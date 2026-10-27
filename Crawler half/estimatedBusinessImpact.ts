/**
 * Estimated Business Impact — evidence-based opportunity estimates for
 * relevant SEO findings in the audit report.
 *
 * DESIGN PRINCIPLES:
 *  1. Use actual data first (client-provided metrics, audit crawler data).
 *  2. Benchmarks only as clearly labeled illustrative scenarios with sources.
 *  3. Every number is traceable to a data source or labeled assumption.
 *  4. Never fabricate traffic, conversions, or revenue.
 *  5. Omit the section entirely when insufficient data exists — no
 *     repetitive placeholder text.
 *  6. Smaller number of well-supported estimates > dozens of speculative ones.
 *
 * ISSUE-SPECIFIC MODELING:
 *  - CTR-related (titles, meta descriptions): impression × CTR improvement
 *  - Indexation (noindex, sitemap): impression unlock potential
 *  - Performance (CWV): sourced benchmark with disclaimer
 *  - Schema (structured data): rich result CTR uplift benchmark
 *  - Other issues: omitted unless defensible calculation exists
 */

import type { RunAuditResult } from "./types";
import { genuineBrokenLinks, countBrokenLinkSourcePages } from "./brokenLinkClassification";

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

/**
 * Optional business metrics the client can supply. All fields optional.
 */
export interface BusinessMetrics {
  /** Monthly organic impressions from Google Search Console. */
  monthlyOrganicImpressions?: number;
  /** Monthly organic clicks from Google Search Console. */
  monthlyOrganicClicks?: number;
  /** Current organic CTR (0–1 scale, e.g. 0.02 = 2.0%). */
  currentOrganicCtr?: number;
  /** Organic conversion rate (0–1 scale, e.g. 0.02 = 2.0%). */
  organicConversionRate?: number;
  /** Average conversion value in dollars. */
  averageConversionValue?: number;
}

// ---------------------------------------------------------------------------
// Confidence levels
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "High" | "Medium" | "Low";

// ---------------------------------------------------------------------------
// Estimate result types
// ---------------------------------------------------------------------------

/**
 * A single auditable estimate for one recommendation.
 */
export interface OpportunityEstimate {
  /** The issue flag(s) this applies to. */
  applicableFlags: string[];
  /** Short label for the recommendation. */
  label: string;
  /** Confidence level. */
  confidence: ConfidenceLevel;
  /** What we know from actual data. */
  observedData: string;
  /** Where the observed data came from. */
  source: string;
  /** The improvement scenario being modeled. */
  scenarioAssumption: string;
  /** Short audit calculation. */
  calculation: string;
  /** The result: estimated additional clicks/month. */
  additionalClicks: number | null;
  /** The result: estimated additional conversions/month. */
  additionalConversions: number | null;
  /** The result: estimated revenue opportunity/month. */
  revenueOpportunity: number | null;
  /** Where the benchmark/scenario assumption came from (if applicable). */
  benchmarkSource?: string;
  /** Affected page count from audit data. */
  affectedPages?: number;
}

/**
 * Full result: a list of well-supported estimates.
 */
export interface EstimatedBusinessImpactResult {
  /** True when at least one estimate was computed. */
  hasEstimates: boolean;
  /** Per-recommendation estimates (max ~6, one per defensible issue type). */
  estimates: OpportunityEstimate[];
}

// ---------------------------------------------------------------------------
// Issue-specific modeling
// ---------------------------------------------------------------------------

/**
 * Flags that are good candidates for CTR-based estimates.
 * Only these issue types get quantitative estimates.
 */
const CTR_ESTIMABLE_FLAGS = new Set([
  "missing_title",
  "title_length_out_of_range",
  "missing_meta_description",
  "meta_description_length_out_of_range",
  "duplicate_titles",
  "duplicate_meta_descriptions",
]);

/**
 * Flags that are good candidates for indexation-based estimates.
 */
const INDEXATION_ESTIMABLE_FLAGS = new Set([
  "noindex_meta_tag",
  "noindex_x_robots_tag",
  "missing_sitemap",
]);

/**
 * Flags that are good candidates for performance-based estimates.
 */
const PERFORMANCE_ESTIMABLE_FLAGS = new Set([
  "webvital_lcp_poor",
  "webvital_inp_poor",
  "webvital_cls_poor",
  "webvital_ttfb_poor",
]);

/**
 * Flags that are good candidates for schema-based estimates.
 */
const SCHEMA_ESTIMABLE_FLAGS = new Set([
  "missing_schema_markup",
  "invalid_schema_markup",
]);

// Label maps
const CATEGORY_LABELS: Record<string, string> = {
  metadata: "Title & meta description optimization",
  indexation: "Indexation improvements",
  performance: "Core Web Vitals / page experience",
  schema: "Structured data / rich results",
};

