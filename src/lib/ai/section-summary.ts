import "server-only";

import { z } from "zod";
import { generateJson, type AiResult } from "@/lib/ai/client";

/**
 * Summarising one passage of a student's own material.
 *
 * Narrower than everything else in this directory: there is exactly one source,
 * and the summary must not go beyond it. No citations are needed because the
 * passage *is* the citation — but the constraint is tighter for the same
 * reason. A summary that adds a fact the passage does not contain is worse than
 * no summary, because the student is reading it precisely to decide whether the
 * passage is worth their time.
 */

const responseSchema = z.object({
  summary: z
    .string()
    .min(30)
    .max(700)
    .describe(
      "What this passage says, in two or three plain sentences. Address the student. No preamble, no 'this section discusses'.",
    ),
  takeaways: z
    .array(z.string().min(8).max(160))
    .max(4)
    .describe("The specific things to take from it — definitions, formulas, results. May be empty."),
  thin: z
    .boolean()
    .describe(
      "True if the passage is mostly headings, boilerplate or fragments with little to learn from.",
    ),
});

export type SectionSummary = {
  summary: string;
  takeaways: string[];
  thin: boolean;
};

const SYSTEM = `
You summarise a single passage from a university student's own course material,
so they can tell at a glance what is in it.

Say what the passage actually says. Use its own notation and vocabulary. Two or
three sentences is usually right.

Everything you write must be supported by the passage in front of you. Do not
fill gaps from general knowledge about the subject, do not explain the wider
topic, and do not speculate about what came before or after. If the passage is
a heading, a fragment, or a list of bullet points with no substance, say so by
setting thin to true and keep the summary honest and short — "a slide listing
the three differentiation rules, with no worked examples" is genuinely more
useful than a paragraph pretending there is more there.

Never begin with "This section", "This passage" or "The text".
`.trim();

export async function summariseSection(input: {
  filename: string;
  sectionNumber: number;
  content: string;
}): Promise<AiResult<SectionSummary>> {
  if (input.content.trim().length < 40) {
    return {
      ok: false,
      kind: "invalid_output",
      error: "There is too little text in this section to summarise.",
    };
  }

  const result = await generateJson({
    schema: responseSchema,
    schemaName: "section_summary",
    system: SYSTEM,
    reference: input.content,
    instruction: `Summarise section ${input.sectionNumber} of ${input.filename}, above.`,
  });

  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      summary: result.data.summary.trim(),
      takeaways: result.data.takeaways.map((item) => item.trim()).filter(Boolean),
      thin: result.data.thin,
    },
  };
}
