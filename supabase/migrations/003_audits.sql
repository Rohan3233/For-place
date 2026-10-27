-- 003_audits.sql
--
-- Stores a COMPLETED audit's results, so the dashboard has real history to
-- show instead of one-off reports that vanish after generation. One row =
-- one finished crawl+score+explanation run, produced by triggerAudit()
-- (app/actions/audits.ts) once a paid_audits order reaches status='paid'.

create table audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  paid_audit_id uuid references paid_audits (id) on delete set null,
  target_url text not null,
  overall_score integer not null,
  pages_crawled integer not null,
  audit_result jsonb not null,
  explanations jsonb not null,
  created_at timestamptz not null default now()
);

create index audits_user_id_idx on audits (user_id);
create index audits_paid_audit_id_idx on audits (paid_audit_id);

create unique index audits_paid_audit_id_unique_idx on audits (paid_audit_id) where paid_audit_id is not null;

alter table audits enable row level security;

create policy "Users can view their own audits"
  on audits for select
  using (auth.uid() = user_id);

create policy "Users can insert their own audits"
  on audits for insert
  with check (auth.uid() = user_id);