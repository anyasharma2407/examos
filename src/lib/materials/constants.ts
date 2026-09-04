import type { MaterialKind } from "@/generated/prisma/enums";

/**
 * Upload policy.
 *
 * Kept in one place because the same limits are enforced in three layers: the
 * file picker's `accept` attribute (convenience), the Server Action (the real
 * check), and `next.config.ts`'s request body limit (the outer bound).
 */

/**
 * Largest single file we accept.
 *
 * Scanned lecture notes and image-heavy slide decks routinely run to tens of
 * megabytes, so this is set well above a typical text PDF. Three separate
 * ceilings have to agree, and the lowest one wins:
 *
 *  1. this value, enforced in `validateUpload`
 *  2. `serverActions.bodySizeLimit` in next.config.ts (one file per request)
 *  3. the storage backend's own cap — `[storage] file_size_limit` in
 *     supabase/config.toml locally; on hosted Supabase it is a project setting
 *     that varies by plan
 *
 * Set `NEXT_PUBLIC_MAX_UPLOAD_MB` to match whichever of those is lowest in a
 * given deployment. Accepting a file the storage backend will then reject is
 * the worst outcome: the student waits through the whole upload to be told no.
 * It is public because the picker and the drop zone display the limit.
 */
function resolveMaxFileBytes(): number {
  const configured = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.round(configured) * 1024 * 1024;
  }
  return 100 * 1024 * 1024;
}

export const MAX_FILE_BYTES = resolveMaxFileBytes();

/**
 * How many files one selection may contain. They are uploaded one request at a
 * time, so this bounds the batch, not the memory used.
 */
export const MAX_FILES_PER_UPLOAD = 25;

export type AcceptedType = {
  kind: MaterialKind;
  extension: string;
  /** MIME types browsers actually report for this format. */
  mimeTypes: readonly string[];
  label: string;
};

export const ACCEPTED_TYPES: readonly AcceptedType[] = [
  {
    kind: "PDF",
    extension: ".pdf",
    mimeTypes: ["application/pdf", "application/x-pdf"],
    label: "PDF",
  },
  {
    kind: "DOCX",
    extension: ".docx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    label: "Word document",
  },
  {
    kind: "PPTX",
    extension: ".pptx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    label: "PowerPoint slides",
  },
  {
    kind: "TXT",
    extension: ".txt",
    mimeTypes: ["text/plain", "text/markdown", ""],
    label: "Plain text",
  },
] as const;

/** Value for an `<input type="file" accept="...">`. */
export const FILE_INPUT_ACCEPT = ACCEPTED_TYPES.flatMap((type) => [
  type.extension,
  ...type.mimeTypes.filter(Boolean),
]).join(",");

export const MATERIAL_BUCKET = "course-material";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
