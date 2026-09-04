"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
  buildKnowledgeMapAction,
  type BuildMapState,
} from "@/app/(app)/courses/[courseId]/topics/actions";
import { Button } from "@/components/ui/button";

const INITIAL: BuildMapState = {};

export function BuildMapButton({
  courseId,
  disabled,
  label,
}: {
  courseId: string;
  disabled?: boolean;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(buildKnowledgeMapAction, INITIAL);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="courseId" value={courseId} />
        <Button type="submit" className="h-9" disabled={pending || disabled}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {pending ? "Reading your material…" : label}
        </Button>
      </form>

      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          This takes a few seconds — ExamOS is working through your uploads.
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
    </div>
  );
}
