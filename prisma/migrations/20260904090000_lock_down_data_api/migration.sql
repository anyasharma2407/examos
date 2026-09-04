-- Close the Supabase Data API over our tables.
--
-- Prisma creates tables without row-level security, and Supabase automatically
-- exposes every table in `public` through PostgREST using the `anon` and
-- `authenticated` roles. The anon key is public by design — it ships in the
-- browser bundle — so without this, anyone could read every user's courses,
-- material, questions, mistakes and practice history straight from
-- `https://<project>.supabase.co/rest/v1/Course`, bypassing the application
-- entirely.
--
-- ExamOS never uses the Data API: all database access goes through Prisma over
-- a direct connection as the table owner, which is unaffected by row-level
-- security and by these grants. Authorisation lives in the application, in
-- `requireUser()` plus a userId filter on every query.
--
-- Two independent locks, so a mistake in either one is not enough on its own:
--
--   1. Row-level security enabled with NO policies. Under PostgREST's roles
--      that denies every row; the owner bypasses it.
--   2. Privileges revoked from those roles outright, including for any table
--      added later.

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Anything created from here on is closed by default too, so a future
-- migration cannot silently reopen the hole.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
