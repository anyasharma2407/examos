"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
  generateAllQuestionsAction,
  type GenerateQuestionsState,
} from "@/app/(app)/courses/[courseId]/practice/actions";
import { Button } from "@/components/ui/button";

const INITIAL: GenerateQuestionsState = {};

/**
 * Writing and starting practice, from the course page.
 *
 * Deliberately does NOT list the topics: the knowledge map directly above
 * already does, and repeating it made the same six rows appear twice on one
 * screen. Per-topic question counts live on those rows instead, and writing
 * questions for a single topic lives on that topic's own page.
 */
export function CourseQuestions({
  courseId,
  totalQuestions,
  topicsWithoutQuestions,
}: {
  courseId: string;
  totalQuestions: number;
  topicsWithoutQuestions: number;
}) {
  const [state, formAction, pending] = useActionState(generateAllQuestionsAction, INITIAL);

  return (
    <section aria-labelledby="questions-heading" className="space-y-4">
      <div>
        <h2 id="questions-heading" className="font-medium">
          Practice questions
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
          {totalQuestions > 0
            ? `${totalQuestions} ${totalQuestions === 1 ? "question" : "questions"} written from your own material. Answering them is what builds your mastery scores.`
            : "Written from your own material — applying the method, not reciting the definition."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {totalQuestions > 0 ? (
          <Button asChild className="h-10 px-4">
            <Link href={`/courses/${courseId}/practice`}>
              Start studying
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null}

        {topicsWithoutQuestions > 0 ? (
          <form action={formAction}>
            <input type="hidden" name="courseId" value={courseId} />
            <Button
              type="submit"
              variant={totalQuestions > 0 ? "outline" : "default"}
              className="h-10 px-4"
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Sparkles aria-hidden />
              )}
              {pending
                ? "Writing questions…"
                : `Write questions for ${topicsWithoutQuestions} ${topicsWithoutQuestions === 1 ? "topic" : "topics"}`}
            </Button>
          </form>
        ) : null}
      </div>

      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Writing questions from the parts of your material that cover each topic. This
          takes up to a minute.
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="flex gap-2 text-sm text-muted-foreground" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-strong" aria-hidden />
          {state.success}
        </p>
      ) : null}

      {state.failures && state.failures.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <p className="text-sm font-medium">
            {state.failures.length === 1
              ? "One topic produced no questions"
              : `${state.failures.length} topics produced no questions`}
          </p>
          <ul className="space-y-1.5">
            {state.failures.map((failure) => (
              <li key={failure.topicName} className="text-sm text-muted-foreground text-pretty">
                <span className="font-medium text-foreground">{failure.topicName}</span> —{" "}
                {failure.reason}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground text-pretty">
            This usually means the topic only appears as a line in your course outline.
            Upload material that actually covers it, rebuild the knowledge map, and try
            again.
          </p>
        </div>
      ) : null}
    </section>
  );
}
