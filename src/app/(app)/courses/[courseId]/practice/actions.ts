"use server";

import { revalidatePath } from "next/cache";
import { guardAi } from "@/lib/ai/guard";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateCourseQuestions, generateTopicQuestions } from "@/lib/questions";
import { submitAnswer, type SubmitResult } from "@/lib/practice/session";

/**
 * Practice actions.
 *
 * Question ids arrive from the client and are resolved through their course's
 * owner, so a question belonging to someone else is simply not found.
 */


export type GenerateQuestionsState = {
  error?: string;
  success?: string;
  /** Topics that produced nothing, so the student can act on the reason. */
  failures?: { topicName: string; reason: string }[];
};

export async function generateQuestionsAction(
  _previous: GenerateQuestionsState,
  formData: FormData,
): Promise<GenerateQuestionsState> {
  const user = await requireUser();

  const topicId = formData.get("topicId");
  const courseId = formData.get("courseId");
  if (typeof topicId !== "string" || typeof courseId !== "string") {
    return { error: "That topic could not be found." };
  }

  const gate = await guardAi({
    userId: user.id,
    feature: "questions",
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!gate.ok) return { error: gate.error };

  const outcome = await generateTopicQuestions(topicId, user.id);
  if (!outcome.ok) return { error: outcome.error };

  revalidatePath(`/courses/${courseId}/topics/${topicId}`);
  revalidatePath(`/courses/${courseId}/practice`);
  revalidatePath(`/courses/${courseId}`);

  return {
    success: `${outcome.created} new ${outcome.created === 1 ? "question" : "questions"} ready.`,
  };
}

/**
 * Writes questions for every topic in the course that has none yet.
 *
 * Topics are generated concurrently rather than one after another: six
 * sequential calls would take minutes and read as a hang, while six in parallel
 * finish in about the time one does.
 */
export async function generateAllQuestionsAction(
  _previous: GenerateQuestionsState,
  formData: FormData,
): Promise<GenerateQuestionsState> {
  const user = await requireUser();

  const courseId = formData.get("courseId");
  if (typeof courseId !== "string") return { error: "That course could not be found." };

  const gate = await guardAi({
    userId: user.id,
    feature: "questions_bulk",
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!gate.ok) return { error: gate.error };

  const outcome = await generateCourseQuestions(courseId, user.id);
  if (!outcome.ok) return { error: outcome.error };

  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/practice`);

  const failures = outcome.failures.length > 0 ? outcome.failures : undefined;

  if (outcome.created === 0) {
    // The per-topic reasons carry the detail; a headline error on top of them
    // would just repeat it.
    return { error: "No questions could be written this time.", failures };
  }

  return {
    success: `${outcome.created} ${outcome.created === 1 ? "question" : "questions"} written across ${outcome.topics} ${outcome.topics === 1 ? "topic" : "topics"}.`,
    failures,
  };
}

export type AnswerState = {
  error?: string;
  result?: SubmitResult;
  /** The question the result belongs to, so a stale result is never shown. */
  questionId?: string;
};

export async function submitAnswerAction(
  _previous: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const user = await requireUser();

  const questionId = formData.get("questionId");
  const answer = formData.get("answer");
  const courseId = formData.get("courseId");
  const timeSpent = Number(formData.get("timeSpentS") ?? 0);

  if (typeof questionId !== "string" || typeof courseId !== "string") {
    return { error: "That question could not be found." };
  }
  if (typeof answer !== "string" || answer.trim().length === 0) {
    return { error: "Enter an answer first." };
  }

  const gate = await guardAi({
    userId: user.id,
    feature: "answer",
    limit: 300,
    windowMs: 60 * 60_000,
  });
  if (!gate.ok) return { error: gate.error, questionId };

  const outcome = await submitAnswer({
    userId: user.id,
    questionId,
    answer,
    timeSpentS: Number.isFinite(timeSpent) ? timeSpent : 0,
  });

  if (!outcome.ok) return { error: outcome.error, questionId };

  // Mastery moved, so anything showing it is now stale.
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/dashboard");

  return { result: outcome.result, questionId };
}

/** Archives a question the student reports as wrong, so it stops appearing. */
export async function reportQuestionAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const questionId = formData.get("questionId");
  const courseId = formData.get("courseId");
  if (typeof questionId !== "string" || typeof courseId !== "string") return;

  await prisma.question.updateMany({
    where: { id: questionId, course: { userId: user.id } },
    data: { archived: true },
  });

  revalidatePath(`/courses/${courseId}/practice`);
}
