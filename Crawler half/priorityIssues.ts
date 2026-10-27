import type { RunAuditResult, CoreWebVitalsAggregate } from "./types";
import type { GroupedIssue } from "./groupIssues";
import { resolveCoreWebVitals } from "./coreWebVitals";
import {
  genuineBrokenLinks,
  countBrokenLinkSourcePages,
} from "./brokenLinkClassification";
import { classifyNoindexUrl } from "./noindexClassification";

export type IssuePillar = "onPage" | "technical" | "aiSearchReadiness";

export interface PriorityIssue {
  key: string;
  label: string;
  /** Which of the three audit pillars this issue belongs to. Every finding
   * belongs to exactly one pillar — no overlap. */
  pillar: IssuePillar;
  severity: "critical" | "moderate" | "minor";
  effort: "quick" | "standard";
  count: number;
  estimatedTimeLabel: string;
  /** Coarse "effort bucket" for primary views (priority table, roadmap):
   * Trivial (< 30 Mins) / Moderate (1–3 Hours) / Advanced (4+ Hours).
   * Raw per-element minute counts are retained in `estimatedTimeLabel` for
   * the detailed issue pages, which carry the micro-copy disclaimer. */
  effortBucketLabel: string;
  /** True when the issue affects more than 80% of crawled pages — the
   * report then frames it as a template-level fix (one shared layout/
   * header/footer update resolves it site-wide) instead of N individual
   * edits, so 47 affected pages don't read as 47 separate tasks. */
  templateLevel: boolean;
  impactStars: number;
  difficultyStars: number;
  priorityScore: number;
  /** Implementation-priority TIER, deliberately a separate concept from
   * `severity`: severity says how damaging the issue is where it applies;
   * priority says what to fix FIRST (impact × reach ÷ effort). A
   * single-page critical-severity issue can rank below a wide moderate one
   * — the ranked lists sort by this, severity is just a badge. */
  priorityTier: "high" | "medium" | "low";
  impactLabel: string;
  difficultyLabel: string;
  batchFixPossible: boolean;
  /** Distinct pages actually affected — populated only where `count`
   * measures something other than pages (broken links: count is LINK
   * instances, affectedPages is the distinct source pages carrying them).
   * Lets the report phrase it "3,012 broken link instances across 284
   * pages" instead of ever calling 3,012 links "pages". */
  affectedPages?: number;
  /** What `count` measures — "pages" for per-page flags, but "links" for
   * broken links, "images" for oversized images, and "URLs" for
   * duplicate-title/meta groups. Rendered next to every count so a client
   * can never misread 3,013 broken LINKS as 3,013 affected pages. */
  countUnit: string;
  /** One-line "why this estimate is what it is" caveat, populated ONLY when
   * the effort/time gap vs. a similarly-scoped issue would otherwise look
   * unexplained — e.g. a manual-content issue (No H2 subheadings, thin
   * content) sitting next to a tag-level issue (Missing H1) that ships with
   * an AI-suggested ready-to-use fix. Rendered as a small note under the
   * estimate wherever it appears; absent for issues that need no caveat. */
  estimateRationale?: string;
}

/**
 * Shared micro-copy disclaimer for retained granular time estimates. Every
 * primary view that keeps "~N min each" (detailed issue pages) must show
 * this once, so developers don't mistake direct editing time for total
 * shipped time.
 */
export const EFFORT_ESTIMATE_DISCLAIMER =
  "Estimates represent direct active editing time per element, excluding staging, testing, and deployment workflows.";

/** Maps per-element minutes to the coarse effort bucket used in primary views. */
export function effortBucketLabelForMinutes(minutes: number): string {
  if (minutes < 30) return "Trivial (< 30 Mins)";
  if (minutes <= 180) return "Moderate (1–3 Hours)";
  return "Advanced (4+ Hours)";
}

/**
 * Maps the batch-aware TOTAL estimate (not per-element minutes) to the
 * coarse effort bucket shown in primary views. A fix affecting 3,000+
 * broken links must NEVER read "Trivial (< 30 Mins)" just because each
 * individual link takes 8 minutes — the bucket reflects the whole job.
 */
export function effortBucketLabelForTotalMinutes(totalMinutes: number): string {
  if (totalMinutes < 30) return "Trivial (< 30 Mins)";
  if (totalMinutes <= 180) return "Moderate (1–3 Hours)";
  if (totalMinutes <= 1440) return "Advanced (4+ Hours)";
  return "Extensive (Multi-Day)";
}

/**
 * Shared rationale strings for issues whose estimate/difficulty would
 * otherwise look inconsistent next to a similarly-scoped issue. The key
 * contrast: tag-level flags (Missing H1, title, meta description) ship
 * with an AI-generated ready-to-use suggestion, so their cost is minutes;
 * content-work flags (H2 structure, thin content) have no such shortcut
 * because the result must match the client's actual content.
 */
