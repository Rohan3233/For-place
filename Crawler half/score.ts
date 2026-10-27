import type {
  CrawlSiteResult,
  BrokenLinkResult,
  OversizedImageResult,
  CoreWebVitalsAggregate,
  AuditScore,
  AuditScoreBreakdown,
} from "./types";
import { genuineBrokenLinks } from "./brokenLinkClassification";

interface FlagWeight {
  base: number;
  perInstance: number;
  instanceCap: number;
}

// Per-flag impact weights — unchanged in spirit from before: a base "this
// issue exists at all" cost, plus a small per-instance cost that's capped
// so one repeated flag can't dominate its whole category.
const FLAG_WEIGHTS: Record<string, FlagWeight> = {
  noindex_meta_tag: { base: 20, perInstance: 1, instanceCap: 15 },
  noindex_x_robots_tag: { base: 20, perInstance: 1, instanceCap: 15 },
  missing_title: { base: 15, perInstance: 0.5, instanceCap: 10 },
  missing_h1: { base: 6, perInstance: 0.3, instanceCap: 6 },
  missing_meta_description: { base: 4, perInstance: 0.15, instanceCap: 6 },
  meta_description_length_out_of_range: { base: 1, perInstance: 0.15, instanceCap: 4 },
  title_length_out_of_range: { base: 1, perInstance: 0.2, instanceCap: 4 },
  multiple_h1: { base: 2, perInstance: 0.2, instanceCap: 4 },
  missing_canonical: { base: 2, perInstance: 0.1, instanceCap: 4 },
  canonical_mismatch: { base: 3, perInstance: 0.2, instanceCap: 5 },
  thin_content: { base: 3, perInstance: 0.2, instanceCap: 6 },
  no_internal_links: { base: 2, perInstance: 0.2, instanceCap: 4 },
  missing_schema_markup: { base: 2, perInstance: 0.05, instanceCap: 4 },
  invalid_schema_markup: { base: 2, perInstance: 0.1, instanceCap: 4 },
  orphan_page: { base: 3, perInstance: 0.3, instanceCap: 6 },
  soft_404: { base: 5, perInstance: 1, instanceCap: 10 },
  missing_alt_text: { base: 0, perInstance: 0.1, instanceCap: 5 },
  missing_h2: { base: 0, perInstance: 0.1, instanceCap: 3 },
  missing_image_dimensions: { base: 0, perInstance: 0.05, instanceCap: 3 },
  url_too_long: { base: 0, perInstance: 0.1, instanceCap: 3 },
  url_has_uppercase: { base: 0, perInstance: 0.05, instanceCap: 2 },
  url_has_underscores: { base: 0, perInstance: 0.05, instanceCap: 2 },
  url_has_parameters: { base: 0, perInstance: 0.05, instanceCap: 2 },
  url_poor_readability: { base: 0, perInstance: 0.1, instanceCap: 3 },
  url_has_encoded_characters: { base: 0, perInstance: 0.05, instanceCap: 2 },
  url_has_tracking_parameters: { base: 0, perInstance: 0.05, instanceCap: 2 },
  url_uses_image_proxy: { base: 1, perInstance: 0.1, instanceCap: 3 },
  url_too_deep: { base: 0, perInstance: 0.05, instanceCap: 2 },
  url_has_file_extension: { base: 0, perInstance: 0.05, instanceCap: 2 },
  missing_lazy_loading: { base: 0, perInstance: 0.05, instanceCap: 2 },
  missing_responsive_images: { base: 0, perInstance: 0.05, instanceCap: 2 },
  poor_image_filenames: { base: 0, perInstance: 0.03, instanceCap: 2 },
  duplicate_alt_text: { base: 0, perInstance: 0.05, instanceCap: 2 },
};

// Site-wide penalty weights.  These were originally calibrated for the
// old 5-category model where each site-wide penalty lived in its own
// independent 0-100 category.  After the three-pillar restructuring,
// broken links, oversized images, redirects, crawl errors, and www
// consistency all contribute to a single Technical SEO pillar.  The
// weights are therefore proportionally reduced so that even the
// theoretical worst-case stack (all site-wide penalties + CWV) cannot
// exceed 100 and floor the Technical score to 0.
const SITE_WIDE = {
  brokenLink: { base: 5, perInstance: 1, instanceCap: 10 } as FlagWeight,
  oversizedImage: { base: 0, perInstance: 0.15, instanceCap: 5 } as FlagWeight,
  duplicateTitleGroup: { base: 3, perInstance: 1, instanceCap: 8 } as FlagWeight,
  duplicateDescGroup: { base: 2, perInstance: 0.5, instanceCap: 6 } as FlagWeight,
  excessiveRedirect: { base: 1, perInstance: 1, instanceCap: 4 } as FlagWeight,
  crawlErrorPage: { base: 4, perInstance: 1, instanceCap: 10 } as FlagWeight,
  wwwInconsistentBase: 3,
};

