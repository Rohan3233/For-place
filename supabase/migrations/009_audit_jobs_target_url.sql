-- 009_audit_jobs_target_url.sql
alter table audit_jobs add column if not exists target_url text;