export const ESTIMATE_RATIONALE: Record<string, string> = {
  missing_h2:
    "Unlike issues with AI-suggested copy (titles, meta descriptions, H1s), this fix requires manually reading each page's content to determine logical section structure — no auto-suggestion is provided since it must match your actual content.",
  thin_content:
    "Requires reading each page and writing genuinely useful copy — unlike tag-level fixes there is no AI-generated shortcut, because the content must match what your business actually offers.",
  webvital_lcp_poor:
    "Requires performance work (image optimization, caching, code splitting) rather than content or tag edits — time varies with your platform and hosting setup.",
  webvital_inp_poor:
    "Requires JavaScript and interaction-performance work rather than content or tag edits — time varies with your platform and hosting setup.",
  webvital_cls_poor:
    "Requires layout/CSS stability fixes rather than content or tag edits — time varies with your platform and hosting setup.",
  webvital_ttfb_poor:
    "Requires server/hosting performance work (caching, TTFB optimization) rather than content or tag edits — time varies with your platform and hosting setup.",
};

/**
 * Issues whose total effort is a FIXED task regardless of instance count —
 * e.g. links blocked from automated checking: you don't review 3,000
 * links individually, you spot-check a sample in a browser and, if a WAF
 * or bot rule is involved, whitelist the crawler. Scaling that by count
 * would produce the same absurd "3+ days" estimate we removed for broken
 * links. When present, the FIXED total replaces count × per-instance
 * minutes everywhere (per-element label, effort bucket, batch-aware
 * total, combined estimate).
 */
const FIXED_TOTAL_MINUTES: Record<string, number> = {
};

const MINUTES_PER_INSTANCE: Record<string, number> = {
  missing_title: 3,
  missing_meta_description: 3,
  meta_description_length_out_of_range: 3,
  title_length_out_of_range: 3,
  missing_h1: 3,
  multiple_h1: 4,
  missing_canonical: 2,
  canonical_mismatch: 3,
  missing_alt_text: 2,
  missing_h2: 15,
  thin_content: 45,
  no_internal_links: 15,
  broken_links: 8,
  duplicate_titles: 10,
  duplicate_meta_descriptions: 10,
  excessive_redirects: 20,
  duplicate_alt_text: 2,
  missing_image_dimensions: 3,
  non_optimized_image_format: 10,
  url_too_long: 5,
  url_has_uppercase: 3,
  url_has_underscores: 3,
  url_has_parameters: 8,
  url_poor_readability: 8,
  url_has_encoded_characters: 3,
  url_has_tracking_parameters: 3,
  url_uses_image_proxy: 5,
  url_too_deep: 3,
  url_has_file_extension: 3,
  missing_schema_markup: 20,
  invalid_schema_markup: 15,
  oversized_images: 5,
  missing_lazy_loading: 2,
  missing_responsive_images: 5,
  poor_image_filenames: 3,
  noindex_meta_tag: 5,
  noindex_x_robots_tag: 10,
  orphan_page: 10,
  soft_404: 15,
  www_inconsistent: 30,
  webvital_lcp_poor: 90,
  webvital_inp_poor: 90,
  webvital_cls_poor: 60,
  webvital_ttfb_poor: 60,
  missing_sitemap: 15,
};

/** Per-element time estimate shown on individual issue detail pages.
 * For fixed-total issues, shows the total. For per-element issues,
 * shows the per-page estimate. The total effort bucket (effortBucketLabel)
 * derives from totalBatchAwareMinutes which may apply batching discounts,
 * so the per-page label is the raw per-element cost, not the batched total.
 */
function estimateEffortLabel(key: string): string {
  const fixedTotal = FIXED_TOTAL_MINUTES[key];
  if (fixedTotal !== undefined) return `~${fixedTotal} min total`;
  const perInstance = MINUTES_PER_INSTANCE[key] ?? 10;
  if (perInstance < 60) return `~${perInstance} min each`;
  const hours = perInstance / 60;
  return `~${hours % 1 === 0 ? hours : hours.toFixed(1)} hr each`;
}

export function estimateCombinedTimeLabel(issues: PriorityIssue[]): string {
  if (!issues || issues.length === 0) {
    return "0 min";
  }

  let totalMinutes = 0;
  
  for (const issue of issues) {
    const fixedTotal = FIXED_TOTAL_MINUTES[issue.key];
    if (fixedTotal !== undefined) {
      totalMinutes += fixedTotal;
      continue;
    }
    const label = issue.estimatedTimeLabel;
    let minutesPerInstance = 0;
    
    const minutesMatch = label.match(/~(\d+\.?\d*)\s*min/);
    if (minutesMatch) {
      minutesPerInstance = parseFloat(minutesMatch[1]);
    } else {
      const hoursMatch = label.match(/~(\d+\.?\d*)\s*hr/);
      if (hoursMatch) {
        minutesPerInstance = parseFloat(hoursMatch[1]) * 60;
      } else {
        minutesPerInstance = MINUTES_PER_INSTANCE[issue.key] ?? 10;
      }
    }
    
    totalMinutes += minutesPerInstance * issue.count;
  }
  
  if (totalMinutes < 1) {
    return "~1 min";
  }
  
  if (totalMinutes < 60) {
    return `${Math.round(totalMinutes)} min`;
  }
  
  const hours = totalMinutes / 60;
  if (hours < 24) {
    const roundedHours = Math.round(hours * 2) / 2;
    if (roundedHours % 1 === 0) {
      return `${roundedHours} hours`;
    }
    return `${roundedHours.toFixed(1)} hours`;
  }
  
  const days = hours / 24;
  const roundedDays = Math.round(days * 2) / 2;
  if (roundedDays % 1 === 0) {
    return `${roundedDays} days`;
  }
  return `${roundedDays.toFixed(1)} days`;
}