const MAX_PERFORMANCE_PENALTY = 20;

function weightedPenalty(count: number, weight: FlagWeight): number {
  if (count <= 0) return 0;
  return weight.base + Math.min(count * weight.perInstance, weight.instanceCap);
}


// ---------------------------------------------------------------------
// THREE-PILLAR CATEGORY GROUPING
//
// Every audit finding belongs to exactly ONE primary pillar per the
// enterprise audit specification:
//
// Pillar A — ON-PAGE SEO: Content/page-level optimization
//   Title tags, meta descriptions, headings, word count, thin content,
//   internal links, orphan pages, image alt text, image filenames.
//
// Pillar B — TECHNICAL SEO: Crawl/indexation/performance infrastructure
//   Canonicals, noindex, robots, sitemaps, broken links, redirects,
//   URL structure, Core Web Vitals, crawl errors, www consistency.
//
// Pillar C — AI SEARCH READINESS (AEO/GEO): Machine readability
//   JSON-LD schema coverage, structured data validity, entity
//   consistency, information retrieval structure.
//
// No finding appears in multiple pillars. Each pillar is independently
// bounded 0-100. The overall score is a weighted average.
// ---------------------------------------------------------------------

// Pillar A — On-Page SEO
const ON_PAGE_FLAGS = new Set([
  // Title tags
  "missing_title",
  "title_length_out_of_range",
  // Meta descriptions
  "missing_meta_description",
  "meta_description_length_out_of_range",
  // Headings
  "missing_h1",
  "multiple_h1",
  "missing_h2",
  // Content
  "thin_content",
  "no_internal_links",
  "orphan_page",
  // Image SEO (content-level, not infrastructure)
  "missing_alt_text",
  "duplicate_alt_text",
  "missing_image_dimensions",
  "non_optimized_image_format",
  "missing_lazy_loading",
  "missing_responsive_images",
  "poor_image_filenames",
]);

// Pillar B — Technical SEO
const TECHNICAL_FLAGS = new Set([
  // Canonicalization
  "missing_canonical",
  "canonical_mismatch",
  // Indexation directives
  "noindex_meta_tag",
  "noindex_x_robots_tag",
  // URL structure
  "url_too_long",
  "url_has_uppercase",
  "url_has_underscores",
  "url_has_parameters",
  "url_poor_readability",
  "url_has_encoded_characters",
  "url_has_tracking_parameters",
  "url_uses_image_proxy",
  "url_too_deep",
  "url_has_file_extension",
]);

// Pillar C — AI Search Readiness (AEO/GEO)
const AI_SEARCH_FLAGS = new Set([
  // Structured data
  "missing_schema_markup",
  "invalid_schema_markup",
]);

// Three-pillar weights — deliberately balanced so no single pillar can
// dominate, but Technical SEO carries slightly more weight because it
// directly governs indexability and crawlability (prerequisites for
// everything else).
const PILLAR_WEIGHTS = {
  onPage: 0.35,
  technical: 0.40,
  aiSearchReadiness: 0.25,
} as const;

function penaltyForFlagSet(pages: CrawlSiteResult["pages"], flagSet: Set<string>): number {
  const counts = new Map<string, number>();
  const totalPages = pages.filter((p) => p.ok).length;
  for (const page of pages) {
    if (!page.ok) continue;
    for (const flag of page.flags) {
      if (!flagSet.has(flag)) continue;
      counts.set(flag, (counts.get(flag) ?? 0) + 1);
    }
  }
  let penalty = 0;
  for (const [flag, count] of counts) {
    const weight = FLAG_WEIGHTS[flag];
    if (!weight) continue;
    // Normalize per-instance cost by site size: a flag firing on ALL
    // pages of any site contributes `perInstance` (one unit), not
    // `count × perInstance`. On a 10-page site with url_has_parameters
    // on all pages: cost = 10/10 × 0.05 = 0.05 (perInstance, uncapped).
    // On a 347-page site with the same: 347/347 × 0.05 = 0.05.
    // Without normalization, 347 × 0.05 = 17.35 → capped at instanceCap(2).
    // The instanceCap now serves its intended purpose: bounding a SINGLE
    // flag's contribution, not being a floor hit by every widespread flag.
    const normalizedCost = totalPages > 0
      ? (count / totalPages) * weight.perInstance
      : count * weight.perInstance;
    penalty += weight.base + Math.min(normalizedCost, weight.instanceCap);
  }
  return penalty;
}

