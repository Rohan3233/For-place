/**
 * Splits link-check failures into three honest buckets:
 *
 *  - broken: the link is actually dead (404, 410, DNS failure, or any
 *    other client/server error that isn't one of the transient or
 *    blocked codes below). Rerunning the crawl won't change this.
 *  - temporary: the failure looks like a rate limit, timeout, or
 *    transient network/TLS hiccup — the kind of thing that commonly
 *    clears up on a re-crawl and shouldn't be reported with the same
 *    weight as a genuinely dead link.
 *  - blocked: the failure is the server REFUSING our automated checker
 *    (403 Forbidden, 401 Unauthorized, 429 Too Many Requests). This says
 *    nothing about whether the link works for a real visitor — it usually
 *    means a WAF, bot-protection rule, or rate limiter is in front of the
 *    site. These are NOT reported as broken links (they are not
 *    "confirmed failures"), they get their own lower-severity category.
 *
 * Deliberately conservative: anything not clearly matching a temporary or
 * blocked pattern is classified as broken, so this never *hides* a real
 * issue — it only pulls out the cases with strong, well-known signals.
 */

/**
 * Cloudflare email-obfuscation URLs (e.g. /cdn-cgi/l/email-protection)
 * are generated client-side by Cloudflare's obfuscation script. Crawlers
 * that don't execute the script get a 404, but real visitors and JS-
 * rendering search engines resolve them fine. These are NOT real broken
 * links and must never count toward broken-link totals or critical severity.
 */
const CLOUDFLARE_EMAIL_OBFUSCATION_PATH = /\/cdn-cgi\/l\//i;

export function isCloudflareEmailObfuscation(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return CLOUDFLARE_EMAIL_OBFUSCATION_PATH.test(pathname);
  } catch {
    return CLOUDFLARE_EMAIL_OBFUSCATION_PATH.test(url);
  }
}

const TEMPORARY_STATUS_CODES = new Set([408, 502, 503, 504]);
// NOTE: 429 is deliberately NOT in TEMPORARY_STATUS_CODES — a rate limit
// is the server refusing our checker, which is what the "blocked" bucket
// exists for (see isBlockedFromAutomatedChecking below).

const TEMPORARY_ERROR_PATTERNS = [
  /timed?\s?out/i,
  /timeout/i,
  /rate.?limit/i,
  /econnreset/i,
  /connection reset/i,
  /socket hang up/i,
  /ssl/i,
  /tls handshake/i,
  /epipe/i,
  /econnrefused/i, // connection actively refused can be transient (server restart, deploy) as often as it's permanent
];

// DNS failures are explicitly treated as genuinely broken, not temporary —
// a domain that doesn't resolve at all is a real problem, not a blip.
const PERMANENT_ERROR_PATTERNS = [/enotfound/i, /dns/i, /getaddrinfo/i, /name not resolved/i];

// "Crawler was refused" signals: the server answered (or throttled) our
// automated request rather than reporting the URL as genuinely dead.
// 401/403 map to the `forbidden` failure category, 429 to `rate_limited`.
const BLOCKED_STATUS_CODES = new Set([401, 403, 429]);
const BLOCKED_FAILURE_CATEGORIES = new Set(["forbidden", "rate_limited"]);

export interface ClassifiableLink {
  statusCode: number | null;
  errorMessage: string | null;
}

export function isTemporaryFailure(link: ClassifiableLink): boolean {
  if (link.errorMessage && PERMANENT_ERROR_PATTERNS.some((p) => p.test(link.errorMessage!))) {
    return false;
  }
  if (link.statusCode !== null && TEMPORARY_STATUS_CODES.has(link.statusCode)) {
    return true;
  }
  if (link.errorMessage && TEMPORARY_ERROR_PATTERNS.some((p) => p.test(link.errorMessage!))) {
    return true;
  }
  return false;
}

/** True when the failure is the server refusing our automated checker
 * (403/401 Forbidden-style responses, 429 rate limiting) rather than the
 * URL being genuinely dead. Always checked BEFORE isTemporaryFailure so a
 * 429 is classified as "blocked", never as "temporary". */
