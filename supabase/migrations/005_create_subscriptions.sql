-- 005_create_subscriptions.sql

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paddle_subscription_id text not null unique,
  plan text not null check (plan in ('pro', 'agency')),
  status text not null check (status in ('active', 'past_due', 'canceled', 'paused')),
  max_pages integer not null,
  reports_per_month integer not null,
  reports_used_this_period integer not null default 0,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on subscriptions(user_id);

alter table subscriptions enable row level security;

create policy "Users can view their own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);