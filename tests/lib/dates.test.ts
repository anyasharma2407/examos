import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  daysUntil,
  formatExamDate,
  formatMinutes,
  parseDateOnly,
  toDateInputValue,
} from "@/lib/dates";

describe("parseDateOnly", () => {
  it("reads the format an <input type=date> submits", () => {
    const date = parseDateOnly("2026-10-25");
    expect(date?.toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });

  it("rejects dates that do not exist", () => {
    // Date.UTC would silently roll these forward into the next month.
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
    expect(parseDateOnly("2025-02-29")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseDateOnly("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("rejects anything that is not a bare date", () => {
    for (const value of ["", "tomorrow", "25/10/2026", "2026-10-25T10:00:00Z", "2026-1-5"]) {
      expect(parseDateOnly(value)).toBeNull();
    }
  });
});

describe("daysUntil", () => {
  const from = new Date("2026-10-08T13:45:00Z");

  it("counts whole calendar days regardless of time of day", () => {
    expect(daysUntil(new Date("2026-10-25T00:00:00Z"), from)).toBe(17);
    expect(daysUntil(new Date("2026-10-09T01:00:00Z"), from)).toBe(1);
  });

  it("is zero for today even late in the day", () => {
    expect(daysUntil(new Date("2026-10-08T23:59:00Z"), from)).toBe(0);
  });

  it("goes negative once the date has passed", () => {
    expect(daysUntil(new Date("2026-10-01T00:00:00Z"), from)).toBe(-7);
  });
});

describe("countdownLabel", () => {
  const from = new Date("2026-10-08T13:45:00Z");

  it("reads naturally at each boundary", () => {
    expect(countdownLabel(new Date("2026-10-25T00:00:00Z"), from)).toBe("17 days remaining");
    expect(countdownLabel(new Date("2026-10-09T00:00:00Z"), from)).toBe("Tomorrow");
    expect(countdownLabel(new Date("2026-10-08T00:00:00Z"), from)).toBe("Exam is today");
    expect(countdownLabel(new Date("2026-10-07T00:00:00Z"), from)).toBe("Exam has passed");
  });
});

describe("formatting", () => {
  it("shows the calendar day the student chose, not a timezone-shifted one", () => {
    expect(formatExamDate(new Date("2026-10-25T00:00:00Z"))).toBe("25 October 2026");
  });

  it("round-trips through the date input format", () => {
    const date = new Date("2026-10-25T00:00:00Z");
    expect(toDateInputValue(date)).toBe("2026-10-25");
    expect(parseDateOnly(toDateInputValue(date))?.getTime()).toBe(date.getTime());
  });

  it("renders study time in the largest sensible unit", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 hour");
    expect(formatMinutes(480)).toBe("8 hours");
    expect(formatMinutes(450)).toBe("7.5 hours");
  });
});
