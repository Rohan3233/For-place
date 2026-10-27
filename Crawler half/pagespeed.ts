import { CONCURRENCY, clampConcurrency } from "./concurrency";
import { nativeFetch } from "./nativeFetch";
import type { PageSpeedResult, PageSpeedMetrics, PageCwvMeasurement, PageSpeedFetcher } from "./types";

// PSI calls are 20-45s each. They're remote Google API requests — the limit
// is Google's quota (25k queries/day), not local CPU/memory — so the
// centralized default pool of 12 cuts sample wall-time roughly linearly
// while staying well inside free-tier quotas. See concurrency.ts.
const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const DEFAULT_TIMEOUT_MS = 45_000; // PSI is genuinely slow — see note in the original business doc

// PSI transient failures worth retrying with backoff: server-side flukes
// (429 rate-limit, 5xx) and network-layer failures (timeout, reset). A
// successful measurement recovered by a retry is a measurement not lost.
const RETRYABLE_PSI_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const PSI_MAX_ATTEMPTS = 3;
const PSI_RETRY_BASE_DELAY_MS = 1000;
/** Upper bound on a single retry delay — a 429's Retry-After can be huge,
 * and "wait 15 minutes per URL" is never the right trade. After this cap
 * the URL is recorded as failed and skipped, per the audit's never-stall
 * contract. */
const PSI_MAX_RETRY_DELAY_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses a Retry-After header expressed in seconds ("30"). Returns 0 for
 * HTTP-date values or garbage — callers fall back to their own backoff. */
function parseRetryAfterSeconds(value: string | null): number {
  if (!value) return 0;
  const sec = Number(value.trim());
  return Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
}

/** Exponential backoff with full jitter so parallel workers don't stampede. */
function backoffMs(baseMs: number, attempt: number): number {
  const windowMs = baseMs * Math.pow(2, attempt);
  return Math.round(windowMs / 2 + Math.random() * (windowMs / 2));
}

function isTransientPageSpeedError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true; // timeout
  if (err instanceof TypeError) return true; // network-layer fetch failure
  // Node's http/https errors carry the code (ECONNRESET, ETIMEDOUT, ...)
  // directly on the error; undici puts it on `.cause`. Check both so the
  // native transport (nativeFetch) and the old fetch path classify alike.
  const code =
    (err as { code?: string } | null)?.code ??
    (err instanceof Error ? (err as Error & { cause?: { code?: string } }).cause?.code : undefined);
  if (typeof code === "string") return true;
  return false;
}

/**
 * Calls Google PageSpeed Insights for a single URL. Deliberately extracts
 * only the handful of fields the business doc's MVP scope calls for
 * (Core Web Vitals + mobile friendliness) rather than storing the entire
 * Lighthouse payload, which is large and mostly not needed for a client
 * report.
 *
 * NOTE ON MOBILE FRIENDLINESS: PSI v5 doesn't return a direct "is this
 * mobile-friendly" boolean (Google's old Mobile-Friendly Test API was a
 * separate, now-retired product). This uses the Lighthouse `viewport`
 * audit as a reasonable proxy — it checks for a correctly configured
 * viewport meta tag, which is the single biggest mobile-friendliness
 * signal, but it is an approximation, not the full mobile-usability audit.
 *
 * NOTE ON COST/SPEED: this call frequently takes 20-45 seconds on its own,
 * as flagged in the original business doc. Callers should run this in
 * parallel with the crawl (see runAudit.ts), not sequentially after it.
 */
