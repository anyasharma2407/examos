import { describe, expect, it } from "vitest";
import { courseFormSchema, weeklyHoursToMinutes } from "@/lib/validation/course";

/** A valid submission, so each test can vary one field at a time. */
function submission(overrides: Record<string, unknown> = {}) {
  const nextYear = new Date();
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  return {
    name: "Discrete Mathematics",
    code: "MATH1061",
    examDate: nextYear.toISOString().slice(0, 10),
    targetGrade: "DISTINCTION",
    weeklyStudyHours: "8",
    ...overrides,
  };
}

function firstError(overrides: Record<string, unknown>): string | undefined {
  const result = courseFormSchema.safeParse(submission(overrides));
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("course creation", () => {
  it("accepts a complete submission and normalises it", () => {
    const result = courseFormSchema.safeParse(
      submission({ name: "  Discrete Mathematics  ", code: " math1061 " }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Discrete Mathematics");
    // Codes are identifiers: upper-casing makes the per-user unique constraint
    // catch "math1061" as a duplicate of "MATH1061".
    expect(result.data?.code).toBe("MATH1061");
    expect(result.data?.weeklyStudyHours).toBe(8);
  });

  it("requires a name and a code", () => {
    expect(firstError({ name: "   " })).toBe("Enter the course name");
    expect(firstError({ code: "" })).toBe("Enter the course code");
  });

  it("rejects course codes that are not identifier-shaped", () => {
    expect(firstError({ code: "!!!" })).toMatch(/letters, numbers/);
    expect(courseFormSchema.safeParse(submission({ code: "COMP_SCI 101-A" })).success).toBe(
      true,
    );
  });

  it("rejects an exam date in the past", () => {
    expect(firstError({ examDate: "2020-01-01" })).toBe("Your exam date is in the past");
  });

  it("rejects a mistyped exam date rather than silently shifting it", () => {
    expect(firstError({ examDate: "2028-02-30" })).toBe("Enter a valid date");
    expect(firstError({ examDate: "next tuesday" })).toBe("Enter a valid date");
  });

  it("rejects an exam date far enough out to break the planner", () => {
    // A typo like 2206 would make every countdown and readiness figure absurd.
    expect(firstError({ examDate: "2206-10-25" })).toMatch(/within the next/);
  });

  it("accepts today as an exam date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(courseFormSchema.safeParse(submission({ examDate: today })).success).toBe(true);
  });

  it("keeps weekly study time within a plausible range", () => {
    expect(firstError({ weeklyStudyHours: "0" })).toMatch(/at least 1 hour/);
    expect(firstError({ weeklyStudyHours: "99" })).toMatch(/60 hours/);
    expect(courseFormSchema.safeParse(submission({ weeklyStudyHours: "2.5" })).success).toBe(
      true,
    );
  });

  it("only accepts known grade bands", () => {
    expect(courseFormSchema.safeParse(submission({ targetGrade: "FIRST_CLASS" })).success).toBe(
      false,
    );
  });
});

describe("weeklyHoursToMinutes", () => {
  it("converts to whole minutes", () => {
    expect(weeklyHoursToMinutes(8)).toBe(480);
    expect(weeklyHoursToMinutes(2.5)).toBe(150);
    expect(weeklyHoursToMinutes(1.75)).toBe(105);
  });
});
