import type { RunAuditResult } from "./types";

/**
 * Canonical crawl-scope counts — the ONE source of truth for every page
 * count in the report. Sections previously computed their own variants of
 * these numbers (dashboard, audit scope, response-code breakdown, sitemap),
 * which drifted apart and made the report look internally inconsistent.
 *
 * Two definitions, used everywhere, deliberately:
 *
 *   urlsCrawled  — the RAW crawl count: every URL the crawler attempted,
 *                  including non-HTML responses, redirects, and pages that
 *                  failed before returning content. This is "pages crawled".
 *   pagesAnalyzed — substantive HTML pages: successfully fetched pages used
 *                  for content, metadata, and AI-readiness analysis. This
 *                  is "pages analyzed" (always <= urlsCrawled).
 *
 * Both PDF and web render from this helper so the two numbers can never
 * disagree between surfaces.
 */
export interface CrawlScopeCounts {
  urlsCrawled: number;
  pagesAnalyzed: number;
  /**
   * Why the crawl stopped (crawl_complete / max_pages_reached /
   * crawl_cancelled) — see CrawlTerminationReason.
   */
  terminationReason: string;
  /**
   * Post-crawl sanity check: when almost nothing was crawled but the site
   * showed signals of containing more pages (internal links, sitemap URLs,
   * robots-blocked URLs, failed fetches), the crawl is flagged as
   * potentially incomplete instead of being presented as a normal
   * successful audit. `reasons` states the evidence.
   */
  lowCoverage: { detected: boolean; reasons: string[] };
}

export function getCrawlScopeCounts(audit: RunAuditResult): CrawlScopeCounts {
  const crawl = audit.crawl;
  return {
    urlsCrawled: crawl.pages.length,
    pagesAnalyzed: crawl.pages.filter((p) => p.ok).length,
    terminationReason: crawl.terminationReason ?? "crawl_complete",
    lowCoverage: crawl.lowCoverage ?? { detected: false, reasons: [] },
  };
}
