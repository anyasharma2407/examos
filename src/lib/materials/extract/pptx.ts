import { unzipSync } from "fflate";
import type { ExtractionResult } from "@/lib/materials/extract";

/**
 * PPTX text extraction.
 *
 * A .pptx is a ZIP of XML parts. Slide text lives in `ppt/slides/slideN.xml`
 * inside `<a:t>` runs, and speaker notes in `ppt/notesSlides/`. There is no
 * small, maintained library for this, and pulling in a full Office parser to
 * read one element type is not worth it, so the runs are read directly.
 *
 * Only `<a:t>` element content is ever read — no XML is evaluated, no external
 * entities are resolved — so a hostile deck cannot do more than supply text,
 * which the AI layer already treats as untrusted data.
 */

/** `<a:t>text</a:t>` — a single run of text. */
const TEXT_RUN = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;

/** `</a:p>` ends a paragraph; treat it as a line break. */
const PARAGRAPH_END = "</a:p>";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** Slide numbers sort numerically: slide2 must come before slide10. */
function slideOrder(path: string): number {
  const match = /(\d+)\.xml$/.exec(path);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * One line per `<a:p>` paragraph, so bullet points stay on separate lines
 * instead of running together into one blob.
 */
function textFromSlideXml(xml: string): string {
  return xml
    .split(PARAGRAPH_END)
    .map((paragraph) =>
      [...paragraph.matchAll(TEXT_RUN)]
        .map((match) => decodeXmlEntities(match[1]))
        .join("")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join("\n");
}

export async function extractPptxText(bytes: Uint8Array): Promise<ExtractionResult> {
  const files = unzipSync(bytes);

  const slidePaths = Object.keys(files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideOrder(a) - slideOrder(b));

  if (slidePaths.length === 0) {
    return { ok: false, reason: "No slides were found in this presentation." };
  }

  const decoder = new TextDecoder("utf-8");
  const slides: string[] = [];

  for (const path of slidePaths) {
    const slideNumber = slideOrder(path);
    const slideText = textFromSlideXml(decoder.decode(files[path]));

    // Speaker notes often carry the actual explanation, so keep them with the
    // slide they belong to.
    const notesPath = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
    const notesText = files[notesPath]
      ? textFromSlideXml(decoder.decode(files[notesPath])).trim()
      : "";

    const parts = [slideText.trim(), notesText ? `Notes: ${notesText}` : ""].filter(Boolean);
    if (parts.length > 0) {
      slides.push(`Slide ${slideNumber}\n${parts.join("\n\n")}`);
    }
  }

  const text = slides.join("\n\n");
  if (text.trim().length === 0) {
    return {
      ok: false,
      reason: "No text could be read from these slides. They may be images only.",
    };
  }

  return { ok: true, text, pageCount: slidePaths.length };
}
