"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import type { UploadResult } from "@/lib/materials/types";
import { Button } from "@/components/ui/button";
import {
  FILE_INPUT_ACCEPT,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_BYTES,
  formatBytes,
} from "@/lib/materials/constants";
import { cn } from "@/lib/utils";

/**
 * Drop zone + file picker for course material.
 *
 * Files are POSTed one at a time to /api/materials/upload rather than as one
 * large multipart body: that keeps a big selection from buffering hundreds of
 * megabytes on the server, lets each file start being read while the next
 * uploads, and means one rejected file does not take the rest of the batch
 * with it.
 *
 * The route handler does the real validation; the checks here only exist to
 * give instant feedback, and nothing from this component is trusted.
 */
export function UploadDropzone({ courseId }: { courseId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Materials are still being read after the last upload returns, so pull fresh
  // server state; the list above polls from there.
  useEffect(() => {
    if (results.length > 0) router.refresh();
  }, [results, router]);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || isPending) return;

    const files = Array.from(fileList);
    setResults([]);
    setBatchNotice(
      files.length > MAX_FILES_PER_UPLOAD
        ? `Only the first ${MAX_FILES_PER_UPLOAD} files were taken.`
        : null,
    );

    const batch = files.slice(0, MAX_FILES_PER_UPLOAD);

    startTransition(async () => {
      const collected: UploadResult[] = [];

      for (const [index, file] of batch.entries()) {
        setProgress({ done: index, total: batch.length });

        const formData = new FormData();
        formData.append("courseId", courseId);
        formData.append("file", file);

        try {
          const response = await fetch("/api/materials/upload", {
            method: "POST",
            body: formData,
          });
          collected.push((await response.json()) as UploadResult);
        } catch {
          // A dropped connection, or the tab going away mid-upload. Keep going:
          // one bad file should not abandon the rest of the batch.
          collected.push({
            status: "failed",
            filename: file.name,
            error: "This file could not be sent. Check your connection and try again.",
          });
        }

        // Show each file's outcome as it lands rather than only at the end.
        setResults([...collected]);
      }

      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  const failures = results.filter((result) => result.status === "failed");
  const skipped = results.filter((result) => result.status === "skipped");
  const uploaded = results.filter((result) => result.status === "uploaded").length;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-foreground bg-muted/60" : "border-border",
        )}
      >
        {isPending ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground" role="status">
              {progress && progress.total > 1
                ? `Uploading file ${progress.done + 1} of ${progress.total}…`
                : "Uploading…"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Upload className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium">Drop your course material here</p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, PPTX or TXT · up to {formatBytes(MAX_FILE_BYTES)} each ·{" "}
                {MAX_FILES_PER_UPLOAD} files at a time
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => inputRef.current?.click()}
            >
              Choose files
            </Button>
          </div>
        )}
      </div>

      {batchNotice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {batchNotice}
        </p>
      ) : null}

      {failures.length > 0 ? (
        <ul role="alert" className="space-y-2">
          {failures.map((failure) => (
            <li
              key={failure.filename}
              className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">{failure.filename}</span> —{" "}
                {failure.status === "failed" ? failure.error : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {skipped.length > 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {skipped.length === 1
            ? `${skipped[0].filename} is already on this course, so it was skipped.`
            : `${skipped.length} files were already on this course and were skipped.`}
        </p>
      ) : null}

      {uploaded > 0 && failures.length === 0 && !isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          {uploaded} {uploaded === 1 ? "file" : "files"} uploaded. Reading them now.
        </p>
      ) : null}
    </div>
  );
}
