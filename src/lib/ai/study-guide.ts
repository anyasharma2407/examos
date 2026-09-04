import "server-only";

import { z } from "zod";
import { generateJson, type AiResult } from "@/lib/ai/client";
import {
  renderGroundingText,
  selectGroundingChunks,
  type SelectedChunk,
  type SourceChunk,
} from "@/lib/ai/selection";

/**
 * Generating a study guide for one topic.
 *
 * Two kinds of content come back and they are treated very differently:
 *
 *  - **Grounded content** — the summary, key ideas, pitfalls, and the reading
 *    plan — must come from the student's own uploads, and every reading cites
 *    the excerpt it refers to. Readings whose citation does not resolve are
 *    dropped, exactly as in curriculum extraction.
 *  - **External suggestions** — video search phrases and textbook titles —
 *    cannot be grounded in the uploads by definition. They are asked for as
 *    *search terms*, never as URLs, video ids or ISBNs: a model inventing a
 *    YouTube id produces a dead link, whereas a search phrase always resolves
 *    to something real. The UI labels them as coming from outside the course.
 */

const responseSchema = z.object({
  summary: z
    .string()
    .min(80)
    .max(1200)
    .describe(
      "Plain-language explanation of this topic as THIS course teaches it, based on the excerpts. Address the student directly.",
    ),
  keyIdeas: z
    .array(z.string().min(10).max(240))
    .min(2)
    .max(7)
    .describe("The things that must be understood, in the order they should be learned"),
  pitfalls: z
    .array(z.string().min(10).max(240))
    .max(5)
    .describe("Mistakes students actually make on this topic, drawn from the material where possible"),
  readings: z
    .array(
      z.object({
        ref: z.string().describe("The [S...] label of the excerpt to read"),
        focus: z.string().min(5).max(200).describe("What to look for in that part of the document"),
        reason: z.string().min(10).max(240).describe("Why it is worth reading for this topic"),
      }),
    )
    .min(1)
    .max(6)
    .describe("What to read in the student's OWN material, most useful first"),
  videoSearches: z
    .array(z.string().min(5).max(100))
    .max(4)
    .describe(
      "Phrases to search on YouTube to find a good explanation. Search phrases only — never URLs, video ids or channel names.",
    ),
  suggestedReading: z
    .array(z.string().min(5).max(160))
    .max(4)
    .describe(
      "Widely used textbooks or standard references for this topic, as 'Title — Author'. Only genuinely well-known works. Never invent an ISBN, edition, page number or link.",
    ),
});

export type StudyGuideReading = {
  materialId: string;
  chunkId: string;
  focus: string;
  reason: string;
};

export type StudyGuide = {
  summary: string;
  keyIdeas: string[];
  pitfalls: string[];
  readings: StudyGuideReading[];
  videoSearches: string[];
  suggestedReading: string[];
};

const SYSTEM = `
You are a patient university tutor writing a study guide for one topic of one
course, using that course's own material.

Write for a student who is revising and short on time:
- Explain the idea itself, not the fact that the idea exists.
- Use the notation and vocabulary the course's material uses.
- Be concrete. Where the material gives a definition, formula or worked example,
  point at it.

The reading plan must send the student to their OWN uploaded material, citing
the excerpt by its [S...] label.

Video searches and textbook suggestions are the only things that may come from
outside the material. Give search phrases, never links or ids, and only name
books that genuinely exist and are widely used. If you are not confident a book
is real and standard, leave it out — an empty list is correct and useful, an
invented reference is not.
`.trim();

/**
 * Cleans a free-text suggestion that becomes a search URL.
 *
 * A schema can only check that these are strings of a plausible length, and
 * models occasionally trail code-ish debris onto the end of one — a real
 * generation produced "related rates calculus introduction and examples].concat([".
 * That would go straight into a search box. Brackets and braces never appear in
 * a genuine search phrase or book title, so the text is cut at the first one and
 * anything still outside a conservative set of characters is dropped.
 *
 * Returns null when nothing usable survives, and the caller omits the entry.
 */
export function sanitiseSuggestion(value: string): string | null {
  const cut = value.split(/[[\]{}<>`|\\]/)[0];

  const cleaned = cut
    .replace(/[^\p{L}\p{N}\s'’\-–—,.:&+/()]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,.:;-]+$/u, "")
    .trim();

  return cleaned.length >= 5 ? cleaned : null;
}

/** Same normalisation as curriculum extraction: models cite "[S3]" and "S3". */
function normaliseRef(ref: string): string {
  return ref.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim().toUpperCase();
}

export function resolveReadings(
  readings: z.infer<typeof responseSchema>["readings"],
  selected: SelectedChunk[],
): StudyGuideReading[] {
  const byRef = new Map(selected.map((chunk) => [normaliseRef(chunk.ref), chunk]));
  const resolved: StudyGuideReading[] = [];
  const seen = new Set<string>();

  for (const reading of readings) {
    const chunk = byRef.get(normaliseRef(reading.ref));
    if (!chunk) continue;
    // One entry per passage; a repeated citation adds nothing to a reading list.
    if (seen.has(chunk.chunkId)) continue;
    seen.add(chunk.chunkId);

    resolved.push({
      materialId: chunk.materialId,
      chunkId: chunk.chunkId,
      focus: reading.focus.trim(),
      reason: reading.reason.trim(),
    });
  }

  return resolved;
}

export type StudyGuideInput = {
  courseCode: string;
  topicName: string;
  topicDescription: string;
  chunks: SourceChunk[];
};

export async function generateStudyGuide(
  input: StudyGuideInput,
): Promise<AiResult<StudyGuide>> {
  // A tighter budget than curriculum extraction: this is about one topic, and
  // the chunks handed in have already been narrowed to that topic's sources.
  const selected = selectGroundingChunks(input.chunks, { budgetChars: 40_000 });

  if (selected.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error: "There is no processed material for this topic yet.",
    };
  }

  const result = await generateJson({
    schema: responseSchema,
    schemaName: "topic_study_guide",
    system: SYSTEM,
    reference: renderGroundingText(selected),
    instruction: `
Write a study guide for the topic "${input.topicName}" in ${input.courseCode}.

The course's knowledge map describes this topic as: ${input.topicDescription}

Base the summary, key ideas, pitfalls and reading plan on the excerpts above,
citing each reading by its [S...] label.
`.trim(),
  });

  if (!result.ok) return result;

  const readings = resolveReadings(result.data.readings, selected);

  if (readings.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error:
        "The reading suggestions could not be traced back to your material, so they were discarded. Try again.",
    };
  }

  return {
    ok: true,
    data: {
      summary: result.data.summary.trim(),
      keyIdeas: result.data.keyIdeas.map((idea) => idea.trim()),
      pitfalls: result.data.pitfalls.map((pitfall) => pitfall.trim()),
      readings,
      videoSearches: result.data.videoSearches
        .map(sanitiseSuggestion)
        .filter((search): search is string => search !== null),
      suggestedReading: result.data.suggestedReading
        .map(sanitiseSuggestion)
        .filter((book): book is string => book !== null),
    },
  };
}
