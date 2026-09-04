import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Authentication protection.
 *
 * The proxy is the first line of defence: signed-out visitors must never reach
 * a protected route, and the check must revalidate the token with Supabase
 * rather than trusting the cookie.
 */

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));

const { updateSession } = await import("@/lib/supabase/proxy");
const { createServerClient } = await import("@supabase/ssr");

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://examos.test"));
}

function signedIn() {
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

function signedOut() {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
}

describe("proxy auth protection", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("redirects a signed-out visitor away from a protected route", async () => {
    signedOut();
    const response = await updateSession(request("/dashboard"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });

  it("preserves the deep link the visitor was trying to reach", async () => {
    signedOut();
    const response = await updateSession(request("/courses/abc123/practice"));

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("next")).toBe("/courses/abc123/practice");
  });

  it("lets a signed-out visitor read public pages", async () => {
    signedOut();
    for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
      const response = await updateSession(request(path));
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("lets a signed-in user through to protected routes", async () => {
    signedIn();
    const response = await updateSession(request("/dashboard"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends a signed-in user away from the login and signup pages", async () => {
    signedIn();
    for (const path of ["/login", "/signup"]) {
      const response = await updateSession(request(path));
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.pathname).toBe("/dashboard");
    }
  });

  it("still allows a signed-in user to reach the reset-password page", async () => {
    signedIn();
    const response = await updateSession(request("/reset-password"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("verifies the session with the auth server instead of reading the cookie", async () => {
    signedOut();
    await updateSession(request("/dashboard"));

    expect(getUser).toHaveBeenCalledTimes(1);
    // `getSession()` would trust a client-supplied cookie; it must not be used.
    const client = vi.mocked(createServerClient).mock.results.at(-1)?.value as {
      auth: Record<string, unknown>;
    };
    expect(client.auth.getSession).toBeUndefined();
  });
});