export interface CategoryScores {
  onPage: number;
  technical: number;
  aiSearchReadiness: number;
  /** @deprecated Use pillar scores above. Kept for backward compatibility. */
  metadata: number;
  /** @deprecated Use pillar scores above. Kept for backward compatibility. */
  content: number;
  /** @deprecated Use pillar scores above. Kept for backward compatibility. */
  brokenLinks: number;
  /** @deprecated Use pillar scores above. Kept for backward compatibility. */
  performance: number;
}

/**
 * Computes each PILLAR score independently, 0-100, floored at 0.
 *
 * Three pillars:
 *   On-Page SEO (0.35 weight): titles, descriptions, headings, content,
 *   images.
 *   Technical SEO (0.40 weight): canonicals, noindex, URLs, broken links,
 *   redirects, CWV, crawl errors.
 *   AI Search Readiness (0.25 weight): schema coverage, structured data
 *   validity.
 *
 * Exported so categoryScores.ts (the report's bar chart) uses the EXACT
 * same numbers as computeOverallScore below.
 *
 * NOTE: the deprecated metadata/content/brokenLinks/performance fields
 * are computed for backward compatibility with cached reports.
 */
export function computeCategoryScores(
  crawl: CrawlSiteResult,
  brokenLinks: BrokenLinkResult[],
  oversizedImages: OversizedImageResult[],
  cwv: CoreWebVitalsAggregate,
  aeoScore?: number | null
): CategoryScores {
  const crawlErrorPageCount = crawl.pages.filter((p) => !p.ok).length;
  const excessiveRedirectsCount = crawl.redirectChains.filter((r) => r.excessive).length;
  const brokenLinksCount = genuineBrokenLinks(brokenLinks).length;
  const oversizedImagesCount = oversizedImages.filter((img) => img.isOversized).length;

  // --- Pillar A: On-Page SEO ---
  // Titles, descriptions, headings, content, images
  const onPagePenalty =
    penaltyForFlagSet(crawl.pages, ON_PAGE_FLAGS) +
    weightedPenalty(crawl.duplicateTitles.length, SITE_WIDE.duplicateTitleGroup) +
    weightedPenalty(crawl.duplicateMetaDescriptions.length, SITE_WIDE.duplicateDescGroup);

  // --- Pillar B: Technical SEO ---
  // Canonicals, noindex, URLs, broken links, redirects, CWV, crawl errors
  const technicalPenalty =
    penaltyForFlagSet(crawl.pages, TECHNICAL_FLAGS) +
    weightedPenalty(brokenLinksCount, SITE_WIDE.brokenLink) +
    weightedPenalty(oversizedImagesCount, SITE_WIDE.oversizedImage) +
    weightedPenalty(excessiveRedirectsCount, SITE_WIDE.excessiveRedirect) +
    weightedPenalty(crawlErrorPageCount, SITE_WIDE.crawlErrorPage) +
    (crawl.wwwConsistency && !crawl.wwwConsistency.consistent ? SITE_WIDE.wwwInconsistentBase : 0);

  // Core Web Vitals: the share of evaluated pages passing. Insufficient
  // data (cwv.score === null) means "could not be evaluated" — never
  // penalized, never faked as 0 or 100.
  //
  // The CWV multiplier is deliberately low (0.35) because CWV is one of
  // many factors in the Technical pillar.  At 0.5, CWV alone could
  // contribute up to 50 penalty points, which combined with broken links
  // and crawl errors caused the Technical score to floor at 0 for
  // otherwise reasonable sites.
  const cwvPenalty = cwv.score !== null ? (100 - cwv.score) : 0;
  const technicalWithCwv = technicalPenalty + cwvPenalty * 0.35;

  // --- Pillar C: AI Search Readiness ---
  // Schema coverage + structured data validity + AEO readiness score
  const schemaPenalty = penaltyForFlagSet(crawl.pages, AI_SEARCH_FLAGS);
  // When AEO score is available, blend schema detection with AEO
  // readiness (which includes entity consistency, content structure, etc.)
  const aeoComponent = aeoScore != null ? (100 - aeoScore) : schemaPenalty;
  const aiSearchPenalty = (schemaPenalty + aeoComponent) / 2;

  // --- Deprecated backward-compatible fields ---
  const metadataPenalty = penaltyForFlagSet(crawl.pages, new Set([
    "missing_title", "title_length_out_of_range",
    "missing_meta_description", "meta_description_length_out_of_range",
  ])) +
    weightedPenalty(crawl.duplicateTitles.length, SITE_WIDE.duplicateTitleGroup) +
    weightedPenalty(crawl.duplicateMetaDescriptions.length, SITE_WIDE.duplicateDescGroup);
  const contentPenalty = penaltyForFlagSet(crawl.pages, new Set([
    "thin_content", "no_internal_links", "missing_h2",
    "missing_h1", "multiple_h1", "orphan_page",
  ]));
  const brokenLinksPenalty = weightedPenalty(brokenLinksCount, SITE_WIDE.brokenLink);
  const performanceScore = cwv.score ?? 100;

  return {
    // Three-pillar scores
    onPage: Math.max(0, 100 - onPagePenalty),
    technical: Math.max(0, 100 - technicalWithCwv),
    aiSearchReadiness: Math.max(0, 100 - aiSearchPenalty),
    // Deprecated backward-compatible fields
    metadata: Math.max(0, 100 - metadataPenalty),
    content: Math.max(0, 100 - contentPenalty),
    brokenLinks: Math.max(0, 100 - brokenLinksPenalty),
    performance: performanceScore,
  };
}

