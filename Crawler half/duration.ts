/**
 * Shared runtime display helpers for the audit report's "Audit Scope" box.
 *
 * Both the PDF (react-pdf/Helvetica) and the web report render the SAME
 * durations from the SAME `audit.timings` data — one formatter, one stage
 * list, so the two surfaces can never disagree about what the crawl took.
 *
 * PLAIN ASCII ONLY: the PDF's Helvetica font uses the WinAnsi charset, where
 * glyphs like "·", "—", and "≈" render as broken bars. Durations spell out
 * units ("4 min 12 sec") exactly like formatTotalTime() elsewhere in the
 * report, so the same string is safe in both the PDF and the browser.
 */

import type { CrawlTimings } from "./types";

/** One row of the report's runtime breakdown. */
export interface RuntimeStage {
  /** Client-facing stage name — "Crawl", "Core Web Vitals", etc. */
  label: string;
  /** Wall-clock milliseconds that stage's work took. */
  ms: number;
}

/**
 * Formats a millisecond duration as a short human-readable string:
 * "58 sec", "4 min 12 sec", "1 hr 5 min". No decimals, no sub-second noise —
 * the report shows stage wall-times at a glance, it doesn't profile code.
 * Invalid/missing durations become "n/a" rather than a fabricated number.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "n/a";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} hr ${restMinutes} min` : `${hours} hr`;
}

/**
 * The single source of truth for an audit's TOTAL runtime.
 *
 * The rule is wall-clock only: total = auditCompletedAt - auditStartedAt,
 * where both timestamps bound the WHOLE pipeline (job created -> saved).
 * Parallel stages (crawl, CWV, images, broken links) overlap, so their
 * durations must NEVER be summed to produce a total — summing is exactly
 * what produced inflated runtimes like "25 min 35 sec" for an ~18 minute
 * audit in the past.
 *
 * Falls back to timings.totalMs (runAudit's own wall span) for audits that
 * predate the start/end timestamps or never went through the job pipeline.
 * Returns null only when nothing is measurable.
 */
export function totalRuntimeMs(
  auditStartedAt: string | null | undefined,
  auditCompletedAt: string | null | undefined,
  fallbackMs: number | null | undefined
): number | null {
  if (auditStartedAt && auditCompletedAt) {
    const start = new Date(auditStartedAt).getTime();
    const end = new Date(auditCompletedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return end - start;
    }
  }
  return Number.isFinite(fallbackMs) && fallbackMs != null && fallbackMs >= 0 ? fallbackMs : null;
}

/**
 * The major audit stages shown in the runtime breakdown, derived from the
 * crawl's structured timings. Deliberately a small, high-level list (no
 * internal stage names, no counters) — a client reading the report wants
 * "Crawl", "Core Web Vitals", "Broken links", "Image analysis", not
 * implementation detail.
 *
 * Note on overlap: Core Web Vitals and image analysis run while the crawl
 * is still discovering pages, so their durations can overlap the crawl
 * window. The renderers say so in one short line rather than hiding it.
 * Stages that measured no work (e.g. image checks disabled, so 0ms) are
 * omitted rather than shown as "0 sec".
 */
export function buildRuntimeBreakdown(timings: CrawlTimings): RuntimeStage[] {
  const stages: RuntimeStage[] = [
    { label: "Crawl", ms: timings.crawlMs },
    {
      label: "Core Web Vitals",
      // Fresh audits record cwvWallMs — the true wall-clock span of ALL PSI
      // work (homepage + streamed + remaining, which run concurrently, so
      // their individual durations must NOT be summed). Cached audits that
      // predate this field fall back to the longest single phase, which can
      // never exceed the total audit time.
      ms:
        timings.cwvWallMs ??
        Math.max(timings.homepagePageSpeedMs, timings.streamedCwvMs, timings.remainingCwvMs),
    },
    { label: "Broken links", ms: timings.brokenLinksMs },
    { label: "Image analysis", ms: timings.streamedImagesMs },
  ];
  return stages.filter((s) => s.ms > 0);
}
