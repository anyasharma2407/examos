import "server-only";

import { generateFlashcards } from "@/lib/ai/flashcards";
import type { SourceChunk } from "@/lib/ai/selection";
import { prisma } from "@/lib/db";

/**
 * Generating and storing a topic's flashcards.
 */

export type FlashcardOutcome =
  | { ok: true; created: number; total: number }
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

export async function generateTopicFlashcards(
  topicId: string,
  userId: string,
): Promise<FlashcardOutcome> {
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
      error: "There is no processed material to make cards from. Upload course material first.",
    };
  }

  // Existing fronts go into the request so a top-up is not a repeat.
  const existing = await prisma.flashcard.findMany({
    where: { topicId: topic.id },
    select: { front: true },
    take: 60,
    orderBy: { position: "asc" },
  });

  const result = await generateFlashcards({
    courseCode: topic.course.code,
    topicName: topic.name,
    topicDescription: topic.description,
    chunks,
    existingFronts: existing.map((card) => card.front),
  });

  if (!result.ok) return { ok: false, error: result.error };

  // Appended, not replaced: a second run tops the set up rather than throwing
  // away cards the student may already have worked through.
  await prisma.flashcard.createMany({
    data: result.data.map((card, index) => ({
      topicId: topic.id,
      kind: card.kind,
      front: card.front,
      back: card.back,
      position: existing.length + index,
      sourceMaterialId: card.sourceMaterialId,
      sourceExcerpt: card.sourceExcerpt,
    })),
  });

  return {
    ok: true,
    created: result.data.length,
    total: existing.length + result.data.length,
  };
}

/** Removes every card for a topic, so a set can be regenerated from scratch. */
export async function clearTopicFlashcards(
  topicId: string,
  userId: string,
): Promise<number> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, course: { userId } },
    select: { id: true },
  });
  if (!topic) return 0;

  const { count } = await prisma.flashcard.deleteMany({ where: { topicId: topic.id } });
  return count;
}
