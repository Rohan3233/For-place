"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseCacheProvider } from "@/lib/crawler/supabaseCache";
import { runAudit } from "@/lib/crawler/runAudit";
import { explainCrawl } from "@/lib/crawler/explainPage";
import { GeminiProvider } from "@/lib/crawler/geminiProvider";
import type { RunAuditResult, PageExplanationResult, CrawlProgress, CrawlTimings } from "@/lib/crawler/types";

// Temporary diagnostics for the live crawl-progress data path. Traces every
// hop in the server: crawl emit -> writeProgress -> progress column ->
// getJobProgress poll. ON in development by default (this debugging session);
// set PROGRESS_DEBUG=0 or build for production to disable. Logs are
// throttled so they don't flood the terminal.
const PROGRESS_DEBUG =
  process.env.NODE_ENV !== "production" && process.env.PROGRESS_DEBUG !== "0";

export interface AuditJobStatus {
  id: string;
  status: "analyzing" | "generating_ai" | "saving" | "done" | "error";
  resultingAuditId: string | null;
  errorMessage: string | null;
  /** ISO timestamp of when the audit began (job row created_at) — the
   *  loading page's elapsed timer starts here, so it agrees with the final
   *  report's total runtime. */
  startedAt?: string | null;
}

type StageOutcome = AuditJobStatus | { error: string };

interface AuditJobRow {
  id: string;
  user_id: string;
  subscription_id: string | null;
  paid_audit_id: string | null;
  target_url: string | null;
  status: AuditJobStatus["status"];
  audit_result: RunAuditResult | null;
  explanations: PageExplanationResult[] | null;
  resulting_audit_id: string | null;
  error_message: string | null;
  white_label_brand_name: string | null;
  /** Live crawl progress (jsonb column from migration 013) — written best-effort while the job is analyzing so the progress page's polling requests see real data across server-action process boundaries. */
  progress?: CrawlProgress | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Same-process fast path for live progress. The authoritative source is the
 * `progress` jsonb column on audit_jobs (see runAnalysisStage): the polling
 * requests on the progress page are SEPARATE server-action invocations that
 * may run on a different process/module instance than the long-running
 * analysis action, so an in-memory registry alone is NOT reliably visible
 * to them. This registry is kept as a same-process fast path and as the
 * fallback when the progress column is unavailable (migration 013 not
 * applied). Entries are deleted when a job leaves the analyzing stage, so
 * this can't grow unbounded.
 *
 * The registry is anchored to globalThis rather than module scope: Next.js
 * may compile server actions into separate module instances per request,
 * and a module-scoped Map is then a DIFFERENT Map for the long-running
 * analysis action and for the progress page's polling action — which is
 * exactly how the card used to sit at "Preparing crawl" forever. In a
 * single Node process (npm run dev, or next start on one instance) both
 * actions share the same globalThis, so the registry is visible to the
 * poll immediately; multi-instance deployments rely on the DB column
 * instead.
 */
const g = globalThis as typeof globalThis & { __fixfirstCrawlProgress?: Map<string, CrawlProgress> };
if (!g.__fixfirstCrawlProgress) g.__fixfirstCrawlProgress = new Map();
const progressRegistry = g.__fixfirstCrawlProgress;

function toStatus(job: AuditJobRow): AuditJobStatus {
  return {
    id: job.id,
    status: job.status,
    resultingAuditId: job.resulting_audit_id,
    errorMessage: job.error_message,
    startedAt: job.created_at ?? null,
  };
}

/**
 * Fetches the job row via the normal session client — RLS (auth.uid() =
 * user_id on audit_jobs) is what enforces ownership here, not an explicit
 * check in this code. A jobId belonging to another user simply won't be
 * returned by this select, same as any other row that doesn't exist.
 */
async function getOwnedJob(
  jobId: string
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; job: AuditJobRow | null }> {
  const supabase = await createClient();
  const { data: job } = await supabase.from("audit_jobs").select("*").eq("id", jobId).maybeSingle();
  return { supabase, job: (job as AuditJobRow) ?? null };
}

async function markError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  message: string
): Promise<AuditJobStatus> {
  await supabase.from("audit_jobs").update({ status: "error", error_message: message }).eq("id", jobId);
  return { id: jobId, status: "error", resultingAuditId: null, errorMessage: message };
}

