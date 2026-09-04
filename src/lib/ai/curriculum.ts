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
 * Building a course's knowledge map from its uploaded material.
 *
 * The output is deliberately constrained: every topic must cite the excerpts it
 * was drawn from, and citations are checked against the excerpts that were
 * actually supplied. A topic the model invented — one citing a reference that
 * was never sent — is dropped rather than stored, which is what keeps the
 * knowledge map a map of *this* course rather than of the subject in general.
 */

/** Bounds chosen so the map stays usable: enough to plan around, few enough to read. */
export const MIN_TOPICS = 3;
export const MAX_TOPICS = 14;

const topicSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(60)
    .describe("Short topic name as a student would recognise it, e.g. 'Conditional Probability'"),
  description: z
    .string()
    .min(20)
    .max(400)
    .describe("One or two sentences on what this topic covers in THIS course"),
  importance: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How central this topic is to the course, from how much of the material covers it and how much the material emphasises it. 0 = mentioned in passing, 1 = the course is built around it",
    ),
  citations: z
    .array(
      z.object({
        ref: z.string().describe("The [S...] label of an excerpt this topic came from"),
        quote: z
          .string()
          .min(3)
          .max(300)
          .describe("A short verbatim quote from that excerpt supporting this topic"),
      }),
    )
    .min(1)
    .max(4),
});

const responseSchema = z.object({
  /**
   * Set when the material is too thin to characterise the course. Preferable to
   * inventing a plausible-looking syllabus.
   */
  insufficientMaterial: z
    .boolean()
    .describe("True if the supplied material is too sparse to identify the course's topics"),
  topics: z.array(topicSchema).max(MAX_TOPICS),
});

export type ExtractedTopic = {
  name: string;
  description: string;
  importance: number;
  citations: { chunkId: string; materialId: string; quote: string }[];
};

export type CurriculumInput = {
  courseName: string;
  courseCode: string;
  chunks: SourceChunk[];
};

const SYSTEM = `
You are a university curriculum analyst. Given excerpts from one course's own
material — lecture slides, tutorials, course outlines, past papers — you
identify the major topics that course actually covers.

What makes a good topic:
- It is a subject a student would revise as a unit, not a single fact and not
  the whole course.
- It comes from the supplied material. If the excerpts never discuss it, it is
  not a topic for this course, however standard it is for the subject.
- Its name is what a student in this course would call it.

Judge importance from the material itself: how much of it addresses the topic,
whether the outline lists it prominently, whether past papers examine it.

Never invent a topic to round out a list. Fewer, well-supported topics are
better than a complete-looking syllabus that the material does not back up.
`.trim();

function buildInstruction(courseCode: string, courseName: string): string {
  return `
Identify the major topics of ${courseCode} (${courseName}) from the excerpts above.

Return between ${MIN_TOPICS} and ${MAX_TOPICS} topics, ordered from most to
least important. Each topic must cite at least one excerpt by its [S...] label
together with a short verbatim quote from that excerpt.

If the excerpts are too sparse or too generic to identify what this course
covers, set insufficientMaterial to true and return an empty topics array.
`.trim();
}

/**
 * Normalises an excerpt label to the bare form used as the lookup key.
 *
 * The material is rendered with bracketed labels ("[S3] (lecture01.pdf...)")
 * and the instruction asks for "the [S...] label", so models reasonably return
 * "[S3]" rather than "S3" — both are the same citation and both must resolve.
 * Being strict here silently discarded every correctly-grounded topic.
 */
function normaliseRef(ref: string): string {
  return ref
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .trim()
    .toUpperCase();
}

/**
 * Drops anything the model did not actually ground in supplied material, and
 * maps citations back to real chunk rows.
 *
 * A hallucinated citation is the clearest signal that a topic was invented, so
 * a topic whose citations all fail to resolve is discarded entirely.
 */
export function resolveCitations(
  topics: z.infer<typeof responseSchema>["topics"],
  selected: SelectedChunk[],
): ExtractedTopic[] {
  const byRef = new Map(selected.map((chunk) => [normaliseRef(chunk.ref), chunk]));
  const resolved: ExtractedTopic[] = [];
  const seenNames = new Set<string>();

  for (const topic of topics) {
    const citations: ExtractedTopic["citations"] = [];

    for (const citation of topic.citations) {
      const chunk = byRef.get(normaliseRef(citation.ref));
      if (!chunk) continue;
      citations.push({
        chunkId: chunk.chunkId,
        materialId: chunk.materialId,
        quote: citation.quote.trim().slice(0, 300),
      });
    }

    if (citations.length === 0) continue;

    // Models occasionally emit near-duplicate topics; keep the first, which is
    // the more important one given the requested ordering.
    const key = topic.name.trim().toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    resolved.push({
      name: topic.name.trim(),
      description: topic.description.trim(),
      importance: Math.min(1, Math.max(0, topic.importance)),
      citations,
    });
  }

  return resolved;
}

export type CurriculumResult = {
  topics: ExtractedTopic[];
  /** Excerpts actually sent, so the caller can report coverage. */
  selected: SelectedChunk[];
};

export async function extractCurriculum(
  input: CurriculumInput,
): Promise<AiResult<CurriculumResult>> {
  const selected = selectGroundingChunks(input.chunks);

  if (selected.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error: "There is no processed course material to analyse yet.",
    };
  }

  const result = await generateJson({
    schema: responseSchema,
    schemaName: "course_knowledge_map",
    system: SYSTEM,
    reference: renderGroundingText(selected),
    instruction: buildInstruction(input.courseCode, input.courseName),
    temperature: 0.2,
  });

  if (!result.ok) return result;

  if (result.data.insufficientMaterial || result.data.topics.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error:
        "There is not enough in the uploaded material to work out this course's topics. Try adding the course outline or more lecture notes.",
    };
  }

  const topics = resolveCitations(result.data.topics, selected);

  if (topics.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error:
        "The topics that came back could not be traced to your material, so they were discarded. Try again.",
    };
  }

  return { ok: true, data: { topics, selected } };
}
