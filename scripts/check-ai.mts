/**
 * Setup diagnostic for the AI configuration.
 *
 * Answers, in order, the questions that go wrong when someone first adds an
 * API key: is the key present, does it authenticate, does the account have
 * credit, and is the configured model actually available? Reporting these
 * separately matters because they have completely different fixes and the
 * provider signals two of them with the same HTTP status.
 *
 * Run with: npm run check:ai
 */

import "dotenv/config";
import OpenAI from "openai";
import { classifyAiError } from "../src/lib/ai/errors";

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

const pass = (message: string) => console.log(`${GREEN}✓${RESET} ${message}`);
const fail = (message: string) => console.log(`${RED}✗${RESET} ${message}`);
const hint = (message: string) => console.log(`  ${DIM}${message}${RESET}`);

const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
const baseURL = process.env.OPENAI_BASE_URL?.trim();

console.log("\nChecking AI configuration\n");

if (!apiKey) {
  fail("OPENAI_API_KEY is not set");
  hint("Add it to .env, then run this again.");
  process.exit(1);
}

// Keys are secrets: show only enough to confirm which one is loaded.
pass(`OPENAI_API_KEY is set (${apiKey.slice(0, 7)}…${apiKey.slice(-4)})`);
console.log(`  ${DIM}model: ${model}${RESET}`);
if (baseURL) console.log(`  ${DIM}base URL: ${baseURL}${RESET}`);
console.log();

const client = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
  maxRetries: 0,
  timeout: 60_000,
});

// The smallest possible real request: enough to prove auth, credit and model
// availability, cheap enough to run as often as you like.
try {
  const response = await client.responses.create({
    model,
    input: 'Reply with exactly: {"ok":true}',
    text: {
      format: {
        type: "json_schema",
        name: "healthcheck",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  });

  // Truncated: a compatible gateway may answer with something much longer.
  const text = (response.output_text?.trim() ?? "").slice(0, 60);
  pass("The API key authenticates and the account has credit");
  pass(`The model "${model}" is available`);
  pass(`Structured JSON output works (${text || "empty"})`);

  console.log(`\n${GREEN}Everything is configured.${RESET} Open a course and click Build knowledge map.\n`);
} catch (error) {
  const { kind, message } = classifyAiError(error, model);
  fail(message);

  if (/no credit left/i.test(message)) {
    hint("A new key has no credit until you add a payment method and buy some.");
    hint("ChatGPT Plus does not include API credit — they are billed separately.");
  } else if (/rejected the API key/i.test(message)) {
    hint("Check for a stray space or a truncated paste in .env.");
  } else if (/not available on your account/i.test(message)) {
    hint("Copy the exact model ID from platform.openai.com/docs/models.");
    hint("The pricing page shows display names, which are not always the API ID.");
  } else if (kind === "transient") {
    hint("This one usually clears on its own — try again in a moment.");
  }

  console.log();
  process.exit(1);
}