/**
 * Realistic, batch-aware TOTAL time estimate for one issue type —
 * replaces naive "count × per-instance minutes" multiplication, which
 * produced absurd totals (e.g. 100 oversized images × 10 min = 1,000+
 * minutes shown to the user with a straight face).
 *
 * The insight: QUICK-effort, tag-level issues (missing title, missing
 * alt text, canonical, etc.) are, in practice, fixed once a handful of
 * pages are affected via ONE template/CMS-wide change or a bulk
 * find-and-replace — not by opening every single page. So cost should
 * grow sublinearly with count, not linearly, once a fix is clearly
 * batchable. STANDARD-effort issues (thin content, missing H2s, real
 * content work) don't get this discount — there's no template shortcut
 * for writing actual content on 300 different pages.
 *
 * Total is capped for display at "3+ days" rather than showing a
 * technically-precise but useless number like "11.4 days" — past that
 * point the exact number stops being actionable and the important
 * message is just "this is a real chunk of work, batch it."
 */
export interface BatchAwareEstimate {
  label: string; // e.g. "~45 min total", "~1.5 days total"
  batchRecommended: boolean; // true once the fix is genuinely large-scale
}

const BATCH_FULL_COST_INSTANCES = 3; // first few pages costed at full per-instance rate
const BATCH_DISCOUNTED_RATE = 0.08; // remaining instances assumed handled via one bulk/template change
const BATCH_CAP_DAYS = 3;

/**
 * Flags where ONE bulk/template change genuinely resolves every instance
 * WITHOUT per-page human review (a CMS rule, find-and-replace, or bulk
 * tool). Per-page-copy flags — missing title/meta/H1, alt text, broken
 * links (each needs classification), orphan pages (each needs a
 * judgment-placed link) — are deliberately NOT here: even with an
 * AI-suggested value, each instance needs a human to review it, so
 * 84 unique H1s is real hours of work, not "< 30 mins".
 */
const BULK_BATCHABLE_FLAGS = new Set([
  "missing_canonical",
  "canonical_mismatch",
  "missing_image_dimensions",
  "missing_lazy_loading",
  "missing_responsive_images",
  "oversized_images",
  "poor_image_filenames",
  "noindex_meta_tag",
  "noindex_x_robots_tag",
  "url_has_uppercase",
  "url_has_underscores",
]);

/**
 * Whether the batch discount may apply: quick-effort AND (a genuine
 * bulk/template path exists for this flag OR the issue is detected as
 * template-level, i.e. affects >80% of pages). Without this guard, a
 * quick tag flag with thousands of DISTINCT instances (broken links,
 * unique H1s per page) would be discounted to minutes even though each
 * instance needs individual attention.
 */
function isBatchEligible(key: string, count: number, effort: PriorityIssue["effort"], templateLevel: boolean): boolean {
  return (
    effort === "quick" &&
    Math.max(1, count) > BATCH_FULL_COST_INSTANCES &&
    (templateLevel || BULK_BATCHABLE_FLAGS.has(key))
  );
}

/**
 * Raw total minutes for an issue, batch-discounted ONLY when the fix is
 * genuinely batchable (see isBatchEligible). Shared by the batch-aware
 * display label and the effort bucket, so the two can never disagree.
 */
export function totalBatchAwareMinutes(
  key: string,
  count: number,
  effort: PriorityIssue["effort"],
  templateLevel: boolean
): number {
  const fixedTotal = FIXED_TOTAL_MINUTES[key];
  if (fixedTotal !== undefined) return fixedTotal;
  const perInstanceMinutes = MINUTES_PER_INSTANCE[key] ?? 10;
  const n = Math.max(1, count);
  if (!isBatchEligible(key, n, effort, templateLevel)) {
    return perInstanceMinutes * n;
  }
  return (
    perInstanceMinutes * BATCH_FULL_COST_INSTANCES +
    (n - BATCH_FULL_COST_INSTANCES) * perInstanceMinutes * BATCH_DISCOUNTED_RATE
  );
}

function formatMinutesAsTotalLabel(totalMinutes: number): string {
  if (totalMinutes < 1) return "~1 min total";
  if (totalMinutes < 60) return `~${Math.round(totalMinutes)} min total`;

  const hours = totalMinutes / 60;
  if (hours < 24) {
    const rounded = Math.round(hours * 2) / 2;
    return `~${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} hour${rounded === 1 ? "" : "s"} total`;
  }

  const days = hours / 24;
  const rounded = Math.round(days * 2) / 2;
  return `~${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} day${rounded === 1 ? "" : "s"} total`;
}

export function estimateBatchAwareTime(issue: PriorityIssue): BatchAwareEstimate {
  const count = Math.max(1, issue.count);
  const eligible = isBatchEligible(issue.key, count, issue.effort, issue.templateLevel);
  const totalMinutes = totalBatchAwareMinutes(issue.key, count, issue.effort, issue.templateLevel);
  const days = totalMinutes / 60 / 24;

  if (days > BATCH_CAP_DAYS) {
    // Past the cap the exact number stops being actionable — the important
    // message is just "this is a real chunk of work" (e.g. 3,000+ broken
    // links to audit, classify, and coordinate is DAYS, not minutes).
    return { label: "~3+ days total", batchRecommended: eligible };
  }
  return { label: formatMinutesAsTotalLabel(totalMinutes), batchRecommended: eligible && days >= 0.5 };
}

