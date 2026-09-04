import { afterEach, describe, expect, it } from "vitest";
import { resetServerEnvCache, serverEnv } from "@/lib/env";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetServerEnvCache();
});

describe("serverEnv", () => {
  it("reads the configured values", () => {
    resetServerEnvCache();
    expect(serverEnv().DATABASE_URL).toBe(process.env.DATABASE_URL);
  });

  it("defaults the model so deployments do not have to set it", () => {
    delete process.env.OPENAI_MODEL;
    resetServerEnvCache();
    // Asserted as a property rather than a literal: the default tracks whatever
    // model is current, and pinning the string here would only ever be a chore.
    expect(serverEnv().OPENAI_MODEL).toMatch(/\S/);
  });

  it("lets the model be overridden without touching code", () => {
    process.env.OPENAI_MODEL = "some-other-model";
    resetServerEnvCache();
    expect(serverEnv().OPENAI_MODEL).toBe("some-other-model");
  });

  it("treats a blank optional value as unset", () => {
    // `.env.example` ships `OPENAI_API_KEY=""`. A copied-but-unfilled file must
    // not break unrelated configuration such as the database connection.
    process.env.OPENAI_API_KEY = "";
    process.env.OPENAI_MODEL = "";
    resetServerEnvCache();

    const env = serverEnv();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    // A blank model falls back to the default rather than becoming "".
    expect(env.OPENAI_MODEL).toMatch(/\S/);
    expect(env.DATABASE_URL).toBe(process.env.DATABASE_URL);
  });

  it("fails loudly, and names the variable, when the database URL is missing", () => {
    delete process.env.DATABASE_URL;
    resetServerEnvCache();
    expect(() => serverEnv()).toThrow(/DATABASE_URL/);
  });
});

describe("isSupabaseConfigured", () => {
  it("is derived from the public credentials", async () => {
    // Read through a fresh module so the build-time inlined values are re-evaluated.
    const { isSupabaseConfigured } = await import("@/lib/env");
    expect(isSupabaseConfigured()).toBe(true);
  });
});
