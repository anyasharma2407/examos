"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FlashcardKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type DeckCard = {
  id: string;
  kind: FlashcardKind;
  front: string;
  back: string;
  sourceFilename: string | null;
};

const KIND_LABEL: Record<FlashcardKind, string> = {
  CONCEPT: "Concept",
  FORMULA: "Formula",
  DISTINCTION: "Distinction",
  APPLICATION: "Application",
  PITFALL: "Pitfall",
};

/** Deterministic shuffle so the order is stable within one pass. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * A flashcard deck: one card at a time, click to reveal.
 *
 * The answer is deliberately hidden until asked for — a card you can see the
 * back of is a card you cannot fail, which is the whole point of the format.
 * Arrow keys and space work, because anyone drilling cards will use the
 * keyboard within about thirty seconds.
 */
export function FlashcardDeck({ cards }: { cards: DeckCard[] }) {
  const [order, setOrder] = useState<DeckCard[]>(cards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const card = order[index];
  const atEnd = index >= order.length - 1;

  function go(delta: number) {
    setRevealed(false);
    setIndex((current) => Math.min(Math.max(current + delta, 0), order.length - 1));
  }

  function restart(shuffle: boolean) {
    setOrder(shuffle ? shuffled(cards) : cards);
    setIndex(0);
    setRevealed(false);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Never steal keys from someone typing in the tutor box.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setRevealed((value) => !value);
      } else if (event.key === "ArrowRight") {
        go(1);
      } else if (event.key === "ArrowLeft") {
        go(-1);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tabular text-sm text-muted-foreground">
          Card {index + 1} of {order.length}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => restart(true)}>
            <Shuffle aria-hidden />
            Shuffle
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => restart(false)}>
            <RotateCcw aria-hidden />
            Restart
          </Button>
        </div>
      </div>

      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={order.length}
        aria-label="Flashcard progress"
      >
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{ width: `${((index + 1) / order.length) * 100}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        aria-expanded={revealed}
        className={cn(
          "flex min-h-56 w-full flex-col justify-center gap-4 rounded-xl border px-6 py-8 text-left transition-colors",
          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          revealed ? "border-border bg-card" : "border-border bg-muted/30 hover:bg-muted/50",
        )}
      >
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {KIND_LABEL[card.kind]}
          </span>
          {card.sourceFilename ? (
            <span className="truncate text-[11px] text-muted-foreground">
              {card.sourceFilename}
            </span>
          ) : null}
        </span>

        <span className="text-lg leading-relaxed font-medium text-pretty">{card.front}</span>

        {revealed ? (
          <span className="border-t border-border pt-4 leading-relaxed text-pretty">
            {card.back}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            Click, or press space, to reveal the answer
          </span>
        )}
      </button>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9"
          onClick={() => go(-1)}
          disabled={index === 0}
        >
          <ArrowLeft aria-hidden />
          Previous
        </Button>

        {atEnd ? (
          <Button type="button" className="h-9" onClick={() => restart(true)}>
            <Shuffle aria-hidden />
            Go again, shuffled
          </Button>
        ) : (
          <Button type="button" className="h-9" onClick={() => go(1)}>
            Next
            <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
