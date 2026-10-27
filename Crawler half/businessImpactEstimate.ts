import type { RunAuditResult } from "./types";
import { genuineBrokenLinks, countBrokenLinkSourcePages } from "./brokenLinkClassification";

/**
 * Turns technical findings into plain-English "why this matters to the
 * business" statements for non-technical stakeholders.
 *
 * HARD RULES this module follows:
 *  - NEVER invents a revenue or dollar figure. This audit has no traffic
 *    or conversion data for the site being scanned, so it has no basis
 *    to say "you'll gain $X" — and doesn't.
 *  - Every claim is either (a) a named, cited piece of external research,
 *    presented as a benchmark/finding attributed to its source — never
 *    as this codebase's own claim or as a fact about the specific site
 *    being audited — or (b) a fact computed directly from this audit's
 *    own data (e.g. "X of Y pages are noindexed"), which needs no
 *    external citation because it isn't a statistical claim at all.
 *  - Wording stays in evidence-backed, non-committal language: "can
 *    increase," "may reduce," "may limit" — never "will" or a promised
 *    outcome.
 */

// ---------------------------------------------------------------------
// Page-speed -> bounce-rate risk (cited external research)
// ---------------------------------------------------------------------
//
// Source: Google/SOASTA Research, "The Need for Mobile Speed" (2017),
// on bounce probability vs. page load time, baseline ~1s:
//   1s -> 3s load time: +32% bounce probability
//   1s -> 5s load time: +90%
//   1s -> 6s load time: +106%
//   1s -> 10s load time: +123%
//
// LCP (Largest Contentful Paint) is used here as the load-time proxy,
// since that's the timing signal this audit actually collects — not the
// exact "page load time" metric the original study measured. The output
// text says so explicitly, and always attributes the number to the study
// by name, never presents it as this tool's own finding or as a fact
// about the audited site's real bounce rate.

export const BOUNCE_RESEARCH_CITATION = 'Google/SOASTA Research, "The Need for Mobile Speed" (2017)';

export interface BounceRiskEstimate {
  lcpSeconds: number;
  bounceIncreasePercent: number; // rounded, relative to a ~1s baseline
  capped: boolean; // true if LCP exceeded the top of the studied range (10s+)
}

const BOUNCE_CURVE: { seconds: number; increasePercent: number }[] = [
  { seconds: 1, increasePercent: 0 },
  { seconds: 3, increasePercent: 32 },
  { seconds: 5, increasePercent: 90 },
  { seconds: 6, increasePercent: 106 },
  { seconds: 10, increasePercent: 123 },
];

/** Linear interpolation across the cited data points — deliberately not
 * extrapolated past 10s (returns a capped result instead of guessing). */
export function estimateBounceRateIncrease(lcpMs: number | null): BounceRiskEstimate | null {
  if (lcpMs === null || lcpMs <= 0) return null;
  const seconds = lcpMs / 1000;

  if (seconds <= 1) return { lcpSeconds: seconds, bounceIncreasePercent: 0, capped: false };
  if (seconds >= 10) return { lcpSeconds: seconds, bounceIncreasePercent: 123, capped: true };

  for (let i = 0; i < BOUNCE_CURVE.length - 1; i++) {
    const a = BOUNCE_CURVE[i];
    const b = BOUNCE_CURVE[i + 1];
    if (seconds >= a.seconds && seconds <= b.seconds) {
      const t = (seconds - a.seconds) / (b.seconds - a.seconds);
      const pct = a.increasePercent + t * (b.increasePercent - a.increasePercent);
      return { lcpSeconds: seconds, bounceIncreasePercent: Math.round(pct), capped: false };
    }
  }
  return null;
}

/**
 * Client-facing sentence for the report. Returns null below a ~20%
 * threshold — a small, unremarkable delta isn't worth a dedicated
 * callout and would just dilute the ones that matter.
 *
 * Wording is deliberately evidence-backed and non-committal ("can
 * increase"), and the source is named inline rather than left as a
 * vague "research shows."
 */
export function buildTrafficRiskStatement(lcpMs: number | null): string | null {
  const estimate = estimateBounceRateIncrease(lcpMs);
  if (!estimate || estimate.bounceIncreasePercent < 20) return null;

  const lcpLabel = `${estimate.lcpSeconds.toFixed(1)}s`;
  const capSuffix = estimate.capped ? "+" : "";

  return (
    `The homepage's Largest Contentful Paint (LCP) is ${lcpLabel} based on a PageSpeed Insights mobile test. ` +
    `According to ${BOUNCE_RESEARCH_CITATION}, mobile bounce rates ` +
    `can increase by roughly ${estimate.bounceIncreasePercent}%${capSuffix} at comparable load times, relative to a ~1-second baseline. ` +
    `This is a cited industry benchmark, not a measurement of this site's actual traffic or conversions — ` +
    `treat it as directional evidence for why the performance fixes below are worth prioritizing, not a projected outcome.`
  );
}

