import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (migrate / studio / generate).
 *
 * Migrations must run over a direct connection: pooled connection strings
 * (Supabase's pgbouncer port, for example) cannot run DDL reliably. At runtime
 * the app connects through the pooled `DATABASE_URL` instead — see src/lib/db.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
