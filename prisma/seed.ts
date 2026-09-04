/**
 * Development-only demo data.
 *
 * Creates a Supabase auth user plus a MATH1061 course so the app can be clicked
 * through without signing up. Every row it writes is marked `isDemo` on the
 * owning `User`, so demo data is always distinguishable from real data and can
 * be removed with a single cascading delete.
 *
 * Run with: npm run db:seed
 *
 * This grows with the application — each phase seeds the entities it adds.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DEMO_EMAIL = "demo@examos.local";
const DEMO_PASSWORD = "demo-password-1234";
const DEMO_NAME = "Demo Student";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to seed demo data. See .env.example.`);
  return value;
}

/**
 * Demo data must never be written to a production database: the account has a
 * published password.
 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error(
      "Refusing to seed demo data with NODE_ENV=production. " +
        "Set ALLOW_PRODUCTION_SEED=true only if you really mean it.",
    );
  }
}

/**
 * Creates (or finds) the demo user in Supabase Auth and returns its id, so the
 * seeded rows belong to an account you can actually log in as.
 */
async function ensureAuthUser(): Promise<string> {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const created = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: DEMO_NAME },
  });

  if (created.data.user) return created.data.user.id;

  // Already there from a previous run — look it up instead of failing.
  const existing = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (existing.error) throw existing.error;

  const match = existing.data.users.find((user) => user.email === DEMO_EMAIL);
  if (!match) {
    throw new Error(
      `Could not create or find the demo auth user: ${created.error?.message ?? "unknown error"}`,
    );
  }
  return match.id;
}

const TOPICS = [
  {
    name: "Functions",
    description: "Domain, range, composition and inverse functions.",
    importance: 0.7,
  },
  {
    name: "Limits",
    description: "Limit laws, one-sided limits and continuity.",
    importance: 0.6,
  },
  {
    name: "Differentiation",
    description: "Derivative rules, implicit differentiation and applications.",
    importance: 0.9,
  },
  {
    name: "Integration",
    description: "Antiderivatives, substitution and integration by parts.",
    importance: 0.95,
  },
  {
    name: "Probability",
    description: "Conditional probability, independence and Bayes' theorem.",
    importance: 0.85,
  },
  {
    name: "Sequences",
    description: "Convergence, monotone sequences and series tests.",
    importance: 0.6,
  },
];

async function main(): Promise<void> {
  assertNotProduction();

  const adapter = new PrismaPg({ connectionString: requireEnv("DATABASE_URL") });
  const prisma = new PrismaClient({ adapter });

  try {
    const userId = await ensureAuthUser();

    const user = await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: DEMO_EMAIL, name: DEMO_NAME, isDemo: true },
      update: { email: DEMO_EMAIL, name: DEMO_NAME, isDemo: true },
    });

    // Rebuild the demo course from scratch so re-seeding is idempotent.
    await prisma.course.deleteMany({ where: { userId: user.id, code: "MATH1061" } });

    const examDate = new Date();
    examDate.setUTCDate(examDate.getUTCDate() + 17);
    examDate.setUTCHours(9, 0, 0, 0);

    const course = await prisma.course.create({
      data: {
        userId: user.id,
        name: "Discrete Mathematics",
        code: "MATH1061",
        targetGrade: "DISTINCTION",
        weeklyStudyMinutes: 8 * 60,
        exams: {
          create: { title: "Final Exam", type: "FINAL", date: examDate, weight: 0.6 },
        },
        topics: {
          create: TOPICS.map((topic, position) => ({ ...topic, position })),
        },
      },
      include: { topics: true, exams: true },
    });

    console.log(
      `Seeded demo account ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})\n` +
        `  course:  ${course.code} — ${course.name}\n` +
        `  exam:    ${course.exams[0]?.date.toISOString().slice(0, 10)}\n` +
        `  topics:  ${course.topics.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
