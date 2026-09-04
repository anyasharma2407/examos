/**
 * Choosing which course material to put in front of the model.
 *
 * A single semester's uploads can run to thousands of chunks — far more than
 * fits in a prompt, and far more than is worth paying for. This picks a
 * representative sample under a character budget.
 *
 * Two properties matter and neither is achieved by simply taking the first N
 * chunks:
 *
 *  - **Every material gets a voice.** A 600-page lecture PDF must not crowd out
 *    the two-page course outline, which is often the single most informative
 *    document about what the course actually covers.
 *  - **Coverage within a material.** Chunks are spread evenly across each
 *    document rather than taken from the front, so week 12 is represented as
 *    well as week 1.
 *
 * Pure — no I/O, fully unit-tested.
 */

export type SourceChunk = {
  materialId: string;
  materialFilename: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
};

export type SelectedChunk = SourceChunk & {
  /** Stable label the model cites, e.g. "S3". Unique within one selection. */
  ref: string;
};

export type SelectionOptions = {
  /** Total characters of material to include. */
  budgetChars?: number;
  /** Never take more than this from a single material. */
  maxPerMaterial?: number;
};

const DEFAULTS = {
  // Roughly 15k tokens of material — enough to characterise a course without
  // an unreasonable per-request cost.
  budgetChars: 60_000,
  maxPerMaterial: 40,
} as const;

/**
 * Picks `count` items spread evenly across `items`, always including the first.
 * The opening of a document is disproportionately informative — titles,
 * outlines, learning objectives — so it is never skipped.
 */
function evenlySpaced<T>(items: T[], count: number): T[] {
  if (count >= items.length) return [...items];
  if (count <= 1) return items.slice(0, 1);

  const step = (items.length - 1) / (count - 1);
  const picked: T[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < count; i += 1) {
    const index = Math.round(i * step);
    if (!seen.has(index)) {
      seen.add(index);
      picked.push(items[index]);
    }
  }

  return picked;
}

export function selectGroundingChunks(
  chunks: SourceChunk[],
  options: SelectionOptions = {},
): SelectedChunk[] {
  const budgetChars = options.budgetChars ?? DEFAULTS.budgetChars;
  const maxPerMaterial = options.maxPerMaterial ?? DEFAULTS.maxPerMaterial;

  if (chunks.length === 0) return [];

  // Group by material, preserving each document's internal order.
  const byMaterial = new Map<string, SourceChunk[]>();
  for (const chunk of chunks) {
    const existing = byMaterial.get(chunk.materialId);
    if (existing) existing.push(chunk);
    else byMaterial.set(chunk.materialId, [chunk]);
  }

  for (const list of byMaterial.values()) {
    list.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  // Give every material an equal share of the budget, then spread that share
  // across the document.
  const materialCount = byMaterial.size;
  const perMaterialBudget = budgetChars / materialCount;

  const shortlists: SourceChunk[][] = [];
  for (const list of byMaterial.values()) {
    const averageChars =
      list.reduce((sum, chunk) => sum + chunk.content.length, 0) / list.length || 1;
    const affordable = Math.max(1, Math.floor(perMaterialBudget / averageChars));
    shortlists.push(evenlySpaced(list, Math.min(affordable, maxPerMaterial)));
  }

  // Interleave the shortlists so that if the budget runs out partway through,
  // what survives is still spread across every material rather than all of the
  // first one.
  const interleaved: SourceChunk[] = [];
  const longest = Math.max(...shortlists.map((list) => list.length));
  for (let position = 0; position < longest; position += 1) {
    for (const list of shortlists) {
      if (position < list.length) interleaved.push(list[position]);
    }
  }

  const selected: SelectedChunk[] = [];
  let used = 0;

  for (const chunk of interleaved) {
    if (used + chunk.content.length > budgetChars && selected.length > 0) continue;
    selected.push({ ...chunk, ref: `S${selected.length + 1}` });
    used += chunk.content.length;
  }

  // Present them grouped by material and in document order: the model reasons
  // better over material that reads like the original documents.
  selected.sort((a, b) =>
    a.materialFilename === b.materialFilename
      ? a.chunkIndex - b.chunkIndex
      : a.materialFilename.localeCompare(b.materialFilename),
  );

  return selected.map((chunk, index) => ({ ...chunk, ref: `S${index + 1}` }));
}

/**
 * Renders the selection for a prompt.
 *
 * Every excerpt is labelled with its ref and its source file so the model can
 * cite where a topic came from, and so a citation can be mapped back to a real
 * chunk row afterwards.
 */
export function renderGroundingText(chunks: SelectedChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `[${chunk.ref}] (${chunk.materialFilename}, section ${chunk.chunkIndex + 1})\n${chunk.content}`,
    )
    .join("\n\n---\n\n");
}
