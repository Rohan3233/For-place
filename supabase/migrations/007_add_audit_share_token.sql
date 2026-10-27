-- 007_add_audit_share_token.sql
alter table audits add column share_token uuid not null default gen_random_uuid();
create unique index audits_share_token_idx on audits (share_token);