/** Suffix text appended next to a batch-aware estimate when a bulk/template
 * fix is the realistic path — kept as one shared string so the PDF, web
 * report, and action plan never phrase this differently from each other. */
export function batchRecommendationSuffix(estimate: BatchAwareEstimate, count: number): string {
  if (!estimate.batchRecommended) return "";
  return count > 50
    ? " — a shared template fix will resolve all affected pages in one pass"
    : " — most efficiently resolved via a shared template fix";
}

function getImpactLabel(severity: PriorityIssue["severity"]): string {
  switch(severity) {
    case 'critical': return '🔴 High Impact';
    case 'moderate': return '🟡 Medium Impact';
    case 'minor': return '🟢 Low Impact';
    default: return 'Impact';
  }
}

/** Derives both difficulty label and effort bucket from the same source:
 * total batch-aware minutes for the entire fix. This ensures the two
 * never contradict — difficulty is per-instance complexity, effort is
 * total time, but both are derived from the same underlying calculation.
 */
function getDifficultyLabel(effort: PriorityIssue["effort"], minutesPerInstance: number): string {
  if (effort === "quick") {
    return minutesPerInstance <= 5 ? "Very Easy" : "Easy";
  }
  if (minutesPerInstance >= 45) return "Very Hard";
  if (minutesPerInstance >= 20) return "Hard";
  return "Medium";
}

const CRITICAL_FLAGS = new Set([
  "missing_title",
  "missing_h1",
  "noindex_meta_tag",
  "noindex_x_robots_tag",
  "thin_content",
  "duplicate_titles",
  "duplicate_meta_descriptions",
  "missing_sitemap",
]);
const MODERATE_FLAGS = new Set([
  "missing_meta_description",
  "meta_description_length_out_of_range",
  "multiple_h1",
  "missing_h2",
  "missing_canonical",
  "canonical_mismatch",
  "title_length_out_of_range",
  "no_internal_links",
  "missing_schema_markup",
  "invalid_schema_markup",
  "url_uses_image_proxy",
  "orphan_page",
  "soft_404",
  "missing_alt_text",
]);

const QUICK_EFFORT_FLAGS = new Set([
  "missing_title",
  "missing_meta_description",
  "meta_description_length_out_of_range",
  "title_length_out_of_range",
  "missing_h1",
  "multiple_h1",
  "missing_canonical",
  "canonical_mismatch",
  "missing_alt_text",
  "duplicate_alt_text",
  "missing_image_dimensions",
  "url_has_uppercase",
  "url_has_underscores",
  "url_has_encoded_characters",
  "url_has_tracking_parameters",
  "url_uses_image_proxy",
  "url_too_deep",
  "url_has_file_extension",
  "oversized_images",
  "missing_lazy_loading",
  "missing_responsive_images",
  "poor_image_filenames",
  "noindex_meta_tag",
  "noindex_x_robots_tag",
]);

// Issues that LOOK like tag-level edits but are NOT quick wins: they need
// real structural/content judgment rather than a find-and-replace, so
// listing them under "Quick Wins (no content rewrite or dev work required)"
// would contradict the effort/difficulty shown on their own detail pages.
// orphan_page: adding internal links requires deciding where each orphan
// belongs in the site's information architecture — not a tag edit.
// thin_content: writing genuinely useful copy for each page (see
// ESTIMATE_RATIONALE) — never a quick win.

function severityForFlag(flag: string): PriorityIssue["severity"] {
  if (CRITICAL_FLAGS.has(flag)) return "critical";
  if (MODERATE_FLAGS.has(flag)) return "moderate";
  return "minor";
}

function effortForFlag(flag: string): PriorityIssue["effort"] {
  return QUICK_EFFORT_FLAGS.has(flag) ? "quick" : "standard";
}

function impactStarsFor(severity: PriorityIssue["severity"], count: number): number {
  const base = severity === "critical" ? 4 : severity === "moderate" ? 3 : 2;
  return Math.min(5, base + (count >= 20 ? 1 : 0));
}

function difficultyStarsFor(effort: PriorityIssue["effort"], minutesPerInstance: number): number {
  if (effort === "quick") return minutesPerInstance <= 5 ? 1 : 2;
  return minutesPerInstance >= 45 ? 5 : minutesPerInstance >= 20 ? 4 : 3;
}

function priorityScoreFor(impactStars: number, difficultyStars: number, count: number): number {
  const raw = impactStars * 2 - difficultyStars * 0.8 + Math.min(2, Math.log10(count + 1));
  return Math.max(0, Math.min(10, Math.round(raw * 10) / 10));
}

/** Maps the numeric priority score to a coarse implementation-priority
 * tier (High / Medium / Low). SEPARATE from severity: a critical-severity
 * issue can be Low priority if it affects one page, and a moderate-severity
 * issue can be High priority if it spans hundreds of pages and is quick.
 * Thresholds: ≥7.5 High, ≥4.5 Medium, else Low. */
export function priorityTierForScore(score: number): "high" | "medium" | "low" {
  if (score >= 7.5) return "high";
  if (score >= 4.5) return "medium";
  return "low";
}

/** Count unit for issue types whose count measures something other than
 * pages — broken links count LINKS, oversized images count IMAGES,
 * duplicate-title/meta groups count URLs. Anything else defaults to
 * "pages" so per-page flags keep their natural unit. */
const COUNT_UNIT: Record<string, string> = {
  broken_links: "links",
  oversized_images: "images",
  duplicate_titles: "URLs",
  duplicate_meta_descriptions: "URLs",
};

