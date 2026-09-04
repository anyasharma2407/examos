import mammoth from "mammoth";
import type { ExtractionResult } from "@/lib/materials/extract";

export async function extractDocxText(bytes: Uint8Array): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });

  const text = result.value.trim();
  if (text.length === 0) {
    return { ok: false, reason: "This document appears to contain no text." };
  }

  return { ok: true, text, pageCount: null };
}
