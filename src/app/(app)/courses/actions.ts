"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { courseFormSchema, weeklyHoursToMinutes } from "@/lib/validation/course";

/**
 * Course mutations.
 *
 * Server Actions accept direct POSTs, so each one re-authenticates with
 * `requireUser()` and scopes every write by that user's id. A course id
 * arriving in a form is treated as untrusted.
 */

export type CourseFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Postgres unique-violation, raised by the `[userId, code]` constraint. */
const UNIQUE_VIOLATION = "P2002";

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createCourseAction(
  _previous: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const user = await requireUser();

  const parsed = courseFormSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    examDate: formData.get("examDate"),
    targetGrade: formData.get("targetGrade"),
    weeklyStudyHours: formData.get("weeklyStudyHours"),
  });

  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { name, code, examDate, targetGrade, weeklyStudyHours } = parsed.data;

  let courseId: string;
  try {
    const course = await prisma.course.create({
      data: {
        userId: user.id,
        name,
        code,
        targetGrade,
        weeklyStudyMinutes: weeklyHoursToMinutes(weeklyStudyHours),
        // The final exam is what readiness and the study plan count down to.
        exams: { create: { title: "Final Exam", type: "FINAL", date: examDate } },
      },
      select: { id: true },
    });
    courseId = course.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      return { fieldErrors: { code: `You already have a course called ${code}.` } };
    }
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/courses");
  redirect(`/courses/${courseId}`);
}

export async function updateCourseAction(
  _previous: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const user = await requireUser();

  const courseId = formData.get("courseId");
  if (typeof courseId !== "string" || courseId.length === 0) {
    return { error: "That course could not be found." };
  }

  const parsed = courseFormSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    examDate: formData.get("examDate"),
    targetGrade: formData.get("targetGrade"),
    weeklyStudyHours: formData.get("weeklyStudyHours"),
  });

  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  // Ownership check and update in one statement: `updateMany` with a userId
  // filter cannot touch a course belonging to anyone else.
  const { name, code, examDate, targetGrade, weeklyStudyHours } = parsed.data;

  try {
    const { count } = await prisma.course.updateMany({
      where: { id: courseId, userId: user.id },
      data: {
        name,
        code,
        targetGrade,
        weeklyStudyMinutes: weeklyHoursToMinutes(weeklyStudyHours),
      },
    });

    if (count === 0) return { error: "That course could not be found." };

    const finalExam = await prisma.exam.findFirst({
      where: { courseId, type: "FINAL", course: { userId: user.id } },
      orderBy: { date: "asc" },
      select: { id: true },
    });

    if (finalExam) {
      await prisma.exam.update({ where: { id: finalExam.id }, data: { date: examDate } });
    } else {
      await prisma.exam.create({
        data: { courseId, title: "Final Exam", type: "FINAL", date: examDate },
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      return { fieldErrors: { code: `You already have a course called ${code}.` } };
    }
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}

export async function deleteCourseAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const courseId = formData.get("courseId");
  if (typeof courseId !== "string" || courseId.length === 0) return;

  // Scoped delete: a course id belonging to another user matches nothing.
  // Materials, topics, questions and attempts cascade from the schema.
  await prisma.course.deleteMany({ where: { id: courseId, userId: user.id } });

  revalidatePath("/dashboard");
  revalidatePath("/courses");
  redirect("/courses");
}