/** Pluralizes a count unit for display: "3,013 links", "1 link",
 * "150 pages", "1 URL". Shared so the PDF and web report never phrase a
 * count differently ("pages" vs "links" vs "URLs"). */
export function countUnitFor(count: number, unit: string): string {
  if (count === 1 && unit.endsWith("s")) return unit.slice(0, -1);
  return unit;
}

export /** Maps issue flag keys to their pillar assignment per the enterprise
 * audit specification's Pillar Purity Rule. Every check belongs to exactly
 * one pillar:
 *
 * On-Page SEO: titles, descriptions, headings, content, images.
 * Technical SEO: canonicals, noindex, robots, sitemaps, broken links,
 *   redirects, URL structure, CWV.
 * AI Search Readiness: JSON-LD schema, entity consistency.
 */
const PILLAR_BY_KEY: Record<string, IssuePillar> = {
  // On-Page SEO
  missing_title: "onPage",
  title_length_out_of_range: "onPage",
  missing_meta_description: "onPage",
  meta_description_length_out_of_range: "onPage",
  missing_h1: "onPage",
  multiple_h1: "onPage",
  missing_h2: "onPage",
  thin_content: "onPage",
  no_internal_links: "onPage",
  orphan_page: "onPage",
  soft_404: "technical",
  missing_alt_text: "onPage",
  duplicate_alt_text: "onPage",
  missing_image_dimensions: "onPage",
  non_optimized_image_format: "onPage",
  missing_lazy_loading: "onPage",
  missing_responsive_images: "onPage",
  poor_image_filenames: "onPage",
  duplicate_titles: "onPage",
  duplicate_meta_descriptions: "onPage",
  // Technical SEO
  missing_canonical: "technical",
  canonical_mismatch: "technical",
  noindex_meta_tag: "technical",
  noindex_x_robots_tag: "technical",
  url_too_long: "technical",
  url_has_uppercase: "technical",
  url_has_underscores: "technical",
  url_has_parameters: "technical",
  url_poor_readability: "technical",
  url_has_encoded_characters: "technical",
  url_has_tracking_parameters: "technical",
  url_uses_image_proxy: "technical",
  url_too_deep: "technical",
  url_has_file_extension: "technical",
  broken_links: "technical",
  excessive_redirects: "technical",
  www_inconsistent: "technical",
  missing_sitemap: "technical",
  webvital_lcp_poor: "technical",
  webvital_inp_poor: "technical",
  webvital_cls_poor: "technical",
  webvital_ttfb_poor: "technical",
  oversized_images: "technical",
  // AI Search Readiness
  missing_schema_markup: "aiSearchReadiness",
  invalid_schema_markup: "aiSearchReadiness",
};

export function makeIssue(
  key: string,
  label: string,
  severity: PriorityIssue["severity"],
  effort: PriorityIssue["effort"],
  count: number,
  minutesOverride?: number
): PriorityIssue {
  const minutesPerInstance = minutesOverride ?? MINUTES_PER_INSTANCE[key] ?? 10;
  const impactStars = impactStarsFor(severity, count);
  const difficultyStars = difficultyStarsFor(effort, minutesPerInstance);
  // Bucket reflects the batch-aware TOTAL (templateLevel isn't known until
  // buildPriorityList's final pass, where it's recomputed), so a 3,000-link
  // issue can never display as "Trivial (< 30 Mins)" just because each
  // individual link takes 8 minutes.
  const totalMinutes = totalBatchAwareMinutes(key, count, effort, false);
  const batchFixPossible = effort === "quick" && count > 1;
  
  const priorityScore = priorityScoreFor(impactStars, difficultyStars, count);
  return {
    key,
    label,
    pillar: PILLAR_BY_KEY[key] ?? "technical",
    severity,
    effort,
    count,
    estimatedTimeLabel: estimateEffortLabel(key),
    effortBucketLabel: effortBucketLabelForTotalMinutes(totalMinutes),
    templateLevel: false,
    impactStars,
    difficultyStars,
    priorityScore,
    priorityTier: priorityTierForScore(priorityScore),
    impactLabel: getImpactLabel(severity),
    difficultyLabel: getDifficultyLabel(effort, minutesPerInstance),
    batchFixPossible,
    countUnit: COUNT_UNIT[key] ?? "pages",
    estimateRationale: ESTIMATE_RATIONALE[key],
  };
}

function buildWebVitalsPriorityIssues(cwv: CoreWebVitalsAggregate): PriorityIssue[] {
  if (cwv.evaluatedPages === 0) return [];
  const checks = [
    { key: "webvital_lcp_poor", label: "Slow Largest Contentful Paint (LCP)", agg: cwv.lcp },
    { key: "webvital_inp_poor", label: "Slow Interaction to Next Paint (INP)", agg: cwv.inp },
    { key: "webvital_cls_poor", label: "High Cumulative Layout Shift (CLS)", agg: cwv.cls },
    { key: "webvital_ttfb_poor", label: "Slow Time to First Byte (TTFB)", agg: cwv.ttfb },
  ];
  return checks
    .filter((c) => c.agg.poor > 0)
    .map((c) => {
      // Severity reflects how WIDESPREAD the problem is across evaluated
      // pages: poor on the majority -> critical, otherwise high. A single
      // poor page must never read as a site-wide critical failure (and the
      // count now reflects real affected pages, not a flat 1).
      const majority = c.agg.poor * 2 >= cwv.evaluatedPages;
      // Count ALL non-good pages (poor + needs-improvement), not just poor.
      // The groupedIssues loop already adds cwvGroupedIssues.instances.length
      // (= poor + needs-improvement), so we must NOT also add this via
      // buildWebVitalsPriorityIssues — that would double-count poor pages.
      // Fix: skip CWV flags in the groupedIssues loop (below) and use
      // the total non-good count here as the single source of truth.
      const affectedCount = c.agg.poor + c.agg.needsImprovement;
      return makeIssue(
        c.key,
        c.label,
        majority ? "critical" : "moderate",
        "standard",
        affectedCount,
        MINUTES_PER_INSTANCE[c.key]
      );
    });
}

