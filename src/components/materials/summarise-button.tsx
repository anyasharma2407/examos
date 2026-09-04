"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
  summariseReadingsAction,
  summariseSectionAction,
  type SummaryState,
} from "@/app/(app)/courses/[courseId]/materials/[materialId]/actions";
import { Button } from "@/components/ui/button";

const INITIAL: SummaryState = {};

/** Summarises the one section being read. */
export function SummariseSectionButton({
  chunkId,
  path,
  hasSummary,
}: {
  chunkId: string;
  path: string;
  hasSummary: boolean;
}) {
  const [state, formAction, pending] = useActionState(summariseSectionAction, INITIAL);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="chunkId" value={chunkId} />
        <input type="hidden" name="path" value={path} />
        {hasSummary ? <input type="hidden" name="mode" value="redo" /> : null}
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {pending
            ? "Summarising…"
            : hasSummary
              ? "Summarise again"
              : "Summarise this section"}
        </Button>
      </form>

      {state.error ? (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/** Summarises every passage a topic's study guide recommends, in one go. */
export function SummariseReadingsButton({
  topicId,
  path,
  anySummarised,
}: {
  topicId: string;
  path: string;
  anySummarised: boolean;
}) {
  const [state, formAction, pending] = useActionState(summariseReadingsAction, INITIAL);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="topicId" value={topicId} />
        <input type="hidden" name="path" value={path} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {pending
            ? "Summarising…"
            : anySummarised
              ? "Summarise the rest"
              : "Summarise these sections"}
        </Button>
      </form>

      {state.error ? (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
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
