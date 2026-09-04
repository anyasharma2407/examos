import "server-only";

import { z } from "zod";
import { generateJson, type AiResult } from "@/lib/ai/client";
import {
  renderGroundingText,
  selectGroundingChunks,
  type SelectedChunk,
  type SourceChunk,
} from "@/lib/ai/selection";
import type { FlashcardKind } from "@/generated/prisma/enums";

/**
 * Generating a flashcard set for one topic.
 *
 * Flashcards sit between the study guide and practice questions: the guide is
 * read once, questions test whether you can apply something, and cards drill
 * the handful of things you need to recall without thinking.
 *
 * The failure mode to design against is a set of ten definitions, which teaches
 * vocabulary rather than the topic. So cards are asked for across five angles —
 * what something is, the exact statement of a rule, how two confusable things
 * differ, when you would reach for it, and the mistake people make — and the
 * spread is enforced after the fact rather than hoped for.
 */

const MIN_CARDS = 8;
const MAX_CARDS = 18;

const cardSchema = z.object({
  kind: z.enum(["CONCEPT", "FORMULA", "DISTINCTION", "APPLICATION", "PITFALL"]),
  front: z
    .string()
    .min(8)
    .max(220)
    .describe(
      "The prompt side. A question, term or situation. Self-contained — never refer to 'the excerpt' or 'the notes'.",
    ),
  back: z
    .string()
    .min(15)
    .max(500)
    .describe(
      "The answer side. Complete enough to learn from in one read, short enough to hold in your head. No preamble.",
    ),
  ref: z.string().describe("The [S...] label of the excerpt this card came from"),
});

const responseSchema = z.object({
  cards: z.array(cardSchema).max(MAX_CARDS),
});

export type GeneratedFlashcard = {
  kind: FlashcardKind;
  front: string;
  back: string;
  sourceMaterialId: string;
  sourceExcerpt: string;
};

const SYSTEM = `
You write flashcards for one topic of one university course, from that course's
own material.

A good card has one idea on it. The front asks for something specific; the back
answers it completely and stops. If the back needs "and also", it should have
been two cards.

Cover the topic from five angles, and label each card with which one it is:

- CONCEPT — what something is, in the course's own terms.
- FORMULA — a rule, formula or statement to recall exactly, written the way the
  course writes it.
- DISTINCTION — how two things students confuse are actually different. These
  are the most valuable cards; write them wherever the material supports one.
- APPLICATION — when you would reach for this, and why that situation calls for
  it rather than something else.
- PITFALL — a specific mistake, and what to do instead.

Write for someone revising who already attended the lectures. Assume the
vocabulary, explain the substance. Never write a card whose answer is "yes" or
"no", and never write one that just restates its own front.

Cards are about the subject, never about the syllabus. "What role does implicit
differentiation have in this course?" answered by "it is listed as an
application" teaches nothing — the student needs to know what implicit
differentiation *is* and how to do it. If the material only mentions something
in passing without explaining it, write no card for it rather than a card about
the fact that it was mentioned.

Every card must come from the supplied material and cite the excerpt it came
from. If the material will not support a good card, write fewer.
`.trim();

/** Models cite "[S3]" as readily as "S3". */
function normaliseRef(ref: string): string {
  return ref.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim().toUpperCase();
}

/**
 * Drops cards that are ungrounded, duplicated, or that answer their own front.
 *
 * A card whose back merely repeats the front teaches nothing but still occupies
 * a slot in a revision set, so it is worth catching here rather than leaving to
 * the student to notice.
 */
export function validateCards(
  cards: z.infer<typeof responseSchema>["cards"],
  selected: SelectedChunk[],
): GeneratedFlashcard[] {
  const byRef = new Map(selected.map((chunk) => [normaliseRef(chunk.ref), chunk]));
  const kept: GeneratedFlashcard[] = [];
  const seenFronts = new Set<string>();

  for (const card of cards) {
    const chunk = byRef.get(normaliseRef(card.ref));
    if (!chunk) continue;

    const front = card.front.trim();
    const back = card.back.trim();

    const key = front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key.length === 0 || seenFronts.has(key)) continue;

    // A back that is the front again is a card that cannot be failed.
    const backKey = back.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (backKey === key) continue;

    seenFronts.add(key);

    kept.push({
      kind: card.kind,
      front,
      back,
      sourceMaterialId: chunk.materialId,
      sourceExcerpt: chunk.content.slice(0, 300),
    });
  }

  return kept;
}

/**
 * Orders a set so consecutive cards are of different kinds where possible.
 *
 * Five definitions in a row is a worse revision experience than the same five
 * cards interleaved, and the model tends to emit them grouped.
 */
export function interleaveByKind(cards: GeneratedFlashcard[]): GeneratedFlashcard[] {
  const buckets = new Map<FlashcardKind, GeneratedFlashcard[]>();
  for (const card of cards) {
    const bucket = buckets.get(card.kind);
    if (bucket) bucket.push(card);
    else buckets.set(card.kind, [card]);
  }

  const ordered: GeneratedFlashcard[] = [];
  while (ordered.length < cards.length) {
    let placedAny = false;
    for (const bucket of buckets.values()) {
      const next = bucket.shift();
      if (next) {
        ordered.push(next);
        placedAny = true;
      }
    }
    // Defensive: without this a bug in the bucketing would spin forever.
    if (!placedAny) break;
  }

  return ordered;
}

export type FlashcardsInput = {
  courseCode: string;
  topicName: string;
  topicDescription: string;
  chunks: SourceChunk[];
  existingFronts: string[];
};

export async function generateFlashcards(
  input: FlashcardsInput,
): Promise<AiResult<GeneratedFlashcard[]>> {
  const selected = selectGroundingChunks(input.chunks, { budgetChars: 35_000 });

  if (selected.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error: "There is no processed material for this topic yet.",
    };
  }

  const avoid =
    input.existingFronts.length > 0
      ? `\n\nYou have already written cards with these fronts. Write different ones:\n${input.existingFronts
          .slice(0, 40)
          .map((front) => `- ${front}`)
          .join("\n")}`
      : "";

  const result = await generateJson({
    schema: responseSchema,
    schemaName: "topic_flashcards",
    system: SYSTEM,
    reference: renderGroundingText(selected),
    instruction: `
Write ${MIN_CARDS} to ${MAX_CARDS} flashcards for "${input.topicName}" in ${input.courseCode}.

The course's knowledge map describes this topic as: ${input.topicDescription}

Spread them across the five kinds. Cite the excerpt each card came from by its
[S...] label.${avoid}
`.trim(),
    temperature: 0.5,
  });

  if (!result.ok) return result;

  const seen = new Set(
    input.existingFronts.map((front) =>
      front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    ),
  );

  const validated = validateCards(result.data.cards, selected).filter((card) => {
    const key = card.front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (validated.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error:
        "No usable cards came back — they either repeated existing ones or could not be traced to your material. Try again.",
    };
  }

  return { ok: true, data: interleaveByKind(validated) };
}
