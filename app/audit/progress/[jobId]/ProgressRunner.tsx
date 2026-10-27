"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  runAnalysisStage,
  runAiStage,
  finalizeStage,
  getJobProgress,
  getFinalAuditStats,
} from "@/app/actions/auditJob";
import type { AuditJobStatus, FinalAuditStats } from "@/app/actions/auditJob";
import type { CrawlProgress } from "@/lib/crawler/types";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";

const STAGES: { key: AuditJobStatus["status"]; label: string }[] = [
  { key: "analyzing", label: "Analyzing site (crawl, links, performance)" },
  { key: "generating_ai", label: "Generating AI recommendations" },
  { key: "saving", label: "Saving report" },
];

/**
 * A rejected fetch (TypeError: "Failed to fetch") means the action request
 * itself never completed — the dev server recompiled or restarted mid-
 * request, or a long-running action's connection dropped. That is NOT an
 * audit failure and must not kill the pipeline. Every stage action is
 * idempotent (it re-checks the job's status server-side before doing
 * anything), so re-dispatching the same stage is always safe: if the work
 * actually finished and only the response was lost, the retry returns the
 * advanced status; if it never ran, the retry runs it. Only fetch
 * rejections are retried — a structured { error } response is a real
 * failure and surfaces immediately.
 */
const MAX_STAGE_FETCH_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// How often the live crawl progress is re-read from the server. The user
// asked for a continuously-updating section (~500-1000ms); 800ms keeps the
// card feeling live without hammering the server with polling requests.
const PROGRESS_POLL_MS = 800;

// The crawl, Core Web Vitals stream and image stream run CONCURRENTLY, so
// their progress payloads interleave. Two rules keep the card coherent
// instead of flickering between stage tile-sets every ~500ms:
//  1. CRAWL_FRESH_MS — while crawl payloads are arriving (the crawl is
//     running), the card stays on the crawl view: it is the primary work
//     the user is watching. The other stages' counters are still being
//     collected and appear as soon as the crawl stops emitting.
//  2. STAGE_HOLD_MS — after the crawl, switching between concurrent
//     stages (broken links vs the CWV drain) is held for at least this
//     long so the numbers are readable.
const CRAWL_FRESH_MS = 3000;
const STAGE_HOLD_MS = 2000;

// The crawler emits its initial progress event the moment it starts (real
// counters, not estimates), so a payload should arrive within the first
// second or two. But if it genuinely doesn't (stale server instance, a
// missing progress column on a multi-instance deployment, a slow first
// poll), the card must NOT sit on the dead "Preparing crawl" state — after
// this grace period it flips to the honest "Crawling website" state with
// the real elapsed timer, and tiles show "—" until real data arrives.
const CRAWLING_FALLBACK_MS = 2500;

// If the analyzing stage has run this long with zero progress payloads,
// surface a subtle note so the user knows the audit itself is fine but
// live data isn't flowing — never a fake counter, just a warning.
const CRAWL_STALL_WARN_MS = 30000;

// How long the "Audit complete — final statistics" screen stays up before
// auto-redirecting to the report (a button jumps there sooner).
const FINAL_STATS_HOLD_MS = 4000;

function isTransientFetchFailure(err: unknown): boolean {
  return (
    err instanceof TypeError &&
    typeof err.message === "string" &&
    /failed to fetch/i.test(err.message)
  );
}

async function dispatchStage(
  status: AuditJobStatus["status"],
  jobId: string,
  onRetry: () => void
): Promise<AuditJobStatus | { error: string }> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (status === "analyzing") return await runAnalysisStage(jobId);
      if (status === "generating_ai") return await runAiStage(jobId);
      if (status === "saving") return await finalizeStage(jobId);
      return { error: "Unknown pipeline stage." };
    } catch (err) {
      if (!isTransientFetchFailure(err) || attempt >= MAX_STAGE_FETCH_RETRIES) {
        throw err;
      }
      onRetry();
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1)));
    }
  }
}