export async function fetchPageSpeed(
  url: string,
  options: {
    apiKey?: string;
    strategy?: "mobile" | "desktop";
    timeoutMs?: number;
    /** Called each time a transient failure is being retried (instrumentation). */
    onRetry?: () => void;
  } = {}
): Promise<PageSpeedResult> {
  const strategy = options.strategy ?? "mobile";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const requestUrl = new URL(PSI_ENDPOINT);
  requestUrl.searchParams.set("url", url);
  requestUrl.searchParams.set("strategy", strategy);
  // Google's API accepts multiple repeated `category` params in one call —
  // requesting accessibility alongside performance costs nothing extra
  // (same request, same 20-45s wait), just a slightly larger response.
  requestUrl.searchParams.append("category", "performance");
  requestUrl.searchParams.append("category", "accessibility");
  if (options.apiKey) requestUrl.searchParams.set("key", options.apiKey);
  // Without an API key, Google allows a small number of unauthenticated
  // requests per day — fine for local testing, not for production. Get a
  // key from Google Cloud Console before this runs for real users.

  for (let attempt = 0; attempt < PSI_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // nativeFetch (node:https) instead of global fetch: Next.js wraps
      // global fetch with its own fetch cache, and an aborted PSI request
      // (45s timeout) makes Next log a scary "Failed to set fetch cache"
      // error stack per abort. nativeFetch bypasses Next entirely.
      const res = await nativeFetch(requestUrl.toString(), { signal: controller.signal, timeoutMs });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const retryable = RETRYABLE_PSI_STATUS.has(res.status);
        if (retryable && attempt < PSI_MAX_ATTEMPTS - 1) {
          try {
            options.onRetry?.();
          } catch {
            /* observer must never break the call */
          }
          // Respect Retry-After when Google supplies one (429s usually
          // do) — capped so a hostile/absurd value can never stall the
          // whole sample. Without a header, exponential backoff + jitter.
          const retryAfterMs = res.status === 429 ? parseRetryAfterSeconds(res.headers.get("retry-after")) * 1000 : 0;
          const delay = Math.min(
            PSI_MAX_RETRY_DELAY_MS,
            Math.max(backoffMs(PSI_RETRY_BASE_DELAY_MS, attempt), retryAfterMs)
          );
          await sleep(delay);
          continue;
        }
        return {
          ok: false,
          url,
          error: `PageSpeed API returned ${res.status}: ${body.slice(0, 300)}`,
        };
      }

      const data = await res.json();
      const metrics = extractMetrics(data);
      return { ok: true, url, strategy, metrics };
    } catch (err: unknown) {
      const transient = isTransientPageSpeedError(err);
      if (transient && attempt < PSI_MAX_ATTEMPTS - 1) {
        try {
          options.onRetry?.();
        } catch {
          /* observer must never break the call */
        }
        await sleep(backoffMs(PSI_RETRY_BASE_DELAY_MS, attempt));
        continue;
      }
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `PageSpeed request timed out after ${timeoutMs}ms (retried ${attempt} time${attempt === 1 ? "" : "s"}).`
          : err instanceof Error
            ? err.message
            : "Unknown error calling PageSpeed API.";
      return { ok: false, url, error: message };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  // Unreachable — the loop always returns. Kept for type narrowing.
  return { ok: false, url, error: "PageSpeed request failed." };
}

/**
 * Evaluates Core Web Vitals for a set of URLs via PageSpeed Insights,
 * running at most `concurrency` requests at once. Each URL is evaluated
 * independently — a timeout/quota failure on one page never affects the
 * others, and never throws (matches the never-throw contract of the rest
 * of the crawler). Results feed aggregateCoreWebVitals() in
 * coreWebVitals.ts; the per-page ok flag is exactly how the aggregate
 * decides what counts as "evaluated".
 */
