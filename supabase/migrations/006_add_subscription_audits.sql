-- 006_add_subscription_audits.sql
alter table audits add column subscription_id uuid references subscriptions (id) on delete set null;
create index audits_subscription_id_idx on audits (subscription_id);