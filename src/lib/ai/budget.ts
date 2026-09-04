import "server-only";

import { prisma } from "@/lib/db";

/**
 * Per-user spending limits on AI features.
 *
 * Every AI call bills the operator's account, not the student's. Without a
 * per-user ceiling, one account — curious, automated, or malicious — can spend
 * without bound, and the first anyone knows of it is the invoice.
 *
 * Tokens are budgeted rather than calls, because calls vary enormously: one
 * question on a short topic and a knowledge map over a whole semester's uploads
 * differ by orders of magnitude. Recording real usage means the budget tracks
 * what is actually being spent.
 */

/** Rolling window the budget applies over. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Default daily allowance per user, in tokens.
 *
 * Sized so a student can set up a course properly — a knowledge map, then a
 * guide, a card set and a question batch for each of six topics, plus a real
 * tutor conversation — and still have room to come back later the same day.
 * Well beyond ordinary use, well short of what an abusive account would want.
 */
const DEFAULT_DAILY_TOKENS = 600_000;

export function dailyTokenBudget(): number {
  const configured = Number(process.env.AI_DAILY_TOKEN_BUDGET);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_DAILY_TOKENS;
}

export type BudgetStatus = {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
};

export async function budgetStatus(userId: string): Promise<BudgetStatus> {
  const since = new Date(Date.now() - WINDOW_MS);

  const totals = await prisma.aiUsage.aggregate({
    where: { userId, createdAt: { gte: since } },
    _sum: { inputTokens: true, outputTokens: true },
  });

  const used = (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0);
  const limit = dailyTokenBudget();

  return { used, limit, remaining: Math.max(0, limit - used), exceeded: used >= limit };
}

/**
 * Checks the budget before an AI call, returning a message when it is spent.
 *
 * Deliberately checked *before* rather than enforced after: a user who has run
 * out should be told plainly rather than having a request fail somewhere
 * unhelpful.
 */
export async function checkBudget(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const status = await budgetStatus(userId);
    if (!status.exceeded) return { ok: true };

    const hours = Math.ceil(WINDOW_MS / 3_600_000);
    return {
      ok: false,
      error: `You have used your AI allowance for today. It resets over the next ${hours} hours.`,
    };
  } catch (error) {
    // Never block a legitimate user because the budget could not be read.
    console.error("[ai-budget] could not check budget", error);
    return { ok: true };
  }
}

/** Records what a call actually cost. Never throws — usage data is not worth failing a request over. */
export async function recordUsage(input: {
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  try {
    await prisma.aiUsage.create({
      data: {
        userId: input.userId,
        feature: input.feature,
        model: input.model,
        inputTokens: Math.max(0, Math.round(input.inputTokens)),
        outputTokens: Math.max(0, Math.round(input.outputTokens)),
      },
    });
  } catch (error) {
    console.error("[ai-budget] could not record usage", error);
  }
}
