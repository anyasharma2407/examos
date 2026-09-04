import "server-only";

import { prisma } from "@/lib/db";
import { extractCurriculum, type ExtractedTopic } from "@/lib/ai/curriculum";
import type { SourceChunk } from "@/lib/ai/selection";

/**
 * Building and storing a course's knowledge map.
 *
 * Rebuilding preserves mastery: a student who has practised Integration should
 * not lose that history because they uploaded another lecture and regenerated
 * the map. Topics are therefore matched by name and updated in place, and
 * mastery fields are never written here — they belong to the mastery module.
 */

export type BuildOutcome =
  | { ok: true; created: number; updated: number; removed: number; total: number }
  | { ok: false; error: string };

/** Names are matched case-insensitively so "Integration" and "integration" merge. */
function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

async function loadChunks(courseId: string): Promise<SourceChunk[]> {
  const materials = await prisma.material.findMany({
    where: { courseId, status: "READY" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      filename: true,
      chunks: {
        orderBy: { index: "asc" },
        select: { id: true, index: true, content: true },
      },
    },
  });

  return materials.flatMap((material) =>
    material.chunks.map((chunk) => ({
      materialId: material.id,
      materialFilename: material.filename,
      chunkId: chunk.id,
      chunkIndex: chunk.index,
      content: chunk.content,
    })),
  );
}

async function persistTopics(
  courseId: string,
  extracted: ExtractedTopic[],
): Promise<{ created: number; updated: number; removed: number }> {
  const existing = await prisma.topic.findMany({
    where: { courseId },
    select: { id: true, name: true },
  });

  const existingByName = new Map(existing.map((topic) => [normaliseName(topic.name), topic]));
  const keptIds = new Set<string>();

  let created = 0;
  let updated = 0;

  for (const [position, topic] of extracted.entries()) {
    const match = existingByName.get(normaliseName(topic.name));

    const topicId = match
      ? (
          await prisma.topic.update({
            where: { id: match.id },
            data: {
              name: topic.name,
              description: topic.description,
              importance: topic.importance,
              position,
            },
            select: { id: true },
          })
        ).id
      : (
          await prisma.topic.create({
            data: {
              courseId,
              name: topic.name,
              description: topic.description,
              importance: topic.importance,
              position,
            },
            select: { id: true },
          })
        ).id;

    if (match) updated += 1;
    else created += 1;
    keptIds.add(topicId);

    // Citations are regenerated wholesale: they describe this run's evidence.
    await prisma.topicSource.deleteMany({ where: { topicId } });
    await prisma.topicSource.createMany({
      data: topic.citations.map((citation) => ({
        topicId,
        materialId: citation.materialId,
        chunkId: citation.chunkId,
        excerpt: citation.quote,
      })),
    });
  }

  // A topic that no longer appears is only removed if nothing depends on it;
  // deleting one with practice history would take the student's attempts with
  // it, which is never worth doing silently.
  const stale = existing.filter((topic) => !keptIds.has(topic.id));
  let removed = 0;

  for (const topic of stale) {
    const dependents = await prisma.question.count({ where: { topicId: topic.id } });
    const attempts = await prisma.practiceAttempt.count({ where: { topicId: topic.id } });
    if (dependents > 0 || attempts > 0) continue;

    await prisma.topic.delete({ where: { id: topic.id } });
    removed += 1;
  }

  return { created, updated, removed };
}

/**
 * Regenerates the knowledge map for a course the caller has already been shown
 * to own.
 */
export async function buildKnowledgeMap(
  courseId: string,
  course: { name: string; code: string },
): Promise<BuildOutcome> {
  const chunks = await loadChunks(courseId);

  if (chunks.length === 0) {
    return {
      ok: false,
      error:
        "No processed material yet. Upload your lecture notes or course outline first, and wait for them to finish reading.",
    };
  }

  const result = await extractCurriculum({
    courseName: course.name,
    courseCode: course.code,
    chunks,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const counts = await persistTopics(courseId, result.data.topics);

  return {
    ok: true,
    ...counts,
    total: result.data.topics.length,
  };
}