/**
 * Builds a human-readable description of a Supabase/PostgREST error.
 * PostgREST errors carry { message, details, hint, code } — but when a
 * request fails at the gateway/network layer (huge audit_result payloads,
 * timeouts, connection resets), the response often isn't a parseable
 * PostgrestError at all, which is exactly when message/details come back
 * undefined. Never return bare "unknown error" — always log the raw object
 * so the real cause survives in server logs.
 */
function describeError(err: unknown): string {
  if (!err) return "no error details returned";
  const e = err as Error & Record<string, unknown>;
  // PostgrestError extends Error, so message may be present OR undefined —
  // the latter is exactly the failure mode that produced the original
  // "unknown error" (a gateway error with no parseable body). Never
  // early-return on a missing message; keep falling through to details,
  // hint, and finally the raw object.
  const parts = [e.message, e.details, e.hint].filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  if (parts.length > 0) {
    const code = typeof e.code === "string" && e.code.length > 0 ? ` (${e.code})` : "";
    return parts.join(" — ") + code;
  }
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return String(err);
  }
}

/**
 * Writes a job status/payload update with a couple of retries. The write is
 * idempotent (same row, same patch), so re-sending after a transient
 * gateway failure is safe — and a multi-MB audit_result write is exactly the
 * kind of request that can flake once and succeed on the next attempt.
 * Returns the last { data, error } so callers decide how to fail.
 */
async function writeJobStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  patch: Record<string, unknown>,
  retries = 2
): Promise<{ updated: AuditJobRow | null; error: unknown }> {
  let last: { updated: AuditJobRow | null; error: unknown } = { updated: null, error: null };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data, error } = await supabase
      .from("audit_jobs")
      .update(patch)
      .eq("id", jobId)
      .select("id, status, resulting_audit_id, error_message")
      .single();
    last = { updated: (data as AuditJobRow | null) ?? null, error };
    if (!error && last.updated) return last;
    if (attempt < retries) {
      console.error(
        `[auditJob] job status write attempt ${attempt + 1}/${retries + 1} failed for ${jobId}: ${describeError(error)}`
      );
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
  return last;
}

/**
 * Runs a supabase.rpc() call with a couple of retries for transient
 * gateway failures, mirroring writeJobStatus's retry semantics. Used for
 * the multi-MB audit payload writes (migration 014 RPCs), which are the
 * kind of request that can flake once and succeed on the next attempt.
 * Returns the last { data, error } so callers decide how to fail.
 */