export function buildPriorityList(audit: RunAuditResult, groupedIssues: GroupedIssue[]): PriorityIssue[] {
  const issueMap = new Map<string, PriorityIssue>();

  for (const group of groupedIssues) {
    const key = group.flag;
    // CWV flags (webvital_*) are handled separately by
    // buildWebVitalsPriorityIssues below — skip them here to avoid
    // double-counting (the groupedIssues loop would add total non-good
    // pages, then buildWebVitalsPriorityIssues would add again).
    if (key.startsWith("webvital_")) continue;
    if (issueMap.has(key)) {
      const existing = issueMap.get(key)!;
      const newCount = existing.count + group.instances.length;
      const newIssue = makeIssue(
        key,
        group.issueLabel,
        severityForFlag(key),
        effortForFlag(key),
        newCount
      );
      issueMap.set(key, newIssue);
    } else {
      issueMap.set(
        key,
        makeIssue(
          key,
          group.issueLabel,
          severityForFlag(key),
          effortForFlag(key),
          group.instances.length
        )
      );
    }
  }

  // Genuine failures ONLY — the same canonical set the Broken Links section
  // shows (transient timeouts/rate-limits/TLS hiccups are split out as
  // Temporary Crawl Issues). Counting them here used to inflate the number
  // everywhere else (3,013 vs the section's 3,012); every surface now
  // derives from genuineBrokenLinks so they can never disagree.
  const brokenLinksCount = genuineBrokenLinks(audit.brokenLinks).length;
  const brokenLinkPages = countBrokenLinkSourcePages(audit.brokenLinks);
  if (brokenLinksCount > 0) {
    const key = "broken_links";
    // Standard effort, deliberately: auditing 3,000+ broken endpoints,
    // classifying 404s/410s, and coordinating redirects is DAYS of work —
    // not a tag edit and never a "quick win".
    const brokenEffort = effortForFlag(key);
    if (issueMap.has(key)) {
      const existing = issueMap.get(key)!;
      const newCount = existing.count + brokenLinksCount;
      const newIssue = makeIssue(key, "Broken links", "critical", brokenEffort, newCount);
      newIssue.affectedPages = brokenLinkPages;
      issueMap.set(key, newIssue);
    } else {
      const newIssue = makeIssue(key, "Broken links", "critical", brokenEffort, brokenLinksCount);
      newIssue.affectedPages = brokenLinkPages;
      issueMap.set(key, newIssue);
    }
  }

  const oversizedImagesCount = audit.oversizedImages.filter((img) => img.isOversized).length;
  if (oversizedImagesCount > 0) {
    const key = "oversized_images";
    if (issueMap.has(key)) {
      const existing = issueMap.get(key)!;
      const newCount = existing.count + oversizedImagesCount;
      const newIssue = makeIssue(key, "Oversized images", "moderate", "standard", newCount);
      issueMap.set(key, newIssue);
    } else {
      issueMap.set(key, makeIssue(key, "Oversized images", "moderate", "standard", oversizedImagesCount));
    }
  }

  if (audit.crawl.duplicateTitles.length > 0) {
    const key = "duplicate_titles";
    const affectedUrlCount = audit.crawl.duplicateTitles.reduce((sum, g) => sum + g.urls.length, 0);
    if (issueMap.has(key)) {
      const existing = issueMap.get(key)!;
      const newCount = existing.count + affectedUrlCount;
      const newIssue = makeIssue(key, "Duplicate title tags", "critical", "quick", newCount);
      issueMap.set(key, newIssue);
    } else {
      issueMap.set(key, makeIssue(key, "Duplicate title tags", "critical", "quick", affectedUrlCount));
    }
  }

  if (audit.crawl.duplicateMetaDescriptions.length > 0) {
    const key = "duplicate_meta_descriptions";
    const affectedUrlCount = audit.crawl.duplicateMetaDescriptions.reduce((sum, g) => sum + g.urls.length, 0);
    if (issueMap.has(key)) {
      const existing = issueMap.get(key)!;
      const newCount = existing.count + affectedUrlCount;
      const newIssue = makeIssue(key, "Duplicate meta descriptions", "critical", "quick", newCount);
      issueMap.set(key, newIssue);
    } else {
      issueMap.set(key, makeIssue(key, "Duplicate meta descriptions", "critical", "quick", affectedUrlCount));
    }
  }

  // Sitemap is "missing" when not found OR when the primary location
  // returned an HTTP error (403/404/5xx) — search engines hitting the
  // primary URL see the error even if URLs were recovered from fallback.
  const sitemapHealthy = audit.crawl.sitemapAudit.status === "found"
    && audit.crawl.sitemapAudit.httpStatus !== undefined
    && audit.crawl.sitemapAudit.httpStatus >= 200
    && audit.crawl.sitemapAudit.httpStatus < 300;
  if (!sitemapHealthy) {
    issueMap.set("missing_sitemap", makeIssue("missing_sitemap", "Sitemap.xml not accessible", "critical", "quick", 1, 15));
  }

  const excessiveRedirectsCount = audit.crawl.redirectChains.filter((r) => r.excessive).length;
  if (excessiveRedirectsCount > 0) {
    const key = "excessive_redirects";
    if (issueMap.has(key)) {
      const existing = issueMap.get(key)!;
      const newCount = existing.count + excessiveRedirectsCount;
      const newIssue = makeIssue(key, "Excessive redirects", "moderate", "standard", newCount);
      issueMap.set(key, newIssue);
    } else {
      issueMap.set(key, makeIssue(key, "Excessive redirects", "moderate", "standard", excessiveRedirectsCount));
    }
  }

  if (audit.crawl.wwwConsistency && audit.crawl.wwwConsistency.checked && !audit.crawl.wwwConsistency.consistent) {
    const key = "www_inconsistent";
    if (issueMap.has(key)) {
      const existing = issueMap.get(key)!;
      const newCount = existing.count + 1;
      const newIssue = makeIssue(key, "www / non-www not consolidated", "critical", "standard", newCount);
      issueMap.set(key, newIssue);
    } else {
      issueMap.set(key, makeIssue(key, "www / non-www not consolidated", "critical", "standard", 1));
    }
  }

  const webVitalsIssues = buildWebVitalsPriorityIssues(resolveCoreWebVitals(audit));
  for (const issue of webVitalsIssues) {
    if (issueMap.has(issue.key)) {
      const existing = issueMap.get(issue.key)!;
      const newCount = existing.count + issue.count;
      const newIssue = makeIssue(issue.key, issue.label, issue.severity, issue.effort, newCount);
      issueMap.set(issue.key, newIssue);
    } else {
      issueMap.set(issue.key, issue);
    }
  }

  const list = Array.from(issueMap.values());
  
  // Template-level detection: when one issue type affects more than 80% of
  // the successfully crawled pages, it almost certainly originates from a
  // shared layout/template rather than N independent mistakes — the report
  // should say so explicitly ("Template-Level Fix (Resolves X Pages)").
  //
  // IMPORTANT: only page-flag-derived issues qualify. Site-wide aggregates
  // (broken_links counts LINKS, oversized_images counts IMAGES, duplicate
  // titles count URLs) are not page counts, so a ratio against total pages
  // could exceed 1.0 and falsely label e.g. "Broken links" as a
  // template-level fix — which is wrong framing. `groupedIssueKeys` is
  // exactly the set of issues that came from per-page flags, so template
  // logic is restricted to those.
  const totalOkPages = audit.crawl.pages.filter((p) => p.ok).length;
  const groupedIssueKeys = new Set(groupedIssues.map((g) => g.flag));
  if (totalOkPages > 0) {
    for (const issue of list) {
      issue.templateLevel =
        groupedIssueKeys.has(issue.key) && issue.count / totalOkPages > 0.8;
      // The effort bucket depends on whether the fix is template-level
      // (batchable) — recompute it now that templateLevel is final so the
      // badge in the priority table and roadmap can never contradict the
      // batch-aware total shown on the detail pages.
      issue.effortBucketLabel = effortBucketLabelForTotalMinutes(
        totalBatchAwareMinutes(issue.key, issue.count, issue.effort, issue.templateLevel)
      );
    }
  }
  
  // --- Context-aware noindex severity adjustment ---
  // noindex on system pages (login, checkout, admin, etc.) is expected
  // practice — not a critical SEO issue. Downgrade severity when ALL
  // affected URLs are system pages; keep critical when ANY are content pages.
  const NOINDEX_FLAGS = new Set(["noindex_meta_tag", "noindex_x_robots_tag"]);
  for (const issue of list) {
    if (!NOINDEX_FLAGS.has(issue.key)) continue;
    // Find the matching grouped issue to get affected URLs
    const group = groupedIssues.find((g) => g.flag === issue.key);
    if (!group) continue;
    const urls = group.instances.map((inst) => inst.url);
    if (urls.length === 0) continue;
    const classifications = urls.map((u) => classifyNoindexUrl(u));
    const allSystem = classifications.every((c) => c.classification === "intentional_safe");
    const anyContent = classifications.some((c) => c.classification !== "intentional_safe");
    if (allSystem) {
      issue.severity = "minor";
    } else if (anyContent) {
      // Mix of system and content pages — keep critical for the content pages
      // but note that some are expected. The severity stays critical because
      // at least one content page has unexpected noindex.
      issue.severity = "critical";
    }
  }

  // PRIORITY-FIRST sort (deliberate): ranked lists (Highest Priority
  // Actions, Top Priority Fixes, roadmap phases, implementation order)
  // order by priorityScore — impact × reach ÷ effort — NOT by severity.
  // Severity stays a descriptive badge on each issue; a single-page
  // critical issue must not outrank a 300-page quick moderate fix just
  // because its severity label is harsher. Severity only breaks ties.
  const severityRank: Record<PriorityIssue["severity"], number> = { critical: 0, moderate: 1, minor: 2 };
  return list.sort((a, b) => {
    const priorityDiff = b.priorityScore - a.priorityScore;
    if (priorityDiff !== 0) return priorityDiff;
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.count - a.count;
  });
}

