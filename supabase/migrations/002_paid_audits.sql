-- 002_paid_audits.sql
--
-- Backs the Pay-As-You-Go flow (business doc pricing table: $3 for a
-- single audit, up to 50 pages). One row = one purchase attempt, created
-- in "pending" state by app/actions/checkout.ts right after the Stripe
-- Checkout Session is created, then flipped to "paid" by the webhook
-- (app/api/webhooks/stripe/route.ts) once Stripe confirms payment.
--
-- Unlike audit_cache (001), this table IS read directly by a logged-in
-- user's own browser session (the /audit/pending status page), so it
-- needs real RLS policies scoped by auth.uid() = user_id, not a
-- backend-only lockout.

create table paid_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_url text not null,
  stripe_session_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  max_pages integer not null default 50,
  amount_cents integer not null default 300,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index paid_audits_user_id_idx on paid_audits (user_id);
create index paid_audits_stripe_session_id_idx on paid_audits (stripe_session_id);

alter table paid_audits enable row level security;

-- A user can see only their own purchases (used by /audit/pending to
-- poll — well, manually refresh — payment status).
create policy "Users can view their own paid_audits"
  on paid_audits for select
  using (auth.uid() = user_id);

-- A user can create a purchase row for themselves. This runs inside
-- app/actions/checkout.ts using the normal session-authenticated client
-- (lib/supabase/server.ts), not the service-role client, so this INSERT
-- policy is what actually authorizes it.
create policy "Users can insert their own paid_audits"
  on paid_audits for insert
  with check (auth.uid() = user_id);

-- Deliberately NO update or delete policy for authenticated/anon users.
-- Only the Stripe webhook flips status from "pending" to "paid", and it
-- does so using the service-role client (lib/supabase/admin.ts), which
-- bypasses RLS entirely — so no update policy is needed, or wanted, for
-- regular users. A user being able to mark their own purchase "paid"
-- client-side would defeat the entire point of this table.
