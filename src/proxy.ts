import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy` (Node.js
 * runtime, no edge). This refreshes the Supabase auth cookie and redirects
 * signed-out visitors away from protected routes.
 *
 * This is a convenience layer, not the security boundary — see src/lib/auth.ts.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except Next.js internals, static assets, and the material
     * upload route.
     *
     * The upload route is excluded deliberately: when a proxy matches a
     * request, Next.js buffers the entire body in memory so it can be read
     * twice, capped at 10MB by default — which would silently truncate a large
     * PDF. Skipping it here costs nothing, because that route authenticates
     * with `requireUser()` and checks course ownership itself.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/materials/upload|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
