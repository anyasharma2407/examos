/**
 * Splitting cleaned document text into chunks.
 *
 * Chunks are the unit of grounding: the AI layer only ever sees chunk text, and
 * topics and questions cite the chunk they came from. They therefore need to be
 * small enough to fit several into a prompt, but large enough that a chunk
 * still makes sense on its own.
 *
 * The split prefers paragraph boundaries, then sentence boundaries, and only
 * cuts mid-sentence when a single sentence is longer than the whole budget.
 * A small overlap carries context across the seam so a definition split across
 * two chunks is not lost to both.
 *
 * Pure — no I/O, fully unit-tested.
 */

export type Chunk = {
  index: number;
  content: string;
  charCount: number;
};

export type ChunkOptions = {
  /** Target chunk size in characters. */
  maxChars?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlapChars?: number;
  /** Chunks shorter than this are folded into their neighbour. */
  minChars?: number;
};

const DEFAULTS = {
  maxChars: 1_800,
  overlapChars: 150,
  minChars: 120,
} as const;

/** Splits on blank lines, keeping paragraphs intact. */
function toParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * Splits a long paragraph at sentence ends. Deliberately simple: it looks for
 * terminal punctuation followed by whitespace. Abbreviations occasionally cause
 * an early split, which costs nothing but a slightly shorter chunk.
 */
function toSentences(paragraph: string): string[] {
  const parts = paragraph.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g);
  return parts ? parts.map((part) => part.trim()).filter(Boolean) : [paragraph];
}

/** Last resort for a single "sentence" longer than the budget. */
function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += maxChars) {
    pieces.push(text.slice(start, start + maxChars));
  }
  return pieces;
}

/** The tail of `text`, trimmed to start at a word boundary. */
function overlapFrom(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) return "";
  const tail = text.slice(-overlapChars);
  const spaceIndex = tail.indexOf(" ");
  return spaceIndex === -1 ? tail : tail.slice(spaceIndex + 1);
}

export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULTS.maxChars;
  const overlapChars = options.overlapChars ?? DEFAULTS.overlapChars;
  const minChars = options.minChars ?? DEFAULTS.minChars;

  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  // Break the document into units no larger than one chunk.
  const units: string[] = [];
  for (const paragraph of toParagraphs(trimmed)) {
    if (paragraph.length <= maxChars) {
      units.push(paragraph);
      continue;
    }
    for (const sentence of toSentences(paragraph)) {
      if (sentence.length <= maxChars) units.push(sentence);
      else units.push(...hardSplit(sentence, maxChars));
    }
  }

  // Greedily pack units into chunks.
  const packed: string[] = [];
  let current = "";

  for (const unit of units) {
    if (current.length === 0) {
      current = unit;
      continue;
    }
    if (current.length + unit.length + 2 <= maxChars) {
      current = `${current}\n\n${unit}`;
      continue;
    }
    packed.push(current);
    const overlap = overlapFrom(current, overlapChars);
    current = overlap ? `${overlap}\n\n${unit}` : unit;
  }
  if (current.length > 0) packed.push(current);

  // A short trailing chunk reads as a fragment; fold it back if it fits.
  if (packed.length > 1) {
    const last = packed[packed.length - 1];
    const previous = packed[packed.length - 2];
    if (last.length < minChars && previous.length + last.length + 2 <= maxChars) {
      packed.splice(packed.length - 2, 2, `${previous}\n\n${last}`);
    }
  }

  return packed.map((content, index) => ({
    index,
    content,
    charCount: content.length,
  }));
}
