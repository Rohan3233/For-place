-- 008_audit_jobs.sql

create table if not exists audit_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  source text not null check (source in ('free', 'payg', 'subscription')),
  subscription_id uuid references subscriptions(id) on delete set null,
  paid_audit_id uuid,

  status text not null default 'analyzing'
    check (status in ('analyzing', 'generating_ai', 'saving', 'done', 'error')),

  audit_result jsonb,
  explanations jsonb,
  error_message text,
  resulting_audit_id uuid references audits(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh on every status transition
create or replace function set_audit_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_audit_jobs_updated_at on audit_jobs;
create trigger trg_audit_jobs_updated_at
  before update on audit_jobs
  for each row
  execute function set_audit_jobs_updated_at();

-- RLS: ownership enforced entirely here, since auditJob.ts uses the normal
-- session client (not admin client) for all three stage actions
alter table audit_jobs enable row level security;

create policy "select own audit_jobs"
  on audit_jobs for select
  using (auth.uid() = user_id);

create policy "insert own audit_jobs"
  on audit_jobs for insert
  with check (auth.uid() = user_id);

create policy "update own audit_jobs"
  on audit_jobs for update
  using (auth.uid() = user_id);