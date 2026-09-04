import { AlertCircle, Check, Loader2, Upload } from "lucide-react";
import type { MaterialStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/** Statuses that are still moving, so the UI knows to keep polling. */
export const IN_FLIGHT_STATUSES: readonly MaterialStatus[] = [
  "UPLOADING",
  "PROCESSING",
  "ANALYSING",
];

export function isInFlight(status: MaterialStatus): boolean {
  return IN_FLIGHT_STATUSES.includes(status);
}

const LABELS: Record<MaterialStatus, string> = {
  UPLOADING: "Uploading",
  PROCESSING: "Processing",
  ANALYSING: "Analysing",
  READY: "Ready",
  FAILED: "Failed",
};

export function MaterialStatusBadge({
  status,
  className,
}: {
  status: MaterialStatus;
  className?: string;
}) {
  const busy = isInFlight(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "READY" && "bg-strong/10 text-strong",
        status === "FAILED" && "bg-destructive/10 text-destructive",
        busy && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {status === "READY" ? (
        <Check className="size-3" aria-hidden />
      ) : status === "FAILED" ? (
        <AlertCircle className="size-3" aria-hidden />
      ) : status === "UPLOADING" ? (
        <Upload className="size-3" aria-hidden />
      ) : (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      )}
      {LABELS[status]}
    </span>
  );
}
