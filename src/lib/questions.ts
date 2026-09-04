import "server-only";

import { generateQuestions } from "@/lib/ai/questions";
import type { SourceChunk } from "@/lib/ai/selection";
import { prisma } from "@/lib/db";

/**
 * Generating and storing practice questions for a topic.
 */

export type GenerateOutcome =
  | { ok: true; created: number; rejected: number }
  | { ok: false; error: string };

/** Prefers the passages the knowledge map cited for this topic. */
async function loadTopicChunks(
  courseId: string,
  citedChunkIds: string[],
): Promise<SourceChunk[]> {
  const where =
    citedChunkIds.length >= 2
      ? { id: { in: citedChunkIds } }
      : { material: { courseId, status: "READY" as const } };

  const rows = await prisma.materialChunk.findMany({
    where,
    take: 200,
    orderBy: [{ materialId: "asc" }, { index: "asc" }],
    select: {
      id: true,
      index: true,
      content: true,
      material: { select: { id: true, filename: true } },
    },
  });

  return rows.map((row) => ({
    materialId: row.material.id,
    materialFilename: row.material.filename,
    chunkId: row.id,
    chunkIndex: row.index,
    content: row.content,
  }));
}

export async function generateTopicQuestions(
  topicId: string,
  userId: string,
  count = 8,
): Promise<GenerateOutcome> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, course: { userId } },
    select: {
      id: true,
      name: true,
      description: true,
      courseId: true,
      course: { select: { code: true } },
      sources: { select: { chunkId: true } },
    },
  });

  if (!topic) return { ok: false, error: "That topic could not be found." };

  const citedChunkIds = topic.sources
    .map((source) => source.chunkId)
    .filter((id): id is string => Boolean(id));

  const chunks = await loadTopicChunks(topic.courseId, citedChunkIds);
  if (chunks.length === 0) {
    return {
      ok: false,
      error:
        "There is no processed material to write questions from. Upload course material first.",
    };
  }

  // Existing prompts go into the request so a top-up is not a repeat.
  const existing = await prisma.question.findMany({
    where: { topicId: topic.id, archived: false },
    select: { prompt: true },
    take: 40,
    orderBy: { createdAt: "desc" },
  });

  const result = await generateQuestions({
    courseCode: topic.course.code,
    topicName: topic.name,
    topicDescription: topic.description,
    chunks,
    count,
    existingPrompts: existing.map((question) => question.prompt),
  });

  if (!result.ok) return { ok: false, error: result.error };

  if (result.data.rejected.length > 0) {
    // Worth seeing: a rising rate here means the prompt or model needs work.
    console.warn(
      `[questions] dropped ${result.data.rejected.length} for ${topic.name}:`,
      result.data.rejected.map((item) => item.reason).join("; "),
    );
  }

  await prisma.question.createMany({
    data: result.data.questions.map((question) => ({
      courseId: topic.courseId,
      topicId: topic.id,
      type: question.type,
      difficulty: question.difficulty,
      prompt: question.prompt,
      choices: question.choices,
      answer: question.answer,
      tolerance: question.tolerance,
      acceptableAnswers: question.acceptableAnswers,
      explanation: question.explanation,
      hint: question.hint,
      sourceMaterialId: question.sourceMaterialId,
      sourceExcerpt: question.sourceExcerpt,
    })),
  });

  return {
    ok: true,
    created: result.data.questions.length,
    rejected: result.data.rejected.length,
  };
}

export type TopicFailure = { topicName: string; reason: string };

export type CourseGenerateOutcome =
  | { ok: true; created: number; topics: number; failures: TopicFailure[] }
  | { ok: false; error: string };

/**
 * Writes questions for every topic in a course that has none yet.
 *
 * Runs the topics concurrently, in small groups. Sequentially this would take
 * minutes for a six-topic course and read as a hang; unbounded it would fire a
 * dozen simultaneous requests at the provider and invite a rate limit. One
 * topic failing does not stop the others — the outcome reports how many.
 */
export async function generateCourseQuestions(
  courseId: string,
  userId: string,
  perTopic = 6,
): Promise<CourseGenerateOutcome> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId },
    select: { id: true },
  });
  if (!course) return { ok: false, error: "That course could not be found." };

  const topics = await prisma.topic.findMany({
    where: { courseId: course.id },
    orderBy: { position: "asc" },
    select: { id: true, name: true, _count: { select: { questions: true } } },
  });

  if (topics.length === 0) {
    return {
      ok: false,
      error: "Build your knowledge map first — questions are written per topic.",
    };
  }

  const pending = topics.filter((topic) => topic._count.questions === 0);

  if (pending.length === 0) {
    return {
      ok: false,
      error:
        "Every topic already has questions. Open a topic to write more for it specifically.",
    };
  }

  let created = 0;
  let done = 0;
  const failures: TopicFailure[] = [];

  const CONCURRENCY = 4;
  for (let start = 0; start < pending.length; start += CONCURRENCY) {
    const group = pending.slice(start, start + CONCURRENCY);
    const results = await Promise.all(
      group.map((topic) => generateTopicQuestions(topic.id, userId, perTopic)),
    );

    for (const [index, result] of results.entries()) {
      if (result.ok) {
        created += result.created;
        done += 1;
      } else {
        // Which topic failed, and why, matters: the usual cause is a topic that
        // only appears as one line in a course outline, and the student can fix
        // that by uploading material that actually covers it.
        failures.push({ topicName: group[index].name, reason: result.error });
      }
    }
  }

  // Deliberately not an early return on `created === 0`: the per-topic reasons
  // are the useful part when nothing worked, and collapsing them into one
  // generic message throws away the only actionable information.
  return { ok: true, created, topics: done, failures };
}

/**
 * The next questions to practise for a topic.
 *
 * Unanswered questions come first, then the ones answered longest ago, so a
 * session works through new material before repeating.
 */
export async function nextQuestionsForTopic(
  topicId: string,
  userId: string,
  limit = 10,
) {
  return prisma.question.findMany({
    where: { topicId, archived: false, course: { userId } },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      type: true,
      difficulty: true,
      prompt: true,
      choices: true,
      attempts: {
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, isCorrect: true },
      },
    },
  });
}
