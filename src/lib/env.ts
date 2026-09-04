import { z } from "zod";

/**
 * Environment access.
 *
 * Server variables are validated lazily so that `next build`, unit tests and
 * `--help`-style tooling do not require a fully provisioned environment. Call
 * `serverEnv()` from server-only code; it throws a single readable error listing
 * everything that is missing.
 *
 * Public variables are read through direct `process.env.NEXT_PUBLIC_*` member
 * expressions because Next.js inlines them at build time only when written that
 * way.
 */

/**
 * An optional variable that may legitimately be blank.
 *
 * `.env.example` ships keys with empty values, so a copied-but-not-yet-filled
 * file would otherwise fail validation. Treating "" as absent keeps a missing
 * OpenAI key from taking down unrelated things like the database connection.
 */
const optional = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  OPENAI_API_KEY: optional,
  /** Point at Azure OpenAI or another OpenAI-compatible gateway. */
  OPENAI_BASE_URL: optional,
  OPENAI_MODEL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).default("gpt-5.6-luna"),
  ),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test helper: forget the memoised environment. */
export function resetServerEnvCache(): void {
  cached = null;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
} as const;

/**
 * True when Supabase credentials are present. The landing page and tests must
 * render without them; anything that actually talks to Supabase should check
 * this and surface a clear setup message instead of throwing at import time.
 */
export function isSupabaseConfigured(): boolean {
  return publicEnv.supabaseUrl.length > 0 && publicEnv.supabaseAnonKey.length > 0;
}