async function runRpcWithRetry<T>(
  fn: () => PromiseLike<{ data: T | null; error: unknown }>,
  label: string,
  jobId: string,
  retries = 2
): Promise<{ data: T | null; error: unknown }> {
  let last: { data: T | null; error: unknown } = { data: null, error: null };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await fn();
    if (!last.error) return last;
    if (attempt < retries) {
      console.error(
        `[auditJob] ${label} attempt ${attempt + 1}/${retries + 1} failed for ${jobId}: ${describeError(last.error)}`
      );
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
  return last;
}

export async function getJobStatus(jobId: string): Promise<StageOutcome> {
  const { job } = await getOwnedJob(jobId);
  if (!job) return { error: "Audit job not found." };
  return toStatus(job);
}

/**
 * Stage 1 — Analyzing: crawl + PageSpeed + brokenLinks + score, via the
 * existing runAudit(). Idempotency guard: if the job isn't currently at
 * "analyzing" (e.g. a duplicate call from a fast client re-render or a
 * resumed session), this is a no-op that returns the job's current state
 * rather than re-running the crawl.
 */
/**
 * Live progress for an in-flight audit job — a lightweight read the
 * progress page polls while runAnalysisStage holds the long-running
 * analysis action. Returns the job's current status plus the real crawler
 * progress persisted by runAnalysisStage (null before the crawler emits
 * its first progress event). Ownership is enforced the same way as
 * getJobStatus: the job is fetched through the session client, so another
 * user's job simply isn't returned.
 */
let lastProgressReadLog = 0;

export async function getJobProgress(
  jobId: string
): Promise<{ status: AuditJobStatus; progress: CrawlProgress | null } | { error: string }> {
  const supabase = await createClient();
  // Prefer the persisted progress column — runAnalysisStage writes the real
  // crawler progress there, so this read works even when the polling request
  // runs on a different server process/module instance than the long-running
  // analysis action (the in-memory registry alone is NOT reliably visible
  // across that boundary — the bug that left the card stuck at "Preparing
  // crawl"). If the column isn't available yet (migration 013 not applied),
  // fall back to the same-process registry as before.
  const { data, error } = await supabase
    .from("audit_jobs")
    .select("id, status, resulting_audit_id, error_message, progress")
    .eq("id", jobId)
    .maybeSingle();
  const registryProgress = progressRegistry.get(jobId) ?? null;
  if (error || !data) {
    // The progress column (migration 013) may be missing on this database
    // — fall back to the same-process registry, which is fresh while the
    // analysis action runs in this Node process.
    const { job } = await getOwnedJob(jobId);
    if (!job) return { error: "Audit job not found." };
    if (PROGRESS_DEBUG) {
      const now = Date.now();
      if (now - lastProgressReadLog >= 5000) {
        lastProgressReadLog = now;
        console.log(
          `[progress] read job=${jobId}: column select failed (${describeError(error)}), returning registry=${registryProgress ? `${registryProgress.stage} crawled=${registryProgress.crawled}` : "null"}`
        );
      }
    }
    return { status: toStatus(job), progress: registryProgress };
  }
  const row = data as AuditJobRow;
  // PRIMARY: the persisted progress column (works across server-action
  // process boundaries and survives module-instance splits — the DB write
  // is throttled to ~1/s so this is at most a second stale). FALLBACK: the
  // same-process registry (fresh even when the column write was throttled
  // or failed). Either channel alone is enough in every deployment shape.
  const dbProgress = (row.progress as CrawlProgress | null) ?? null;
  const progress = dbProgress ?? registryProgress;
  if (PROGRESS_DEBUG) {
    const now = Date.now();
    if (now - lastProgressReadLog >= 5000) {
      lastProgressReadLog = now;
      console.log(
        `[progress] read job=${jobId}: db=${dbProgress ? `${dbProgress.stage} crawled=${dbProgress.crawled}` : "null"} registry=${registryProgress ? `${registryProgress.stage} crawled=${registryProgress.crawled}` : "null"} -> ${progress ? progress.stage : "null"}`
      );
    }
  }
  return {
    status: {
      id: row.id,
      status: row.status,
      resultingAuditId: row.resulting_audit_id,
      errorMessage: row.error_message,
      startedAt: row.created_at ?? null,
    },
    progress,
  };
}

export interface FinalAuditStats {
  /** Pages crawled (success + error) + URLs skipped by robots.txt. */
  discoveredUrls: number;
  /** Pages that finished crawling (success or error). */
  pagesCrawled: number;
  /** Pages that failed to crawl. */
  pagesFailed: number;
  /** Crawl + PageSpeed + broken-link retries, matching what the live crawl card shows. */
  retries: number;
  /** Successful pages per second during the crawl phase, if measurable. */
  crawlRatePerSec: number | null;
  /** URLs actually sent to PageSpeed Insights (the performance sample). */
  pagesPerformanceTested: number;
  /** Distinct page types/templates represented in the performance sample. */
  templatesRepresented: number;
  /** Full audit wall time. */
  totalMs: number;
}

/**
 * Compact final statistics for a finished audit — read exactly once, after
 * the pipeline reaches "done", so the progress page can swap the live
 * counters for the real final numbers (requirement: "replace the live
 * progress state with the final audit statistics"). Reads only
 * audit_result.timings via a PostgREST JSON-path select (->), never the
 * multi-MB audit payload. Returns an error when the job isn't done yet or
 * timings aren't stored; the progress UI then just redirects to the
 * report as before.
 */
export async function getFinalAuditStats(
  jobId: string
): Promise<{ stats: FinalAuditStats } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_jobs")
    .select("status, created_at, updated_at, audit_result->timings")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) return { error: "Audit job not found." };
  const row = data as {
    status?: string;
    timings?: CrawlTimings | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  if (row.status !== "done") return { error: "Audit is not finished yet." };
  const timings = row.timings;
  if (!timings) return { error: "No timing data is available for this audit." };

  // Full audit wall time as the user experienced it: job created → job marked
  // done (updated_at is stamped by the DB trigger on every status change).
  // timings.totalMs only covers runAudit (crawl + PageSpeed + broken links);
  // the AI recommendations and saving stages run AFTER runAudit returns, so
  // the displayed total previously understated the real audit duration. Falls
  // back to timings.totalMs if the row timestamps are missing.
  let totalMs = timings.totalMs;
  if (row.created_at && row.updated_at) {
    const start = new Date(row.created_at).getTime();
    const end = new Date(row.updated_at).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      totalMs = end - start;
    }
  }

  return {
    stats: {
      discoveredUrls: timings.pagesCrawled + (timings.pagesSkippedRobots ?? 0),
      pagesCrawled: timings.pagesCrawled,
      pagesFailed: timings.pagesFailed ?? 0,
      retries:
        (timings.cwvRetries ?? 0) +
        (timings.brokenLinkRetries ?? 0) +
        (timings.crawlRetries ?? 0),
      crawlRatePerSec:
        timings.crawlMs > 0
          ? Math.round((timings.pagesCrawled / (timings.crawlMs / 1000)) * 10) / 10
          : null,
      pagesPerformanceTested: timings.cwvRequests ?? 0,
      templatesRepresented: timings.cwvTemplatesRepresented ?? 0,
      totalMs,
    },
  };
}

