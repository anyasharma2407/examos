import { describe, expect, it } from "vitest";
import { greetingFor } from "@/lib/greeting";

describe("greetingFor", () => {
  it("splits the day into morning, afternoon and evening", () => {
    expect(greetingFor(0)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });

  it("falls back for impossible hours", () => {
    expect(greetingFor(-1)).toBe("Hello");
    expect(greetingFor(24)).toBe("Hello");
    expect(greetingFor(Number.NaN)).toBe("Hello");
  });
});
