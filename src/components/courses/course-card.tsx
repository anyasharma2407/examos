import Link from "next/link";
import { CalendarDays, Clock, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { targetGradeLabel, type CourseSummary } from "@/lib/courses";
import { countdownLabel, daysUntil, formatExamDate, formatMinutes } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Exam proximity drives the accent: under a fortnight is worth noticing. */
function urgencyClass(examDate: Date | undefined): string {
  if (!examDate) return "text-muted-foreground";
  const days = daysUntil(examDate);
  if (days < 0) return "text-muted-foreground";
  if (days <= 7) return "text-weak";
  if (days <= 21) return "text-moderate";
  return "text-muted-foreground";
}

export function CourseCard({ course }: { course: CourseSummary }) {
  const exam = course.nextExam;

  return (
    <Card className="relative transition-colors hover:border-foreground/20">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tabular text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {course.code}
            </p>
            <h3 className="mt-1 truncate font-medium">
              <Link href={`/courses/${course.id}`} className="hover:underline">
                {/* Stretches the link across the card without nesting anchors. */}
                <span className="absolute inset-0" aria-hidden />
                {course.name}
              </Link>
            </h3>
          </div>
          {exam ? (
            <span
              className={cn(
                "shrink-0 text-right text-xs font-medium",
                urgencyClass(exam.date),
              )}
            >
              {countdownLabel(exam.date)}
            </span>
          ) : null}
        </div>

        {/* Wraps rather than truncates: a long date must stay readable in a
            half-width card. */}
        <dl className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Exam date</dt>
            <dd>{exam ? formatExamDate(exam.date) : "No exam set"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Target className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Target grade</dt>
            <dd>{targetGradeLabel(course.targetGrade)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Weekly study time</dt>
            <dd>{formatMinutes(course.weeklyStudyMinutes)}/week</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