// ---------------------------------------------------------------------
// Indexability -> organic visibility risk (computed directly from this audit's data — no external citation needed)
// ---------------------------------------------------------------------

export function buildIndexabilityRiskStatement(totalPages: number, noindexedPages: number): string | null {
  if (totalPages === 0 || noindexedPages === 0) return null;
  const pct = Math.round((noindexedPages / totalPages) * 100);
  if (pct < 5) return null;

  return (
    `${noindexedPages} of ${totalPages} crawled pages (${pct}%) are currently blocked from search indexing. ` +
    `Pages that can't be indexed may limit organic visibility for whatever those pages would otherwise rank for — ` +
    `this is a direct count from this audit, not an estimate, and is independent of any ranking or content ` +
    `improvements covered elsewhere in this report.`
  );
}

// ---------------------------------------------------------------------
// Broken links -> conversion risk (computed directly from this audit's data — no external citation needed)
// ---------------------------------------------------------------------

export function buildBrokenLinksRiskStatement(brokenLinksCount: number, totalPages: number): string | null {
  if (brokenLinksCount === 0) return null;

  return (
    `${brokenLinksCount} broken link ${brokenLinksCount === 1 ? "instance" : "instances"} ${brokenLinksCount === 1 ? "was" : "were"} found ` +
    `across ${totalPages} ${totalPages === 1 ? "page" : "pages"} of the crawl — a page can carry more than one broken ` +
    `link, so this counts link instances, not affected pages. A broken link interrupts a visitor's path through ` +
    `the site, which may reduce conversions for whatever action that page was meant to lead toward — this count is ` +
    `directly from this audit, not an estimate.`
  );
}

// ---------------------------------------------------------------------
// Combined summary — one call, every applicable statement, report-ready
// ---------------------------------------------------------------------

export interface BusinessImpactStatement {
  key: string;
  label: string;
  text: string;
  /** true = derived from a named, external, published source (cited inline in `text`).
   *  false = a direct, exact fact computed from this specific audit's own data. */
  isResearchDerived: boolean;
  /** Present only when isResearchDerived is true — lets the UI render an
   * explicit source line separately from the sentence itself, if desired. */
  citation?: string;
}

/**
 * Gathers every applicable business-impact statement for one audit.
 * Order is deliberate: page speed first (usually the biggest, most
 * universally-understood lever), then visibility, then broken links.
 */
export function buildBusinessImpactSummary(audit: RunAuditResult): BusinessImpactStatement[] {
  const statements: BusinessImpactStatement[] = [];

  if (audit.pageSpeed.ok) {
    const trafficRisk = buildTrafficRiskStatement(audit.pageSpeed.metrics.lcpMs);
    if (trafficRisk) {
      statements.push({
        key: "lcp_bounce_risk",
        label: "Page Speed Risk",
        text: trafficRisk,
        isResearchDerived: true,
        citation: BOUNCE_RESEARCH_CITATION,
      });
    }
  }

  const okPages = audit.crawl.pages.filter((p) => p.ok);
  const noindexedCount = okPages.filter(
    (p) => p.flags.includes("noindex_meta_tag") || p.flags.includes("noindex_x_robots_tag")
  ).length;
  const indexRisk = buildIndexabilityRiskStatement(okPages.length, noindexedCount);
  if (indexRisk) {
    statements.push({ key: "indexability_risk", label: "Organic Visibility Risk", text: indexRisk, isResearchDerived: false });
  }

  const brokenLinks = genuineBrokenLinks(audit.brokenLinks);
  const brokenCount = brokenLinks.length;
  // Distinct pages actually carrying a broken link — NOT the total crawl
  // size, which would read as "3,013 broken links across 334 crawled pages"
  // and imply every page is affected.
  const brokenSourcePages = countBrokenLinkSourcePages(audit.brokenLinks);
  const brokenRisk = buildBrokenLinksRiskStatement(brokenCount, brokenSourcePages);
  if (brokenRisk) {
    statements.push({ key: "broken_links_risk", label: "Conversion Risk", text: brokenRisk, isResearchDerived: false });
  }

  return statements;
}
