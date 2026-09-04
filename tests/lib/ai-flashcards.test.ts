import { describe, expect, it } from "vitest";
import { interleaveByKind, validateCards } from "@/lib/ai/flashcards";
import type { SelectedChunk } from "@/lib/ai/selection";

/**
 * Flashcard post-processing.
 *
 * Two failures a schema cannot catch: a card grounded in material that was
 * never supplied, and a card whose back merely restates its front — which is a
 * card that cannot be failed, and so teaches nothing while still occupying a
 * slot in a revision set.
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
    materialFilename: "tutorial04.docx",
    chunkId: "chunk-b1",
    chunkIndex: 2,
    content: "A sequence converges when its terms approach a single limit.",
  },
];

function card(overrides: Record<string, unknown> = {}) {
  return {
    kind: "CONCEPT" as const,
    front: "What is the derivative of a function at a point?",
    back: "The limit of the difference quotient as the increment approaches zero.",
    ref: "S1",
    ...overrides,
  } as Parameters<typeof validateCards>[0][number];
}

describe("grounding", () => {
  it("keeps a card citing supplied material and records its source", () => {
    const [kept] = validateCards([card()], selected);
    expect(kept).toMatchObject({ sourceMaterialId: "material-a", kind: "CONCEPT" });
    expect(kept.sourceExcerpt).toContain("difference quotients");
  });

  it("accepts bracketed citation labels", () => {
    expect(validateCards([card({ ref: "[S2]" })], selected)).toHaveLength(1);
  });

  it("drops a card citing material that was never sent", () => {
    expect(validateCards([card({ ref: "S99" })], selected)).toEqual([]);
  });
});

describe("card quality", () => {
  it("drops a card whose back just restates its front", () => {
    // Such a card cannot be failed, so it is worthless as revision.
    const circular = card({
      front: "The chain rule",
      back: "the chain rule",
    });
    expect(validateCards([circular], selected)).toEqual([]);
  });

  it("drops duplicate fronts, keeping the first", () => {
    const cards = [
      card({ back: "First answer, the one to keep." }),
      card({ back: "Second answer, a near duplicate." }),
    ];
    const kept = validateCards(cards, selected);
    expect(kept).toHaveLength(1);
    expect(kept[0].back).toBe("First answer, the one to keep.");
  });

  it("treats fronts differing only in punctuation or case as duplicates", () => {
    const cards = [
      card({ front: "What is a limit?" }),
      card({ front: "what is a LIMIT" }),
    ];
    expect(validateCards(cards, selected)).toHaveLength(1);
  });

  it("trims whitespace off both sides", () => {
    const [kept] = validateCards(
      [card({ front: "  Padded front?  ", back: "  Padded back that is long enough.  " })],
      selected,
    );
    expect(kept.front).toBe("Padded front?");
    expect(kept.back).toBe("Padded back that is long enough.");
  });
});

describe("interleaveByKind", () => {
  const make = (kind: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind: kind as never,
      front: `${kind} ${i}`,
      back: `answer ${i}`,
      sourceMaterialId: "m",
      sourceExcerpt: "x",
    }));

  it("does not leave five definitions in a row", () => {
    const grouped = [...make("CONCEPT", 4), ...make("FORMULA", 4), ...make("PITFALL", 4)];
    const ordered = interleaveByKind(grouped);

    // Models emit cards grouped by kind; drilling them that way is worse.
    let longestRun = 1;
    let run = 1;
    for (let i = 1; i < ordered.length; i += 1) {
      run = ordered[i].kind === ordered[i - 1].kind ? run + 1 : 1;
      longestRun = Math.max(longestRun, run);
    }
    expect(longestRun).toBeLessThanOrEqual(2);
  });

  it("keeps every card", () => {
    const grouped = [...make("CONCEPT", 3), ...make("APPLICATION", 5)];
    expect(interleaveByKind(grouped)).toHaveLength(8);
  });

  it("handles a single kind without looping forever", () => {
    expect(interleaveByKind(make("CONCEPT", 5))).toHaveLength(5);
  });

  it("handles an empty set", () => {
    expect(interleaveByKind([])).toEqual([]);
  });
});