const STAGE_LABELS: Record<CrawlProgress["stage"], string> = {
  crawl: "Crawling website",
  broken_links: "Checking broken links",
  core_web_vitals: "Analyzing Core Web Vitals",
  image_analysis: "Checking image sizes",
  finalizing: "Generating report",
};

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sa-cp-stat">
      <span className="sa-cp-stat-label">{label}</span>
      <strong className="sa-cp-stat-value">{value}</strong>
    </div>
  );
}

/**
 * Live counters for the current stage, mapped 1:1 from the crawler's real
 * progress data — never hardcoded or estimated. "—" marks anything the
 * stage hasn't reported yet: the crawl stage reports discovered / crawled /
 * queued / failed / retries / rate, while the broken-link, Core Web Vitals
 * and image stages report processed / total / retries / rate.
 */
function metricTiles(p: CrawlProgress): { label: string; value: string | number }[] {
  const elapsed = p.elapsedMs != null ? formatElapsed(p.elapsedMs) : "—";
  const tiles: { label: string; value: string | number }[] = [];
  if (p.stage === "crawl") {
    tiles.push({ label: "URLs Discovered", value: p.discovered != null ? formatCount(p.discovered) : "—" });
    tiles.push({ label: "URLs Scanned", value: p.crawled != null ? formatCount(p.crawled) : "—" });
    tiles.push({ label: "URLs Remaining", value: p.queued != null ? formatCount(p.queued) : "—" });
    tiles.push({ label: "Failed URLs", value: p.failed != null ? formatCount(p.failed) : "—" });
    tiles.push({ label: "Images analyzed", value: p.imagesAnalyzed != null ? formatCount(p.imagesAnalyzed) : "—" });
    tiles.push({ label: "Internal links", value: p.internalLinksAnalyzed != null ? formatCount(p.internalLinksAnalyzed) : "—" });
    tiles.push({ label: "Retries", value: p.retries != null ? formatCount(p.retries) : "—" });
    tiles.push({ label: "Crawl Rate", value: p.rate != null ? `${p.rate} URLs/sec` : "—" });
    tiles.push({ label: "Elapsed Time", value: elapsed });
  } else if (p.stage === "broken_links") {
    tiles.push({ label: "Links Checked", value: p.processed != null ? formatCount(p.processed) : "—" });
    if (p.total != null && p.processed != null) {
      tiles.push({ label: "Remaining", value: formatCount(Math.max(0, p.total - p.processed)) });
    }
    tiles.push({ label: "Retries", value: p.retries != null ? formatCount(p.retries) : "—" });
    tiles.push({ label: "Check Rate", value: p.rate != null ? `${p.rate} links/sec` : "—" });
    tiles.push({ label: "Elapsed Time", value: elapsed });
  } else if (p.stage === "core_web_vitals") {
    tiles.push({ label: "Pages Measured", value: p.processed != null ? formatCount(p.processed) : "—" });
    if (p.total != null && p.processed != null) {
      tiles.push({ label: "Remaining", value: formatCount(Math.max(0, p.total - p.processed)) });
    }
    tiles.push({ label: "Retries", value: p.retries != null ? formatCount(p.retries) : "—" });
    tiles.push({ label: "Measure Rate", value: p.rate != null ? `${p.rate} pages/sec` : "—" });
    tiles.push({ label: "Elapsed Time", value: elapsed });
  } else if (p.stage === "image_analysis") {
    tiles.push({ label: "Images Checked", value: p.processed != null ? formatCount(p.processed) : "—" });
    tiles.push({ label: "Check Rate", value: p.rate != null ? `${p.rate} images/sec` : "—" });
    tiles.push({ label: "Elapsed Time", value: elapsed });
  } else {
    tiles.push({ label: "Elapsed Time", value: elapsed });
  }
  return tiles;
}

/**
 * Visual progress bar, rendered ONLY when the crawler genuinely knows the
 * total up front (e.g. broken links after the crawl resolves, or the
 * streamed Core Web Vitals set once the crawl finishes). The crawl stage
 * itself never knows its final URL count, so it shows live counters
 * without a percentage — never a fabricated total.
 */
