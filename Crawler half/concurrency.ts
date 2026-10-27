/**
 * Centralized concurrency limits for the audit pipeline.
 *
 * Every stage's default concurrency and its hard cap live HERE — never
 * scattered across modules — so tuning one number (or exposing it as a
 * setting later) is a single-line change. The defaults are chosen to be
 * safe for the current architecture:
 *
 *   - crawl:            cheap HTTP GETs + HTML parse; 8 workers keep the
 *                       request rate polite for the target site while the
 *                       crawl (the longest on-site phase) still gets real
 *                       parallelism — bounded well under the cap of 10.
 *                       The crawl is network-bound, so throughput scales
 *                       with concurrency until the server or a rate limit
 *                       bites; 8 is a safe middle ground between the old
 *                       conservative 5 and the 10 cap.
 *   - brokenLinks:      HEAD/GET link checks; a higher global pool is safe
 *                       because most links are cheap — but perHost caps
 *                       the rate at any single domain so a multi-domain
 *                       link set can't hammer one origin (see
 *                       brokenLinks.ts for the per-host semaphore and the
 *                       host circuit breaker).
 *   - pageSpeed:        PageSpeed Insights is a remote Google API (20-45s
 *                       per call); the bound is Google's quota (25k free
 *                       queries/day), not local CPU. Default 5 is a
 *                       deliberately conservative pool (a ~30-page
 *                       representative sample still finishes in a few
 *                       minutes without risking 429s); raise it up to the
 *                       cap of 12 once rate-limit headroom is confirmed.
 *   - imageChecks:      cheap CDN HEAD requests.
 */
export interface ConcurrencyLimit {
  /** Used when the caller doesn't specify a value. */
  default: number;
  /** Absolute ceiling — never exceeded regardless of caller input. */
  max: number;
}

export const CONCURRENCY: Record<
  "crawl" | "brokenLinks" | "brokenLinksPerHost" | "pageSpeed" | "imageChecks",
  ConcurrencyLimit
> = {
  crawl: { default: 8, max: 10 },
  brokenLinks: { default: 24, max: 48 },
  brokenLinksPerHost: { default: 10, max: 16 },
  pageSpeed: { default: 5, max: 12 },
  imageChecks: { default: 12, max: 24 },
};

/** Clamps a caller-supplied concurrency into [1, limit.max]. */
export function clampConcurrency(
  value: number | undefined,
  limit: ConcurrencyLimit,
  fallback?: number
): number {
  const raw = value ?? fallback ?? limit.default;
  return Math.max(1, Math.min(Math.floor(raw), limit.max));
}
