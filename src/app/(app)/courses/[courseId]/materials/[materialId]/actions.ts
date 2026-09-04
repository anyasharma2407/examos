"use server";

import { revalidatePath } from "next/cache";
import { guardAi } from "@/lib/ai/guard";
import { requireUser } from "@/lib/auth";
import { summariseChunk, summariseTopicReadings } from "@/lib/sections";

/**
 * Section summaries.
 *
 * Cheap individually but easy to loop, so rate limited per user. Both actions
 * resolve the passage through its course's owner.
 */


export type SummaryState = { error?: string; success?: string };

export async function summariseSectionAction(
  _previous: SummaryState,
  formData: FormData,
): Promise<SummaryState> {
  const user = await requireUser();

  const chunkId = formData.get("chunkId");
  const path = formData.get("path");
  if (typeof chunkId !== "string") return { error: "That section could not be found." };

  const gate = await guardAi({
    userId: user.id,
    feature: "summary",
    limit: 120,
    windowMs: 60 * 60_000,
  });
  if (!gate.ok) return { error: gate.error };

  const outcome = await summariseChunk(chunkId, user.id, {
    force: formData.get("mode") === "redo",
  });
  if (!outcome.ok) return { error: outcome.error };

  if (typeof path === "string" && path.startsWith("/")) revalidatePath(path);
  return {};
}

export async function summariseReadingsAction(
  _previous: SummaryState,
  formData: FormData,
): Promise<SummaryState> {
  const user = await requireUser();

  const topicId = formData.get("topicId");
  const path = formData.get("path");
  if (typeof topicId !== "string") return { error: "That topic could not be found." };

  const gate = await guardAi({
    userId: user.id,
    feature: "summary",
    limit: 120,
    windowMs: 60 * 60_000,
  });
  if (!gate.ok) return { error: gate.error };

  const outcome = await summariseTopicReadings(topicId, user.id);
  if (!outcome.ok) return { error: outcome.error };

  if (typeof path === "string" && path.startsWith("/")) revalidatePath(path);

  return {
    success:
      outcome.failed > 0
        ? `${outcome.summarised} summarised, ${outcome.failed} could not be.`
        : `${outcome.summarised} ${outcome.summarised === 1 ? "section" : "sections"} summarised.`,
  };
}
