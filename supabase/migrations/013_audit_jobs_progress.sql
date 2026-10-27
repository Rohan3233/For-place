-- 013_audit_jobs_progress.sql
-- Live crawl progress for the progress page. The crawler's onProgress
-- callback writes the current stage/counters here (throttled, best-effort)
-- so the client's getJobProgress poll can read real progress even across
-- server-action process boundaries / restarts — the in-memory registry alone
-- is not reliably visible to a different request.
alter table audit_jobs add column if not exists progress jsonb;
