/**
 * Minimal robots.txt support.
 *
 * LIMITATIONS (known, acceptable for MVP — revisit if a real site trips these up):
 *  - Crawl blocking only honours rules under `User-agent: *`. We do not match
 *    our specific bot UA string against a named block, since most small
 *    business sites (our actual target sites) don't write bot-specific rules.
 *    (The report-side audit info DOES parse every block, so the client can see
 *    all directives — crawl behaviour just follows the wildcard block.)
 *  - Disallow matching is a simple prefix match. No wildcard (*) or end-anchor
 *    ($) support. Good enough for the vast majority of real robots.txt files,
 *    which mostly disallow simple path prefixes like /admin or /wp-admin.
 *  - Crawl-delay is not enforced. A `Sitemap:` declaration is captured for the
 *    report (see fetchRobotsAuditInfo) but not used for crawling — the crawler
 *    fetches sitemap.xml directly instead (see sitemap.ts).
 */

export interface RobotsRules {
  disallowedPaths: string[];
}

const EMPTY_RULES: RobotsRules = { disallowedPaths: [] };

/** One parsed `User-agent:` block: the rules that apply to that bot. */
export interface RobotsDirectiveBlock {
  userAgent: string;
  allows: string[];
  disallows: string[];
}

export interface RobotsAuditInfo {
  status: "found" | "not_found" | "fetch_error";
  disallowedPaths: string[];
  /** HTTP status returned when the file was fetched (factual, when reachable). */
  httpStatus?: number;
  /** Value of a `Sitemap:` line, if the file declares one. */
  sitemapDirective?: string | null;
  /** Per-bot rules as written in the file (capped to keep the audit JSON small). */
  directives?: RobotsDirectiveBlock[];
}

const MAX_STORED_DIRECTIVE_BLOCKS = 20;

/**
 * Fetches robots.txt ONCE per hostname and derives both what the crawl
 * needs (RobotsRules — which paths to skip) and what the report needs
 * (RobotsAuditInfo — status, directives, sitemap declaration) from the
 * single response. crawlSite previously fetched robots.txt twice (once for
 * crawl behavior, once for the report section) — this removes the
 * duplicate request and the duplicate parse.
 */
// Browser-like User-Agent used for retries when the default bot UA gets 403'd by WAF/bot-protection.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchRobotsOnce(
  origin: string,
  userAgent: string,
  timeoutMs = 5000
): Promise<{ rules: RobotsRules; audit: RobotsAuditInfo; rawText: string | null }> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(new URL("/robots.txt", origin).toString(), {
      cache: "no-store",
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
    });
    if (!res.ok) {
      // 403/401 on robots.txt is often WAF/bot-protection blocking the crawler UA,
      // not a real missing file. Retry once with a browser-like User-Agent.
      if (res.status === 401 || res.status === 403) {
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs);
        try {
          const retryRes = await fetch(new URL("/robots.txt", origin).toString(), {
            cache: "no-store",
            headers: { "User-Agent": BROWSER_UA },
            signal: retryController.signal,
          });
          if (retryRes.ok) {
            const retryText = await retryRes.text();
            const { blocks: retryBlocks, sitemapDirective: retrySitemap } = parseRobotsTxtDetailed(retryText);
            const retryDisallowed = retryBlocks
              .filter((b) => b.userAgent === "*")
              .flatMap((b) => b.disallows)
              .filter((v) => v);
            return {
              rules: { disallowedPaths: retryDisallowed },
              audit: {
                status: "found",
                disallowedPaths: retryDisallowed,
                httpStatus: retryRes.status,
                sitemapDirective: retrySitemap,
                directives: retryBlocks.slice(0, MAX_STORED_DIRECTIVE_BLOCKS),
              },
              rawText: retryText,
            };
          }
        } finally {
          clearTimeout(retryTimeout);
        }
      }
      // No robots.txt = everything allowed. The audit distinguishes
      // not_found (server answered, no file) from fetch_error (couldn't
      // reach it at all).
      return {
        rules: EMPTY_RULES,
        audit: { status: "not_found", disallowedPaths: [], httpStatus: res.status },
        rawText: null,
      };
    }
    const text = await res.text();
    const { blocks, sitemapDirective } = parseRobotsTxtDetailed(text);
    const disallowedPaths = blocks
      .filter((b) => b.userAgent === "*")
      .flatMap((b) => b.disallows)
      .filter((v) => v);
    return {
      rules: { disallowedPaths },
      audit: {
        status: "found",
        disallowedPaths,
        httpStatus: res.status,
        sitemapDirective,
        directives: blocks.slice(0, MAX_STORED_DIRECTIVE_BLOCKS),
      },
      rawText: text,
    };
  } catch {
    // Network error or timeout — fail open (allow crawling) rather than
    // fail closed, since a missing/broken robots.txt is common and
    // shouldn't block an otherwise-valid audit. The audit still gets a
    // distinct fetch_error so the report can be honest that we couldn't
    // check, rather than implying the site has no robots.txt.
    return { rules: EMPTY_RULES, audit: { status: "fetch_error", disallowedPaths: [] }, rawText: null };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function fetchRobotsRules(
  origin: string,
  userAgent: string,
  timeoutMs = 5000
): Promise<RobotsRules> {
  return (await fetchRobotsOnce(origin, userAgent, timeoutMs)).rules;
}

export async function fetchRobotsAuditInfo(
  origin: string,
  userAgent: string,
  timeoutMs = 5000
): Promise<RobotsAuditInfo> {
  return (await fetchRobotsOnce(origin, userAgent, timeoutMs)).audit;
}

/**
 * Full parse: every `User-agent:` block (with its allow/disallow rules) plus
 * any `Sitemap:` declaration. Comments and empty values are dropped.
 */
export function parseRobotsTxtDetailed(text: string): {
  blocks: RobotsDirectiveBlock[];
  sitemapDirective: string | null;
} {
  const blocks: RobotsDirectiveBlock[] = [];
  let sitemapDirective: string | null = null;
  let current: RobotsDirectiveBlock | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim(); // strip comments
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      current = { userAgent: value, allows: [], disallows: [] };
      blocks.push(current);
      continue;
    }
    if (key === "sitemap") {
      if (value) sitemapDirective = value;
      continue;
    }
    if (!current) continue; // rule before any user-agent block — ignore
    if (key === "allow" && value) current.allows.push(value);
    if (key === "disallow" && value) current.disallows.push(value);
  }

  return { blocks, sitemapDirective };
}

export function parseRobotsTxt(text: string): RobotsRules {
  const { blocks } = parseRobotsTxtDetailed(text);
  return {
    // All wildcard blocks' disallows, matching the original parser's behavior
    // of honoring every disallow while any `User-agent: *` block was active.
    disallowedPaths: blocks
      .filter((b) => b.userAgent === "*")
      .flatMap((b) => b.disallows)
      .filter((v) => v),
  };
}

export function isPathAllowed(pathname: string, rules: RobotsRules): boolean {
  return !rules.disallowedPaths.some((disallowed) => pathname.startsWith(disallowed));
}
