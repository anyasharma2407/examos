import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses row-level security, so it is only for
 * trusted server-side work (signed storage URLs, deleting a user's objects).
 * Never import this from a Client Component.
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set; server-side storage operations are unavailable.",
    );
  }

  return createClient(publicEnv.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
