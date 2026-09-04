import "server-only";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { TargetGrade } from "@/generated/prisma/enums";

/**
 * Course reads.
 *
 * Every function here takes a `userId` and filters on it. Loading a course by
 * id alone would let anyone with a course id read another student's course, so
 * there is deliberately no such helper.
 */

export type CourseSummary = {
  id: string;
  name: string;
  code: string;
  targetGrade: TargetGrade;
  weeklyStudyMinutes: number;
  nextExam: { id: string; title: string; date: Date } | null;
  topicCount: number;
  materialCount: number;
};

export async function listCourseSummaries(userId: string): Promise<CourseSummary[]> {
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      targetGrade: true,
      weeklyStudyMinutes: true,
      exams: {
        orderBy: { date: "asc" },
        select: { id: true, title: true, date: true },
      },
      _count: { select: { topics: true, materials: true } },
    },
  });

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  return courses.map((course) => ({
    id: course.id,
    name: course.name,
    code: course.code,
    targetGrade: course.targetGrade,
    weeklyStudyMinutes: course.weeklyStudyMinutes,
    // The soonest exam still ahead of us; fall back to the last one so a
    // finished course still shows a date rather than nothing.
    nextExam:
      course.exams.find((exam) => exam.date.getTime() >= todayStart.getTime()) ??
      course.exams.at(-1) ??
      null,
    topicCount: course._count.topics,
    materialCount: course._count.materials,
  }));
}

/** The course, or null when it does not exist or belongs to someone else. */
export async function getOwnedCourse(courseId: string, userId: string) {
  return prisma.course.findFirst({
    where: { id: courseId, userId },
    include: { exams: { orderBy: { date: "asc" } } },
  });
}

/**
 * The course, or a 404. Another user's course is reported as missing rather
 * than forbidden so that ids cannot be probed for existence.
 */
export async function requireOwnedCourse(courseId: string, userId: string) {
  const course = await getOwnedCourse(courseId, userId);
  if (!course) notFound();
  return course;
}

export function targetGradeLabel(grade: TargetGrade): string {
  switch (grade) {
    case "PASS":
      return "Pass";
    case "CREDIT":
      return "Credit";
    case "DISTINCTION":
      return "Distinction";
    case "HIGH_DISTINCTION":
      return "High Distinction";
  }
}
