/**
 * Tests never touch a real database, Supabase project or OpenAI account.
 * These values only need to be present and syntactically plausible; anything
 * that would make a network call is mocked in the test that needs it.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/examos_test";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.OPENAI_API_KEY ??= "test-openai-key";
