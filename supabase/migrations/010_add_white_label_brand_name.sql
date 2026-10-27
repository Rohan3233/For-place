-- 010_add_white_label_brand_name.sql
alter table audit_jobs add column if not exists white_label_brand_name text;
alter table audits add column if not exists white_label_brand_name text;