export function buildQuickWins(priorityList: PriorityIssue[]): PriorityIssue[] {
  return priorityList.filter((issue) => issue.effort === "quick");
}

/** One-line plain-English fix description used by the "If You Only Do
 * 5 Things" condensed section — imperative, what the team should do, no
 * "why it matters" prose (that lives in the detailed sections). */
export const FIX_DESCRIPTIONS: Record<string, string> = {
  missing_title: "Write a unique, descriptive title tag for each page",
  title_length_out_of_range: "Trim or extend title tags to the ideal length",
  missing_meta_description: "Write a unique meta description for each page",
  meta_description_length_out_of_range: "Adjust meta descriptions to the ideal length",
  missing_h1: "Add one clear H1 that names the page's main topic",
  multiple_h1: "Keep exactly one H1 per page; demote the extras to H2s",
  missing_h2: "Add H2 subheadings that structure each page's content",
  thin_content: "Expand thin pages with genuinely useful, specific content",
  missing_canonical: "Add a self-referencing canonical tag to each page",
  canonical_mismatch: "Align canonical tags with the page's preferred URL",
  missing_alt_text: "Add descriptive alt text to every image",
  duplicate_alt_text: "Write unique alt text for each image",
  missing_image_dimensions: "Add width and height attributes to images",
  non_optimized_image_format: "Convert images to modern compressed formats",
  oversized_images: "Compress and resize oversized images",
  missing_lazy_loading: "Add lazy loading to below-the-fold images",
  missing_responsive_images: "Add responsive srcset sizes to images",
  poor_image_filenames: "Rename image files to descriptive hyphenated names",
  url_too_long: "Shorten long URLs to concise, readable paths",
  url_has_uppercase: "Convert uppercase characters in URLs to lowercase",
  url_has_underscores: "Replace underscores in URLs with hyphens",
  url_has_parameters: "Reduce tracking parameters in crawlable URLs",
  url_poor_readability: "Rewrite URLs to be human-readable",
  url_has_encoded_characters: "Replace percent-encoded characters in URLs with readable text",
  url_has_tracking_parameters: "Strip tracking parameters from canonical, crawlable URLs",
  url_uses_image_proxy: "Replace image-proxy URLs with clean, direct page URLs",
  url_too_deep: "Shorten only needlessly deep URL paths (keep necessary taxonomy depth)",
  url_has_file_extension: "Remove legacy file extensions and use clean URL slugs",
  broken_links: "Fix or redirect broken links",
  duplicate_titles: "Make each title tag unique across pages",
  duplicate_meta_descriptions: "Make each meta description unique across pages",
  excessive_redirects: "Collapse multi-hop redirect chains into direct links",
  missing_schema_markup: "Add structured data matching each page's content",
  invalid_schema_markup: "Fix errors in existing structured data markup",
  noindex_meta_tag: "Remove the noindex meta tag where indexing is intended",
  noindex_x_robots_tag: "Remove the noindex X-Robots-Tag header where indexing is intended",
  orphan_page: "Add internal links pointing to orphaned pages",
  soft_404: "Return a proper 404/410 status or redirect to the correct page",
  www_inconsistent: "Consolidate the site onto one www / non-www domain",
  missing_sitemap: "Create and submit an XML sitemap",
  webvital_lcp_poor: "Speed up largest content render (LCP)",
  webvital_inp_poor: "Reduce interaction latency (INP)",
  webvital_cls_poor: "Eliminate layout shifts (CLS)",
  webvital_ttfb_poor: "Reduce server response time (TTFB)",
};

