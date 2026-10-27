import { isPathAllowed } from "./robots";
import { fetchWithRetry, describeNetworkError } from "./fetchWithRetry";
import { CONCURRENCY, clampConcurrency } from "./concurrency";
import type { CrawlPageResult, BrokenLinkResult, BrokenLinkFailureCategory } from "./types";

// Defaults come from the centralized concurrency config (see concurrency.ts);
// the timeout is a broken-links concern and lives here.
const DEFAULT_TIMEOUT_MS = 8000;
// After a host has produced this many CONSECUTIVE timeout/network-error
// results, it is treated as slow/unresponsive and its remaining links are
// checked with a short timeout and a single attempt (no retry, no backoff
// wait). The failure CATEGORY is unchanged — a short-circuit timeout is
// still reported as a "timeout", never as broken — this only bounds the
// worst case where one black-holed or bot-protected host would otherwise
// burn the full per-attempt timeout (twice, with retries) on every one of
// its links, stalling the whole verification queue behind it.
const HOST_FAIL_STREAK_THRESHOLD = 3;
const SHORT_CIRCUIT_TIMEOUT_MS = 2000;

export const BROKEN_LINK_CATEGORY_LABEL: Record<BrokenLinkFailureCategory, string> = {
  not_found: "404/410 Not Found",
  client_error: "4xx Client Error",
  server_error: "5xx Server Error",
  timeout: "Timeout",
  dns_error: "DNS Error",
  network_error: "Network Error",
  blocked_by_robots: "Blocked by robots.txt",
  forbidden: "Crawler Blocked",
  rate_limited: "Rate Limited by Server",
  other: "Other",
};

// Display order — most actionable/likely-genuine first, robots-blocked
// last since those were never actually checked at all.
const CATEGORY_DISPLAY_ORDER: BrokenLinkFailureCategory[] = [
  "not_found",
  "client_error",
  "server_error",
  "forbidden",
  "rate_limited",
  "timeout",
  "dns_error",
  "network_error",
  "other",
  "blocked_by_robots",
];

/**
 * Normalization used for DEDUP and for deciding whether a link's health is
 * already proven by the crawl itself. Deliberately conservative: lowercases
 * the host, strips the hash, and ignores a trailing slash — but keeps the
 * scheme, port, and query string EXACT. A link with a different scheme
 * (http vs https), port, or query may genuinely resolve differently, so
 * those never match a crawled page without an actual request.
 */
