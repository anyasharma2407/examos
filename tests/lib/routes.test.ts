import { describe, expect, it } from "vitest";
import { isProtectedPath, isSignedOutOnlyPath, PROTECTED_PREFIXES } from "@/lib/routes";

describe("route access policy", () => {
  it("protects every declared prefix and its children", () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(isProtectedPath(prefix)).toBe(true);
      expect(isProtectedPath(`${prefix}/nested/deep`)).toBe(true);
    }
  });

  it("leaves public routes alone", () => {
    for (const path of ["/", "/login", "/signup", "/forgot-password", "/auth/confirm"]) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });

  it("does not protect a path that merely starts with the same characters", () => {
    // `/dashboards-public` must not be treated as living under `/dashboard`.
    expect(isProtectedPath("/dashboards-public")).toBe(false);
    expect(isProtectedPath("/coursework")).toBe(false);
  });

  it("identifies pages a signed-in user should be bounced away from", () => {
    expect(isSignedOutOnlyPath("/login")).toBe(true);
    expect(isSignedOutOnlyPath("/signup")).toBe(true);
    expect(isSignedOutOnlyPath("/dashboard")).toBe(false);
    expect(isSignedOutOnlyPath("/reset-password")).toBe(false);
  });
});
