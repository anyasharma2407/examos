import { z } from "zod";
import { parseDateOnly } from "@/lib/dates";

/** Grade bands, ordered from lowest. Mirrors the `TargetGrade` enum. */
export const TARGET_GRADES = [
  { value: "PASS", label: "Pass" },
  { value: "CREDIT", label: "Credit" },
  { value: "DISTINCTION", label: "Distinction" },
  { value: "HIGH_DISTINCTION", label: "High Distinction" },
] as const;

export const targetGradeSchema = z.enum([
  "PASS",
  "CREDIT",
  "DISTINCTION",
  "HIGH_DISTINCTION",
]);

/** How far ahead an exam may reasonably be scheduled. */
const MAX_EXAM_YEARS_AHEAD = 3;

/**
 * An exam date must be a real calendar date, not already past, and not absurdly
 * far away — a typo like `2206` would otherwise wreck every readiness and
 * study-plan calculation downstream.
 */
const examDateSchema = z
  .string()
  .trim()
  .min(1, "Choose your exam date")
  .transform((value, ctx) => {
    const parsed = parseDateOnly(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return parsed;
  })
  .refine(
    (date) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return date.getTime() >= today.getTime();
    },
    { message: "Your exam date is in the past" },
  )
  .refine(
    (date) => {
      const limit = new Date();
      limit.setUTCFullYear(limit.getUTCFullYear() + MAX_EXAM_YEARS_AHEAD);
      return date.getTime() <= limit.getTime();
    },
    { message: `Choose a date within the next ${MAX_EXAM_YEARS_AHEAD} years` },
  );

export const courseFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the course name")
    .max(120, "That course name is too long"),
  code: z
    .string()
    .trim()
    .min(1, "Enter the course code")
    .max(20, "That course code is too long")
    // Codes are identifiers, so normalise case: MATH1061 and math1061 are the
    // same course and must collide on the per-user unique constraint.
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z0-9][A-Z0-9 ._-]*$/.test(value), {
      message: "Use letters, numbers, spaces, dots, dashes or underscores",
    }),
  examDate: examDateSchema,
  targetGrade: targetGradeSchema,
  // Kept in hours because that is what the student types; the action converts
  // to the minutes the schema stores.
  weeklyStudyHours: z.coerce
    .number({ error: "Enter your weekly study time" })
    .min(1, "Set aside at least 1 hour a week")
    .max(60, "60 hours a week is the maximum"),
});

/** Weekly study time is stored in minutes so the planner never deals in fractions. */
export function weeklyHoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export type CourseFormInput = z.infer<typeof courseFormSchema>;