/** One short fix item for the "If You Only Do 5 Things" condensed section. */
export interface TopQuickAction {
  key: string;
  label: string;
  description: string;
  pageCount: number;
  /** What pageCount measures (pages/links/images/URLs) — same COUNT_UNIT
   * the priority list uses, so "3,013 links" can never read as pages. */
  countUnit: string;
  estimatedTime: string; // batch-aware total, e.g. "~39 min total"
}

/**
 * The top-N highest-leverage actions for a skimming stakeholder: ranked by
 * (impact × pages affected ÷ effort), reusing the SAME PriorityIssue data
 * (impactStars, count, per-instance minutes) as the rest of the report —
 * no independently computed values. Returns at most `limit` items; empty
 * when there are no prioritized issues. Kept in the shared layer so the
 * web UI and PDF render identical selections.
 */
export function buildTopQuickActions(priorityList: PriorityIssue[], limit = 5): TopQuickAction[] {
  return priorityList
    .map((issue) => {
      const minutes = MINUTES_PER_INSTANCE[issue.key] ?? 10;
      // impact × reach ÷ effort — high-impact, widespread, quick fixes win.
      const leverage = (issue.impactStars * Math.max(1, issue.count)) / minutes;
      return { issue, leverage };
    })
    .sort((a, b) => b.leverage - a.leverage)
    .slice(0, limit)
    .map(({ issue }) => ({
      key: issue.key,
      label: issue.label,
      description: FIX_DESCRIPTIONS[issue.key] ?? issue.label,
      pageCount: issue.count,
      countUnit: issue.countUnit,
      estimatedTime: estimateBatchAwareTime(issue).label,
    }));
}