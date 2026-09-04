/**
 * `server-only` throws when it is resolved outside a React Server Component
 * build, which is exactly what happens under Vitest. Aliasing it to this empty
 * module lets server modules be unit-tested; the real guard still applies to
 * the Next.js build, which is where it matters.
 */
export {};
