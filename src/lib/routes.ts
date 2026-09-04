/**
 * Route access policy, shared by the middleware and its tests.
 *
 * Middleware is a convenience redirect, not the security boundary: every page
 * and action under these prefixes independently calls `requireUser()`.
 */

/** Everything below these prefixes requires a signed-in user. */
export const PROTECTED_PREFIXES = ["/dashboard", "/courses", "/practice", "/study"] as const;

/** Auth screens that a signed-in user should be bounced away from. */
export const SIGNED_OUT_ONLY_PATHS = ["/login", "/signup"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isSignedOutOnlyPath(pathname: string): boolean {
  return (SIGNED_OUT_ONLY_PATHS as readonly string[]).includes(pathname);
}
