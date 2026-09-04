import "server-only";

import { gradeShortAnswer } from "@/lib/ai/grade";
import { prisma } from "@/lib/db";
import { applyAttempt } from "@/lib/mastery";
import { gradeAnswer } from "@/lib/practice/grading";
import type { Difficulty, QuestionType } from "@/generated/prisma/enums";

/**
 * Recording one practice attempt.
 *
 * The write is a single transaction covering the attempt, the mistake record
 * and the topic's mastery, because a half-applied result is worse than none:
 * a mistake with no attempt, or mastery that moved without the evidence behind
 * it, would both be permanently wrong and invisible.
 */

export type SubmitResult = {
  correct: boolean;
  score: number;
  correctAnswer: string;
  explanation: string;
  hint: string | null;
  /** Set when a short answer was marked by the model rather than by comparison. */
  feedback?: string;
  topicName: string;
  difficulty: Difficulty;
  type: QuestionType;
};

export type SubmitOutcome =
  | { ok: true; result: SubmitResult }
  | { ok: false; error: string };

export async function submitAnswer(input: {
  userId: string;
  questionId: string;
  answer: string;
  timeSpentS: number;
}): Promise<SubmitOutcome> {
  // Reached through the question's course, so another user's question is simply
  // not found rather than answerable.
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, course: { userId: input.userId } },
    select: {
      id: true,
      courseId: true,
      topicId: true,
      type: true,
      difficulty: true,
      answer: true,
      choices: true,
      tolerance: true,
      acceptableAnswers: true,
      explanation: true,
      hint: true,
      prompt: true,
      topic: {
        select: {
          name: true,
          masteryScore: true,
          masteryStrength: true,
          lastPracticedAt: true,
        },
      },
    },
  });

  if (!question) return { ok: false, error: "That question could not be found." };

  const answer = input.answer.trim();
  if (answer.length === 0) return { ok: false, error: "Enter an answer first." };

  let score: number;
  let feedback: string | undefined;

  const graded = gradeAnswer(answer, {
    type: question.type,
    answer: question.answer,
    choices: question.choices,
    tolerance: question.tolerance,
    acceptableAnswers: question.acceptableAnswers,
  });

  if (graded.verdict === "needs_review") {
    const aiGrade = await gradeShortAnswer({
      prompt: question.prompt,
      modelAnswer: question.answer,
      acceptableAnswers: question.acceptableAnswers,
      studentAnswer: answer,
    });

    if (aiGrade.ok) {
      score = aiGrade.data.score;
      feedback = aiGrade.data.feedback;
    } else {
      // The grader is unavailable. Marking the student wrong on a technicality
      // would be unfair and would poison their mastery score, so the attempt is
      // reported and not recorded.
      return {
        ok: false,
        error: `This answer needs marking and that could not be done right now. ${aiGrade.error}`,
      };
    }
  } else {
    score = graded.score;
  }

  const correct = score >= 0.5;
  const now = new Date();

  const next = applyAttempt(
    {
      score: question.topic.masteryScore,
      strength: question.topic.masteryStrength,
      lastPracticedAt: question.topic.lastPracticedAt,
    },
    { score, difficulty: question.difficulty, at: now },
  );

  await prisma.$transaction(async (tx) => {
    const attempt = await tx.practiceAttempt.create({
      data: {
        userId: input.userId,
        courseId: question.courseId,
        topicId: question.topicId,
        questionId: question.id,
        answer,
        isCorrect: correct,
        score,
        difficulty: question.difficulty,
        timeSpentS: Math.max(0, Math.min(input.timeSpentS, 3600)),
      },
      select: { id: true },
    });

    if (!correct) {
      await tx.mistake.create({
        data: {
          userId: input.userId,
          courseId: question.courseId,
          topicId: question.topicId,
          questionId: question.id,
          attemptId: attempt.id,
          givenAnswer: answer,
          correctAnswer: question.answer,
          difficulty: question.difficulty,
        },
      });
    } else {
      // Answering the same question correctly settles the earlier mistake, so
      // weak-area reporting reflects what is still unresolved.
      await tx.mistake.updateMany({
        where: {
          userId: input.userId,
          questionId: question.id,
          resolvedAt: null,
        },
        data: { resolvedAt: now },
      });
    }

    await tx.topic.update({
      where: { id: question.topicId },
      data: {
        masteryScore: next.score,
        masteryStrength: next.strength,
        lastPracticedAt: now,
        attemptCount: { increment: 1 },
        correctCount: correct ? { increment: 1 } : undefined,
      },
    });
  });

  return {
    ok: true,
    result: {
      correct,
      score,
      correctAnswer: question.answer,
      explanation: question.explanation,
      hint: question.hint,
      feedback,
      topicName: question.topic.name,
      difficulty: question.difficulty,
      type: question.type,
    },
  };
}