export function isBlockedFromAutomatedChecking(
  link: ClassifiableLink & { failureCategory?: string | null }
): boolean {
  if (link.failureCategory && BLOCKED_FAILURE_CATEGORIES.has(link.failureCategory)) {
    return true;
  }
  if (link.statusCode !== null && BLOCKED_STATUS_CODES.has(link.statusCode)) {
    return true;
  }
  return false;
}

export function splitBrokenLinks<T extends ClassifiableLink & { failureCategory?: string | null }>(
  links: T[]
): { broken: T[]; temporary: T[]; blocked: T[] } {
  const broken: T[] = [];
  const temporary: T[] = [];
  const blocked: T[] = [];
  for (const link of links) {
    if (isBlockedFromAutomatedChecking(link)) blocked.push(link);
    else if (isTemporaryFailure(link)) temporary.push(link);
    else broken.push(link);
  }
  return { broken, temporary, blocked };
}

/** A broken-link result as it appears on the audit: the classifiable
 * status/error fields plus the crawl metadata (ok, failureCategory,
 * linkedFrom). */
export interface BrokenLinkLike extends ClassifiableLink {
  url: string;
  ok: boolean;
  failureCategory: string | null;
  linkedFrom?: string[];
}

/**
 * THE canonical "genuinely broken" link set: links that actually failed
 * (ok === false), were actually checked (robots-blocked links were never
 * requested at all, so they can't be called broken), and are NOT the
 * transient kind (timeouts, TLS/network hiccups) and NOT the
 * crawler-blocked kind (403/429 — the server refused us, which says
 * nothing about whether the link works for a real visitor).
 *
 * Every surface that reports a broken-link COUNT — priority list, score,
 * category scores, AEO checks, business impact, CSV, and the dedicated
 * Broken Links section — must derive its number from this helper, so no
 * two sections can ever disagree again (the old bug: some surfaces
 * counted transient AND 403/429 failures too, producing e.g. 3,013 while
 * the Broken Links section correctly showed 3,012).
 */
export function genuineBrokenLinks<T extends BrokenLinkLike>(links: T[]): T[] {
  return splitBrokenLinks(
    links.filter((l) => !l.ok && l.failureCategory !== "blocked_by_robots" && !isCloudflareEmailObfuscation(l.url))
  ).broken;
}

/**
 * THE canonical "blocked from automated checking" link set: links the
 * server refused our checker (403/401/429). Kept separate from genuinely
 * broken links so a WAF or rate limiter in front of the site is never
 * reported as critical-severity confirmed failures. Shares the same
 * filtering conventions as genuineBrokenLinks (robots-blocked links were
 * never requested at all, so they stay out of both).
 */
export function blockedFromAutomatedChecking<T extends BrokenLinkLike>(links: T[]): T[] {
  return links.filter(
    (l) => !l.ok && l.failureCategory !== "blocked_by_robots" && !isCloudflareEmailObfuscation(l.url) && isBlockedFromAutomatedChecking(l)
  );
}

/** Number of DISTINCT pages that link to at least one genuinely broken
 * link — the honest "affected pages" figure that pairs with the instance
 * count, so a report can say "3,012 broken link instances across 284
 * pages" instead of ever implying 3,012 affected pages. */
export function countBrokenLinkSourcePages<T extends BrokenLinkLike>(links: T[]): number {
  const pages = new Set<string>();
  for (const link of genuineBrokenLinks(links)) {
    for (const source of link.linkedFrom ?? []) {
      if (source) pages.add(source);
    }
  }
  return pages.size;
}

/** One canonical phrasing for the broken-links scope, shared by the PDF
 * and web surfaces: "3,012 broken link instances across 284 pages". */
export function brokenLinkScopeLabel(instances: number, pages: number): string {
  if (instances === 0) return "No broken links found";
  const instanceWord = `${instances.toLocaleString("en-US")} broken link ${instances === 1 ? "instance" : "instances"}`;
  if (pages === 0) return instanceWord;
  return `${instanceWord} across ${pages.toLocaleString("en-US")} ${pages === 1 ? "page" : "pages"}`;
}
