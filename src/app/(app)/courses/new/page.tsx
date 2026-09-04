import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createCourseAction } from "@/app/(app)/courses/actions";
import { CourseForm } from "@/components/courses/course-form";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Add a course" };
export const dynamic = "force-dynamic";

export default async function NewCoursePage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Courses
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add a course</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          The exam date and your weekly study time are what the daily plan is built
          around. You can change both later.
        </p>
      </div>

      <CourseForm
        action={createCourseAction}
        submitLabel="Create course"
        cancelHref="/courses"
        defaults={{
          name: "",
          code: "",
          examDate: "",
          targetGrade: "CREDIT",
          weeklyStudyHours: "8",
        }}
      />
    </div>
  );
}
