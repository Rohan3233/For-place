create unique index if not exists subscriptions_active_user_plan_unique_idx
  on subscriptions (user_id, plan)
  where status = 'active';