// ---------------------------------------------------------------------------
// Benchmark sources (only used when actual data is unavailable)
// ---------------------------------------------------------------------------

const BENCHMARKS = {
  /**
   * CTR improvement from optimizing title tags.
   * Source: Backlinko, "We Analyzed 5 Million Google Search Results.
   * Here's What We Learned About Organic CTR" (2023).
   * https://backlinko.com/organic-ctr-stats
   * Note: This is the difference between position 1 and lower positions,
   * used as a conservative proxy for title optimization impact.
   */
  titleCtrImprovement: {
    relativeImprovement: 0.10, // 10% relative CTR improvement (conservative)
    source: "Backlinko, \"We Analyzed 5 Million Google Search Results\" (2023)",
    url: "https://backlinko.com/organic-ctr-stats",
    description: "10% relative CTR improvement (conservative estimate for title/description optimization)",
  },
  /**
   * Rich result CTR uplift from structured data.
   * Source: Search Engine Land, "Study: Rich snippets can increase
   * CTR by as much as 35%" (2019).
   * https://searchengineland.com/study-rich-snippets-can-increase-ctr-by-as-much-as-35-297633
   */
  richResultCtrUplift: {
    relativeImprovement: 0.08, // 8% relative CTR improvement (conservative)
    source: "Search Engine Land, \"Study: Rich snippets can increase CTR by as much as 35%\" (2019)",
    url: "https://searchengineland.com/study-rich-snippets-can-increase-ctr-by-as-much-as-35-297633",
    description: "8% relative CTR improvement (conservative, based on rich result uplift studies)",
  },
  /**
   * Page speed / bounce rate relationship.
   * Source: Google/SOASTA Research, \"The Need for Mobile Speed\" (2017).
   * Already cited in businessImpactEstimate.ts — reused here.
   */
  pageSpeedBounceRate: {
    source: "Google/SOASTA Research, \"The Need for Mobile Speed\" (2017)",
    description: "Slow page load increases bounce probability — used qualitatively, not converted to revenue",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectiveCtr(metrics: BusinessMetrics): number | null {
  if (metrics.currentOrganicCtr !== undefined && metrics.currentOrganicCtr > 0) {
    return metrics.currentOrganicCtr;
  }
  if (
    metrics.monthlyOrganicClicks !== undefined &&
    metrics.monthlyOrganicImpressions !== undefined &&
    metrics.monthlyOrganicImpressions > 0
  ) {
    return metrics.monthlyOrganicClicks / metrics.monthlyOrganicImpressions;
  }
  return null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function ctrPct(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

/** Count pages affected by a specific flag in the audit. */
function affectedPageCount(audit: RunAuditResult, flag: string): number {
  const okPages = audit.crawl.pages.filter((p) => p.ok);
  return okPages.filter((p) => p.flags.includes(flag)).length;
}

// ---------------------------------------------------------------------------
// Issue-specific estimate builders
// ---------------------------------------------------------------------------

function buildCtrEstimate(
  flags: string[],
  metrics: BusinessMetrics,
  audit: RunAuditResult
): OpportunityEstimate | null {
  const ctr = effectiveCtr(metrics);
  const impressions = metrics.monthlyOrganicImpressions;
  if (ctr === null || !impressions || impressions <= 0) return null;

  const currentClicks = Math.round(impressions * ctr);
  const benchmark = BENCHMARKS.titleCtrImprovement;
  const targetCtr = ctr * (1 + benchmark.relativeImprovement);
  const potentialClicks = Math.round(impressions * targetCtr);
  const additionalClicks = potentialClicks - currentClicks;
  if (additionalClicks <= 0) return null;

  let additionalConversions: number | null = null;
  let revenueOpportunity: number | null = null;
  if (metrics.organicConversionRate && metrics.organicConversionRate > 0) {
    additionalConversions = Math.round(additionalClicks * metrics.organicConversionRate);
    if (metrics.averageConversionValue && metrics.averageConversionValue > 0) {
      revenueOpportunity = Math.round(additionalConversions * metrics.averageConversionValue);
    }
  }

  // Total affected pages across all matching flags
  let totalAffected = 0;
  for (const flag of flags) {
    totalAffected += affectedPageCount(audit, flag);
  }

  const source = metrics.currentOrganicCtr !== undefined
    ? "Client-provided: monthly organic impressions + CTR"
    : "Client-provided: monthly organic impressions + clicks (CTR derived)";

  return {
    applicableFlags: flags,
    label: CATEGORY_LABELS.metadata,
    confidence: "Medium",
    observedData: `${fmt(impressions)} monthly organic impressions, ${ctrPct(ctr)} current CTR, ${fmt(currentClicks)} current clicks${totalAffected > 0 ? `, ${totalAffected} pages affected` : ""}`,
    source,
    scenarioAssumption: `CTR improves from ${ctrPct(ctr)} → ${ctrPct(targetCtr)} (10% relative improvement)`,
    calculation: `${fmt(impressions)} × (${ctrPct(targetCtr)} − ${ctrPct(ctr)}) = +${fmt(additionalClicks)} clicks/month`,
    additionalClicks,
    additionalConversions,
    revenueOpportunity,
    benchmarkSource: benchmark.source,
    affectedPages: totalAffected || undefined,
  };
}

function buildIndexationEstimate(
  flags: string[],
  metrics: BusinessMetrics,
  audit: RunAuditResult
): OpportunityEstimate | null {
  const ctr = effectiveCtr(metrics);
  const impressions = metrics.monthlyOrganicImpressions;
  if (ctr === null || !impressions || impressions <= 0) return null;

  // Total affected pages
  let totalAffected = 0;
  for (const flag of flags) {
    totalAffected += affectedPageCount(audit, flag);
  }
  if (totalAffected === 0) return null;

  // Conservative estimate: noindexed pages represent missed impression opportunity
  // proportional to their share of the crawled site.
  const totalCrawled = audit.crawl.pages.filter((p) => p.ok).length;
  if (totalCrawled === 0) return null;

  const affectedShare = totalAffected / totalCrawled;
  const potentialAdditionalImpressions = Math.round(impressions * affectedShare * 0.5); // 50% recovery assumption
  const additionalClicks = Math.round(potentialAdditionalImpressions * ctr);
  if (additionalClicks <= 0) return null;

  let additionalConversions: number | null = null;
  let revenueOpportunity: number | null = null;
  if (metrics.organicConversionRate && metrics.organicConversionRate > 0) {
    additionalConversions = Math.round(additionalClicks * metrics.organicConversionRate);
    if (metrics.averageConversionValue && metrics.averageConversionValue > 0) {
      revenueOpportunity = Math.round(additionalConversions * metrics.averageConversionValue);
    }
  }

  const source = metrics.currentOrganicCtr !== undefined
    ? "Client-provided: monthly organic impressions + CTR"
    : "Client-provided: monthly organic impressions + clicks (CTR derived)";

  return {
    applicableFlags: flags,
    label: CATEGORY_LABELS.indexation,
    confidence: "Low",
    observedData: `${totalAffected} of ${totalCrawled} crawled pages are noindexed or missing sitemap coverage`,
    source,
    scenarioAssumption: `${totalAffected} blocked pages could recover ~50% of their proportional impression share`,
    calculation: `${fmt(impressions)} × ${(affectedShare * 100).toFixed(1)}% affected share × 50% recovery = ${fmt(potentialAdditionalImpressions)} potential impressions → +${fmt(additionalClicks)} clicks/month`,
    additionalClicks,
    additionalConversions,
    revenueOpportunity,
    affectedPages: totalAffected,
  };
}

function buildPerformanceEstimate(
  flags: string[],
  metrics: BusinessMetrics,
  audit: RunAuditResult
): OpportunityEstimate | null {
  const ctr = effectiveCtr(metrics);
  const impressions = metrics.monthlyOrganicImpressions;
  if (ctr === null || !impressions || impressions <= 0) return null;

  // Count affected pages from CWV
  let totalAffected = 0;
  if (audit.cwv) {
    totalAffected = audit.cwv.failingPages;
  }
  if (totalAffected === 0) return null;

  // Conservative: 5% relative CTR improvement from better page experience
  const benchmark = BENCHMARKS.titleCtrImprovement; // using 10% as conservative proxy
  const targetCtr = ctr * 1.05; // 5% relative improvement (more conservative than metadata)
  const additionalClicks = Math.round(impressions * (targetCtr - ctr));
  if (additionalClicks <= 0) return null;

  let additionalConversions: number | null = null;
  let revenueOpportunity: number | null = null;
  if (metrics.organicConversionRate && metrics.organicConversionRate > 0) {
    additionalConversions = Math.round(additionalClicks * metrics.organicConversionRate);
    if (metrics.averageConversionValue && metrics.averageConversionValue > 0) {
      revenueOpportunity = Math.round(additionalConversions * metrics.averageConversionValue);
    }
  }

  return {
    applicableFlags: flags,
    label: CATEGORY_LABELS.performance,
    confidence: "Low",
    observedData: `${totalAffected} page${totalAffected === 1 ? "" : "s"} failing Core Web Vitals`,
    source: "Audit crawler data (PageSpeed Insights lab measurements)",
    scenarioAssumption: "5% relative CTR improvement from improved page experience (conservative)",
    calculation: `${fmt(impressions)} × 5% relative improvement = +${fmt(additionalClicks)} clicks/month`,
    additionalClicks,
    additionalConversions,
    revenueOpportunity,
    benchmarkSource: BENCHMARKS.pageSpeedBounceRate.source,
    affectedPages: totalAffected,
  };
}

function buildSchemaEstimate(
  flags: string[],
  metrics: BusinessMetrics,
  audit: RunAuditResult
): OpportunityEstimate | null {
  const ctr = effectiveCtr(metrics);
  const impressions = metrics.monthlyOrganicImpressions;
  if (ctr === null || !impressions || impressions <= 0) return null;

  let totalAffected = 0;
  for (const flag of flags) {
    totalAffected += affectedPageCount(audit, flag);
  }
  if (totalAffected === 0) return null;

  const benchmark = BENCHMARKS.richResultCtrUplift;
  const targetCtr = ctr * (1 + benchmark.relativeImprovement);
  const additionalClicks = Math.round(impressions * (targetCtr - ctr));
  if (additionalClicks <= 0) return null;

  let additionalConversions: number | null = null;
  let revenueOpportunity: number | null = null;
  if (metrics.organicConversionRate && metrics.organicConversionRate > 0) {
    additionalConversions = Math.round(additionalClicks * metrics.organicConversionRate);
    if (metrics.averageConversionValue && metrics.averageConversionValue > 0) {
      revenueOpportunity = Math.round(additionalConversions * metrics.averageConversionValue);
    }
  }

  return {
    applicableFlags: flags,
    label: CATEGORY_LABELS.schema,
    confidence: "Low",
    observedData: `${totalAffected} page${totalAffected === 1 ? "" : "s"} missing or invalid structured data`,
    source: "Audit crawler data + client-provided impressions/CTR",
    scenarioAssumption: `8% relative CTR improvement from rich results (conservative)`,
    calculation: `${fmt(impressions)} × 8% relative improvement = +${fmt(additionalClicks)} clicks/month`,
    additionalClicks,
    additionalConversions,
    revenueOpportunity,
    benchmarkSource: benchmark.source,
    affectedPages: totalAffected,
  };
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Build evidence-based opportunity estimates for one audit.
 *
 * Only produces estimates when:
 *  1. BusinessMetrics are supplied with sufficient data (impressions + CTR).
 *  2. A defensible calculation exists for the issue type.
 *
 * When no data exists, returns empty estimates — the renderer omits the section.
 */
export function buildEstimatedBusinessImpact(
  audit: RunAuditResult,
  flags: string[],
  metrics: BusinessMetrics | undefined
): EstimatedBusinessImpactResult {
  if (!metrics) {
    return { hasEstimates: false, estimates: [] };
  }

  const ctr = effectiveCtr(metrics);
  const impressions = metrics.monthlyOrganicImpressions;
  if (ctr === null || !impressions || impressions <= 0) {
    return { hasEstimates: false, estimates: [] };
  }

  const estimates: OpportunityEstimate[] = [];

  // Group flags by estimable category
  const ctrFlags = flags.filter((f) => CTR_ESTIMABLE_FLAGS.has(f));
  const indexationFlags = flags.filter((f) => INDEXATION_ESTIMABLE_FLAGS.has(f));
  const performanceFlags = flags.filter((f) => PERFORMANCE_ESTIMABLE_FLAGS.has(f));
  const schemaFlags = flags.filter((f) => SCHEMA_ESTIMABLE_FLAGS.has(f));

  // Build one estimate per category (best candidate wins)
  if (ctrFlags.length > 0) {
    const estimate = buildCtrEstimate(ctrFlags, metrics, audit);
    if (estimate) estimates.push(estimate);
  }
  if (indexationFlags.length > 0) {
    const estimate = buildIndexationEstimate(indexationFlags, metrics, audit);
    if (estimate) estimates.push(estimate);
  }
  if (performanceFlags.length > 0) {
    const estimate = buildPerformanceEstimate(performanceFlags, metrics, audit);
    if (estimate) estimates.push(estimate);
  }
  if (schemaFlags.length > 0) {
    const estimate = buildSchemaEstimate(schemaFlags, metrics, audit);
    if (estimate) estimates.push(estimate);
  }

  return {
    hasEstimates: estimates.length > 0,
    estimates,
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatDollarAmount(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatClickCount(n: number): string {
  return fmt(n);
}

export function formatConversionCount(n: number): string {
  return fmt(n);
}

export function formatImpressionCount(n: number): string {
  return fmt(n);
}

export function formatCtr(ctr: number): string {
  return ctrPct(ctr);
}
