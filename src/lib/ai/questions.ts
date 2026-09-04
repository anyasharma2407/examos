import "server-only";

import { z } from "zod";
import { generateJson, type AiResult } from "@/lib/ai/client";
import {
  renderGroundingText,
  selectGroundingChunks,
  type SelectedChunk,
  type SourceChunk,
} from "@/lib/ai/selection";
import type { Difficulty, QuestionType } from "@/generated/prisma/enums";

/**
 * Generating practice questions for one topic.
 *
 * Questions are the part of the product where a wrong answer is actively
 * harmful: a student who trusts a mis-keyed question learns the wrong thing and
 * loses confidence in the rest. So the output is checked far harder than the
 * schema alone can manage — see `validateQuestion`, which drops anything
 * internally inconsistent (a multiple-choice answer that is not among its own
 * options, a numeric answer that is not a number, duplicate options) rather
 * than storing it.
 */

const MAX_PER_REQUEST = 12;

const rawQuestionSchema = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "NUMERIC", "SHORT_ANSWER"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  prompt: z
    .string()
    .min(15)
    .max(900)
    .describe("The question. Self-contained: never refer to 'the excerpt' or 'the material'."),
  choices: z
    .array(z.string().min(1).max(300))
    .describe(
      "MULTIPLE_CHOICE: exactly 4 options, one correct, the rest plausible mistakes a student would actually make. Empty array for other types.",
    ),
  answer: z
    .string()
    .min(1)
    .max(600)
    .describe(
      "MULTIPLE_CHOICE: the correct option, copied exactly. NUMERIC: the value as a plain decimal, no units or words. SHORT_ANSWER: a concise model answer.",
    ),
  tolerance: z
    .number()
    .min(0)
    .describe("NUMERIC: absolute tolerance for a correct answer. 0 for other types."),
  acceptableAnswers: z
    .array(z.string().min(1).max(300))
    .describe(
      "SHORT_ANSWER: other phrasings that should count as correct. Empty array for other types.",
    ),
  explanation: z
    .string()
    .min(30)
    .max(1200)
    .describe("Why the answer is right, worked through the way this course would."),
  hint: z
    .string()
    .min(10)
    .max(300)
    .describe("A nudge toward the method, shown only after a wrong answer. Never gives the answer."),
  ref: z.string().describe("The [S...] label of the excerpt this question is based on"),
});

const responseSchema = z.object({
  questions: z.array(rawQuestionSchema).max(MAX_PER_REQUEST),
});

export type GeneratedQuestion = {
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  choices: string[];
  answer: string;
  tolerance: number | null;
  acceptableAnswers: string[];
  explanation: string;
  hint: string;
  sourceMaterialId: string;
  sourceExcerpt: string;
};

const SYSTEM = `
You write practice exam questions for one topic of one university course, using
that course's own material.

Write questions that test whether the student can DO the thing, not whether they
can recall that it exists. For a technical subject that means: apply a method to
a specific case, decide which method fits, spot why a given argument fails,
compute a value, interpret a result. Avoid questions answerable by matching a
word from a definition.

Multiple choice: exactly four options. The wrong ones must be mistakes a real
student makes — an off-by-one, a sign error, the right method misapplied, a
confusion with a neighbouring concept. Never use filler options, "all of the
above", or options of obviously different lengths.

Numeric: the answer must be a single plain decimal number. State the units in
the question, never in the answer. Set a tolerance that accommodates sensible
rounding.

Short answer: ask for something checkable in a sentence or two.

Every question must be answerable from the course material provided, and must
cite the excerpt it came from. Spread questions across difficulties. If the
material will not support a good question, produce fewer — an empty list is a
valid answer.
`.trim();

/** Same tolerance for label spellings as everywhere else: "S3" and "[S3]". */
function normaliseRef(ref: string): string {
  return ref.trim().replace(/^\[+/, "").replace(/\]+$/, "").trim().toUpperCase();
}

export type ValidationFailure = { prompt: string; reason: string };

/**
 * Checks a question against itself.
 *
 * The JSON schema guarantees field types; it cannot guarantee that a
 * multiple-choice answer appears among its own options, or that a "numeric"
 * answer is a number. Those are the failures that would silently mark a correct
 * student wrong, so anything that fails here is discarded.
 */
