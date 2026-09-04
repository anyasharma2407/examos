"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
  generateQuestionsAction,
  type GenerateQuestionsState,
} from "@/app/(app)/courses/[courseId]/practice/actions";
import { Button } from "@/components/ui/button";

const INITIAL: GenerateQuestionsState = {};

export function GenerateQuestionsButton({
  courseId,
  topicId,
  label,
  questionCount,
}: {
  courseId: string;
  topicId: string;
  label: string;
  questionCount: number;
}) {
  const [state, formAction, pending] = useActionState(generateQuestionsAction, INITIAL);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="topicId" value={topicId} />
          <Button
            type="submit"
            variant={questionCount > 0 ? "outline" : "default"}
            className="h-9"
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {pending ? "Writing questions…" : label}
          </Button>
        </form>

        {questionCount > 0 ? (
          <Button asChild className="h-9">
            <Link href={`/courses/${courseId}/practice?topic=${topicId}`}>
              Practise {questionCount} {questionCount === 1 ? "question" : "questions"}
            </Link>
          </Button>
        ) : null}
      </div>

      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Writing questions from the parts of your material that cover this topic.
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
          {state.success} Reload to practise them.
        </p>
      ) : null}
    </div>
  );
}
