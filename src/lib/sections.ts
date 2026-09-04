import "server-only";

import { summariseSection } from "@/lib/ai/section-summary";
import { prisma } from "@/lib/db";

/**
 * Summarising passages of uploaded material.
 *
 * Summaries are cached on the chunk. The same passage is frequently cited by
 * several topics, so summarising once keeps it both cheap and consistent —
 * two topics pointing at the same paragraph should not describe it differently.
 */

export type SummariseOutcome = { ok: true; summary: string } | { ok: false; error: string };

/**
 * Formats a summary for storage as one block of text.
 *
 * Kept as a single column rather than a related table: this is derived display
 * text, always read whole and never queried into.
 */
function render(summary: { summary: string; takeaways: string[]; thin: boolean }): string {
  const parts = [summary.summary];
  if (summary.takeaways.length > 0) {
    parts.push(summary.takeaways.map((item) => `• ${item}`).join("\n"));
  }
  if (summary.thin) {
    parts.push("(This passage is mostly headings or fragments.)");
  }
  return parts.join("\n\n");
}

export async function summariseChunk(
  chunkId: string,
  userId: string,
  { force = false } = {},
): Promise<SummariseOutcome> {
  // Reached through the material's course, so another user's passage is not
  // summarisable — and, since summaries cost money, not chargeable to them.
  const chunk = await prisma.materialChunk.findFirst({
    where: { id: chunkId, material: { course: { userId } } },
    select: {
      id: true,
      index: true,
      content: true,
      summary: true,
      material: { select: { filename: true } },
    },
  });

  if (!chunk) return { ok: false, error: "That section could not be found." };
  if (chunk.summary && !force) return { ok: true, summary: chunk.summary };

  const result = await summariseSection({
    filename: chunk.material.filename,
    sectionNumber: chunk.index + 1,
    content: chunk.content,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const summary = render(result.data);

  await prisma.materialChunk.update({
    where: { id: chunk.id },
    data: { summary, summarisedAt: new Date() },
  });

  return { ok: true, summary };
}

export type SummariseReadingsOutcome =
  | { ok: true; summarised: number; failed: number }
  | { ok: false; error: string };

/**
 * Summarises every passage a topic's study guide recommends.
 *
 * Run concurrently in a small group: a guide recommends at most six passages,
 * and doing them one after another would take long enough to read as a hang.
 */
export async function summariseTopicReadings(
  topicId: string,
  userId: string,
): Promise<SummariseReadingsOutcome> {
  const guide = await prisma.topicGuide.findFirst({
    where: { topicId, topic: { course: { userId } } },
    select: { readings: { select: { chunkId: true } } },
  });

  if (!guide) return { ok: false, error: "This topic has no study guide yet." };

  const chunkIds = guide.readings
    .map((reading) => reading.chunkId)
    .filter((id): id is string => Boolean(id));

  if (chunkIds.length === 0) {
    return { ok: false, error: "None of the recommended readings point at a stored passage." };
  }

  const results = await Promise.all(
    chunkIds.map((chunkId) => summariseChunk(chunkId, userId)),
  );

  const summarised = results.filter((result) => result.ok).length;
  const failed = results.length - summarised;

  if (summarised === 0) {
    return { ok: false, error: "None of the sections could be summarised. Try again." };
  }

  return { ok: true, summarised, failed };
}
