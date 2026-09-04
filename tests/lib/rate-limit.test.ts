import { beforeEach, describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";

describe("FixedWindowRateLimiter", () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it("allows up to the limit and then blocks", () => {
    const limiter = new FixedWindowRateLimiter(3, 60_000, clock);

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 0 });

    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
  });

  it("tracks keys independently", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, clock);

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("starts a fresh window once the old one expires", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, clock);

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    now += 60_000;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("reports a shrinking retry-after as the window drains", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, clock);
    limiter.check("a");

    now += 20_000;
    expect(limiter.check("a").retryAfterMs).toBe(40_000);
  });

  it("can be reset per key and wholesale", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, clock);
    limiter.check("a");
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);

    limiter.reset();
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("rejects nonsensical configuration", () => {
    expect(() => new FixedWindowRateLimiter(0, 1000)).toThrow();
    expect(() => new FixedWindowRateLimiter(1, 0)).toThrow();
  });
});
