"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import {
  buildStudyGuideAction,
  type GuideState,
} from "@/app/(app)/courses/[courseId]/topics/[topicId]/actions";
import { Button } from "@/components/ui/button";

const INITIAL: GuideState = {};

export function BuildGuideButton({
  courseId,
  topicId,
  label,
}: {
  courseId: string;
  topicId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(buildStudyGuideAction, INITIAL);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="topicId" value={topicId} />
        <Button type="submit" className="h-9" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {pending ? "Writing your study guide…" : label}
        </Button>
      </form>

      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Reading the parts of your material that cover this topic.
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
    </div>
  );
}