export async function runAnalysisStage(jobId: string): Promise<StageOutcome> {
  const { supabase, job } = await getOwnedJob(jobId);
  if (!job) return { error: "Audit job not found." };
  if (job.status !== "analyzing") return toStatus(job);

  if (!job.target_url) {
    return markError(supabase, jobId, "Job is missing a target URL.");
  }

// Re-derive max_pages from the subscription rather than trusting a
  // stale client-supplied value — same source triggerSubscriptionAudit
  // already checked, just re-read here since this is a fresh request.
  // runAudit() requires a real number, so a missing subscription or
  // missing max_pages is treated as a hard failure for this job rather
  // than silently falling back to an arbitrary default.
  let maxPages: number;
  if (job.subscription_id) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("max_pages")
      .eq("id", job.subscription_id)
      .maybeSingle();
    if (typeof subscription?.max_pages !== "number") {
      return markError(supabase, jobId, "Could not resolve max_pages from the subscription.");
    }
    maxPages = subscription.max_pages;
  } else if (job.paid_audit_id) {
    const { data: order } = await supabase
      .from("paid_audits")
      .select("max_pages")
      .eq("id", job.paid_audit_id)
      .maybeSingle();
    if (typeof order?.max_pages !== "number") {
      return markError(supabase, jobId, "Could not resolve max_pages from the order.");
    }
    maxPages = order.max_pages;
  } else {
    return markError(supabase, jobId, "Job has neither a subscription nor a paid order to derive max_pages from.");
  }

  // Live progress persistence: the in-memory registry is only visible to
  // requests in the same server process/module instance — the progress
  // page's polling requests are separate invocations and were NOT seeing
  // it (the card sat at "Preparing crawl" while the audit ran). Persist the
  // real crawler progress to the job row (best-effort, throttled, never
  // awaited) so getJobProgress reads live data regardless of process
  // boundaries. Probe once whether the progress column exists (migration
  // 013); if not, degrade to the registry-only behavior instead of spamming
  // failed writes. The final numbers come from timings at the end, so a
  // dropped progress write never affects the audit result.
  let progressColumnAvailable = true;
  try {
    const probe = await supabase.from("audit_jobs").select("progress").eq("id", jobId).limit(1);
    if (probe.error) progressColumnAvailable = false;
  } catch {
    progressColumnAvailable = false;
  }
  let lastProgressWrite = 0;
  let lastProgressLog = 0;
  const PROGRESS_DB_WRITE_INTERVAL_MS = 1000;
  const writeProgress = (p: CrawlProgress): void => {
    progressRegistry.set(jobId, p);
    if (PROGRESS_DEBUG) {
      const now = Date.now();
      if (now - lastProgressLog >= 2000) {
        lastProgressLog = now;
        console.log(
          `[progress] write job=${jobId}: stage=${p.stage} discovered=${p.discovered ?? "-"} crawled=${p.crawled ?? p.processed ?? "-"} queued=${p.queued ?? "-"} currentUrl=${p.currentUrl ?? "-"}`
        );
      }
    }
    if (!progressColumnAvailable) return;
    const now = Date.now();
    if (now - lastProgressWrite < PROGRESS_DB_WRITE_INTERVAL_MS) return;
    lastProgressWrite = now;
    // Fire-and-forget: a progress write must never slow the crawl or fail
    // the audit. Uses an async wrapper (not .catch) because Supabase's
    // query builder types are PromiseLike-only, and awaits are safe here
    // since the enclosing action holds the process alive for the whole
    // audit.
    void (async () => {
      try {
        await supabase.from("audit_jobs").update({ progress: p }).eq("id", jobId);
      } catch (err: unknown) {
        console.error(`[auditJob] progress write failed for ${jobId}: ${describeError(err)}`);
      }
    })();
  };

  try {
    // Stamp the true audit start (job creation = when the audit began) so
    // the report's total runtime is a real wall-clock span
    // (auditCompletedAt - auditStartedAt) rather than a sum of parallel
    // stage durations — which is what inflated runtimes like
    // "25m 35s" for an ~18 minute audit.
    const auditStartedAt = job.created_at ?? new Date().toISOString();
    // Domain-level cache (see lib/crawler/supabaseCache.ts): paid/subscription
    // audits of the same domain within the 7-day TTL share one crawl. Uses the
    // service-role client because the cache table has RLS enabled with no
    // policies (backend-only by design), and runAudit's own try/catch degrades
    // gracefully to a fresh audit if the cache is unavailable. The cache hit
    // is recorded on the result as fromCache: true, which the report surfaces.
    const audit: RunAuditResult = await runAudit(job.target_url, {
      maxPages,
      pageSpeedApiKey: process.env.PSI_API_KEY,
      onProgress: writeProgress,
      cacheProvider: new SupabaseCacheProvider(createAdminClient()),
    });
    audit.auditStartedAt = auditStartedAt;

    progressRegistry.delete(jobId);
    // The full audit result is a multi-MB JSONB document; a plain UPDATE can
    // exceed the database's statement_timeout and get canceled with 57014
    // ("canceling statement due to statement timeout"). set_audit_job_analysis
    // (migration 014) performs the same update under a raised
    // statement_timeout, so a large result can never be lost mid-save.
    const { data: newStatus, error: updateError } = await runRpcWithRetry(
      () =>
        supabase.rpc("set_audit_job_analysis", {
          job_id: jobId,
          p_audit_result: audit,
        }),
      "analysis result write",
      jobId
    );

    if (updateError || newStatus !== "generating_ai") {
      const reason = describeError(updateError);
      console.error(`[auditJob] analysis finished but status save failed for ${jobId}: ${reason}`, updateError);
      return markError(
        supabase,
        jobId,
        `Analysis finished but the job status could not be saved: ${reason}`
      );
    }
    // Re-read the job row so the returned status matches what writeJobStatus
    // used to return (id, status, resulting_audit_id, error_message).
    const { job: refreshed } = await getOwnedJob(jobId);
    if (!refreshed) return { error: "Audit job not found." };
    return toStatus(refreshed);
  } catch (err: unknown) {
    progressRegistry.delete(jobId);
    const message = err instanceof Error ? err.message : "Unknown error during analysis.";
    return markError(supabase, jobId, message);
  }
}