const CRITICAL_FLAGS = new Set(["missing_title", "missing_h1", "noindex_meta_tag", "noindex_x_robots_tag"]);
const MODERATE_FLAGS = new Set([
  "missing_meta_description", "meta_description_length_out_of_range", "multiple_h1",
  "missing_canonical", "canonical_mismatch", "title_length_out_of_range", "thin_content",
  "no_internal_links", "missing_schema_markup", "invalid_schema_markup", "orphan_page",
]);

export function computeOverallScore(
  crawl: CrawlSiteResult,
  brokenLinks: BrokenLinkResult[],
  oversizedImages: OversizedImageResult[],
  cwv: CoreWebVitalsAggregate,
  aeoScore?: number | null
): AuditScore {
  // Informational breakdown only (counts shown in the report's stat
  // cards) — does NOT drive the score math below.
  let criticalIssuesCount = 0;
  let moderateIssuesCount = 0;
  let minorIssuesCount = 0;
  let pagesWithNoindex = 0;
  let okPageCount = 0;

  for (const page of crawl.pages) {
    if (!page.ok) continue;
    okPageCount++;
    let pageHasNoindex = false;
    for (const flag of page.flags) {
      if (CRITICAL_FLAGS.has(flag)) criticalIssuesCount++;
      else if (MODERATE_FLAGS.has(flag)) moderateIssuesCount++;
      else if (FLAG_WEIGHTS[flag]) minorIssuesCount++;
      if (flag === "noindex_meta_tag" || flag === "noindex_x_robots_tag") pageHasNoindex = true;
    }
    if (pageHasNoindex) pagesWithNoindex++;
  }

  const crawlErrorPageCount = crawl.pages.filter((p) => !p.ok).length;
  criticalIssuesCount += crawlErrorPageCount;
  moderateIssuesCount += crawl.duplicateTitles.length + crawl.duplicateMetaDescriptions.length;
  moderateIssuesCount += crawl.redirectChains.filter((r) => r.excessive).length;

  const brokenLinksCount = genuineBrokenLinks(brokenLinks).length;
  const oversizedImagesCount = oversizedImages.filter((img) => img.isOversized).length;

  const categories = computeCategoryScores(crawl, brokenLinks, oversizedImages, cwv, aeoScore);

  // Three-pillar weighted average
  let overallScore =
    categories.onPage * PILLAR_WEIGHTS.onPage +
    categories.technical * PILLAR_WEIGHTS.technical +
    categories.aiSearchReadiness * PILLAR_WEIGHTS.aiSearchReadiness;

  // A noindexed page is invisible to search no matter how clean
  // everything else is. If MOST of the site is noindexed, that's a
  // fundamental, site-breaking problem — cap the score hard rather than
  // let four otherwise-fine categories dilute it away.
  if (okPageCount > 0 && pagesWithNoindex / okPageCount > 0.5) {
    overallScore = Math.min(overallScore, 25);
  }

  overallScore = Math.max(0, Math.min(100, overallScore));

  const performancePenalty =
    cwv.score !== null
      ? Math.round(((100 - cwv.score) / 100) * MAX_PERFORMANCE_PENALTY)
      : 0;

  const breakdown: AuditScoreBreakdown = {
    criticalIssuesCount,
    moderateIssuesCount,
    minorIssuesCount,
    brokenLinksCount,
    oversizedImagesCount,
    performancePenalty,
  };

  return { overallScore: Math.round(overallScore), breakdown };
}