import { describe, expect, it } from "vitest";
import {
  gradeAnswer,
  normaliseAnswer,
  parseNumericAnswer,
  type GradableQuestion,
} from "@/lib/practice/grading";

/**
 * Answer grading.
 *
 * Two failures matter more than anything else here: marking a correct student
 * wrong, which teaches them to distrust the product, and marking a wrong answer
 * right, which lets them walk into an exam believing they know something. Both
 * are worse than escalating an ambiguous short answer to the AI grader.
 */

function mcq(overrides: Partial<GradableQuestion> = {}): GradableQuestion {
  return {
    type: "MULTIPLE_CHOICE",
    answer: "P(A and B) / P(B)",
    choices: ["P(A and B) / P(B)", "P(A) P(B)", "P(B) / P(A)", "P(A) + P(B)"],
    tolerance: null,
    acceptableAnswers: [],
    ...overrides,
  };
}

function numeric(overrides: Partial<GradableQuestion> = {}): GradableQuestion {
  return {
    type: "NUMERIC",
    answer: "0.75",
    choices: [],
    tolerance: 0.01,
    acceptableAnswers: [],
    ...overrides,
  };
}

function short(overrides: Partial<GradableQuestion> = {}): GradableQuestion {
  return {
    type: "SHORT_ANSWER",
    answer: "It is continuous",
    choices: [],
    tolerance: null,
    acceptableAnswers: ["continuous", "the function is continuous"],
    ...overrides,
  };
}

describe("normaliseAnswer", () => {
  it("ignores case, accents, spacing and stray punctuation", () => {
    expect(normaliseAnswer("  Café,  au   lait! ")).toBe(normaliseAnswer("cafe au lait"));
  });

  it("keeps characters that carry mathematical meaning", () => {
    expect(normaliseAnswer("-3.5")).toBe("-3.5");
    expect(normaliseAnswer("x/y")).toBe("x/y");
  });

  it("ignores a sentence-ending full stop on prose", () => {
    // Students punctuate sentences; that must never decide right from wrong.
    expect(normaliseAnswer("The function is continuous.")).toBe(
      normaliseAnswer("the function is continuous"),
    );
  });

  it("does not strip a decimal point from a number", () => {
    expect(normaliseAnswer("0.75")).toBe("0.75");
  });
});

describe("parseNumericAnswer", () => {
  it("reads the ways a student actually writes numbers", () => {
    expect(parseNumericAnswer("0.75")).toBe(0.75);
    expect(parseNumericAnswer(" 1,250 ")).toBe(1250);
    expect(parseNumericAnswer("3/4")).toBe(0.75);
    expect(parseNumericAnswer("75%")).toBe(0.75);
    expect(parseNumericAnswer("1.5e3")).toBe(1500);
    // A unicode minus sign pasted from a PDF must not read as text.
    expect(parseNumericAnswer("−2.5")).toBe(-2.5);
  });

  it("rejects things that are not numbers", () => {
    for (const value of ["", "about three", "12 metres", "1/0", "--5"]) {
      expect(parseNumericAnswer(value), value).toBeNull();
    }
  });
});

describe("multiple choice", () => {
  it("marks the correct option correct", () => {
    expect(gradeAnswer("P(A and B) / P(B)", mcq())).toEqual({ verdict: "correct", score: 1 });
  });

  it("is not defeated by trivial differences in the submitted option", () => {
    expect(gradeAnswer("  p(a and b) / p(b)  ", mcq()).verdict).toBe("correct");
  });

  it("marks a distractor incorrect", () => {
    expect(gradeAnswer("P(A) P(B)", mcq())).toEqual({ verdict: "incorrect", score: 0 });
  });

  it("marks an empty submission incorrect rather than crashing", () => {
    expect(gradeAnswer("   ", mcq()).verdict).toBe("incorrect");
  });
});

describe("numeric", () => {
  it("accepts an answer within tolerance", () => {
    expect(gradeAnswer("0.75", numeric()).verdict).toBe("correct");
    expect(gradeAnswer("0.752", numeric()).verdict).toBe("correct");
  });

  it("rejects an answer outside tolerance", () => {
    expect(gradeAnswer("0.8", numeric()).verdict).toBe("incorrect");
  });

  it("accepts equivalent notations", () => {
    // Same value, three ways a student might type it.
    expect(gradeAnswer("3/4", numeric()).verdict).toBe("correct");
    expect(gradeAnswer("75%", numeric()).verdict).toBe("correct");
    expect(gradeAnswer(".75", numeric()).verdict).toBe("correct");
  });

  it("does not punish sensible rounding when no tolerance was given", () => {
    // A zero tolerance would make every rounded answer wrong.
    const q = numeric({ answer: "0.3333333", tolerance: 0 });
    expect(gradeAnswer("0.333", q).verdict).toBe("correct");
  });

  it("handles negative and zero answers", () => {
    expect(gradeAnswer("-2.5", numeric({ answer: "-2.5" })).verdict).toBe("correct");
    expect(gradeAnswer("0", numeric({ answer: "0", tolerance: 0 })).verdict).toBe("correct");
    expect(gradeAnswer("1", numeric({ answer: "0", tolerance: 0 })).verdict).toBe("incorrect");
  });

  it("marks non-numeric text incorrect rather than escalating", () => {
    expect(gradeAnswer("about three quarters", numeric()).verdict).toBe("incorrect");
  });
});

describe("short answer", () => {
  it("accepts the model answer and its listed variants without paying for AI", () => {
    expect(gradeAnswer("It is continuous", short())).toEqual({ verdict: "correct", score: 1 });
    expect(gradeAnswer("continuous", short())).toEqual({ verdict: "correct", score: 1 });
    expect(gradeAnswer("The function is continuous.", short()).verdict).toBe("correct");
  });

  it("escalates anything needing judgement instead of guessing", () => {
    // Marking this wrong on string comparison would be unfair; marking it right
    // on keyword overlap would reward stuffing. Neither is decidable here.
    expect(gradeAnswer("it has no breaks or jumps", short())).toEqual({
      verdict: "needs_review",
    });
  });

  it("marks an empty answer incorrect without calling the model", () => {
    expect(gradeAnswer("", short())).toEqual({ verdict: "incorrect", score: 0 });
    expect(gradeAnswer("   ", short())).toEqual({ verdict: "incorrect", score: 0 });
  });
});
