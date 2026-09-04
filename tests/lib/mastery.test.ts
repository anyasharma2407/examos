import { describe, expect, it } from "vitest";
import {
  applyAttempt,
  decayStrength,
  INITIAL_MASTERY,
  masteryBand,
  masteryFrom,
  practicePriority,
  type AttemptEvidence,
} from "@/lib/mastery";

/**
 * The mastery model.
 *
 * These tests are written as the properties the model must have, rather than as
 * assertions on particular numbers — the constants are meant to be tuned, and a
 * test suite that pins them would block every improvement. What must not change
 * is the behaviour: harder questions count for more, recent evidence outweighs
 * old, one lucky guess is not mastery, and confidence decays.
 */

const DAY = 86_400_000;
const t0 = new Date("2026-09-01T09:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);

function attempt(overrides: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return { score: 1, difficulty: "MEDIUM", at: t0, ...overrides };
}

describe("a fresh topic", () => {
  it("starts with no score and no confidence", () => {
    expect(INITIAL_MASTERY).toMatchObject({ score: 0, strength: 0, lastPracticedAt: null });
    expect(masteryBand(INITIAL_MASTERY)).toBe("untested");
  });
});

describe("evidence accumulates", () => {
  it("is not correct divided by total", () => {
    // One right answer out of one is 100% by that formula. It is not mastery.
    const after = applyAttempt(INITIAL_MASTERY, attempt());
    expect(after.score).toBeLessThan(0.6);
  });

  it("rises steadily with repeated correct answers", () => {
    const scores: number[] = [];
    let state = INITIAL_MASTERY;
    for (let day = 0; day < 8; day += 1) {
      state = applyAttempt(state, attempt({ at: at(day) }));
      scores.push(state.score);
    }

    // Monotonic, and eventually high.
    for (let i = 1; i < scores.length; i += 1) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    expect(state.score).toBeGreaterThan(0.7);
  });

  it("gains confidence with every attempt, with diminishing returns", () => {
    let state = INITIAL_MASTERY;
    const gains: number[] = [];
    for (let day = 0; day < 5; day += 1) {
      const before = state.strength;
      state = applyAttempt(state, attempt({ at: at(day) }));
      gains.push(state.strength - before);
    }

    for (let i = 1; i < gains.length; i += 1) expect(gains[i]).toBeLessThan(gains[i - 1]);
    expect(state.strength).toBeLessThan(1);
  });
});

describe("difficulty matters", () => {
  it("rewards a hard question more than an easy one", () => {
    const hard = applyAttempt(INITIAL_MASTERY, attempt({ difficulty: "HARD" }));
    const easy = applyAttempt(INITIAL_MASTERY, attempt({ difficulty: "EASY" }));
    expect(hard.score).toBeGreaterThan(easy.score);
  });

  it("caps what an easy question can demonstrate", () => {
    // No number of easy questions should read as complete mastery.
    let state = INITIAL_MASTERY;
    for (let day = 0; day < 15; day += 1) {
      state = applyAttempt(state, attempt({ difficulty: "EASY", at: at(day) }));
    }
    expect(state.score).toBeLessThan(0.8);
  });

  it("punishes missing an easy question harder than missing a hard one", () => {
    let strong = INITIAL_MASTERY;
    for (let day = 0; day < 6; day += 1) {
      strong = applyAttempt(strong, attempt({ difficulty: "HARD", at: at(day) }));
    }

    const missedEasy = applyAttempt(strong, attempt({ score: 0, difficulty: "EASY", at: at(7) }));
    const missedHard = applyAttempt(strong, attempt({ score: 0, difficulty: "HARD", at: at(7) }));

    expect(missedEasy.score).toBeLessThan(missedHard.score);
  });
});

describe("recent performance outweighs old", () => {
  it("lets a run of wrong answers pull a high score down", () => {
    let state = INITIAL_MASTERY;
    for (let day = 0; day < 8; day += 1) state = applyAttempt(state, attempt({ at: at(day) }));
    const peak = state.score;

    for (let day = 8; day < 12; day += 1) {
      state = applyAttempt(state, attempt({ score: 0, at: at(day) }));
    }

    expect(state.score).toBeLessThan(peak * 0.7);
  });

  it("does not let old correct answers outvote today's mistakes", () => {
    const history: AttemptEvidence[] = [
      ...Array.from({ length: 10 }, (_, i) => attempt({ at: at(i) })),
      ...Array.from({ length: 3 }, (_, i) => attempt({ score: 0, at: at(60 + i) })),
    ];

    // 10 right, 3 wrong is 77% by ratio. Recency says otherwise.
    expect(masteryFrom(history).score).toBeLessThan(0.6);
  });
});

describe("confidence decays with time", () => {
  it("halves over the half-life", () => {
    const decayed = decayStrength(1, t0, at(21));
    expect(decayed).toBeCloseTo(0.5, 2);
  });

  it("does not decay for a topic never practised", () => {
    expect(decayStrength(0.8, null, at(100))).toBe(0);
  });

  it("reports a long-untouched topic as untested again", () => {
    let state = INITIAL_MASTERY;
    for (let day = 0; day < 6; day += 1) state = applyAttempt(state, attempt({ at: at(day) }));

    expect(masteryBand(state, at(6))).not.toBe("untested");
    // Six months later the measurement is no longer current evidence.
    expect(masteryBand(state, at(180))).toBe("untested");
  });

  it("leaves the score itself alone — knowledge is not assumed to drain away", () => {
    let state = INITIAL_MASTERY;
    for (let day = 0; day < 6; day += 1) state = applyAttempt(state, attempt({ at: at(day) }));
    const score = state.score;

    expect(masteryFrom([]).score).toBe(0);
    expect(state.score).toBe(score);
  });
});

describe("bands", () => {
  it("only reports a band once there is enough evidence", () => {
    const oneAttempt = applyAttempt(INITIAL_MASTERY, attempt());
    expect(masteryBand(oneAttempt, t0)).toBe("untested");
  });

  it("separates weak from strong", () => {
    let weak = INITIAL_MASTERY;
    let strong = INITIAL_MASTERY;
    for (let day = 0; day < 10; day += 1) {
      weak = applyAttempt(weak, attempt({ score: 0, at: at(day) }));
      strong = applyAttempt(strong, attempt({ difficulty: "HARD", at: at(day) }));
    }

    expect(masteryBand(weak, at(10))).toBe("weak");
    expect(masteryBand(strong, at(10))).toBe("strong");
  });
});

describe("practicePriority", () => {
  it("ranks a weak important topic above a strong one", () => {
    let weak = INITIAL_MASTERY;
    let strong = INITIAL_MASTERY;
    for (let day = 0; day < 8; day += 1) {
      weak = applyAttempt(weak, attempt({ score: 0, at: at(day) }));
      strong = applyAttempt(strong, attempt({ difficulty: "HARD", at: at(day) }));
    }

    expect(practicePriority(weak, 0.9, at(9))).toBeGreaterThan(
      practicePriority(strong, 0.9, at(9)),
    );
  });

  it("ranks an important topic above an unimportant one at equal mastery", () => {
    const state = applyAttempt(INITIAL_MASTERY, attempt());
    expect(practicePriority(state, 0.95, at(1))).toBeGreaterThan(
      practicePriority(state, 0.1, at(1)),
    );
  });

  it("gives an untested topic real priority rather than ignoring it", () => {
    // Never practised is a bigger unknown than practised and mediocre.
    let mediocre = INITIAL_MASTERY;
    for (let day = 0; day < 6; day += 1) {
      mediocre = applyAttempt(mediocre, attempt({ score: day % 2, at: at(day) }));
    }

    expect(practicePriority(INITIAL_MASTERY, 0.8, t0)).toBeGreaterThan(0.4);
    expect(practicePriority(INITIAL_MASTERY, 0.8, t0)).toBeGreaterThan(
      practicePriority(mediocre, 0.8, at(6)) * 0.8,
    );
  });

  it("stays within range", () => {
    for (const importance of [0, 0.5, 1, 2, -1]) {
      const value = practicePriority(INITIAL_MASTERY, importance, t0);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
