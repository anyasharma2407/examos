import { cn } from "@/lib/utils";

type PreviewTask = {
  topic: string;
  minutes: number;
  detail: string;
  level: "weak" | "moderate" | "strong";
};

const TASKS: PreviewTask[] = [
  { topic: "Probability", minutes: 35, detail: "Conditional probability · 10 questions", level: "weak" },
  { topic: "Integration", minutes: 25, detail: "Review mistakes · 5 questions", level: "weak" },
  { topic: "Sequences", minutes: 20, detail: "Concept review · 5 questions", level: "moderate" },
  { topic: "Differentiation", minutes: 10, detail: "Spaced review", level: "strong" },
];

const DOT: Record<PreviewTask["level"], string> = {
  weak: "bg-weak",
  moderate: "bg-moderate",
  strong: "bg-strong",
};

/**
 * Static illustration of a generated daily plan, used on the landing page.
 * Marketing copy only — the real plan is rendered by the dashboard.
 */
export function PlanPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Today
          </p>
          <p className="mt-1 text-sm text-muted-foreground">90 minutes available</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Readiness
          </p>
          <p className="tabular mt-1 text-2xl font-semibold tracking-tight">72%</p>
        </div>
      </div>

      <ul className="mt-5 space-y-1">
        {TASKS.map((task) => (
          <li
            key={task.topic}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60"
          >
            <span className={cn("size-2 shrink-0 rounded-full", DOT[task.level])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{task.topic}</span>
              <span className="block truncate text-xs text-muted-foreground">{task.detail}</span>
            </span>
            <span className="tabular shrink-0 text-sm text-muted-foreground">
              {task.minutes} min
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex h-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
        Start studying
      </div>
    </div>
  );
}
