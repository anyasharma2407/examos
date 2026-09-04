"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Layers, Loader2, RefreshCw } from "lucide-react";
import {
  generateFlashcardsAction,
  type FlashcardState,
} from "@/app/(app)/courses/[courseId]/topics/[topicId]/actions";
import { Button } from "@/components/ui/button";

const INITIAL: FlashcardState = {};

export function GenerateFlashcardsButton({
  courseId,
  topicId,
  cardCount,
}: {
  courseId: string;
  topicId: string;
  cardCount: number;
}) {
  const [state, formAction, pending] = useActionState(generateFlashcardsAction, INITIAL);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="topicId" value={topicId} />
          <Button
            type="submit"
            variant={cardCount > 0 ? "outline" : "default"}
            className="h-9"
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Layers aria-hidden />}
            {pending ? "Writing cards…" : cardCount > 0 ? "Add more cards" : "Make flashcards"}
          </Button>
        </form>

        {cardCount > 0 ? (
          <form action={formAction}>
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="topicId" value={topicId} />
            <input type="hidden" name="mode" value="replace" />
            <Button type="submit" variant="ghost" size="sm" disabled={pending}>
              <RefreshCw aria-hidden />
              Start the set again
            </Button>
          </form>
        ) : null}
      </div>

      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Writing cards from the parts of your material that cover this topic.
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
          {state.success} Reload to see them.
        </p>
      ) : null}
    </div>
  );
}
