/**
 * Cleaning extracted document text.
 *
 * Extractors produce noisy output: PDFs carry per-page headers and footers,
 * slide decks repeat their template, and everything drags in odd whitespace.
 * The AI layer is charged per token and grounded on this text, so it is worth
 * removing the noise before it is ever stored.
 *
 * Pure functions — no I/O, fully unit-tested.
 */

/** Lines that are just a page number, optionally decorated. */
const PAGE_NUMBER_LINE = /^(?:page\s*)?[-–—|]?\s*\d{1,4}\s*(?:\/\s*\d{1,4})?\s*[-–—|]?$/i;

/** A line of nothing but punctuation or box-drawing leftovers. */
const DECORATION_LINE = /^[\s._\-–—=*•·▪◦|<>]+$/;

/**
 * Normalises whitespace and strips characters that break storage or add no
 * meaning.
 *
 * NUL is removed specifically because PostgreSQL rejects it in `text` columns —
 * a single stray NUL from a malformed PDF would otherwise fail the insert and
 * lose the whole document.
 */
export function normaliseWhitespace(input: string): string {
  return (
    input
      // Normalise line endings first so later rules only deal with "\n".
      .replace(/\r\n?/g, "\n")
      // NUL and other control characters, keeping tab and newline.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      // Soft hyphens and zero-width characters that PDFs sprinkle everywhere.
      .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
      // Non-breaking and exotic spaces become ordinary spaces.
      .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
      .replace(/\t/g, " ")
      // Collapse runs of spaces, but never across a line break.
      .replace(/ {2,}/g, " ")
      // Trim each line.
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      // Three or more blank lines carry no more meaning than one.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Rejoins words split across a line break by hyphenation, which PDF extraction
 * produces constantly ("differ-\nentiation" is one word, not two).
 */
export function rejoinHyphenatedWords(input: string): string {
  return input.replace(/([a-z])-\n([a-z])/g, "$1$2");
}

/**
 * Removes lines that repeat on almost every page — running headers and footers
 * such as a course code or a lecturer's name. A line has to be short, appear
 * many times, and account for a meaningful share of the pages to qualify, so
 * genuine repeated content (a recurring heading in a long document) survives.
 */
export function stripRepeatedLines(input: string, minOccurrences = 4): string {
  const lines = input.split("\n");
  const counts = new Map<string, number>();

  for (const line of lines) {
    const key = line.trim();
    if (key.length === 0 || key.length > 80) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const boilerplate = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= minOccurrences)
      .map(([line]) => line),
  );

  if (boilerplate.size === 0) return input;

  return lines.filter((line) => !boilerplate.has(line.trim())).join("\n");
}

/** Drops page-number-only and decoration-only lines. */
export function stripNoiseLines(input: string): string {
  return input
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      return !PAGE_NUMBER_LINE.test(trimmed) && !DECORATION_LINE.test(trimmed);
    })
    .join("\n");
}

/**
 * The full cleaning pipeline. Order matters: whitespace is normalised first so
 * every later rule can assume trimmed lines and "\n" endings.
 */
export function cleanExtractedText(raw: string): string {
  const normalised = normaliseWhitespace(raw);
  const dehyphenated = rejoinHyphenatedWords(normalised);
  const withoutNoise = stripNoiseLines(dehyphenated);
  const withoutBoilerplate = stripRepeatedLines(withoutNoise);
  return normaliseWhitespace(withoutBoilerplate);
}

/**
 * Whether there is enough text to be worth analysing. A scanned PDF with no
 * text layer extracts to almost nothing, and the student needs to be told that
 * rather than watching an empty knowledge map appear.
 *
 * Set low deliberately: a scan yields a few dozen characters at most, while a
 * short but genuine document — a one-page course outline, a single slide — can
 * be surprisingly brief. Rejecting real material is the worse failure.
 */
export const MIN_USEFUL_CHARS = 80;

export function hasUsefulText(text: string): boolean {
  return text.replace(/\s/g, "").length >= MIN_USEFUL_CHARS;
}