function ProgressBar({ processed, total }: { processed: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.min(100, Math.round((processed / total) * 100));
  return (
    <div className="sa-cp-bar-wrap">
      <div className="sa-cp-bar">
        <div className="sa-cp-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="sa-cp-bar-label">
        {formatCount(Math.min(processed, total))} of {formatCount(total)} · {pct}%
      </span>
    </div>
  );
}

function stageIndex(status: AuditJobStatus["status"]): number {
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx === -1 ? STAGES.length : idx; // "done" or "error" -> past all stages
}

export default function ProgressRunner({ initialStatus }: { initialStatus: AuditJobStatus }) {
  const [job, setJob] = useState<AuditJobStatus>(initialStatus);
  const [topError, setTopError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Live payloads are kept PER STAGE (the crawl, CWV stream and image
  // stream run concurrently), plus one "displayed" payload — the view the
  // card shows, which may be a different stage than the newest payload so
  // concurrent stages don't flip the tile-set every poll. The displayed
  // payload always pairs its own stage's labels with its own numbers.
  const [displayedProgress, setDisplayedProgress] = useState<CrawlProgress | null>(null);
  const progressByStageRef = useRef<Partial<Record<CrawlProgress["stage"], CrawlProgress>>>({});
  const stageArrivedAtRef = useRef<Partial<Record<CrawlProgress["stage"], number>>>({});
  const displayedStageRef = useRef<CrawlProgress["stage"] | null>(null);
  const displayedAtRef = useRef(0);
  const [finalStats, setFinalStats] = useState<FinalAuditStats | null>(null);
  const [doneAuditId, setDoneAuditId] = useState<string | null>(null);
  const router = useRouter();
  const startedRef = useRef(false);

  // Elapsed timer anchored to the REAL audit start (job.created_at), not to
  // this page's mount time — so the loading page's elapsed time matches the
  // final report's total runtime. The ticker freezes when the job finishes
  // (effect stops), and the final-stats card shows the same wall-clock
  // total (created_at -> updated_at).
  const startMsRef = useRef<number | null>(null);
  if (startMsRef.current === null && job.startedAt) {
    const t = new Date(job.startedAt).getTime();
    if (Number.isFinite(t)) startMsRef.current = t;
  }
  const [elapsedMs, setElapsedMs] = useState(() =>
    startMsRef.current ? Math.max(0, Date.now() - startMsRef.current) : 0
  );
  useEffect(() => {
    if (job.status === "done" || job.status === "error") return;
    const interval = setInterval(() => {
      if (startMsRef.current != null) setElapsedMs(Math.max(0, Date.now() - startMsRef.current));
      else setElapsedMs((s) => s + 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [job.status]);

  // Live stage progress: while the long-running analysis action holds the
  // crawl, poll and render the real counters
  // (discovered/crawled/queued/processed/retries/rate).
  //
  // The crawler's progress is persisted to the audit_jobs.progress column
  // (runAnalysisStage -> writeProgress, throttled ~1/s), so the frontend can
  // read it two independent ways:
  //   1. PRIMARY — a direct browser read of that column via the RLS-protected
  //      supabase client. No server-action hop, no process-boundary issue:
  //      the data lives in the database, so this works whether the audit ran
  //      in this process or another.
  //   2. FALLBACK — the getJobProgress server action, used if the direct read
  //      errors or returns empty for a few consecutive polls.
  useEffect(() => {
    if (job.status !== "analyzing") return;
    const sb = createBrowserSupabaseClient();
    // Temporary trace (dev only) — the payloads here prove what the frontend
    // actually receives (open DevTools -> Console while an audit runs).
    if (process.env.NODE_ENV !== "production") {
      console.info(`[progress:ui] poll loop started for job ${job.id} (status ${job.status})`);
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let emptyStreak = 0;
    let directFailed = false;

    function applyProgress(p: CrawlProgress): void {
      // Keep the latest payload per stage so a held view always pairs
      // its own labels with its own numbers.
      progressByStageRef.current[p.stage] = p;
      const arrived = stageArrivedAtRef.current;
      arrived[p.stage] = Date.now();
      // Pick the stage to display: the crawl while it is running, then
      // the newest non-crawl stage, held for STAGE_HOLD_MS so the card
      // doesn't flicker between concurrent stages.
      const now = Date.now();
      let chosen: CrawlProgress["stage"] | null = null;
      const crawlAt = arrived.crawl;
      if (crawlAt != null && now - crawlAt < CRAWL_FRESH_MS) {
        chosen = "crawl";
      } else {
        let newest = -1;
        for (const [s, t] of Object.entries(arrived) as [CrawlProgress["stage"], number][]) {
          if (s === "crawl") continue;
          if (t > newest) {
            newest = t;
            chosen = s;
          }
        }
      }
      if (chosen) {
        const prev = displayedStageRef.current;
        if (prev === chosen || displayedAtRef.current === 0 || now - displayedAtRef.current >= STAGE_HOLD_MS) {
          displayedStageRef.current = chosen;
          displayedAtRef.current = now;
        }
        setDisplayedProgress(progressByStageRef.current[displayedStageRef.current!] ?? p);
      }
    }

    function describe(p: CrawlProgress | null): string {
      if (!p) return "null";
      return `stage=${p.stage} discovered=${p.discovered ?? "-"} crawled=${p.crawled ?? p.processed ?? "-"} queued=${p.queued ?? "-"} url=${p.currentUrl ?? "-"}`;
    }

    // PRIMARY: direct browser read of audit_jobs.progress (RLS-scoped to the
    // signed-in user's own job). No server-action layer in the path.
    async function pollDirect(): Promise<void> {
      try {
        const { data, error } = await sb
          .from("audit_jobs")
          .select("progress")
          .eq("id", job.id)
          .maybeSingle();
        const p = (data as { progress?: CrawlProgress | null } | null)?.progress ?? null;
        if (!cancelled) {
          if (!error && p) {
            emptyStreak = 0;
            applyProgress(p);
            if (process.env.NODE_ENV !== "production") {
              console.info(`[progress:ui] direct read -> ${describe(p)}`);
            }
          } else {
            emptyStreak++;
            if (process.env.NODE_ENV !== "production") {
              console.info(`[progress:ui] direct read -> empty (error=${error ? error.message : "none"})`);
            }
          }
        }
      } catch {
        emptyStreak++;
      }
      if (!cancelled) {
        if (!directFailed && emptyStreak >= 3) {
          directFailed = true;
          if (process.env.NODE_ENV !== "production") {
            console.info("[progress:ui] direct read failing/empty — switching to getJobProgress server action");
          }
          timer = setTimeout(pollServer, 0);
        } else {
          timer = setTimeout(pollDirect, PROGRESS_POLL_MS);
        }
      }
    }

    // FALLBACK: the server action, if the direct read couldn't deliver.
    async function pollServer(): Promise<void> {
      try {
        const res = await getJobProgress(job.id);
        if (!cancelled) {
          if (!("error" in res) && res.progress) {
            emptyStreak = 0;
            applyProgress(res.progress);
            if (process.env.NODE_ENV !== "production") {
              console.info(`[progress:ui] server action -> ${describe(res.progress)}`);
            }
          } else {
            emptyStreak++;
            if (process.env.NODE_ENV !== "production") {
              console.info(
                "[progress:ui] server action ->",
                "error" in res ? `ERROR ${res.error}` : "progress=null"
              );
            }
          }
        }
      } catch {
        emptyStreak++;
      }
      if (!cancelled) timer = setTimeout(pollServer, PROGRESS_POLL_MS);
    }

    pollDirect();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job.status, job.id]);

  useEffect(() => {
    // Guards against React's dev-mode double-invoke of effects, which
    // would otherwise fire the pipeline twice on mount.
    if (startedRef.current) return;
    startedRef.current = true;

    // No unmount-abort flag here on purpose. Each stage action is
    // idempotent (it checks the job's current status server-side before
    // doing anything), so a stray extra dispatch from React Strict
    // Mode's dev-only double-invoke is harmless. An abort flag tied to
    // effect cleanup actively breaks this: Strict Mode's first cleanup
    // fires almost immediately after mount, which would kill the real
    // pipeline before it ever finished stage 1.
    async function runPipeline() {
      let current = initialStatus;

      while (current.status !== "done" && current.status !== "error") {
        let result: AuditJobStatus | { error: string };

        try {
          result = await dispatchStage(current.status, current.id, () => setRetrying(true));
          setRetrying(false);
        } catch (err) {
          setRetrying(false);
          setTopError(
            isTransientFetchFailure(err)
              ? "Lost connection to the server while running the audit, even after retrying. " +
                  "Refresh this page to continue — the audit resumes from where it stopped."
              : err instanceof Error
                ? err.message
                : String(err)
          );
          return;
        }

        if ("error" in result) {
          setTopError(result.error);
          return;
        }

        current = result;
        setJob(result);
      }

      if (current.status === "done" && current.resultingAuditId) {
        // Grab the real final statistics from the stored audit result and
        // show them in place of the live counters before redirecting to
        // the report. Best-effort: if the read fails, redirect as before.
        let stats: FinalAuditStats | null = null;
        try {
          const res = await getFinalAuditStats(current.id);
          if (!("error" in res)) stats = res.stats;
        } catch {
          // fall back to redirecting straight away
        }
        setFinalStats(stats);
        setDoneAuditId(current.resultingAuditId);
        if (stats) {
          await new Promise((resolve) => setTimeout(resolve, FINAL_STATS_HOLD_MS));
        }
        router.push(`/audit/${current.resultingAuditId}`);
      }
    }

    runPipeline();
    // initialStatus and router are stable for the lifetime of this
    // component instance (a fresh page load provides a new one).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeIndex = stageIndex(job.status);
  const showLiveProgress = job.status === "analyzing" && !topError;
  const crawlFallback = showLiveProgress && !displayedProgress && elapsedMs >= CRAWLING_FALLBACK_MS;
  const crawlStalled = showLiveProgress && !displayedProgress && elapsedMs >= CRAWL_STALL_WARN_MS;
  const showFinal = job.status === "done" && doneAuditId != null;
  const barPct =
    displayedProgress && displayedProgress.total != null && displayedProgress.processed != null
      ? Math.min(100, Math.round((displayedProgress.processed / displayedProgress.total) * 100))
      : null;

  const goToReport = () => {
    if (doneAuditId) router.push(`/audit/${doneAuditId}`);
  };

  return (
    <div>
      <ul className="sa-stage-list">
        {STAGES.map((stage, i) => {
          const state = job.status === "error" && i === activeIndex - 1 ? "error"
            : i < activeIndex ? "done"
            : i === activeIndex ? "active"
            : "pending";

          return (
            <li key={stage.key} className={`sa-stage sa-stage-${state}`}>
              <span className="sa-stage-marker">
                {state === "done" ? "✓" : state === "error" ? "!" : state === "active" ? (
                  <span className="sa-stage-spinner" />
                ) : ""}
              </span>
              <span>{stage.label}</span>
              {state === "active" && (
                <span className="sa-stage-elapsed">{formatElapsed(elapsedMs)}</span>
              )}
            </li>
          );
        })}
      </ul>

      {retrying && (
        <p className="sa-progress-note">Connection interrupted — retrying automatically&hellip;</p>
      )}

      {showLiveProgress && (
        <section className="sa-crawl-progress">
          <div className="sa-cp-head">
            <h2 className="sa-cp-title">Crawl Progress</h2>
            <span className="sa-cp-stage">
              {displayedProgress
                ? STAGE_LABELS[displayedProgress.stage]
                : crawlFallback
                  ? "Crawling website"
                  : "Preparing crawl"}
            </span>
          </div>
          {displayedProgress ? (
            <>
              <div className="sa-cp-grid">
                {metricTiles(displayedProgress).map((m) => (
                  <Stat key={m.label} label={m.label} value={m.value} />
                ))}
              </div>
              {barPct != null && displayedProgress.total != null && displayedProgress.processed != null && (
                <ProgressBar processed={displayedProgress.processed} total={displayedProgress.total} />
              )}
              {displayedProgress.stage === "crawl" && displayedProgress.currentUrl && (
                <p className="sa-cp-current">
                  Current URL: <span>{displayedProgress.currentUrl}</span>
                </p>
              )}
            </>
          ) : crawlFallback ? (
            // No payload yet — the crawler's first event is late. Show the
            // honest crawling state with the real elapsed timer; tiles stay
            // "—" rather than inventing numbers. The audit itself keeps
            // running regardless.
            <>
              <div className="sa-cp-grid">
                <Stat label="URLs Discovered" value="—" />
                <Stat label="URLs Scanned" value="—" />
                <Stat label="URLs Remaining" value="—" />
                <Stat label="Failed URLs" value="—" />
                <Stat label="Images analyzed" value="—" />
                <Stat label="Internal links" value="—" />
                <Stat label="Retries" value="—" />
                <Stat label="Crawl Rate" value="—" />
                <Stat label="Elapsed Time" value={formatElapsed(elapsedMs)} />
              </div>
              <p className="sa-cp-current">
                Current URL: <span>—</span>
              </p>
              <p className="sa-cp-waiting">
                Waiting for the first page result — live counters appear as pages complete.
              </p>
              {crawlStalled && (
                <p className="sa-cp-stall">
                  No live counters have arrived yet, but the audit is still running normally.
                </p>
              )}
            </>
          ) : (
            <p className="sa-cp-waiting">
              Waiting for live crawl data — the counters appear as soon as the crawler starts.
            </p>
          )}
        </section>
      )}

      {job.status !== "done" && job.status !== "error" && !topError && (
        <p className="sa-progress-note">☕ This might take a few minutes — grab a coffee, we'll take it from here.</p>
      )}

      {showFinal && (
        <section className="sa-crawl-progress sa-cp-done">
          <div className="sa-cp-head">
            <h2 className="sa-cp-title">Audit complete</h2>
            <span className="sa-cp-stage sa-cp-stage-done">Final statistics</span>
          </div>
          {finalStats ? (
            <>
              <div className="sa-cp-grid">
                <Stat label="URLs Discovered" value={formatCount(finalStats.discoveredUrls)} />
                <Stat label="URLs Scanned" value={formatCount(finalStats.pagesCrawled)} />
                <Stat label="URLs Remaining" value={0} />
                <Stat label="Failed URLs" value={formatCount(finalStats.pagesFailed)} />
                <Stat label="Performance tested" value={formatCount(finalStats.pagesPerformanceTested)} />
                <Stat label="Templates" value={formatCount(finalStats.templatesRepresented)} />
                <Stat label="Retries" value={formatCount(finalStats.retries)} />
                <Stat
                  label="Crawl Rate"
                  value={finalStats.crawlRatePerSec != null ? `${finalStats.crawlRatePerSec} URLs/sec` : "—"}
                />
                <Stat label="Total Time" value={formatElapsed(finalStats.totalMs)} />
              </div>
              <div className="sa-cp-done-actions">
                <button type="button" className="sa-cp-btn" onClick={goToReport}>
                  View your report &rarr;
                </button>
                <span className="sa-cp-done-note">Opening automatically in a moment&hellip;</span>
              </div>
            </>
          ) : (
            <p className="sa-cp-waiting">Opening your report&hellip;</p>
          )}
        </section>
      )}

      {(job.status === "error" || topError) && (
        <div className="sa-stage-error-box">
          <p className="sa-stage-error-title">Something went wrong</p>
          <p className="sa-stage-error-text">{job.errorMessage ?? topError}</p>
          <a href="/dashboard" className="sa-link">&larr; Back to dashboard</a>
        </div>
      )}

      <style>{stageStyles}</style>
    </div>
  );
}

const stageStyles = `
  .sa-stage-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sa-stage {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--paper-raised);
    font-size: 14px;
    color: var(--ink-soft);
  }
  .sa-stage-marker {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
    background: var(--line);
    color: var(--ink-soft);
  }
  .sa-stage-active { color: var(--ink); border-color: var(--signal); }
  .sa-stage-active .sa-stage-marker { background: var(--signal-soft); color: var(--signal); }
  .sa-stage-done { color: var(--ink); }
  .sa-stage-done .sa-stage-marker { background: var(--pass-soft); color: var(--pass); }
  .sa-stage-error { color: var(--ink); border-color: var(--fail); }
  .sa-stage-error .sa-stage-marker { background: var(--fail-soft); color: var(--fail); }

  .sa-stage-error-box {
    margin-top: 20px;
    padding: 18px 20px;
    border-radius: 10px;
    background: var(--fail-soft);
  }
  .sa-stage-error-title { font-weight: 700; color: var(--fail); margin: 0 0 6px; }
  .sa-stage-error-text { font-size: 14px; color: var(--ink); margin: 0 0 12px; }

  .sa-stage-spinner {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--signal-soft);
    border-top-color: var(--signal);
    animation: sa-spin 0.7s linear infinite;
  }
  @keyframes sa-spin {
    to { transform: rotate(360deg); }
  }
  .sa-stage-elapsed {
    margin-left: auto;
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    color: var(--ink-soft);
  }

  /* --- Crawl Progress card ------------------------------------------ */
  .sa-crawl-progress {
    margin-top: 22px;
    padding: 18px 20px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--paper-raised);
    box-shadow: 0 1px 3px rgba(20, 23, 28, 0.06);
  }
  .sa-cp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }
  .sa-cp-title {
    font-family: var(--font-display), sans-serif;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0;
    color: var(--ink);
  }
  .sa-cp-stage {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
    color: var(--signal);
    background: var(--signal-soft);
    padding: 5px 11px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .sa-cp-stage::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--signal);
    animation: sa-pulse 1.4s ease-in-out infinite;
  }
  .sa-cp-stage-done { color: var(--pass); background: var(--pass-soft); }
  .sa-cp-stage-done::before { background: var(--pass); animation: none; }
  @keyframes sa-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  .sa-cp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    gap: 10px;
  }
  .sa-cp-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 9px;
    background: var(--paper);
    border: 1px solid var(--line);
  }
  .sa-cp-stat-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .sa-cp-stat-value {
    font-family: var(--font-mono), monospace;
    font-size: 19px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.2;
  }
  .sa-cp-bar-wrap { margin-top: 14px; }
  .sa-cp-bar {
    height: 8px;
    border-radius: 999px;
    background: var(--line);
    overflow: hidden;
  }
  .sa-cp-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--signal);
    transition: width 0.4s ease;
  }
  .sa-cp-bar-label {
    display: block;
    margin-top: 6px;
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    color: var(--ink-soft);
  }
  .sa-cp-waiting {
    font-size: 13px;
    color: var(--ink-soft);
    margin: 0;
  }
  .sa-cp-stall {
    margin-top: 10px;
    font-size: 12.5px;
    color: #9A6A00;
    background: #FBF3E0;
    border: 1px solid #F0DFB6;
    border-radius: 8px;
    padding: 8px 12px;
  }
  .sa-cp-current {
    margin-top: 12px;
    font-size: 12.5px;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sa-cp-current span {
    font-family: var(--font-mono), monospace;
    color: var(--ink);
  }
  .sa-cp-done-actions {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .sa-cp-btn {
    appearance: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-body), system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    background: var(--signal);
    padding: 10px 16px;
    border-radius: 9px;
  }
  .sa-cp-btn:hover { filter: brightness(1.05); }
  .sa-cp-done-note {
    font-size: 13px;
    color: var(--ink-soft);
  }
  .sa-progress-note {
    margin-top: 18px;
    font-size: 13px;
    color: var(--ink-soft);
    text-align: center;
  }
`;
