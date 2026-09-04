import OpenAI from "openai";

/**
 * Turning provider errors into something a student can act on.
 *
 * Deliberately separate from `client.ts`, which is `server-only`: the setup
 * diagnostic (`npm run check:ai`) runs outside Next.js and must report failures
 * using exactly the same rules, not a second copy of them that drifts.
 */

export type AiFailureKind =
  /** No API key configured. */
  | "not_configured"
  /** Rate limited, timed out, or a provider 5xx — worth trying again later. */
  | "transient"
  /** The model answered, but not in a shape that survived validation. */
  | "invalid_output"
  /** The model declined to answer. */
  | "refused"
  /** Anything else, including auth and quota errors. */
  | "failed";

export type ClassifiedError = { kind: AiFailureKind; message: string };

export function classifyAiError(error: unknown, model: string): ClassifiedError {
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;

    if (status === 401 || status === 403) {
      return {
        kind: "failed",
        message: "The AI provider rejected the API key. Check OPENAI_API_KEY.",
      };
    }

    if (status === 429) {
      // Two very different failures share this status. A rate limit clears on
      // its own; an exhausted quota never will, and retrying it just tells the
      // user to "try again shortly" forever when what they need is to add
      // credit to their account.
      if (error.code === "insufficient_quota") {
        return {
          kind: "failed",
          message:
            "Your OpenAI account has no credit left. Add a payment method and buy credits at platform.openai.com/settings/organization/billing.",
        };
      }
      return {
        kind: "transient",
        message: "The AI provider is rate limiting requests. Try again shortly.",
      };
    }

    if (status === 404) {
      return {
        kind: "failed",
        message: `The model "${model}" is not available on your account. Set OPENAI_MODEL in .env to one you have access to.`,
      };
    }

    if (status >= 500) {
      return {
        kind: "transient",
        message: "The AI provider is having trouble. Try again shortly.",
      };
    }

    return { kind: "failed", message: error.message };
  }

  if (error instanceof Error) {
    // Timeouts and socket errors surface as plain Errors from the SDK.
    if (/timeout|aborted|ECONNRESET|ENOTFOUND|fetch failed/i.test(error.message)) {
      return { kind: "transient", message: "The AI request timed out. Try again." };
    }
    return { kind: "failed", message: error.message };
  }

  return { kind: "failed", message: "The AI request failed." };
}

/** True when the provider rejected the request solely because of `temperature`. */
export function isUnsupportedTemperature(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError) || error.status !== 400) return false;
  return /temperature/i.test(error.message);
}
