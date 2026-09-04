import "server-only";

import { budgetStatus, checkBudget } from "@/lib/ai/budget";
import { runWithAiContext } from "@/lib/ai/context";
import { consume } from "@/lib/rate-limit-shared";

/**
 * The single gate every AI feature passes through.
 *
 * Two protections, in the order that fails cheapest first:
 *
 *   1. A shared rate limit, so a burst is refused before any work happens.
 *   2. A per-user token budget, so sustained use cannot run up an unbounded
 *      bill on the operator's account.
 *
 * Having one gate rather than a check in each action is the point: a new
 * feature that forgets to rate limit itself is the hole someone finds.
 */

export type GuardFailure = { ok: false; error: string };

export async function guardAi(input: {
  userId: string;
  feature: string;
  /** Calls allowed in the window, for this feature. */
  limit: number;
  windowMs: number;
}): Promise<{ ok: true } | GuardFailure> {
  const gate = await consume(`ai:${input.feature}`, input.userId, input.limit, input.windowMs);

  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return {
      ok: false,
      error: `You have done that several times just now. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const budget = await checkBudget(input.userId);
  if (!budget.ok) return budget;

  return { ok: true };
}

/**
 * Runs an AI operation behind the guard, tagged so its token usage is recorded
 * against the right user.
 */
export async function withAi<T>(
  input: { userId: string; feature: string; limit: number; windowMs: number },
  run: () => Promise<T>,
): Promise<T | GuardFailure> {
  const gate = await guardAi(input);
  if (!gate.ok) return gate;

  return runWithAiContext({ userId: input.userId, feature: input.feature }, run);
}

export { budgetStatus };