/**
 * Stage 2 — Generating AI recommendations: explainCrawl() with the same
 * thinContentAi gating subscription audits use today.
 */
export async function runAiStage(jobId: string): Promise<StageOutcome> {
  const { supabase, job } = await getOwnedJob(jobId);
  if (!job) return { error: "Audit job not found." };
  if (job.status !== "generating_ai") return toStatus(job);

  const auditResult = job.audit_result;
  if (!auditResult) {
    return markError(supabase, jobId, "Job reached the AI stage with no stored analysis result.");
  }

  try {
    const llm = process.env.GEMINI_API_KEY ? new GeminiProvider(process.env.GEMINI_API_KEY) : null;
const explanations: PageExplanationResult[] = await explainCrawl(auditResult.crawl, llm);
    // Same multi-MB payload concern as the analysis write: the explanations
    // array (one AI write-up per page) is routed through
    // set_audit_job_explanations (migration 014) so the update runs under a
    // raised statement_timeout instead of being canceled at the default ~30s.
    const { data: newStatus, error: updateError } = await runRpcWithRetry(
      () =>
        supabase.rpc("set_audit_job_explanations", {
          job_id: jobId,
          p_explanations: explanations,
        }),
      "explanations write",
      jobId
    );

    if (updateError || newStatus !== "saving") {
      const reason = describeError(updateError);
      console.error(`[auditJob] AI stage finished but status save failed for ${jobId}: ${reason}`, updateError);
      return markError(
        supabase,
        jobId,
        `AI stage finished but the job status could not be saved: ${reason}`
      );
    }
    // Re-read the job row so the returned status matches what writeJobStatus
    // used to return (id, status, resulting_audit_id, error_message).
    const { job: refreshed } = await getOwnedJob(jobId);
    if (!refreshed) return { error: "Audit job not found." };
    return toStatus(refreshed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error generating AI suggestions.";
    return markError(supabase, jobId, message);
  }
}

/**
 * Stage 3 — Saving: the existing audits insert + subscription quota
 * increment logic, moved as-is from triggerSubscriptionAudit.
 */
export async function finalizeStage(jobId: string): Promise<StageOutcome> {
  const { supabase, job } = await getOwnedJob(jobId);
  if (!job) return { error: "Audit job not found." };
  if (job.status === "done") return toStatus(job);
  if (job.status !== "saving") return toStatus(job);

  const auditResult = job.audit_result;
  if (!auditResult || !job.target_url) {
    return markError(supabase, jobId, "Job reached the saving stage with missing analysis data.");
  }  // Same multi-MB payload concern as the analysis write: the audits insert is
  // routed through save_audit (migration 014) so the statement runs under a
  // raised statement_timeout instead of being canceled at the default ~30s
  // with 57014 (which is exactly what lost some early production audits).
  const { data: insertedId, error: insertError } = await runRpcWithRetry(
    () =>
      supabase.rpc("save_audit", {
        p_user_id: job.user_id,
        p_subscription_id: job.subscription_id,
        p_paid_audit_id: job.paid_audit_id,
        p_target_url: job.target_url,
        p_overall_score: auditResult.score.overallScore,
        p_pages_crawled: auditResult.crawl.pages.length,
        p_audit_result: auditResult,
        p_explanations: job.explanations,
        p_white_label_brand_name: job.white_label_brand_name,
      }),
    "audit insert",
    jobId
  );

  if (insertError || !insertedId) {
    const reason = describeError(insertError);
    console.error(`[auditJob] audit insert failed for ${jobId}: ${reason}`, insertError);
    return markError(supabase, jobId, `Audit completed but could not be saved: ${reason}`);
  }
  const inserted = { id: insertedId };

  // Only increment usage AFTER a successful insert, same reasoning as the
  // original triggerSubscriptionAudit — a failed audit never burns a
  // report from the user's monthly allowance. Requires the admin client
  // since there's deliberately no UPDATE policy for regular users on
  // subscriptions.
  if (job.subscription_id) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("reports_used_this_period")
      .eq("id", job.subscription_id)
      .maybeSingle();

    if (subscription) {
      const admin = createAdminClient();
      const { error: incrementError } = await admin
        .from("subscriptions")
        .update({ reports_used_this_period: subscription.reports_used_this_period + 1 })
        .eq("id", job.subscription_id);

      if (incrementError) {
        // Don't fail the request over this — the audit itself is already
        // saved. Log it so it can be caught/reconciled manually.
        console.error(
          `Failed to increment reports_used_this_period for subscription ${job.subscription_id}: ${incrementError.message}`
        );
      }
    }
  }

  const { updated, error: updateError } = await writeJobStatus(supabase, jobId, {
    status: "done",
    resulting_audit_id: inserted.id,
  });

  if (updateError || !updated) {
    // The audit row is already saved at this point — only the job's own
    // final status write failed. Report it, but don't call this a lost
    // audit. Mark the job errored so a page refresh doesn't re-run the
    // saving stage and create a duplicate audit row.
    const reason = describeError(updateError);
    console.error(`[auditJob] audit saved but final status write failed for ${jobId}: ${reason}`, updateError);
    return markError(
      supabase,
      jobId,
      `Audit was saved but the job's final status could not be confirmed: ${reason}`
    );
  }

  return toStatus(updated);
}