import type { QuestionType } from "@/generated/prisma/enums";

/**
 * Deciding whether an answer is right.
 *
 * This is the highest-stakes pure code in the product. Marking a correct
 * student wrong teaches them to distrust the whole thing, and marking a wrong
 * answer right lets them walk into an exam believing they know something. Both
 * failures are worse than saying "I am not sure", which is why short answers
 * that are not an obvious match are escalated to the AI grader instead of being
 * guessed at here.
 *
 * Pure and synchronous — no I/O, exhaustively unit-tested.
 */

export type GradeOutcome =
  | { verdict: "correct"; score: 1 }
  | { verdict: "incorrect"; score: 0 }
  /** Needs judgement this code cannot make; the caller asks the model. */
  | { verdict: "needs_review" };

export type GradableQuestion = {
  type: QuestionType;
  answer: string;
  choices: string[];
  tolerance: number | null;
  acceptableAnswers: string[];
};

/**
 * Normalises free text for comparison: case, accents, punctuation and spacing
 * should never be the difference between right and wrong.
 */
export function normaliseAnswer(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    // Strip combining accents so "cafe" matches "café".
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.\-+/]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // A sentence-ending full stop must not be the difference between right and
  // wrong. Only stripped when the answer contains letters, so the decimal point
  // in "0.75" and a bare "1." survive intact.
  return /\p{L}/u.test(cleaned) ? cleaned.replace(/\.+$/, "").trim() : cleaned;
}

/**
 * Parses a number the way a student would write one, accepting thousands
 * separators, unicode minus, percentages, fractions and simple scientific
 * notation. Returns null when the text is not a number at all.
 */
export function parseNumericAnswer(value: string): number | null {
  const cleaned = value
    .trim()
    .replace(/[−‒–—]/g, "-")
    .replace(/,/g, "")
    .replace(/\s/g, "");

  if (cleaned.length === 0) return null;

  // "3/4" is a perfectly reasonable way to write 0.75.
  const fraction = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(cleaned);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }

  const percentage = /^(-?\d+(?:\.\d+)?)%$/.exec(cleaned);
  if (percentage) return Number(percentage[1]) / 100;

  if (!/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function gradeNumeric(given: string, question: GradableQuestion): GradeOutcome {
  const student = parseNumericAnswer(given);
  const expected = parseNumericAnswer(question.answer);

  if (student === null || expected === null) return { verdict: "incorrect", score: 0 };

  // A tolerance of zero would make any rounding wrong; fall back to a small
  // relative one so 0.333 counts for 1/3.
  const tolerance =
    question.tolerance && question.tolerance > 0
      ? question.tolerance
      : Math.max(Math.abs(expected) * 0.01, 1e-6);

  return Math.abs(student - expected) <= tolerance
    ? { verdict: "correct", score: 1 }
    : { verdict: "incorrect", score: 0 };
}

function gradeMultipleChoice(given: string, question: GradableQuestion): GradeOutcome {
  const student = normaliseAnswer(given);
  if (student.length === 0) return { verdict: "incorrect", score: 0 };

  return student === normaliseAnswer(question.answer)
    ? { verdict: "correct", score: 1 }
    : { verdict: "incorrect", score: 0 };
}

function gradeShortAnswer(given: string, question: GradableQuestion): GradeOutcome {
  const student = normaliseAnswer(given);
  if (student.length === 0) return { verdict: "incorrect", score: 0 };

  const accepted = [question.answer, ...question.acceptableAnswers].map(normaliseAnswer);

  // An exact match on the model answer or a listed variant is unambiguous, and
  // handling it here keeps the common case free and instant.
  if (accepted.includes(student)) return { verdict: "correct", score: 1 };

  // Anything else is a judgement call about meaning. Guessing from string
  // overlap would mark paraphrases wrong and keyword-stuffing right, so it goes
  // to the model instead.
  return { verdict: "needs_review" };
}

export function gradeAnswer(given: string, question: GradableQuestion): GradeOutcome {
  switch (question.type) {
    case "MULTIPLE_CHOICE":
      return gradeMultipleChoice(given, question);
    case "NUMERIC":
      return gradeNumeric(given, question);
    case "SHORT_ANSWER":
      return gradeShortAnswer(given, question);
  }
}
