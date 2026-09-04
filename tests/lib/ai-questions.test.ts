import { describe, expect, it } from "vitest";
import { validateQuestion } from "@/lib/ai/questions";
import type { SelectedChunk } from "@/lib/ai/selection";

/**
 * Question self-consistency checks.
 *
 * The JSON schema guarantees field types. It cannot guarantee that a
 * multiple-choice answer appears among its own options, or that a "numeric"
 * answer is a number — and those are exactly the defects that mark a correct
 * student wrong. Anything failing here is discarded rather than stored.
 */

const selected: SelectedChunk[] = [
  {
    ref: "S1",
    materialId: "material-a",
    materialFilename: "lecture03.pdf",
    chunkId: "chunk-a1",
    chunkIndex: 0,
    content: "Conditional probability is P(A|B) = P(A and B) / P(B).",
  },
];

function raw(overrides: Record<string, unknown> = {}) {
  return {
    type: "MULTIPLE_CHOICE" as const,
    difficulty: "MEDIUM" as const,
    prompt: "Which expression gives the conditional probability of A given B?",
    choices: ["P(A and B) / P(B)", "P(A) P(B)", "P(B) / P(A)", "P(A) + P(B)"],
    answer: "P(A and B) / P(B)",
    tolerance: 0,
    acceptableAnswers: [] as string[],
    explanation: "Conditional probability divides the joint probability by P(B).",
    hint: "Start from the definition of conditional probability.",
    ref: "S1",
    ...overrides,
  } as Parameters<typeof validateQuestion>[0];
}

describe("grounding", () => {
  it("keeps a question citing supplied material", () => {
    const result = validateQuestion(raw(), selected);
    expect(result.ok).toBe(true);
  });

  it("accepts a bracketed citation label", () => {
    expect(validateQuestion(raw({ ref: "[S1]" }), selected).ok).toBe(true);
  });

  it("rejects a question citing material that was never sent", () => {
    const result = validateQuestion(raw({ ref: "S99" }), selected);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/not supplied/) });
  });
});

describe("multiple choice", () => {
  it("rejects a question whose answer is not one of its own options", () => {
    // The worst possible defect: every student is marked wrong.
    const result = validateQuestion(
      raw({ answer: "P(A) / P(A and B)" }),
      selected,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "its answer is not one of its own options",
    });
  });

  it("matches the answer to an option case-insensitively and stores the option verbatim", () => {
    const result = validateQuestion(raw({ answer: "p(a and b) / p(b)" }), selected);
    expect(result.ok).toBe(true);
    // Grading later is a plain comparison, so the stored answer must be the
    // exact option text the student will click.
    expect(result.ok && result.question.answer).toBe("P(A and B) / P(B)");
  });

  it("rejects duplicate options", () => {
    const result = validateQuestion(
      raw({ choices: ["P(A and B) / P(B)", "P(A) P(B)", "P(A) P(B)", "P(A) + P(B)"] }),
      selected,
    );
    expect(result).toMatchObject({ ok: false, reason: "has duplicate options" });
  });

  it("rejects too few or too many options", () => {
    expect(validateQuestion(raw({ choices: ["only one"] }), selected).ok).toBe(false);
    expect(
      validateQuestion(raw({ choices: ["a", "b", "c", "d", "e", "f"] }), selected).ok,
    ).toBe(false);
  });
});

describe("numeric", () => {
  const numeric = (overrides: Record<string, unknown> = {}) =>
    raw({
      type: "NUMERIC",
      choices: [],
      answer: "0.75",
      tolerance: 0.01,
      prompt: "What is P(A given B) if P(A and B) = 0.3 and P(B) = 0.4?",
      ...overrides,
    });

  it("keeps a well-formed numeric question", () => {
    const result = validateQuestion(numeric(), selected);
    expect(result.ok).toBe(true);
    expect(result.ok && result.question.tolerance).toBe(0.01);
  });

  it("rejects a numeric answer that is not a number", () => {
    const result = validateQuestion(numeric({ answer: "about three quarters" }), selected);
    expect(result).toMatchObject({ ok: false, reason: "its numeric answer is not a number" });
  });

  it("supplies a tolerance when the model gave none, so rounding is not punished", () => {
    const result = validateQuestion(numeric({ answer: "10", tolerance: 0 }), selected);
    expect(result.ok && result.question.tolerance).toBeGreaterThan(0);
  });

  it("normalises the stored answer", () => {
    const result = validateQuestion(numeric({ answer: " 1,250 " }), selected);
    expect(result.ok && result.question.answer).toBe("1250");
  });
});

describe("short answer", () => {
  const shortAnswer = (overrides: Record<string, unknown> = {}) =>
    raw({
      type: "SHORT_ANSWER",
      choices: [],
      answer: "Divide the joint probability by P(B)",
      acceptableAnswers: ["P(A and B) over P(B)"],
      ...overrides,
    });

  it("keeps a well-formed short answer question with its variants", () => {
    const result = validateQuestion(shortAnswer(), selected);
    expect(result.ok).toBe(true);
    expect(result.ok && result.question.acceptableAnswers).toEqual(["P(A and B) over P(B)"]);
  });

  it("rejects an empty model answer", () => {
    const result = validateQuestion(shortAnswer({ answer: "x" }), selected);
    expect(result).toMatchObject({ ok: false });
  });
});

describe("stored shape", () => {
  it("records where the question came from so it can be traced", () => {
    const result = validateQuestion(raw(), selected);
    expect(result.ok && result.question.sourceMaterialId).toBe("material-a");
    expect(result.ok && result.question.sourceExcerpt).toContain("Conditional probability");
  });
});
