import "server-only";

import { prisma } from "@/lib/db";
import type { RateLimitResult } from "@/lib/rate-limit";

/**
 * Rate limiting that survives horizontal scaling.
 *
 * The in-process limiter in `rate-limit.ts` counts per Node process, which is
 * the right shape for a single server and close to meaningless on a platform
 * that runs many concurrent instances: ten instances silently means ten times
 * the allowance. This keeps the counter in the database, so a limit of twenty
 * an hour is twenty an hour no matter how the platform scales.
 *
 * The increment is a single atomic statement. Read-then-write would let two
 * simultaneous requests both see a count under the limit and both proceed —
 * exactly the case a limit exists to stop.
 */

type WindowRow = { count: number; windowStart: Date };

export async function consume(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = `${scope}:${subject}`;
  const now = Date.now();
  // Fixed windows aligned to the clock, so the row is self-expiring: a stale
  // windowStart is simply overwritten rather than needing to be cleaned up.
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  try {
    const rows = await prisma.$queryRaw<WindowRow[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count")
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" < ${windowStart} THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" < ${windowStart} THEN ${windowStart}
          ELSE "RateLimit"."windowStart"
        END
      RETURNING "count", "windowStart"
    `;

    const row = rows[0];
    if (!row) return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };

    const resetAt = row.windowStart.getTime() + windowMs;

    if (row.count > limit) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, resetAt - now) };
    }

    return { allowed: true, remaining: Math.max(0, limit - row.count), retryAfterMs: 0 };
  } catch (error) {
    // A limiter that fails closed would take the whole app down with the
    // database's first hiccup. Log loudly and let the request through — the
    // per-user AI budget is the backstop that actually protects spending.
    console.error(`[rate-limit] ${key} could not be checked`, error);
    return { allowed: true, remaining: 0, retryAfterMs: 0 };
  }
}

/** Removes windows that have long since expired. Safe to call rarely. */
export async function pruneRateLimits(olderThanMs = 86_400_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const { count } = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return count;
}
