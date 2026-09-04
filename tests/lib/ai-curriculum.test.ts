import { describe, expect, it } from "vitest";
import { resolveCitations } from "@/lib/ai/curriculum";
import type { SelectedChunk } from "@/lib/ai/selection";

/**
 * Grounding the knowledge map in the student's own material.
 *
 * The model is asked to cite the excerpt each topic came from. A citation that
 * points at an excerpt we never sent is the clearest available signal that the
 * topic was produced from general knowledge rather than from this course — so
 * unresolvable topics are dropped rather than stored. Without this, ExamOS
 * would quietly become a generic syllabus generator.
 */

const selected: SelectedChunk[] = [
  {
    ref: "S1",
    materialId: "material-a",
    materialFilename: "Lecture 01.pdf",
    chunkId: "chunk-a1",
    chunkIndex: 0,
    content: "Conditional probability is defined as P(A|B) = P(A and B) / P(B).",
  },
  {
    ref: "S2",
    materialId: "material-b",
    materialFilename: "Tutorial 04.pdf",
    chunkId: "chunk-b1",
    chunkIndex: 3,
    content: "A sequence converges when its terms approach a single limit.",
  },
];

function topic(overrides: Partial<Parameters<typeof resolveCitations>[0][number]> = {}) {
  return {
    name: "Conditional Probability",
    description: "Computing probabilities given that another event has occurred.",
    importance: 0.9,
    citations: [{ ref: "S1", quote: "P(A|B) = P(A and B) / P(B)" }],
    ...overrides,
  };
}

describe("resolveCitations", () => {
  it("maps a citation back to the real chunk and material it came from", () => {
    const [resolved] = resolveCitations([topic()], selected);

    expect(resolved.citations).toEqual([
      {
        chunkId: "chunk-a1",
        materialId: "material-a",
        quote: "P(A|B) = P(A and B) / P(B)",
      },
    ]);
  });

  it("drops a topic whose citations point at excerpts that were never sent", () => {
    // A hallucinated reference: the model produced a topic from general
    // knowledge and invented a source for it.
    const invented = topic({
      name: "Quantum Field Theory",
      citations: [{ ref: "S99", quote: "the Lagrangian density" }],
    });

    expect(resolveCitations([invented], selected)).toEqual([]);
  });

  it("keeps a topic that has at least one resolvable citation", () => {
    const partly = topic({
      citations: [
        { ref: "S404", quote: "invented" },
        { ref: "S1", quote: "P(A|B) = P(A and B) / P(B)" },
      ],
    });

    const [resolved] = resolveCitations([partly], selected);
    expect(resolved.citations).toHaveLength(1);
    expect(resolved.citations[0].chunkId).toBe("chunk-a1");
  });

  it("accepts the bracketed label form the prompt actually invites", () => {
    // Regression: the material is rendered as "[S1] (file, section 1)" and the
    // instruction asks for "the [S...] label", so real models return "[S1]".
    // Matching only the bare "S1" silently discarded every grounded topic —
    // which surfaced as "could not be traced to your material" on a live run.
    const bracketed = topic({ citations: [{ ref: "[S1]", quote: "P(A|B)" }] });
    const [resolved] = resolveCitations([bracketed], selected);
    expect(resolved.citations[0].chunkId).toBe("chunk-a1");
  });

  it("tolerates every label spelling seen in practice", () => {
    for (const ref of [" s1 ", "[S1]", "[s1] ", "S1", "[[S1]]"]) {
      const messy = topic({ citations: [{ ref, quote: "P(A|B)" }] });
      expect(resolveCitations([messy], selected), `ref ${JSON.stringify(ref)}`).toHaveLength(1);
    }
  });

  it("still rejects a label that is genuinely not ours, brackets or not", () => {
    for (const ref of ["[S99]", "S99", "[lecture01.pdf]"]) {
      const bogus = topic({ citations: [{ ref, quote: "invented" }] });
      expect(resolveCitations([bogus], selected), `ref ${JSON.stringify(ref)}`).toEqual([]);
    }
  });

  it("removes near-duplicate topics, keeping the more important one", () => {
    const topics = [
      topic({ name: "Probability", importance: 0.9 }),
      topic({ name: "probability", importance: 0.4 }),
    ];

    const resolved = resolveCitations(topics, selected);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].importance).toBe(0.9);
  });

  it("clamps importance into range", () => {
    const [high] = resolveCitations([topic({ importance: 4 })], selected);
    expect(high.importance).toBe(1);

    const [low] = resolveCitations([topic({ importance: -2 })], selected);
    expect(low.importance).toBe(0);
  });

  it("trims whitespace and caps quote length", () => {
    const [resolved] = resolveCitations(
      [
        topic({
          name: "  Conditional Probability  ",
          description: "  Padded description that is long enough to be useful.  ",
          citations: [{ ref: "S1", quote: "x".repeat(500) }],
        }),
      ],
      selected,
    );

    expect(resolved.name).toBe("Conditional Probability");
    expect(resolved.description).toBe("Padded description that is long enough to be useful.");
    expect(resolved.citations[0].quote).toHaveLength(300);
  });

  it("returns nothing when every topic is ungrounded", () => {
    const fabricated = [
      topic({ name: "A", citations: [{ ref: "S50", quote: "q" }] }),
      topic({ name: "B", citations: [{ ref: "S51", quote: "q" }] }),
    ];

    // The caller turns this into an error rather than an empty knowledge map.
    expect(resolveCitations(fabricated, selected)).toEqual([]);
  });

  it("handles topics citing several different materials", () => {
    const spanning = topic({
      name: "Course overview",
      citations: [
        { ref: "S1", quote: "Conditional probability" },
        { ref: "S2", quote: "A sequence converges" },
      ],
    });

    const [resolved] = resolveCitations([spanning], selected);
    expect(resolved.citations.map((citation) => citation.materialId)).toEqual([
      "material-a",
      "material-b",
    ]);
  });
});
