"use server";

import { revalidatePath } from "next/cache";
import { askTutor } from "@/lib/ai/tutor";
import type { SourceChunk } from "@/lib/ai/selection";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { clearTopicFlashcards, generateTopicFlashcards } from "@/lib/flashcards";
import { buildStudyGuide } from "@/lib/study";

/**
 * Study-page actions.
 *
 * Both call a model, so both are rate limited per user, and both resolve the
 * topic through its course's owner — a topic id from a URL or form is never
 * trusted on its own.
 */

/** 30 guide generations per hour. Generous for a study session, not for a loop. */
const guideLimiter = new FixedWindowRateLimiter(30, 60 * 60_000);
/** 60 tutor questions per hour: a real conversation, without runaway spend. */
const tutorLimiter = new FixedWindowRateLimiter(60, 60 * 60_000);
/** 30 card sets per hour. */
const flashcardLimiter = new FixedWindowRateLimiter(30, 60 * 60_000);

export type GuideState = { error?: string };

export async function buildStudyGuideAction(
  _previous: GuideState,
  formData: FormData,
): Promise<GuideState> {
  const user = await requireUser();

  const topicId = formData.get("topicId");
  const courseId = formData.get("courseId");
  if (typeof topicId !== "string" || typeof courseId !== "string") {
    return { error: "That topic could not be found." };
  }

  const { allowed, retryAfterMs } = guideLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return { error: `That is a lot of guides at once. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const outcome = await buildStudyGuide(topicId, user.id);
  if (!outcome.ok) return { error: outcome.error };

  revalidatePath(`/courses/${courseId}/topics/${topicId}`);
  return {};
}

export type FlashcardState = { error?: string; success?: string };

export async function generateFlashcardsAction(
  _previous: FlashcardState,
  formData: FormData,
): Promise<FlashcardState> {
  const user = await requireUser();

  const topicId = formData.get("topicId");
  const courseId = formData.get("courseId");
  if (typeof topicId !== "string" || typeof courseId !== "string") {
    return { error: "That topic could not be found." };
  }

  const { allowed, retryAfterMs } = flashcardLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return { error: `That is a lot of cards at once. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  // "replace" starts the set again; the default tops it up.
  if (formData.get("mode") === "replace") {
    await clearTopicFlashcards(topicId, user.id);
  }

  const outcome = await generateTopicFlashcards(topicId, user.id);
  if (!outcome.ok) return { error: outcome.error };

  revalidatePath(`/courses/${courseId}/topics/${topicId}`);
  revalidatePath(`/courses/${courseId}`);

  return {
    success: `${outcome.created} new ${outcome.created === 1 ? "card" : "cards"} — ${outcome.total} in total.`,
  };
}

export type TutorTurn = {
  question: string;
  answer: string;
  groundedInMaterial: boolean;
  followUp: string;
};

/**
 * The whole conversation lives in the action's state.
 *
 * `useActionState` hands the previous state to the action, so the transcript is
 * accumulated here rather than mirrored into component state by an effect.
 */
export type TutorState = {
  turns: TutorTurn[];
  error?: string;
};

// NOTE: this module is "use server", so it may only export async functions at
// runtime. Types are erased and therefore fine; a constant initial state would
// arrive as `undefined` on the client, so it lives in the component instead.


export async function askTutorAction(
  previous: TutorState,
  formData: FormData,
): Promise<TutorState> {
  const turns = previous?.turns ?? [];
  const user = await requireUser();

  const topicId = formData.get("topicId");
  const question = formData.get("question");

  if (typeof topicId !== "string") return { turns, error: "That topic could not be found." };
  if (typeof question !== "string" || question.trim().length === 0) {
    return { turns, error: "Ask a question first." };
  }

  const topic = await prisma.topic.findFirst({
    where: { id: topicId, course: { userId: user.id } },
    select: {
      id: true,
      name: true,
      courseId: true,
      course: { select: { code: true } },
      sources: { select: { chunkId: true } },
    },
  });
  if (!topic) return { turns, error: "That topic could not be found." };

  const { allowed, retryAfterMs } = tutorLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return {
      turns,
      error: `You have asked a lot of questions just now. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const citedIds = topic.sources
    .map((source) => source.chunkId)
    .filter((id): id is string => Boolean(id));

  const rows = await prisma.materialChunk.findMany({
    where:
      citedIds.length > 0
        ? { id: { in: citedIds } }
        : { material: { courseId: topic.courseId, status: "READY" } },
    take: 60,
    orderBy: [{ materialId: "asc" }, { index: "asc" }],
    select: {
      id: true,
      index: true,
      content: true,
      material: { select: { id: true, filename: true } },
    },
  });

  const chunks: SourceChunk[] = rows.map((row) => ({
    materialId: row.material.id,
    materialFilename: row.material.filename,
    chunkId: row.id,
    chunkIndex: row.index,
    content: row.content,
  }));

  const result = await askTutor({
    courseCode: topic.course.code,
    topicName: topic.name,
    question,
    chunks,
  });

  if (!result.ok) return { turns, error: result.error };

  return {
    turns: [
      ...turns,
      {
        question: question.trim(),
        answer: result.data.answer,
        groundedInMaterial: result.data.groundedInMaterial,
        followUp: result.data.followUp,
      },
    ],
  };
}
