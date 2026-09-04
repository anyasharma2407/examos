import type { MaterialKind } from "@/generated/prisma/enums";
import { extractDocxText } from "@/lib/materials/extract/docx";
import { extractPdfText } from "@/lib/materials/extract/pdf";
import { extractPptxText } from "@/lib/materials/extract/pptx";
import { extractTxtText } from "@/lib/materials/extract/txt";

/**
 * Text extraction.
 *
 * Every extractor returns the same shape and is allowed to fail: a
 * password-protected PDF, a corrupt archive or a scanned page with no text
 * layer are all normal, expected outcomes. Failure is reported as a value so
 * the caller can record it against the material and show the student something
 * useful, rather than crashing a request.
 */

export type ExtractionResult =
  | { ok: true; text: string; pageCount: number | null }
  | { ok: false; reason: string };

export type Extractor = (bytes: Uint8Array) => Promise<ExtractionResult>;

const EXTRACTORS: Record<MaterialKind, Extractor> = {
  PDF: extractPdfText,
  DOCX: extractDocxText,
  PPTX: extractPptxText,
  TXT: extractTxtText,
};

export async function extractText(
  kind: MaterialKind,
  bytes: Uint8Array,
): Promise<ExtractionResult> {
  const extractor = EXTRACTORS[kind];
  try {
    return await extractor(bytes);
  } catch (error) {
    // A library throwing on malformed input is expected; keep the detail for
    // the logs but hand the student a sentence they can act on.
    console.error(`[materials] ${kind} extraction threw`, error);
    return {
      ok: false,
      reason: "This file could not be read. It may be corrupt or password protected.",
    };
  }
}