export function validateQuestion(
  raw: z.infer<typeof rawQuestionSchema>,
  selected: SelectedChunk[],
): { ok: true; question: GeneratedQuestion } | { ok: false; reason: string } {
  const chunk = selected.find((item) => normaliseRef(item.ref) === normaliseRef(raw.ref));
  if (!chunk) return { ok: false, reason: "cites material that was not supplied" };

  const prompt = raw.prompt.trim();
  const answer = raw.answer.trim();

  if (raw.type === "MULTIPLE_CHOICE") {
    const choices = raw.choices.map((choice) => choice.trim()).filter(Boolean);

    if (choices.length < 3 || choices.length > 5) {
      return { ok: false, reason: `has ${choices.length} options` };
    }

    const unique = new Set(choices.map((choice) => choice.toLowerCase()));
    if (unique.size !== choices.length) {
      return { ok: false, reason: "has duplicate options" };
    }

    // The single most damaging failure: a correct student marked wrong.
    if (!choices.some((choice) => choice.toLowerCase() === answer.toLowerCase())) {
      return { ok: false, reason: "its answer is not one of its own options" };
    }

    // Store the option exactly as it appears, so grading is a plain comparison.
    const canonical = choices.find((choice) => choice.toLowerCase() === answer.toLowerCase())!;

    return {
      ok: true,
      question: {
        type: "MULTIPLE_CHOICE",
        difficulty: raw.difficulty,
        prompt,
        choices,
        answer: canonical,
        tolerance: null,
        acceptableAnswers: [],
        explanation: raw.explanation.trim(),
        hint: raw.hint.trim(),
        sourceMaterialId: chunk.materialId,
        sourceExcerpt: chunk.content.slice(0, 300),
      },
    };
  }

  if (raw.type === "NUMERIC") {
    const value = Number(answer.replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      return { ok: false, reason: "its numeric answer is not a number" };
    }

    return {
      ok: true,
      question: {
        type: "NUMERIC",
        difficulty: raw.difficulty,
        prompt,
        choices: [],
        answer: String(value),
        // A zero tolerance makes any rounding wrong; give a small relative one.
        tolerance: raw.tolerance > 0 ? raw.tolerance : Math.max(Math.abs(value) * 0.01, 0.001),
        acceptableAnswers: [],
        explanation: raw.explanation.trim(),
        hint: raw.hint.trim(),
        sourceMaterialId: chunk.materialId,
        sourceExcerpt: chunk.content.slice(0, 300),
      },
    };
  }

  if (answer.length < 2) return { ok: false, reason: "has an empty model answer" };

  return {
    ok: true,
    question: {
      type: "SHORT_ANSWER",
      difficulty: raw.difficulty,
      prompt,
      choices: [],
      answer,
      tolerance: null,
      acceptableAnswers: raw.acceptableAnswers
        .map((alternative) => alternative.trim())
        .filter(Boolean),
      explanation: raw.explanation.trim(),
      hint: raw.hint.trim(),
      sourceMaterialId: chunk.materialId,
      sourceExcerpt: chunk.content.slice(0, 300),
    },
  };
}

export type QuestionsInput = {
  courseCode: string;
  topicName: string;
  topicDescription: string;
  chunks: SourceChunk[];
  count: number;
  /** Prompts already stored for this topic, so a top-up is not a repeat. */
  existingPrompts: string[];
};

export type QuestionsResult = {
  questions: GeneratedQuestion[];
  /** Questions the model produced that failed validation, for logging. */
  rejected: ValidationFailure[];
};

export async function generateQuestions(
  input: QuestionsInput,
): Promise<AiResult<QuestionsResult>> {
  const selected = selectGroundingChunks(input.chunks, { budgetChars: 35_000 });

  if (selected.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error: "There is no processed material for this topic yet.",
    };
  }

  const wanted = Math.min(Math.max(input.count, 1), MAX_PER_REQUEST);

  const avoid =
    input.existingPrompts.length > 0
      ? `\n\nYou have already written these questions for this topic. Write different ones, testing different aspects:\n${input.existingPrompts
          .slice(0, 30)
          .map((prompt) => `- ${prompt}`)
          .join("\n")}`
      : "";

  const result = await generateJson({
    schema: responseSchema,
    schemaName: "practice_questions",
    system: SYSTEM,
    reference: renderGroundingText(selected),
    instruction: `
Write ${wanted} practice questions on "${input.topicName}" for ${input.courseCode}.

The course's knowledge map describes this topic as: ${input.topicDescription}

Mix the three types and mix the difficulties. Cite the excerpt each question is
based on by its [S...] label.${avoid}
`.trim(),
    // A little variety is wanted here; questions should not all look alike.
    temperature: 0.6,
  });

  if (!result.ok) return result;

  const questions: GeneratedQuestion[] = [];
  const rejected: ValidationFailure[] = [];
  const seen = new Set(input.existingPrompts.map((prompt) => prompt.trim().toLowerCase()));

  for (const raw of result.data.questions) {
    const checked = validateQuestion(raw, selected);

    if (!checked.ok) {
      rejected.push({ prompt: raw.prompt.slice(0, 80), reason: checked.reason });
      continue;
    }

    const key = checked.question.prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    questions.push(checked.question);
  }

  if (questions.length === 0) {
    return {
      ok: false,
      kind: "invalid_output",
      error:
        "No usable questions came back — they either repeated existing ones or failed their consistency checks. Try again.",
    };
  }

  return { ok: true, data: { questions, rejected } };
}
