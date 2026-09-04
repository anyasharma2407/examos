import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf";
import type { ExtractionResult } from "@/lib/materials/extract";

/**
 * PDF text extraction via unpdf (a serverless-friendly pdf.js build).
 *
 * `mergePages: false` keeps one string per page so page boundaries survive into
 * the chunker, which lets a topic cite the page it came from.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractionResult> {
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await unpdfExtractText(document, { mergePages: false });

  const pages = Array.isArray(text) ? text : [text];
  const joined = pages
    .map((page) => page.trim())
    .filter((page) => page.length > 0)
    .join("\n\n");

  if (joined.trim().length === 0) {
    return {
      ok: false,
      // Overwhelmingly this means a scan with no text layer. Saying so is more
      // useful than "extraction failed".
      reason:
        "No text could be read from this PDF. If it is a scan, it needs to be run through OCR first.",
    };
  }

  return { ok: true, text: joined, pageCount: totalPages ?? pages.length };
}
