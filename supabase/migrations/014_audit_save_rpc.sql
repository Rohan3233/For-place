-- 014_audit_save_rpc.sql
--
-- The finished audit result (hundreds of pages, tens of thousands of
-- broken-link checks, image findings, PSI measurements) is a multi-MB
-- JSONB document. Writing it in one INSERT/UPDATE can exceed the
-- database's default statement_timeout (~30s), which cancels the
-- statement with SQLSTATE 57014 — losing the whole audit with
-- "could not be saved: canceling statement due to statement timeout".
--
-- These RPCs run the three heavy writes (analysis result, AI
-- explanations, final audits insert) under a raised statement_timeout
-- so a large save can never be killed mid-write. All three are SECURITY
-- INVOKER: the caller's RLS policies on audit_jobs / audits apply
-- exactly as they do for the equivalent direct INSERT/UPDATE, so
-- ownership checks are unchanged.

-- Stage 1 — persist the crawl + score result onto the job row and move
-- the job to "generating_ai". Returns the new status, or NULL if the job
-- id doesn't exist.
create or replace function public.set_audit_job_analysis(
  job_id uuid,
  p_audit_result jsonb
) returns text
language plpgsql
security invoker
set statement_timeout = '600000'
as $$
declare s text;
begin
  update audit_jobs
     set audit_result = p_audit_result,
         status = 'generating_ai'
   where id = job_id
   returning status into s;
  return s;
end;
$$;

-- Stage 2 — persist the AI explanations onto the job row and move the
-- job to "saving". Returns the new status, or NULL if the job id doesn't
-- exist.
create or replace function public.set_audit_job_explanations(
  job_id uuid,
  p_explanations jsonb
) returns text
language plpgsql
security invoker
set statement_timeout = '600000'
as $$
declare s text;
begin
  update audit_jobs
     set explanations = p_explanations,
         status = 'saving'
   where id = job_id
   returning status into s;
  return s;
end;
$$;

-- Stage 3 — save the finished audit row. Returns the new audits.id.
create or replace function public.save_audit(
  p_user_id uuid,
  p_subscription_id uuid,
  p_paid_audit_id uuid,
  p_target_url text,
  p_overall_score integer,
  p_pages_crawled integer,
  p_audit_result jsonb,
  p_explanations jsonb,
  p_white_label_brand_name text
) returns uuid
language plpgsql
security invoker
set statement_timeout = '600000'
as $$
declare new_id uuid;
begin
  insert into audits (
    user_id,
    subscription_id,
    paid_audit_id,
    target_url,
    overall_score,
    pages_crawled,
    audit_result,
    explanations,
    white_label_brand_name
  ) values (
    p_user_id,
    p_subscription_id,
    p_paid_audit_id,
    p_target_url,
    p_overall_score,
    p_pages_crawled,
    p_audit_result,
    p_explanations,
    p_white_label_brand_name
  )
  returning id into new_id;
  return new_id;
end;
$$;
