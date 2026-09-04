"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { buildKnowledgeMap } from "@/lib/topics";

/**
 * Knowledge map generation.
 *
 * Each run costs a model call over a large slice of the course material, so it
 * is rate limited per user. The course id comes from the client and is only
 * ever used alongside the signed-in user's id.
 */

/** 10 rebuilds per hour per user. Rebuilding is useful, but not constantly. */
const buildLimiter = new FixedWindowRateLimiter(10, 60 * 60_000);

export type BuildMapState = {
  error?: string;
  success?: string;
};

export async function buildKnowledgeMapAction(
  _previous: BuildMapState,
  formData: FormData,
): Promise<BuildMapState> {
  const user = await requireUser();

  const courseId = formData.get("courseId");
  if (typeof courseId !== "string" || courseId.length === 0) {
    return { error: "That course could not be found." };
  }

  const course = await prisma.course.findFirst({
    where: { id: courseId, userId: user.id },
    select: { id: true, name: true, code: true },
  });
  if (!course) return { error: "That course could not be found." };

  const { allowed, retryAfterMs } = buildLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return {
      error: `You have rebuilt your knowledge map several times just now. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const outcome = await buildKnowledgeMap(course.id, course);

  if (!outcome.ok) return { error: outcome.error };

  revalidatePath(`/courses/${course.id}`);
  revalidatePath("/dashboard");

  const parts = [`${outcome.total} ${outcome.total === 1 ? "topic" : "topics"} found`];
  if (outcome.updated > 0) parts.push(`${outcome.updated} kept from before`);
  if (outcome.removed > 0) parts.push(`${outcome.removed} no longer covered`);

  return { success: `${parts.join(", ")}.` };
}
