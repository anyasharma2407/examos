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
     * Every path except Next.js internals and static assets, so the auth cookie
     * is refreshed on normal navigations without burning work on images.
     *
     * No upload path needs excluding: files go from the browser straight to
     * storage, so no request the proxy sees ever carries a large body.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
