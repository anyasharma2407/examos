"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { summariseChunk, summariseTopicReadings } from "@/lib/sections";

/**
 * Section summaries.
 *
 * Cheap individually but easy to loop, so rate limited per user. Both actions
 * resolve the passage through its course's owner.
 */

/** 120 sections an hour — a long reading session, not a scraper. */
const summaryLimiter = new FixedWindowRateLimiter(120, 60 * 60_000);

export type SummaryState = { error?: string; success?: string };

export async function summariseSectionAction(
  _previous: SummaryState,
  formData: FormData,
): Promise<SummaryState> {
  const user = await requireUser();

  const chunkId = formData.get("chunkId");
  const path = formData.get("path");
  if (typeof chunkId !== "string") return { error: "That section could not be found." };

  const { allowed, retryAfterMs } = summaryLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return { error: `That is a lot of summarising. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

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

  const { allowed, retryAfterMs } = summaryLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return { error: `That is a lot of summarising. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

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
