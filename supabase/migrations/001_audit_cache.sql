-- Run this in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query).
-- This is the ONLY table this project currently needs. It backs
-- SupabaseCacheProvider (lib/crawler/supabaseCache.ts) — the domain-level
-- cache that protects your margins per the business doc (Section VI).

create table if not exists audit_cache (
  domain text primary key,
  result jsonb not null,
  stored_at timestamptz not null
);

-- Speeds up any future "most recently cached" admin/debug queries.
-- Not required for the cache itself to function.
create index if not exists audit_cache_stored_at_idx
  on audit_cache (stored_at desc);

-- ROW LEVEL SECURITY: enabled and locked down by default.
-- This table is written to and read from ONLY by your backend, using the
-- service role key (which bypasses RLS entirely) — never by a user's
-- browser session with the anon key. So: RLS on, no policies granting
-- access to anon/authenticated roles. If a bug ever caused this table to
-- be queried with the anon key instead of the service role key, RLS
-- silently returning nothing is the correct, safe failure mode.
alter table audit_cache enable row level security;

-- No policies are created here on purpose — see the comment above.
-- If you later add an admin dashboard that reads this table from the
-- browser (not just your backend), that's when you'd add a specific
-- policy scoped to an admin role, not before.
