import { describe, expect, it } from "vitest";
import {
  emailSchema,
  forgotPasswordSchema,
  loginSchema,
  passwordSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/auth";

describe("email validation", () => {
  it("normalises whitespace and casing", () => {
    expect(emailSchema.parse("  Student@Uni.EDU.AU ")).toBe("student@uni.edu.au");
  });

  it("rejects malformed addresses", () => {
    for (const value of ["", "not-an-email", "a@b", "@example.com", "a b@example.com"]) {
      expect(emailSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("password policy", () => {
  it("requires at least 10 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a".repeat(10)).success).toBe(true);
  });

  it("rejects passwords bcrypt would silently truncate", () => {
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });
});

describe("sign up", () => {
  it("accepts a complete submission", () => {
    const result = signUpSchema.safeParse({
      name: "  Ada Lovelace ",
      email: "ADA@example.com",
      password: "correct-horse",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct-horse",
    });
  });

  it("reports every invalid field at once", () => {
    const result = signUpSchema.safeParse({ name: "", email: "nope", password: "x" });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });
});

describe("login", () => {
  it("does not apply the sign-up password policy to existing passwords", () => {
    // An account created before the policy changed must still be able to log in.
    expect(loginSchema.safeParse({ email: "a@example.com", password: "old" }).success).toBe(
      true,
    );
  });

  it("still requires a password to be present", () => {
    expect(loginSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
  });
});

describe("password reset", () => {
  it("requires the confirmation to match", () => {
    const mismatch = resetPasswordSchema.safeParse({
      password: "correct-horse",
      confirmPassword: "correct-hors",
    });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);

    expect(
      resetPasswordSchema.safeParse({
        password: "correct-horse",
        confirmPassword: "correct-horse",
      }).success,
    ).toBe(true);
  });

  it("validates the email on the forgot-password form", () => {
    expect(forgotPasswordSchema.safeParse({ email: "  A@B.com " }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "junk" }).success).toBe(false);
  });
});
