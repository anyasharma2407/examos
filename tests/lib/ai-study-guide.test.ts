import { describe, expect, it } from "vitest";
import { resolveReadings, sanitiseSuggestion } from "@/lib/ai/study-guide";
import type { SelectedChunk } from "@/lib/ai/selection";

/**
 * Study-guide post-processing.
 *
 * A schema can only assert that these fields are strings of a plausible length.
 * Two things it cannot catch are covered here: readings that cite material we
 * never sent, and free text that ends up inside a URL.
 */

const selected: SelectedChunk[] = [
  {
    ref: "S1",
    materialId: "material-a",
    materialFilename: "week02.pptx",
    chunkId: "chunk-a1",
    chunkIndex: 0,
    content: "The derivative is a limit of difference quotients.",
  },
  {
    ref: "S2",
    materialId: "material-b",
    materialFilename: "outline.txt",
    chunkId: "chunk-b1",
    chunkIndex: 0,
    content: "Week 3: Differentiation",
  },
];

function reading(overrides: Partial<{ ref: string; focus: string; reason: string }> = {}) {
  return {
    ref: "S1",
    focus: "Read the definition of the derivative",
    reason: "It is the definition the whole topic builds on",
    ...overrides,
  };
}

describe("resolveReadings", () => {
  it("maps a reading back to the material and chunk it points at", () => {
    const [resolved] = resolveReadings([reading()], selected);
    expect(resolved).toMatchObject({ materialId: "material-a", chunkId: "chunk-a1" });
  });

  it("accepts bracketed labels, which is what models actually return", () => {
    expect(resolveReadings([reading({ ref: "[S2]" })], selected)).toHaveLength(1);
  });

  it("drops a reading citing material that was never sent", () => {
    expect(resolveReadings([reading({ ref: "S77" })], selected)).toEqual([]);
  });

  it("does not list the same passage twice", () => {
    const duplicated = [reading(), reading({ focus: "Read it again" })];
    expect(resolveReadings(duplicated, selected)).toHaveLength(1);
  });

  it("keeps distinct passages", () => {
    const two = [reading({ ref: "S1" }), reading({ ref: "S2" })];
    expect(resolveReadings(two, selected)).toHaveLength(2);
  });
});

describe("sanitiseSuggestion", () => {
  it("strips code debris a model trailed onto a search phrase", () => {
    // Verbatim from a real generation. Unsanitised this went into a search URL.
    expect(
      sanitiseSuggestion("related rates calculus introduction and examples].concat(["),
    ).toBe("related rates calculus introduction and examples");
  });

  it("leaves an ordinary search phrase alone", () => {
    expect(sanitiseSuggestion("product quotient and chain rule differentiation")).toBe(
      "product quotient and chain rule differentiation",
    );
  });

  it("keeps punctuation that belongs in real book titles", () => {
    expect(sanitiseSuggestion("Thomas' Calculus — George B. Thomas")).toBe(
      "Thomas' Calculus — George B. Thomas",
    );
    expect(sanitiseSuggestion("Calculus: Early Transcendentals — James Stewart")).toBe(
      "Calculus: Early Transcendentals — James Stewart",
    );
  });

  it("cuts markup and template syntax rather than passing it through", () => {
    expect(sanitiseSuggestion("limits explained <script>alert(1)</script>")).toBe(
      "limits explained",
    );
    expect(sanitiseSuggestion("integration by parts {{topic}}")).toBe("integration by parts");
    expect(sanitiseSuggestion("sequences `rm -rf` tutorial")).toBe("sequences");
  });

  it("returns null when nothing usable survives, so the entry is dropped", () => {
    expect(sanitiseSuggestion("[]{}")).toBeNull();
    expect(sanitiseSuggestion("   ")).toBeNull();
    expect(sanitiseSuggestion("]abc")).toBeNull();
  });

  it("trims trailing punctuation left by the cut", () => {
    expect(sanitiseSuggestion("bayes theorem explained, [S1]")).toBe("bayes theorem explained");
  });
});
