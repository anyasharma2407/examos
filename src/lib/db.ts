import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env";

/**
 * Single Prisma client per process, created on first use.
 *
 * Prisma 7 requires an explicit driver adapter. We connect over the pooled
 * `DATABASE_URL`; migrations use `DIRECT_URL` via prisma.config.ts.
 *
 * The client is created lazily behind a proxy so that merely importing this
 * module never reads the environment or opens a socket — `next build` renders
 * static pages that transitively import it, and unit tests import modules that
 * touch it without ever issuing a query.
 *
 * In development Next.js re-evaluates modules on every hot reload, so the
 * instance is stashed on `globalThis` to avoid exhausting the connection pool.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property) as unknown;
    // Bind to the real client: forwarding `this` as the proxy would break
    // Prisma's internal private-field access.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
