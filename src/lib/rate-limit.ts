/**
 * Fixed-window rate limiting.
 *
 * Deliberately in-memory and per-process: it is a cheap guard against a single
 * client hammering an endpoint (auth attempts, uploads, AI generation), not a
 * distributed quota. Swap the store for Redis before running multiple
 * instances behind a load balancer.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Milliseconds until the window resets. 0 when the request was allowed. */
  retryAfterMs: number;
};

type Window = { count: number; resetAt: number };

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (limit < 1) throw new Error("Rate limit must allow at least one request");
    if (windowMs < 1) throw new Error("Rate limit window must be positive");
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    this.prune(now);

    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterMs: 0 };
    }

    if (existing.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count, retryAfterMs: 0 };
  }

  reset(key?: string): void {
    if (key === undefined) this.windows.clear();
    else this.windows.delete(key);
  }

  /** Drop expired windows so the map cannot grow without bound. */
  private prune(now: number): void {
    if (this.windows.size < 512) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

/**
 * Limiters are module-level so they survive between requests within a process.
 * Next.js keeps route modules warm, so this is effective in practice.
 */
export const authLimiter = new FixedWindowRateLimiter(10, 5 * 60_000);
