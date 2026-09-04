import { describe, expect, it } from "vitest";
import {
  renderGroundingText,
  selectGroundingChunks,
  type SourceChunk,
} from "@/lib/ai/selection";

/**
 * Choosing what material to send to the model.
 *
 * The failure this guards against is subtle and expensive: a 600-page lecture
 * PDF silently crowding out the two-page course outline, producing a knowledge
 * map that misses half the course.
 */

function chunksFor(materialId: string, count: number, chars = 500): SourceChunk[] {
  return Array.from({ length: count }, (_, index) => ({
    materialId,
    materialFilename: `${materialId}.pdf`,
    chunkId: `${materialId}-chunk-${index}`,
    chunkIndex: index,
    content: `${materialId} section ${index} `.padEnd(chars, "x"),
  }));
}

describe("selectGroundingChunks", () => {
  it("returns nothing for no material", () => {
    expect(selectGroundingChunks([])).toEqual([]);
  });

  it("keeps everything when it fits in the budget", () => {
    const chunks = chunksFor("outline", 4, 200);
    const selected = selectGroundingChunks(chunks, { budgetChars: 100_000 });

    expect(selected).toHaveLength(4);
    expect(selected.map((chunk) => chunk.chunkId)).toEqual(
      chunks.map((chunk) => chunk.chunkId),
    );
  });

  it("stays within the character budget", () => {
    const chunks = chunksFor("big", 400, 500);
    const selected = selectGroundingChunks(chunks, { budgetChars: 10_000 });

    const total = selected.reduce((sum, chunk) => sum + chunk.content.length, 0);
    expect(total).toBeLessThanOrEqual(10_000);
    expect(selected.length).toBeGreaterThan(0);
  });

  it("gives a small document a voice alongside a huge one", () => {
    // The whole point: an outline must not be drowned out by a 600-page PDF.
    const selected = selectGroundingChunks(
      [...chunksFor("huge-lectures", 600), ...chunksFor("course-outline", 3)],
      { budgetChars: 20_000 },
    );

    const materials = new Set(selected.map((chunk) => chunk.materialId));
    expect(materials).toContain("course-outline");
    expect(materials).toContain("huge-lectures");
  });

  it("spreads coverage across a document instead of taking only the start", () => {
    const selected = selectGroundingChunks(chunksFor("lectures", 100), {
      budgetChars: 10_000,
    });

    const indexes = selected.map((chunk) => chunk.chunkIndex);
    // Week 12 matters as much as week 1.
    expect(Math.max(...indexes)).toBeGreaterThan(50);
    expect(Math.min(...indexes)).toBe(0);
  });

  it("respects the per-material cap", () => {
    const selected = selectGroundingChunks(chunksFor("lectures", 500, 50), {
      budgetChars: 1_000_000,
      maxPerMaterial: 5,
    });

    expect(selected).toHaveLength(5);
  });

  it("labels excerpts uniquely and contiguously", () => {
    const selected = selectGroundingChunks(
      [...chunksFor("a", 5), ...chunksFor("b", 5)],
      { budgetChars: 100_000 },
    );

    const refs = selected.map((chunk) => chunk.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs).toEqual(selected.map((_, index) => `S${index + 1}`));
  });

  it("keeps each document's sections in reading order", () => {
    const selected = selectGroundingChunks(
      [...chunksFor("b", 6), ...chunksFor("a", 6)],
      { budgetChars: 100_000 },
    );

    const forA = selected.filter((chunk) => chunk.materialId === "a");
    expect(forA.map((chunk) => chunk.chunkIndex)).toEqual(
      [...forA.map((chunk) => chunk.chunkIndex)].sort((x, y) => x - y),
    );
  });

  it("always returns at least one excerpt, even for a single oversized chunk", () => {
    const huge: SourceChunk[] = [
      {
        materialId: "m",
        materialFilename: "m.pdf",
        chunkId: "m-0",
        chunkIndex: 0,
        content: "x".repeat(50_000),
      },
    ];

    expect(selectGroundingChunks(huge, { budgetChars: 1_000 })).toHaveLength(1);
  });
});

describe("renderGroundingText", () => {
  it("labels every excerpt with its ref and source file", () => {
    const selected = selectGroundingChunks(chunksFor("lecture01", 2, 100), {
      budgetChars: 100_000,
    });
    const rendered = renderGroundingText(selected);

    expect(rendered).toContain("[S1] (lecture01.pdf, section 1)");
    expect(rendered).toContain("[S2] (lecture01.pdf, section 2)");
    // A citation has to be traceable back to a real chunk row.
    expect(rendered).toContain("lecture01 section 0");
  });
});