function normalizeLinkKey(url: string): string | null {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString().toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Checks every unique internal link for broken-ness, reusing the crawl's
 * own evidence wherever possible and bounding the network cost of what's
 * left.
 *
 * DUPLICATE-REQUEST ELIMINATION:
 *  - The crawl already fetched every page it visited (status 200 or it
 *    wouldn't be in `pages` as ok). A link whose normalized form matches a
 *    successfully crawled page — its final URL, or the original URL of a
 *    page that redirected to a successful final URL — is provably NOT
 *    broken; re-requesting it with a HEAD would be a duplicate network
 *    request with a predetermined outcome. Those links are reported as ok
 *    (same shape, statusCode 200) without any request.
 *  - Links are deduped by their NORMALIZED key (host case, hash, trailing
 *    slash), so "https://x/a" and "https://x/a/" — equivalent URLs that
 *    would previously each generate a request — resolve to ONE check. The
 *    first-seen spelling is what gets reported, and `linkedFrom` merges
 *    every page that linked to any spelling.
 *  - Only links the crawl never verified get an actual network check.
 *
 * CONCURRENCY & HOST PROTECTION:
 *  - A global worker pool (default 24) plus a per-host semaphore (default
 *    10) bound both total and per-origin request rates, so a multi-domain
 *    link set can't hammer one domain and one slow host can't starve the
 *    others.
 *  - Host circuit breaker: see HOST_FAIL_STREAK_THRESHOLD above.
 *
 * Returns { results, skippedAsCrawled, retries } — `results` keeps the
 * exact same shape as before (every unique link present, every failure
 * still detected), the counters let runAudit report how many requests were
 * avoided and how many retries happened (observability only).
 */
export async function checkBrokenLinks(
  pages: CrawlPageResult[],
  options: {
    userAgent: string;
    concurrency?: number;
    perHostConcurrency?: number;
    timeoutMs?: number;
    robotsDisallowedPaths?: string[];
    onProgress?: (info: { processed: number; total: number }) => void;
  }
): Promise<{ results: BrokenLinkResult[]; skippedAsCrawled: number; retries: number; reusedAsBroken: number }> {
  const {
    userAgent,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    robotsDisallowedPaths = [],
    onProgress,
  } = options;
  const concurrency = clampConcurrency(options.concurrency, CONCURRENCY.brokenLinks);
  const perHostConcurrency = clampConcurrency(
    options.perHostConcurrency,
    CONCURRENCY.brokenLinksPerHost
  );

  // Dedup by normalized key; keep the first-seen original spelling as the
  // reported URL and merge every linking page into linkedFrom.
  const linkSources = new Map<string, Set<string>>();
  const linkSpellings = new Map<string, string>();
  for (const page of pages) {
    if (!page.ok) continue;
    for (const link of page.internalLinks) {
      const key = normalizeLinkKey(link) ?? link; // unparseable links keep their raw spelling
      const sources = linkSources.get(key) ?? new Set<string>();
      sources.add(page.url);
      linkSources.set(key, sources);
      if (!linkSpellings.has(key)) linkSpellings.set(key, link);
    }
  }

  // URLs whose health the crawl itself already established: every
  // successfully crawled page's final URL, plus the requested URL of any
  // page that redirected to a successful final URL (redirect: "follow"
  // would land on that same good page, so the link resolves fine), plus
  // every URL the redirect walk passed THROUGH (a link pointing at a
  // redirect target resolves to the same good page).
  const knownOk = new Set<string>();
  for (const page of pages) {
    if (!page.ok) continue;
    const finalKey = normalizeLinkKey(page.url);
    if (finalKey) knownOk.add(finalKey);
    if (page.redirected && page.requestedUrl) {
      const requestedKey = normalizeLinkKey(page.requestedUrl);
      if (requestedKey) knownOk.add(requestedKey);
    }
    for (const hopUrl of page.redirectHopUrls ?? []) {
      const hopKey = normalizeLinkKey(hopUrl);
      if (hopKey) knownOk.add(hopKey);
    }
  }

  // URLs the crawl already PROVED broken: a page it fetched that failed
  // with a definitive client error (4xx) is not going to succeed for a
  // HEAD moments later — re-checking it would be a duplicate request with a
  // predetermined outcome. Only 4xx is reused: 5xx/timeouts can clear
  // between the crawl and the check, so those are still re-verified (never
  // trade accuracy for speed).
  const knownBroken = new Map<string, { statusCode: number; failureCategory: BrokenLinkFailureCategory }>();
  for (const page of pages) {
    if (page.ok) continue;
    const status = page.error.statusCode;
    if (status === undefined || status < 400 || status >= 500) continue;
    const key = normalizeLinkKey(page.url);
    if (!key) continue;
    knownBroken.set(key, { statusCode: status, failureCategory: categorizeStatusCode(status) });
  }

  const uniqueKeys = Array.from(linkSources.keys());
  const results: BrokenLinkResult[] = [];
  let skippedAsCrawled = 0;
  let reusedAsBroken = 0;
  let retries = 0;
  let index = 0;

  // --- Per-host semaphore + host fail-streak (circuit breaker) ----------
  const hostActive = new Map<string, number>();
  const hostWaiters = new Map<string, (() => void)[]>();
  const hostFailStreak = new Map<string, number>();

  function acquireHostSlot(host: string): Promise<void> {
    const active = hostActive.get(host) ?? 0;
    if (active < perHostConcurrency) {
      hostActive.set(host, active + 1);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const list = hostWaiters.get(host) ?? [];
      list.push(resolve);
      hostWaiters.set(host, list);
    });
  }

  function releaseHostSlot(host: string): void {
    const waiters = hostWaiters.get(host);
    const next = waiters?.shift();
    if (next) {
      next(); // the waiter inherits the slot — active count stays put
    } else {
      const active = hostActive.get(host) ?? 1;
      const updated = Math.max(0, active - 1);
      hostActive.set(host, updated);
      if (updated === 0) hostWaiters.delete(host);
    }
  }

  function hostIsShortCircuited(host: string): boolean {
    return (hostFailStreak.get(host) ?? 0) >= HOST_FAIL_STREAK_THRESHOLD;
  }

  function recordOutcome(host: string, result: { failureCategory: BrokenLinkFailureCategory | null }): void {
    if (result.failureCategory === "timeout" || result.failureCategory === "network_error") {
      hostFailStreak.set(host, (hostFailStreak.get(host) ?? 0) + 1);
    } else {
      hostFailStreak.set(host, 0);
    }
  }

  async function worker() {
    while (index < uniqueKeys.length) {
      const key = uniqueKeys[index];
      index++;

      const spelling = linkSpellings.get(key) ?? key;

      // Precedence preserved: robots-disallowed links report blocked_by_robots
      // exactly as before (this is the existing contract — a disallowed path
      // is "never actually checked", even if the crawl happened to visit it
      // with respectRobotsTxt disabled). Known-ok is only consulted after.
      if (isDisallowedByRobots(spelling, robotsDisallowedPaths)) {
        results.push({
          url: spelling,
          statusCode: null,
          ok: false,
          errorMessage: "Path is disallowed by robots.txt — not checked.",
          failureCategory: "blocked_by_robots",
          linkedFrom: Array.from(linkSources.get(key) ?? []),
        });
        continue;
      }

      if (knownOk.has(key)) {
        skippedAsCrawled++;
        results.push({
          url: spelling,
          statusCode: 200,
          ok: true,
          errorMessage: null,
          failureCategory: null,
          linkedFrom: Array.from(linkSources.get(key) ?? []),
        });
        continue;
      }

      // The crawl already fetched this exact URL and it returned a
      // definitive 4xx — reuse that outcome (same shape, same category,
      // same message) instead of issuing another request.
      const crawlBroken = knownBroken.get(key);
      if (crawlBroken) {
        reusedAsBroken++;
        results.push({
          url: spelling,
          statusCode: crawlBroken.statusCode,
          ok: false,
          errorMessage: messageForFailureCategory(crawlBroken.failureCategory),
          failureCategory: crawlBroken.failureCategory,
          linkedFrom: Array.from(linkSources.get(key) ?? []),
        });
        continue;
      }

      let host: string;
      try {
        host = new URL(spelling).hostname;
      } catch {
        host = "__unparseable__";
      }
      const shortCircuit = hostIsShortCircuited(host);

      await acquireHostSlot(host);
      let result: Omit<BrokenLinkResult, "url" | "linkedFrom">;
      try {
        result = await checkOneLink(spelling, userAgent, {
          timeoutMs: shortCircuit ? SHORT_CIRCUIT_TIMEOUT_MS : timeoutMs,
          maxAttempts: shortCircuit ? 1 : 2,
          onRetry: () => {
            retries++;
          },
        });
      } finally {
        releaseHostSlot(host);
      }
      recordOutcome(host, result);

      results.push({
        url: spelling,
        ...result,
        linkedFrom: Array.from(linkSources.get(key) ?? []),
      });

      if (onProgress) {
        try {
          onProgress({ processed: results.length, total: uniqueKeys.length });
        } catch {
          /* observer must never break the check */
        }
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, uniqueKeys.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { results, skippedAsCrawled, retries, reusedAsBroken };
}

export function groupBrokenLinksByCategory(
  links: BrokenLinkResult[]
): { category: BrokenLinkFailureCategory; label: string; links: BrokenLinkResult[] }[] {
  const map = new Map<BrokenLinkFailureCategory, BrokenLinkResult[]>();
  for (const link of links) {
    const category = link.failureCategory ?? "other";
    const list = map.get(category) ?? [];
    list.push(link);
    map.set(category, list);
  }
  return CATEGORY_DISPLAY_ORDER.filter((c) => map.has(c)).map((category) => ({
    category,
    label: BROKEN_LINK_CATEGORY_LABEL[category],
    links: map.get(category)!,
  }));
}

function isDisallowedByRobots(url: string, disallowedPaths: string[]): boolean {
  if (disallowedPaths.length === 0) return false;
  try {
    const pathname = new URL(url).pathname;
    return !isPathAllowed(pathname, { disallowedPaths });
  } catch {
    return false;
  }
}

async function checkOneLink(
  url: string,
  userAgent: string,
  opts: { timeoutMs: number; maxAttempts: number; onRetry: () => void }
): Promise<Omit<BrokenLinkResult, "url" | "linkedFrom">> {
  const headResult = await attemptRequest(url, "HEAD", userAgent, opts);

  if (headResult.statusCode === 405 || headResult.statusCode === 501) {
    // Some servers reject HEAD outright — a GET fallback is the honest
    // check, never a blind HEAD-only assumption.
    return attemptRequest(url, "GET", userAgent, opts);
  }

  return headResult;
}

async function attemptRequest(
  url: string,
  method: "HEAD" | "GET",
  userAgent: string,
  opts: { timeoutMs: number; maxAttempts: number; onRetry: () => void }
): Promise<Omit<BrokenLinkResult, "url" | "linkedFrom">> {
  // Retry transient failures before declaring a link broken — a one-shot
  // timeout or connection reset is not evidence the link is dead. Only a
  // failure that survives the retries reaches the report. Deterministic
  // 404/410 responses are returned immediately (fetchWithRetry never
  // retries non-retryable statuses), so no retries are wasted on them.
  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      { method, headers: { "User-Agent": userAgent }, redirect: "follow" },
      { timeoutMs: opts.timeoutMs, maxAttempts: opts.maxAttempts, onRetry: opts.onRetry }
    );
  } catch (err: unknown) {
    const { category, message } = categorizeNetworkError(err);
    return { statusCode: null, ok: false, errorMessage: message, failureCategory: category };
  }

  if (res.ok) {
    return { statusCode: res.status, ok: true, errorMessage: null, failureCategory: null };
  }
  const failureCategory = categorizeStatusCode(res.status);
  return {
    statusCode: res.status,
    ok: false,
    errorMessage: messageForFailureCategory(failureCategory),
    failureCategory,
  };
}

/**
 * The human-readable message for a failure category — shared between the
 * live check and the crawl-reuse path so a reused 403/429 reads exactly
 * like the one a fresh request would have produced.
 */
function messageForFailureCategory(category: BrokenLinkFailureCategory): string | null {
  if (category === "forbidden") {
    return "Crawler blocked — the server refused automated requests. This often does NOT mean the page is broken for real visitors; check it manually before treating this as a genuine issue.";
  }
  if (category === "rate_limited") {
    return "Rate limited by server — the server is throttling automated requests, not necessarily reporting a real error. Re-run the audit later if this persists.";
  }
  return null;
}

function categorizeStatusCode(statusCode: number): BrokenLinkFailureCategory {
  if (statusCode === 404 || statusCode === 410) return "not_found";
  if (statusCode === 429) return "rate_limited";
  if (statusCode === 401 || statusCode === 403) return "forbidden";
  if (statusCode >= 500) return "server_error";
  if (statusCode >= 400) return "client_error";
  return "other";
}

function categorizeNetworkError(err: unknown): { category: BrokenLinkFailureCategory; message: string } {
  if (err instanceof Error && err.name === "AbortError") {
    return { category: "timeout", message: "Request timed out after retries — the server is not responding." };
  }

  // Node's fetch (undici) surfaces DNS/connection failures as a TypeError
  // with a `.cause.code` like ENOTFOUND / EAI_AGAIN.
  const cause = err instanceof Error ? (err as Error & { cause?: { code?: string } }).cause : undefined;
  const code = cause?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { category: "dns_error", message: "Could not resolve the domain (DNS lookup failed)." };
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT") {
    return { category: "network_error", message: describeNetworkError(err) };
  }

  // Any other thrown fetch error (protocol error, TLS failure, etc.) —
  // genuinely a network-level failure, not a generic "other" bucket.
  return { category: "network_error", message: describeNetworkError(err) };
}
