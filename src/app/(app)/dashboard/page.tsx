import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { CourseCard } from "@/components/courses/course-card";
import { NoCoursesYet } from "@/components/courses/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { listCourseSummaries, type CourseSummary } from "@/lib/courses";
import { countdownLabel, daysUntil, formatExamDate } from "@/lib/dates";
import { greetingFor } from "@/lib/greeting";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Today" };

/** Session state changes per request, so never serve this from the cache. */
export const dynamic = "force-dynamic";

/** The soonest exam that has not happened yet, across every course. */
function nextUpcoming(courses: CourseSummary[]): CourseSummary | null {
  const upcoming = courses
    .filter((course) => course.nextExam && daysUntil(course.nextExam.date) >= 0)
    .sort((a, b) => a.nextExam!.date.getTime() - b.nextExam!.date.getTime());
  return upcoming[0] ?? null;
}

/**
 * The single most useful thing this student could do right now. Whatever the
 * dashboard shows, it must always end in a link that goes somewhere real.
 */
function nextAction(course: CourseSummary): { label: string; href: string; why: string } {
  if (course.materialCount === 0) {
    return {
      label: "Add your course material",
      href: `/courses/${course.id}`,
      why: "ExamOS needs your lecture slides or notes before it can work out what to study.",
    };
  }
  if (course.topicCount === 0) {
    return {
      label: "Build the knowledge map",
      href: `/courses/${course.id}`,
      why: "Your material is uploaded — next it gets turned into topics.",
    };
  }
  return {
    label: "Open course",
    href: `/courses/${course.id}`,
    why: "Keep working through your topics.",
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const courses = await listCourseSummaries(user.id);

  const greeting = greetingFor(new Date().getHours());
  const firstName = user.name?.trim().split(/\s+/)[0];
  const focus = nextUpcoming(courses) ?? courses[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {courses.length === 0
              ? "Set up a course to start building your study plan."
              : `${courses.length} active ${courses.length === 1 ? "course" : "courses"}.`}
          </p>
        </div>
        {courses.length > 0 ? (
          <Button asChild variant="outline" className="h-9">
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
        <>
          {focus ? <FocusCard course={focus} /> : null}

          <section aria-labelledby="your-courses" className="space-y-4">
            <h2 id="your-courses" className="font-medium">
              Your courses
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {courses.map((course) => (
                <li key={course.id}>
                  <CourseCard course={course} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

/** The "what should I do now" panel — the point of the whole product. */
function FocusCard({ course }: { course: CourseSummary }) {
  const action = nextAction(course);
  const exam = course.nextExam;
  const days = exam ? daysUntil(exam.date) : null;

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="tabular text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {course.code} exam
            </p>
            <p className="mt-1 text-lg font-medium">
              {exam ? formatExamDate(exam.date) : "No exam date set"}
            </p>
          </div>
          {exam ? (
            <p
              className={cn(
                "tabular text-2xl font-semibold tracking-tight",
                days !== null && days <= 7
                  ? "text-weak"
                  : days !== null && days <= 21
                    ? "text-moderate"
                    : "text-foreground",
              )}
            >
              {countdownLabel(exam.date)}
            </p>
          ) : null}
        </div>

        <div className="border-t border-border pt-5">
          <p className="text-sm text-muted-foreground text-pretty">{action.why}</p>
          <Button asChild className="mt-4 h-10 px-4">
            <Link href={action.href}>
              {action.label}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
