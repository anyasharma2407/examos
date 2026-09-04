import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CourseCard } from "@/components/courses/course-card";
import { NoCoursesYet } from "@/components/courses/empty-state";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { listCourseSummaries } from "@/lib/courses";

export const metadata: Metadata = { title: "Courses" };
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const user = await requireUser();
  const courses = await listCourseSummaries(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {courses.length === 0
              ? "Everything ExamOS knows about you starts here."
              : `${courses.length} ${courses.length === 1 ? "course" : "courses"}.`}
          </p>
        </div>
        {courses.length > 0 ? (
          <Button asChild className="h-9 px-4">
            <Link href="/courses/new">
              <Plus aria-hidden />
              Add course
            </Link>
          </Button>
        ) : null}
      </div>

      {courses.length === 0 ? (
        <NoCoursesYet />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {courses.map((course) => (
            <li key={course.id}>
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
