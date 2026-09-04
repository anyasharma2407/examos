import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-user AI spending limits.
 *
 * Every AI call bills the operator, not the student. Without a per-user
 * ceiling one account can spend without bound, and the first anyone knows of
 * it is the invoice — so the properties that matter are that the budget is
 * measured in real tokens, that it is scoped to one user, and that it cannot
 * take the app down when the database is unhappy.
 */

const aggregate = vi.fn();
const create = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { aiUsage: { aggregate, create } },
}));

const { budgetStatus, checkBudget, dailyTokenBudget, recordUsage } = await import(
  "@/lib/ai/budget"
);

const USER = "11111111-1111-1111-1111-111111111111";
const ORIGINAL = { ...process.env };

function usage(input: number, output: number) {
  aggregate.mockResolvedValue({ _sum: { inputTokens: input, outputTokens: output } });
}

beforeEach(() => {
  vi.clearAllMocks();
  usage(0, 0);
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("dailyTokenBudget", () => {
  it("has a default so a deployment cannot accidentally be unlimited", () => {
    delete process.env.AI_DAILY_TOKEN_BUDGET;
    expect(dailyTokenBudget()).toBeGreaterThan(0);
  });

  it("can be tuned per deployment", () => {
    process.env.AI_DAILY_TOKEN_BUDGET = "12345";
    expect(dailyTokenBudget()).toBe(12345);
  });

  it("ignores nonsense rather than becoming unlimited", () => {
    for (const value of ["", "abc", "-5", "0"]) {
      process.env.AI_DAILY_TOKEN_BUDGET = value;
      expect(dailyTokenBudget(), value).toBeGreaterThan(0);
    }
  });
});

describe("budgetStatus", () => {
  it("counts input and output tokens together", () => {
    // Output is the expensive half; ignoring it would understate spend badly.
    usage(100_000, 20_000);
    return expect(budgetStatus(USER)).resolves.toMatchObject({ used: 120_000 });
  });

  it("only counts the user's own usage, over a rolling window", async () => {
    await budgetStatus(USER);

    const where = aggregate.mock.calls[0]?.[0]?.where;
    expect(where.userId).toBe(USER);
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("reports remaining allowance", async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = "100000";
    usage(30_000, 10_000);

    expect(await budgetStatus(USER)).toMatchObject({
      used: 40_000,
      limit: 100_000,
      remaining: 60_000,
      exceeded: false,
    });
  });

  it("never reports negative remaining", async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = "1000";
    usage(5_000, 0);

    const status = await budgetStatus(USER);
    expect(status.remaining).toBe(0);
    expect(status.exceeded).toBe(true);
  });

  it("treats no usage as zero rather than crashing", async () => {
    aggregate.mockResolvedValue({ _sum: { inputTokens: null, outputTokens: null } });
    expect(await budgetStatus(USER)).toMatchObject({ used: 0, exceeded: false });
  });
});

describe("checkBudget", () => {
  it("allows a user inside their allowance", async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = "100000";
    usage(10_000, 1_000);
    expect(await checkBudget(USER)).toEqual({ ok: true });
  });

  it("refuses once spent, and says when it comes back", async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = "1000";
    usage(2_000, 0);

    const result = await checkBudget(USER);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/allowance/i);
  });

  it("lets the request through if the budget cannot be read", async () => {
    // A budget check that fails closed would take the app down with the
    // database's first hiccup; the rate limit is the other line of defence.
    aggregate.mockRejectedValue(new Error("connection lost"));
    expect(await checkBudget(USER)).toEqual({ ok: true });
  });
});

describe("recordUsage", () => {
  it("records what a call actually cost", async () => {
    await recordUsage({
      userId: USER,
      feature: "knowledge_map",
      model: "test-model",
      inputTokens: 1234,
      outputTokens: 56,
    });

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      userId: USER,
      feature: "knowledge_map",
      inputTokens: 1234,
      outputTokens: 56,
    });
  });

  it("never fails the request it is measuring", async () => {
    create.mockRejectedValue(new Error("write failed"));
    await expect(
      recordUsage({
        userId: USER,
        feature: "tutor",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses to record negative or fractional tokens", async () => {
    await recordUsage({
      userId: USER,
      feature: "tutor",
      model: "m",
      inputTokens: -5,
      outputTokens: 10.7,
    });

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      inputTokens: 0,
      outputTokens: 11,
    });
  });
});
