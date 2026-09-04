"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, RotateCw, Trash2 } from "lucide-react";
import {
  deleteMaterialAction,
  retryMaterialAction,
} from "@/app/(app)/courses/[courseId]/materials/actions";
import { isInFlight, MaterialStatusBadge } from "@/components/materials/material-status";
import { Button } from "@/components/ui/button";
import type { MaterialStatus } from "@/generated/prisma/enums";
import { formatBytes } from "@/lib/materials/constants";

export type MaterialRow = {
  id: string;
  filename: string;
  sizeBytes: number;
  status: MaterialStatus;
  statusError: string | null;
  chunkCount: number;
};

/** How often to re-check while something is still being processed. */
const POLL_MS = 2_000;

export function MaterialList({ materials }: { materials: MaterialRow[] }) {
  const router = useRouter();
  const busy = materials.some((material) => isInFlight(material.status));

  // Processing happens after the response, so the page has to ask for updates.
  // The interval only runs while something is actually in flight.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [busy, router]);

  if (materials.length === 0) return null;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {materials.map((material) => (
        <li key={material.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{material.filename}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(material.sizeBytes)}
              {material.status === "READY" && material.chunkCount > 0
                ? ` · ${material.chunkCount} sections`
                : ""}
            </p>
            {material.statusError ? (
              <p className="mt-1 text-xs text-destructive text-pretty">
                {material.statusError}
              </p>
            ) : null}
          </div>

          <MaterialStatusBadge status={material.status} />

          <div className="flex items-center gap-1">
            {material.status === "FAILED" ? (
              <form action={retryMaterialAction}>
                <input type="hidden" name="materialId" value={material.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Retry processing ${material.filename}`}
                >
                  <RotateCw aria-hidden />
                </Button>
              </form>
            ) : null}

            <form action={deleteMaterialAction}>
              <input type="hidden" name="materialId" value={material.id} />
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${material.filename}`}
              >
                <Trash2 aria-hidden />
              </Button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
