import type { ExtractionResult } from "@/lib/materials/extract";

export async function extractTxtText(bytes: Uint8Array): Promise<ExtractionResult> {
  try {
    // `fatal` so mislabelled binary is rejected here rather than stored as
    // replacement characters and fed to the AI layer as gibberish.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text, pageCount: null };
  } catch {
    return { ok: false, reason: "This text file is not valid UTF-8." };
  }
}
