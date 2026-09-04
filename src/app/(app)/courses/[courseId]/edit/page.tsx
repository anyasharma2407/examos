import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { updateCourseAction } from "@/app/(app)/courses/actions";
import { CourseForm } from "@/components/courses/course-form";
import { DeleteCourse } from "@/components/courses/delete-course";
import { requireUser } from "@/lib/auth";
import { requireOwnedCourse } from "@/lib/courses";
import { toDateInputValue } from "@/lib/dates";

export const metadata: Metadata = { title: "Course settings" };
export const dynamic = "force-dynamic";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireOwnedCourse(courseId, user.id);

  const finalExam = course.exams.find((exam) => exam.type === "FINAL") ?? course.exams[0];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href={`/courses/${course.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {course.code}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Course settings</h1>
      </div>

      <CourseForm
        action={updateCourseAction}
        submitLabel="Save changes"
        cancelHref={`/courses/${course.id}`}
        defaults={{
          courseId: course.id,
          name: course.name,
          code: course.code,
          examDate: finalExam ? toDateInputValue(finalExam.date) : "",
          targetGrade: course.targetGrade,
          weeklyStudyHours: String(course.weeklyStudyMinutes / 60),
        }}
      />

      <div className="border-t border-border pt-6">
        <h2 className="font-medium">Danger zone</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground text-pretty">
          Deleting {course.code} removes its material, topics, questions and your
          practice history for it.
        </p>
        <DeleteCourse courseId={course.id} courseCode={course.code} />
      </div>
    </div>
  );
}
