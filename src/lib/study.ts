import "server-only";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { generateStudyGuide } from "@/lib/ai/study-guide";
import type { SourceChunk } from "@/lib/ai/selection";

/**
 * Loading and building a topic's study page.
 *
 * Ownership is reached through the topic's course every time: a topic id in a
 * URL is attacker-controlled, so it is never looked up on its own.
 */

export async function requireOwnedTopic(topicId: string, userId: string) {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, course: { userId } },
    include: {
      course: { select: { id: true, name: true, code: true } },
      sources: {
        select: {
          id: true,
          excerpt: true,
          chunkId: true,
          // The section number is what lets a citation open the passage it quotes.
          chunk: { select: { index: true } },
          material: { select: { id: true, filename: true } },
        },
      },
      flashcards: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          kind: true,
          front: true,
          back: true,
          sourceMaterial: { select: { filename: true } },
        },
      },
      guide: {
        include: {
          readings: {
            orderBy: { position: "asc" },
            include: {
              material: { select: { id: true, filename: true } },
              chunk: { select: { index: true, content: true } },
            },
          },
        },
      },
    },
  });

  if (!topic) notFound();
  return topic;
}

/**
 * The material a topic's guide is built from.
 *
 * Prefers the chunks the knowledge map already cited for this topic — those are
 * known to be about it — and tops up with the rest of the course only if that
 * is too thin to write from. Sending the whole course for every topic would be
 * both expensive and less focused.
 */
async function loadTopicChunks(
  courseId: string,
  citedChunkIds: string[],
): Promise<SourceChunk[]> {
  const cited = await prisma.materialChunk.findMany({
    where: { id: { in: citedChunkIds } },
    select: {
      id: true,
      index: true,
      content: true,
      material: { select: { id: true, filename: true } },
    },
  });

  const toSource = (chunk: (typeof cited)[number]): SourceChunk => ({
    materialId: chunk.material.id,
    materialFilename: chunk.material.filename,
    chunkId: chunk.id,
    chunkIndex: chunk.index,
    content: chunk.content,
  });

  // Two cited passages is not enough to write a guide from; widen to the course.
  if (cited.length >= 3) return cited.map(toSource);

  const wider = await prisma.materialChunk.findMany({
    where: { material: { courseId, status: "READY" } },
    take: 400,
    orderBy: [{ materialId: "asc" }, { index: "asc" }],
    select: {
      id: true,
      index: true,
      content: true,
      material: { select: { id: true, filename: true } },
    },
  });

  const seen = new Set(cited.map((chunk) => chunk.id));
  return [
    ...cited.map(toSource),
    ...wider.filter((chunk) => !seen.has(chunk.id)).map(toSource),
  ];
}

export type BuildGuideOutcome = { ok: true } | { ok: false; error: string };

export async function buildStudyGuide(
  topicId: string,
  userId: string,
): Promise<BuildGuideOutcome> {
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
        "There is no processed material to build a guide from. Upload course material and wait for it to finish reading.",
    };
  }

  const result = await generateStudyGuide({
    courseCode: topic.course.code,
    topicName: topic.name,
    topicDescription: topic.description,
    chunks,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const guide = result.data;

  // Replace wholesale: a guide is a snapshot of one generation, not something
  // that accumulates across runs.
  await prisma.$transaction(async (tx) => {
    await tx.topicGuide.deleteMany({ where: { topicId: topic.id } });
    await tx.topicGuide.create({
      data: {
        topicId: topic.id,
        summary: guide.summary,
        keyIdeas: guide.keyIdeas,
        pitfalls: guide.pitfalls,
        videoSearches: guide.videoSearches,
        suggestedReading: guide.suggestedReading,
        readings: {
          create: guide.readings.map((reading, position) => ({
            materialId: reading.materialId,
            chunkId: reading.chunkId,
            position,
            focus: reading.focus,
            reason: reading.reason,
          })),
        },
      },
    });
  });

  return { ok: true };
}
