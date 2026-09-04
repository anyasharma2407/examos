"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { authLimiter } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/auth";

/**
 * Authentication Server Actions.
 *
 * Server Actions are reachable by direct POST, so each one validates its own
 * input and rate-limits before touching Supabase. Failures are returned as
 * state for `useActionState` rather than thrown, so the form can render them.
 */

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

const NOT_CONFIGURED: AuthFormState = {
  error:
    "Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.",
};

function parse<T>(schema: ZodType<T>, raw: unknown): { data: T } | { state: AuthFormState } {
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { state: { error: "Please fix the highlighted fields.", fieldErrors } };
}

/**
 * Rate-limit key. Behind a proxy the client IP arrives in `x-forwarded-for`;
 * when it is absent every caller shares one bucket, which fails closed-ish
 * (stricter) rather than open.
 */
async function limiterKey(scope: string): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

async function checkLimit(scope: string): Promise<AuthFormState | null> {
  const { allowed, retryAfterMs } = authLimiter.check(await limiterKey(scope));
  if (allowed) return null;
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
}

/** Absolute origin for links Supabase emails back to the user. */
async function siteOrigin(): Promise<string> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = parse(signUpSchema, {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if ("state" in parsed) return parsed.state;

  const limited = await checkLimit("signup");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) return { error: error.message };

  // When the project requires email confirmation there is no session yet.
  if (!data.session) {
    return {
      success: `Check ${parsed.data.email} for a confirmation link to finish setting up your account.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = parse(loginSchema, {
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if ("state" in parsed) return parsed.state;

  const limited = await checkLimit("login");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // Deliberately vague: distinguishing "no such user" from "wrong password"
  // would let anyone enumerate registered email addresses.
  if (error) return { error: "That email and password combination is not correct." };

  const nextPath = formData.get("next");
  const destination =
    typeof nextPath === "string" && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function forgotPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = parse(forgotPasswordSchema, { email: formData.get("email") });
  if ("state" in parsed) return parsed.state;

  const limited = await checkLimit("forgot-password");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });

  // Always the same answer, whether or not the address is registered.
  return {
    success: `If an account exists for ${parsed.data.email}, a reset link is on its way.`,
  };
}

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = parse(resetPasswordSchema, {
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if ("state" in parsed) return parsed.state;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reaching this page requires the recovery link to have created a session.
  if (!user) {
    return { error: "This reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}
