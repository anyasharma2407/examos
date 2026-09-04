import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who an AI call is being made for.
 *
 * Carried in async context rather than threaded through every function between
 * the action and the model call. The alternative is passing a user id through
 * five layers of otherwise-pure library code, where the only thing that would
 * enforce it is remembering — and a usage record that is merely usually written
 * is not a budget.
 */

export type AiContext = { userId: string; feature: string };

const storage = new AsyncLocalStorage<AiContext>();

export function runWithAiContext<T>(context: AiContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function currentAiContext(): AiContext | undefined {
  return storage.getStore();
}
