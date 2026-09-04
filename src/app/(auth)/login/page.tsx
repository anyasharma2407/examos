import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

const LINK_ERRORS: Record<string, string> = {
  "invalid-link": "That link is not valid. Request a new one.",
  "expired-link": "That link has expired. Request a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Only accept same-origin relative paths as a post-login destination.
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Log in to pick up today&apos;s study plan.
        </p>
      </div>

      <LoginForm next={next} notice={params.error ? LINK_ERRORS[params.error] : undefined} />

      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  );
}
