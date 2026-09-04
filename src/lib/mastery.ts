/**
 * Topic mastery.
 *
 * Deliberately not `correct / total`. That number is wrong in ways that matter
 * for revision:
 *
 *  - it treats an easy question as worth the same as a hard one;
 *  - it lets ten right answers from last month outweigh three wrong ones today,
 *    when recent evidence is what predicts an exam;
 *  - it never decays, so a topic practised in week 2 still reads 90% in week 12;
 *  - it reads 100% after a single lucky guess.
 *
 * This model instead keeps a running estimate updated per attempt, where each
 * attempt's influence depends on its difficulty and how much evidence already
 * exists, and where confidence decays with time since practice.
 *
 * `masteryScore` is the estimate (0..1). `masteryStrength` is how much evidence
 * backs it (0..1) — the UI uses it to distinguish "70%, barely tested" from
 * "70%, tested repeatedly". Keeping them separate is what lets the study planner
 * choose between revisiting an uncertain topic and drilling a genuinely weak one.
 *
 * Pure functions over plain data: no database, no clock of its own, fully
 * unit-tested and replaceable without touching anything else.
 */

import type { Difficulty } from "@/generated/prisma/enums";

export type MasteryState = {
  /** Current estimate of how well the topic is known, 0..1. */
  score: number;
  /** Confidence in that estimate, 0..1. */
  strength: number;
  lastPracticedAt: Date | null;
};

export type AttemptEvidence = {
  /** 0..1. Partial credit is allowed; a binary grade passes 0 or 1. */
  score: number;
  difficulty: Difficulty;
  at: Date;
};

/**
 * What a correct answer at each difficulty demonstrates.
 *
 * Getting a hard question right is strong evidence of mastery; getting an easy
 * one right is weak evidence, because a student who knows very little can still
 * manage it. The same asymmetry runs the other way: missing an easy question is
 * a louder signal than missing a hard one.
 */
const DIFFICULTY_WEIGHT: Record<Difficulty, { correct: number; incorrect: number }> = {
  EASY: { correct: 0.6, incorrect: 1.3 },
  MEDIUM: { correct: 1.0, incorrect: 1.0 },
  HARD: { correct: 1.4, incorrect: 0.7 },
};

/** The level a single answer at this difficulty is evidence *for*. */
const DIFFICULTY_CEILING: Record<Difficulty, number> = {
  EASY: 0.75,
  MEDIUM: 0.9,
  HARD: 1,
};

/** Starting point for a topic with no evidence: unknown, not zero-knowledge. */
export const INITIAL_MASTERY: MasteryState = {
  score: 0,
  strength: 0,
  lastPracticedAt: null,
};

/** Half-life of confidence, in days. After this long, strength has halved. */
const STRENGTH_HALF_LIFE_DAYS = 21;

const DAY_MS = 86_400_000;

/**
 * How much a topic's evidence has faded.
 *
 * Knowledge is not assumed to drain away — the score is left alone — but our
 * *confidence* in a months-old measurement should not be treated as current.
 * The planner uses the decayed strength to bring stale topics back around.
 */
export function decayStrength(
  strength: number,
  lastPracticedAt: Date | null,
  now: Date,
): number {
  if (lastPracticedAt === null) return 0;

  const days = (now.getTime() - lastPracticedAt.getTime()) / DAY_MS;
  if (days <= 0) return strength;

  return strength * Math.pow(0.5, days / STRENGTH_HALF_LIFE_DAYS);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Folds one attempt into the running estimate.
 *
 * The learning rate falls as evidence accumulates, so early attempts move the
 * estimate a lot and later ones refine it. That is what stops a single lucky
 * guess reading as mastery, while still letting a run of wrong answers pull a
 * previously high score down.
 */
export function applyAttempt(
  state: MasteryState,
  attempt: AttemptEvidence,
): MasteryState {
  const score = clamp01(attempt.score);
  const correct = score >= 0.5;
  const weight = DIFFICULTY_WEIGHT[attempt.difficulty];

  // Confidence is judged as of this attempt, not as of the last one.
  const strength = decayStrength(state.strength, state.lastPracticedAt, attempt.at);

  // Evidence about a level, not a raw 0 or 1: a correct HARD answer argues for
  // 1.0, a correct EASY one only for 0.75, and a wrong answer argues for a
  // level below the current estimate rather than for zero.
  const target = correct
    ? DIFFICULTY_CEILING[attempt.difficulty] * (0.5 + score / 2)
    : Math.min(state.score, DIFFICULTY_CEILING[attempt.difficulty]) * 0.45 + score * 0.2;

  // Falls as evidence builds, so early attempts move the estimate and later
  // ones refine it — but floored, because an estimator that stops responding
  // cannot represent "recent performance". Without the floor, a student who had
  // built a high score could get four in a row wrong and barely move.
  const responsiveness = Math.max(0.45 / (1 + strength * 4), 0.2);
  const learningRate = (correct ? weight.correct : weight.incorrect) * responsiveness;

  const nextScore = clamp01(state.score + (target - state.score) * clamp01(learningRate));

  // Each attempt adds evidence, with diminishing returns.
  const nextStrength = clamp01(strength + (1 - strength) * 0.22);

  return {
    score: nextScore,
    strength: nextStrength,
    lastPracticedAt: attempt.at,
  };
}

/** Replays a whole history. Used by tests and by any future recalculation. */
export function masteryFrom(attempts: AttemptEvidence[]): MasteryState {
  return attempts
    .slice()
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .reduce(applyAttempt, INITIAL_MASTERY);
}

export type MasteryBand = "untested" | "weak" | "shaky" | "solid" | "strong";

/**
 * Minimum confidence before a band is shown at all.
 *
 * Set above what a single attempt produces: one answer, right or wrong, must
 * never present itself as a measurement of what a student knows.
 */
const BAND_THRESHOLD = 0.3;

/**
 * The band shown to the student.
 *
 * A score backed by almost no evidence is reported as untested rather than
 * flattering the student with a number one question produced.
 */
export function masteryBand(state: MasteryState, now: Date = new Date()): MasteryBand {
  const strength = decayStrength(state.strength, state.lastPracticedAt, now);
  if (strength < BAND_THRESHOLD) return "untested";
  if (state.score < 0.4) return "weak";
  if (state.score < 0.6) return "shaky";
  if (state.score < 0.8) return "solid";
  return "strong";
}

/**
 * How badly a topic needs attention, 0..1 — the number the study planner sorts
 * on. High when the topic matters, is not known well, and has not been seen
 * recently.
 */
export function practicePriority(
  state: MasteryState,
  importance: number,
  now: Date = new Date(),
): number {
  const strength = decayStrength(state.strength, state.lastPracticedAt, now);
  const gap = 1 - state.score;
  // An untested topic is a bigger unknown than a tested weak one, so low
  // confidence raises priority on its own.
  const uncertainty = 1 - strength;

  return clamp01((gap * 0.6 + uncertainty * 0.4) * (0.4 + clamp01(importance) * 0.6));
}
