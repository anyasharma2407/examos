import "server-only";

import { prisma } from "@/lib/db";
import { chunkText } from "@/lib/materials/chunk";
import { cleanExtractedText, hasUsefulText, MIN_USEFUL_CHARS } from "@/lib/materials/clean";
import { extractText } from "@/lib/materials/extract";
import { downloadMaterial } from "@/lib/materials/storage";
import { validateContent } from "@/lib/materials/validation";

/**
 * Document processing: storage object -> extracted text -> chunks.
 *
 * Runs after the upload response has been sent (see the Server Action's
 * `after()` call), so a slow PDF never blocks the page. Progress is recorded on
 * the material row, which is what the UI polls.
 *
 * This is also where the file's actual bytes are checked against the type it
 * claimed to be. Files are uploaded straight from the browser to storage, so
 * this is the first moment the server sees them — and the only check a client
 * cannot influence.
 *
 * This function must never throw: it is invoked detached from any request, so
 * an unhandled rejection would leave a material stuck on PROCESSING forever
 * with nothing to report. Every failure path writes FAILED with a reason.
 */

async function markFailed(materialId: string, reason: string): Promise<void> {
  try {
    await prisma.material.update({
      where: { id: materialId },
      data: { status: "FAILED", statusError: reason, processedAt: new Date() },
    });
  } catch (error) {
    console.error(`[materials] could not record failure for ${materialId}`, error);
  }
}

export async function processMaterial(materialId: string): Promise<void> {
  try {
    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, kind: true, storagePath: true, status: true },
    });

    if (!material) {
      console.error(`[materials] ${materialId} vanished before processing`);
      return;
    }

    await prisma.material.update({
      where: { id: materialId },
      data: { status: "PROCESSING", statusError: null },
    });

    const bytes = await downloadMaterial(material.storagePath);
    if (!bytes) {
      await markFailed(materialId, "The stored file could not be read back.");
      return;
    }

    // The declared type was the client's word for it; the bytes are the truth.
    const content = validateContent(material.kind, bytes.subarray(0, 1024));
    if (!content.ok) {
      await markFailed(materialId, content.reason);
      return;
    }

    const extraction = await extractText(material.kind, bytes);
    if (!extraction.ok) {
      await markFailed(materialId, extraction.reason);
      return;
    }

    // ANALYSING covers the cleaning and chunking pass, which is what the UI
    // shows while the text is being turned into something usable.
    await prisma.material.update({
      where: { id: materialId },
      data: { status: "ANALYSING" },
    });

    const cleaned = cleanExtractedText(extraction.text);

    if (!hasUsefulText(cleaned)) {
      await markFailed(
        materialId,
        `Only ${cleaned.replace(/\s/g, "").length} characters of text were found, which is too little to work with (${MIN_USEFUL_CHARS} needed). If this is a scan, it needs OCR first.`,
      );
      return;
    }

    const chunks = chunkText(cleaned);

    // Replace rather than append so reprocessing a material is idempotent.
    await prisma.$transaction([
      prisma.materialChunk.deleteMany({ where: { materialId } }),
      prisma.materialChunk.createMany({
        data: chunks.map((chunk) => ({
          materialId,
          index: chunk.index,
          content: chunk.content,
          charCount: chunk.charCount,
        })),
      }),
      prisma.material.update({
        where: { id: materialId },
        data: {
          status: "READY",
          statusError: null,
          charCount: cleaned.length,
          processedAt: new Date(),
        },
      }),
    ]);
  } catch (error) {
    console.error(`[materials] processing ${materialId} failed`, error);
    await markFailed(
      materialId,
      "Something went wrong while processing this file. Try uploading it again.",
    );
  }
}
