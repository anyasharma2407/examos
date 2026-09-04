import type { MaterialKind } from "@/generated/prisma/enums";
import { ACCEPTED_TYPES, MAX_FILE_BYTES, formatBytes } from "@/lib/materials/constants";

/**
 * Upload validation.
 *
 * Uploaded files are untrusted input. A browser-reported MIME type and a file
 * extension are both attacker-controlled, so the file's leading bytes are
 * checked too: renaming `payload.exe` to `notes.pdf` must not get past this.
 *
 * Pure and synchronous so it can be exhaustively unit-tested.
 */

export type UploadCandidate = {
  filename: string;
  mimeType: string;
  size: number;
  /** The first kilobyte or so of the file. */
  head: Uint8Array;
};

export type ValidationResult =
  | { ok: true; kind: MaterialKind; safeFilename: string }
  | { ok: false; reason: string };

/** `%PDF-` — the PDF header. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * `PK\x03\x04` — the local file header every real ZIP starts with. DOCX and
 * PPTX are both ZIP containers, so this cannot tell them apart; the extension
 * decides which extractor runs, and a mismatch fails cleanly during processing
 * rather than corrupting anything.
 */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Some generators emit a few junk bytes before `%PDF-`, and readers tolerate it,
 * so scan a short prefix rather than demanding it at offset zero.
 */
function containsPdfSignature(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024);
  for (let index = 0; index <= limit - PDF_SIGNATURE.length; index += 1) {
    if (startsWith(bytes, PDF_SIGNATURE, index)) return true;
  }
  return false;
}

/** Text must be decodable as UTF-8 and free of NUL, which Postgres rejects. */
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

/**
 * Strips directory components and anything that could confuse a storage path.
 * The stored object key is generated from an id anyway; this keeps the display
 * name and the key readable and safe.
 */
export function sanitiseFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    // Strip control characters, then anything outside a conservative allowlist.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+/, "")
    .trim();
  return cleaned.slice(0, 120) || "file";
}

export function validateUpload(candidate: UploadCandidate): ValidationResult {
  const safeFilename = sanitiseFilename(candidate.filename);

  if (candidate.size === 0) {
    return { ok: false, reason: "That file is empty." };
  }

  if (candidate.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `That file is ${formatBytes(candidate.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
    };
  }

  const extension = extensionOf(safeFilename);
  const declaredMime = candidate.mimeType.toLowerCase().split(";")[0].trim();

  const byExtension = ACCEPTED_TYPES.find((type) => type.extension === extension);
  const byMime = ACCEPTED_TYPES.find((type) => type.mimeTypes.includes(declaredMime));

  if (!byExtension) {
    return {
      ok: false,
      reason: byMime
        ? `Rename the file to end in ${byMime.extension} so it can be read correctly.`
        : "Upload a PDF, DOCX, PPTX or TXT file.",
    };
  }

  const contentMatches =
    byExtension.kind === "PDF"
      ? containsPdfSignature(candidate.head)
      : byExtension.kind === "TXT"
        ? looksLikeText(candidate.head)
        : startsWith(candidate.head, ZIP_SIGNATURE);

  if (!contentMatches) {
    return {
      ok: false,
      reason: `That file does not look like a ${byExtension.label}. It may be corrupt or renamed.`,
    };
  }

  return { ok: true, kind: byExtension.kind, safeFilename };
}
