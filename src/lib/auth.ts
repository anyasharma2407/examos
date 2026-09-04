import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@/generated/prisma/client";

/**
 * Server-side session access.
 *
 * This is the authorisation boundary for the app: middleware only redirects,
 * so every page, Server Action and Route Handler that touches user data must
 * start from `requireUser()`.
 */

/**
 * The Supabase-verified user for this request, or null.
 *
 * `getUser()` revalidates the token against the auth server; `getSession()`
 * would trust a cookie the client could have forged.
 */
export const getAuthUser = cache(async (): Promise<SupabaseUser | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/**
 * Mirrors the Supabase identity into our own `User` table so that application
 * rows have a real foreign key to point at. Safe to call on every request.
 */
async function syncUser(authUser: SupabaseUser): Promise<User> {
  const email = authUser.email ?? `${authUser.id}@no-email.local`;
  const name =
    typeof authUser.user_metadata?.name === "string" ? authUser.user_metadata.name : null;

  return prisma.user.upsert({
    where: { id: authUser.id },
    create: { id: authUser.id, email, name },
    update: { email, ...(name ? { name } : {}) },
  });
}

/** The signed-in application user, or null when signed out. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const authUser = await getAuthUser();
  if (!authUser) return null;
  return syncUser(authUser);
});

/**
 * The signed-in application user; redirects to the login page when signed out.
 * Use this in every protected page and action.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