export async function fetchPageSpeedForPages(
  urls: string[],
  options: {
    apiKey?: string;
    strategy?: "mobile" | "desktop";
    timeoutMs?: number;
    concurrency?: number;
    /** Called each time a transient failure is being retried (instrumentation). */
    onRetry?: () => void;
    /** Called after each page finishes, with (processed, total). */
    onProgress?: (processed: number, total: number) => void;
    /**
     * Called after each individual request completes, with the URL and its
     * wall-clock duration in ms (instrumentation — avg/max request time).
     * Must not throw.
     */
    onRequestDuration?: (url: string, durationMs: number) => void;
    /**
     * Inject a single-URL PageSpeed fetcher (testing/benchmarking). Must
     * never throw — return { ok: false, url, error } on failure.
     */
    fetchSingle?: PageSpeedFetcher;
  } = {}
): Promise<PageCwvMeasurement[]> {
  const concurrency = Math.max(
    1,
    Math.min(clampConcurrency(options.concurrency, CONCURRENCY.pageSpeed), urls.length || 1)
  );
  const fetchOne = options.fetchSingle ?? fetchPageSpeed;
  const results: PageCwvMeasurement[] = new Array(urls.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= urls.length) return;
      const url = urls[index];
      const startedAt = Date.now();
      let single: PageSpeedResult;
      try {
        single = await fetchOne(url, {
          apiKey: options.apiKey,
          strategy: options.strategy,
          timeoutMs: options.timeoutMs,
          onRetry: options.onRetry,
        });
      } catch (err: unknown) {
        // The fetcher contract says never throw, but a test double or a
        // future implementation could — a single bad fetcher must never
        // abort the whole batch (same isolation as WorkQueue workers).
        single = {
          ok: false,
          url,
          error: err instanceof Error ? err.message : "PageSpeed request failed.",
        };
      }
      if (options.onRequestDuration) {
        try {
          options.onRequestDuration(url, Date.now() - startedAt);
        } catch {
          /* observer must never break the batch */
        }
      }
      results[index] = single.ok
        ? { url, ok: true, metrics: single.metrics }
        : { url, ok: false, error: single.error };
      completed++;
      if (options.onProgress) {
        try {
          options.onProgress(completed, urls.length);
        } catch {
          /* observer must never break the batch */
        }
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PSI's response shape is large and only partially typed here on purpose
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PSI's response shape is large and only partially typed here on purpose
function extractMetrics(data: any): PageSpeedMetrics {
  const audits = data?.lighthouseResult?.audits ?? {};
  const performanceScoreRaw = data?.lighthouseResult?.categories?.performance?.score;
  const accessibilityScoreRaw = data?.lighthouseResult?.categories?.accessibility?.score;

  return {
    performanceScore:
      typeof performanceScoreRaw === "number" ? Math.round(performanceScoreRaw * 100) : null,
    lcpMs: numericAuditValue(audits["largest-contentful-paint"]),
    clsScore: numericAuditValue(audits["cumulative-layout-shift"]),
    // INP is the current Core Web Vital (replaced FID). Lab data for INP
    // isn't always present depending on the PSI API version; fall back to
    // max-potential-fid as a legacy approximation if INP is missing.
    inpMs:
      numericAuditValue(audits["interaction-to-next-paint"]) ??
      numericAuditValue(audits["max-potential-fid"]),
    ttfbMs: numericAuditValue(audits["server-response-time"]),
    isMobileFriendly: typeof audits["viewport"]?.score === "number" ? audits["viewport"].score === 1 : null,
    accessibilityScore:
      typeof accessibilityScoreRaw === "number" ? Math.round(accessibilityScoreRaw * 100) : null,
    accessibilityIssues: extractAccessibilityIssues(data),
  };
}

/**
 * Walks the accessibility category's audit refs and returns only the ones
 * that actually failed (score < 1) and count toward the category (weight
 * > 0 — Lighthouse includes some informational-only, unweighted audits
 * that shouldn't be surfaced as "issues"). Deliberately a small, curated
 * list rather than every possible Lighthouse accessibility audit, since
 * some (e.g. manual-check-only audits) have no numeric score at all.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAccessibilityIssues(data: any): import("./types").AccessibilityIssue[] {
  const audits = data?.lighthouseResult?.audits ?? {};
  const auditRefs = data?.lighthouseResult?.categories?.accessibility?.auditRefs ?? [];

  const issues: import("./types").AccessibilityIssue[] = [];
  for (const ref of auditRefs) {
    if (typeof ref?.weight !== "number" || ref.weight <= 0) continue; // skip unweighted/manual-only checks
    const audit = audits[ref.id];
    if (!audit || typeof audit.score !== "number" || audit.score >= 1) continue; // only genuine failures

    issues.push({
      id: ref.id,
      title: typeof audit.title === "string" ? audit.title : ref.id,
      description: typeof audit.description === "string" ? stripMarkdownLinks(audit.description) : "",
    });
  }
  return issues;
}

/**
 * Lighthouse audit descriptions often contain markdown-style links, e.g.
 * "[Learn more](https://...)" — stripped down to just the link text since
 * this feeds directly into the client-facing report, not a web page that
 * can render markdown.
 */
function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function numericAuditValue(audit: any): number | null {
  return typeof audit?.numericValue === "number" ? audit.numericValue : null;
}
