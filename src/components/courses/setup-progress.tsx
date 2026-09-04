import { Check, Circle, Dot } from "lucide-react";
import { cn } from "@/lib/utils";

export type SetupStep = {
  label: string;
  detail: string;
  state: "done" | "next" | "later";
};

/**
 * Shows a student where they are in getting a course ready, so a course with no
 * material yet reads as "step 1 of 5 complete" rather than as an empty screen.
 */
export function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((step) => step.state === "done").length;

  return (
    <section aria-labelledby="setup-progress-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="setup-progress-heading" className="font-medium">
          Getting this course ready
        </h2>
        <p className="tabular text-sm text-muted-foreground">
          {done} of {steps.length}
        </p>
      </div>

      <ol className="space-y-px overflow-hidden rounded-xl border border-border">
        {steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              "flex gap-3 border-b border-border px-4 py-3.5 last:border-b-0",
              step.state === "later" && "opacity-60",
            )}
          >
            <span className="mt-0.5 shrink-0">
              {step.state === "done" ? (
                <Check className="size-4 text-strong" aria-hidden />
              ) : step.state === "next" ? (
                <Circle className="size-4 text-foreground" aria-hidden />
              ) : (
                <Dot className="size-4 text-muted-foreground" aria-hidden />
              )}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{step.label}</span>
                {step.state === "next" ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Next
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">
                {step.detail}
              </span>
            </span>
            <span className="sr-only">
              {step.state === "done" ? "Complete" : step.state === "next" ? "Next step" : "Not started"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
