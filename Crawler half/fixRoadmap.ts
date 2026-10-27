/**
 * Fix Roadmap — the client-facing answer to "what should we fix first?".
 *
 * Built ENTIRELY from existing audit data — nothing is re-calculated and
 * nothing is invented:
 *
 *   - which issues exist  -> priorityList (buildPriorityList in
 *                            priorityIssues.ts) — the same authoritative
 *                            "issues needing action" list the Priority
 *                            Fixes, Quick Wins, and 30-Day Action Plan use;
 *   - affected counts     -> the PriorityIssue fields (count, countUnit,
 *                            affectedPages) — never recomputed here;
 *   - affected URLs       -> the Complete SEO Check Coverage evidence
 *                            (CoverageCheck.affectedUrls, which itself
 *                            comes from the crawler's grouped issues /
 *                            site-wide checks / CWV aggregate), falling
 *                            back to the same grouped-issue instances;
 *   - why / recommended   -> the existing FixFirst copy (coverage copy,
 *                            grouped-issue copy, issue templates,
 *                            FIX_DESCRIPTIONS) — reused, never duplicated;
 *   - priority tier       -> a single documented, deterministic rule
 *                            (fixTierFor) applied to the existing
 *                            PriorityIssue fields (severity, key, priority
 *                            tier). No AI, no arbitrary scoring.
 *
 * The three tiers (Fix First / Fix Next / Optimize) are deliberately
 * selective: only issues that can materially affect crawling, indexing,
 * access to important content, or core user experience go into Fix First;
 * lower-impact improvements land in Optimize regardless of how many pages
 * they affect (a critical indexability problem on 2 pages outranks missing
 * alt text on 500).
 *
 * Both renderers (web report + PDF) consume this one module so the roadmap
 * can never disagree between surfaces.
 */

import type { RunAuditResult } from "./types";
import type { PriorityIssue } from "./priorityIssues";
import { FIX_DESCRIPTIONS } from "./priorityIssues";
import type { CoverageCheck } from "./seoCheckCoverage";
import { COVERAGE_URLS_INLINE_LIMIT } from "./seoCheckCoverage";
import type { GroupedIssue } from "./groupIssues";
import { getIssueTemplate } from "./templates";
import { blockedFromAutomatedChecking } from "./brokenLinkClassification";
import type { AeoCheck } from "./aeoTypes";
import { effectivePriorityWeight, AEO_PRIORITY_WEIGHT, AEO_IMPACT_WEIGHT, AEO_DIFF_WEIGHT } from "./aeoTypes";

/** The three roadmap tiers, in display order. Values intentionally match
 * the FixRoadmap property names (fixFirst / fixNext / optimize) so
 * renderers can index `fixRoadmap[tier]` without a second lookup table. */
export const FIX_TIER_ORDER = ["fixFirst", "fixNext", "optimize"] as const;
export type FixTier = (typeof FIX_TIER_ORDER)[number];

export const FIX_TIER_META: Record<FixTier, { title: string; blurb: string }> = {
  fixFirst: {
    title: "Fix First",
    blurb:
      "Issues that can materially affect crawling, indexing, access to important content, or core user experience. Resolve these before anything else — even when only a few pages are affected.",
  },
  fixNext: {
    title: "Fix Next",
    blurb:
      "Important issues to address after the Fix First items — meaningful SEO or user-experience impact, typically spread across many pages or requiring moderate effort.",
  },
  optimize: {
    title: "Optimize",
    blurb:
      "Lower-impact improvements and optimization opportunities. Worth doing when convenient — but not blocking, and not worth delaying other work for.",
  },
};

/**
 * Issue keys that can block crawling, indexing, or access to important
 * content — the core "Fix First" criterion. Deliberately keyed, not
 * count-based: one indexability problem on a critical page matters more
 * than hundreds of cosmetic issues, so these always sit at the top.
 */
const CRAWL_INDEX_BLOCKING_KEYS = new Set([
  "noindex_meta_tag",
  "noindex_x_robots_tag",
  "broken_links",
  "missing_canonical",
  "canonical_mismatch",
  "www_inconsistent",
  "missing_sitemap",
  "robots_blocked_links",
  "orphan_page",
]);

/**
 * AEO check keys that block AI systems from accessing or understanding
 * content — the AI equivalent of crawl/index blockers. These go into
 * "Fix First" when they affect important content.
 */
const AEO_FIX_FIRST_KEYS = new Set([
  "gptbot",
  "chatgpt-user",
  "claudebot",
  "perplexitybot",
  "indexability_aeo",
  "canonicals_aeo",
  "broken_links_aeo",
]);

/**
 * AEO check keys that are foundational for AI understanding —
 * structured data, entity consistency, content structure.
 * These go into "Fix Next" when they affect important content.
 */
const AEO_FIX_NEXT_KEYS = new Set([
  "schema_organization",
  "schema_localbusiness",
  "schema_person",
  "schema_article",
  "schema_faq",
  "schema_breadcrumb",
  "schema_product",
  "schema_sameas",
  "entity_consistency",
  "question_headings",
  "lists_tables",
  "heading_hierarchy",
  "llms_txt",
  "render_mode",
]);

/**
 * AEO check keys that are lower-priority optimizations —
 * content quality signals, trust enhancements, advanced AEO.
 * These go into "Optimize".
 */
const AEO_OPTIMIZE_KEYS = new Set([
  "author_name",
  "last_updated",
  "contact_info",
  "about_page",
  "numeric_density",
  "duplicate_content_aeo",
  "missing_faq_opportunity",
  "missing_tldr",
  "internal_links_related",
  "external_authority_links",
  "semantic_density",
  "robots_sitemap_aeo",
  "redirect_chains_aeo",
  "core_web_vitals_aeo",
  "alt_text_aeo",
  "meta_title_aeo",
  "meta_description_aeo",
  "og_tags",
  "twitter_card_tags",
]);

/**
 * AEO check keys that overlap with existing traditional SEO issues.
 * These are DEDUPLICATED — the traditional SEO roadmap item takes
 * precedence since it already covers the same fix.
 */
const AEO_OVERLAP_KEYS = new Set([
  "heading_hierarchy",   // overlaps with missing_h2 / multiple_h1
  "alt_text_aeo",        // overlaps with missing_alt_text
  "meta_title_aeo",      // overlaps with missing_title
  "meta_description_aeo", // overlaps with missing_meta_description
  "broken_links_aeo",    // overlaps with broken_links
  "indexability_aeo",    // overlaps with noindex_*
  "canonicals_aeo",      // overlaps with missing_canonical
  "robots_sitemap_aeo",  // overlaps with missing_sitemap
  "redirect_chains_aeo", // overlaps with excessive_redirects
  "core_web_vitals_aeo", // overlaps with webvital_*
]);

/**
 * The single, documented, deterministic tier rule (the one place it lives):
 *
 *   Fix First  — severity "critical" (missing title/H1, noindex, broken
 *                links, www consolidation), OR the issue blocks
 *                crawling/indexing/important-content access (the key set
 *                above), OR it is a Core Web Vital (a major user-experience
 *                problem).
 *   Fix Next   — everything else with severity "moderate", OR a
 *                medium/high implementation-priority tier (the existing
 *                impact × reach ÷ effort ranking says it matters).
 *   Optimize   — the remainder: minor-severity, lower-impact improvements
 *                (alt text, URL hygiene, image formats, etc.).
 */
export function fixTierFor(issue: PriorityIssue): FixTier {
  if (issue.severity === "critical") return "fixFirst";
  if (CRAWL_INDEX_BLOCKING_KEYS.has(issue.key)) return "fixFirst";
  if (issue.key.startsWith("webvital_")) return "fixFirst";
  if (issue.severity === "moderate" || issue.priorityTier === "high" || issue.priorityTier === "medium") {
    return "fixNext";
  }
  return "optimize";
}

/**
 * Determines the roadmap tier for an AEO check based on its priority,
 * impact, and the check's key. AEO checks that overlap with existing
 * traditional SEO issues are excluded by the caller (deduplication).
 */
function aeoTierFor(check: AeoCheck): FixTier {
  // Critical/high-priority AEO checks that block AI access → Fix First
  if (AEO_FIX_FIRST_KEYS.has(check.key)) {
    // Only promote to Fix First if the check actually fails and has meaningful scope
    if (!check.passed && (check.priority === "critical" || check.priority === "high")) {
      return "fixFirst";
    }
  }
  // Foundational AI understanding checks → Fix Next
  if (AEO_FIX_NEXT_KEYS.has(check.key) && !check.passed) {
    return "fixNext";
  }
  // Low-priority or best-practice checks → Optimize
  if (check.priority === "low" || check.priority === "best_practice") {
    return "optimize";
  }
  // Use the weighted scoring for remaining checks
  const priorityW = effectivePriorityWeight(check);
  const impactW = AEO_IMPACT_WEIGHT[check.expectedImpact] ?? 3;
  const combined = priorityW + impactW;
  // High combined score → Fix Next; otherwise → Optimize
  if (combined >= 6) return "fixNext";
  return "optimize";
}

/**
 * Converts a failing AEO check into a FixRoadmapItem, using the AEO
 * check's own metadata (label, whyItMatters, recommendedFix, affectedUrls).
 * Only called for checks that don't overlap with existing SEO issues.
 */
function aeoCheckToRoadmapItem(check: AeoCheck, tier: FixTier): FixRoadmapItem {
  const countUnit = check.countUnit ?? "pages";
  return {
    key: check.key,
    label: check.label,
    tier,
    count: check.affectedCount,
    countUnit,
    severity: check.priority === "critical" ? "critical" : check.priority === "high" ? "moderate" : "minor",
    effortBucketLabel: check.timeLabel,
    templateLevel: check.affectedCount > 20, // heuristic: many affected pages → likely template-level
    whyItMatters: check.whyItMatters,
    recommendation: check.recommendedFix || "See the AI Search Readiness section of this report for details.",
    affectedUrls: check.affectedUrls,
    hasMoreAffectedUrls: check.hasMoreAffectedUrls,
  };
}

/** One roadmap item — every field maps to a real audit finding. */
export interface FixRoadmapItem {
  key: string;
  label: string;
  tier: FixTier;
  /** Affected count — the SAME number the priority list shows (never
   * recomputed). For broken links this is link instances, not pages. */
  count: number;
  /** What `count` measures — "pages" / "links" / "images" / "URLs". */
  countUnit: string;
  /** Distinct pages actually affected — populated where `count` measures
   * something other than pages (e.g. broken links: link instances vs the
   * pages carrying them). */
  affectedPages?: number;
  severity: PriorityIssue["severity"];
  effortBucketLabel: string;
  templateLevel: boolean;
  /** Why it matters — reused from the existing FixFirst copy. */
  whyItMatters: string;
  /** The recommended action — reused from the existing FixFirst copy where
   * one exists; otherwise the centralized one-liner in FIX_DESCRIPTIONS. */
  recommendation: string;
  /** The actual affected URLs from the crawler dataset; empty only when the
   * check genuinely has no per-page evidence (site-level checks like www
   * consistency or sitemap presence) — never manufactured. */
  affectedUrls: string[];
  /** True when the full URL set is larger than COVERAGE_URLS_INLINE_LIMIT
   * (the one configurable display threshold) — renderers then show a sample
   * + a pointer to the CSV export instead of the whole list. */
  hasMoreAffectedUrls: boolean;
}

export interface FixRoadmap {
  fixFirst: FixRoadmapItem[];
  fixNext: FixRoadmapItem[];
  optimize: FixRoadmapItem[];
}

/** Total roadmap items across all three tiers (for empty-state checks). */
export function countFixRoadmapItems(roadmap: FixRoadmap): number {
  return roadmap.fixFirst.length + roadmap.fixNext.length + roadmap.optimize.length;
}

/**
 * Centralized why/action copy for the one priority issue that has no
 * template, no auxiliary copy, and no coverage catalog entry: links our
 * automated checker was refused (403/401/429). Written once here — the same
 * wording the priority engine and CSV use — so the roadmap never invents a
 * reason or a fix for it.
 */
const ROADMAP_FALLBACK_COPY: Record<string, { whyItMatters: string; recommendation: string }> = {
  links_blocked_from_checking: {
    whyItMatters:
      "These links point to pages our automated checker could not reach — a WAF, bot-protection rule, or rate limit refused the request. The block means each destination was never verified, not that the link is broken.",
    recommendation:
      "Spot-check a sample of these links in a regular browser — most will load fine for real visitors. If a WAF or bot rule is involved, whitelist the crawler so future audits can verify them.",
  },
};

/** Honest fallback for any future priority key with no copy anywhere — the
 * roadmap never fabricates a reason, it points to the report's own detail. */
const DEFAULT_WHY =
  "This issue was detected during the audit and is explained in full in its dedicated section of this report.";

/**
 * Resolves the WHY + ACTION for a roadmap item from the existing FixFirst
 * copy sources, in priority order: the coverage check's copy (which itself
 * reuses grouped-issue/template/auxiliary copy), the grouped issue's copy,
 * the issue template, the centralized one-line FIX_DESCRIPTIONS, then the
 * fallback table above. Never generates new copy inline.
 */
function resolveCopy(
  issue: PriorityIssue,
  check: CoverageCheck | undefined,
  group: GroupedIssue | undefined
): { whyItMatters: string; recommendation: string } {
  if (check) {
    return { whyItMatters: check.whyItMatters, recommendation: check.recommendedFix };
  }
  if (group) {
    return { whyItMatters: group.whyItMatters, recommendation: group.recommendedFix };
  }
  const template = getIssueTemplate(issue.key);
  if (template) {
    return { whyItMatters: template.whyItMatters, recommendation: template.recommendedFix };
  }
  const fallback = ROADMAP_FALLBACK_COPY[issue.key];
  if (fallback) {
    return { whyItMatters: fallback.whyItMatters, recommendation: fallback.recommendation };
  }
  return {
    whyItMatters: DEFAULT_WHY,
    recommendation: FIX_DESCRIPTIONS[issue.key] ?? "See the dedicated section of this report for the recommended fix.",
  };
}

/**
 * Builds the three-tier Fix Roadmap from the authoritative existing data:
 * the priority list (which issues exist + severity/effort/counts) and the
 * Complete SEO Check Coverage evidence (real affected URLs + reused copy).
 * Items keep the priority list's deterministic order (priority score, then
 * severity, then count) within each tier.
 */
export function buildFixRoadmap(
  priorityList: PriorityIssue[],
  coverageChecks: CoverageCheck[],
  groupedIssues: GroupedIssue[],
  audit: RunAuditResult,
  aeoChecks?: AeoCheck[]
): FixRoadmap {
  const coverageByKey = new Map(coverageChecks.map((c) => [c.key, c]));
  const groupedByKey = new Map(groupedIssues.map((g) => [g.flag, g]));

  const buckets: Record<FixTier, FixRoadmapItem[]> = { fixFirst: [], fixNext: [], optimize: [] };

  // Collect all traditional SEO issue keys for deduplication
  const seoIssueKeys = new Set(priorityList.map((i) => i.key));

  for (const issue of priorityList) {
    const tier = fixTierFor(issue);
    const check = coverageByKey.get(issue.key);
    const group = groupedByKey.get(issue.key);

    // Real crawler URLs from the same sources the coverage section uses.
    // Only the genuinely site-level checks (www consistency, sitemap) end
    // up empty — the roadmap then honestly omits a URL list.
    const affectedUrls =
      check !== undefined
        ? check.affectedUrls
        : group !== undefined
          ? group.instances.map((i) => i.url)
          : issue.key === "links_blocked_from_checking"
            ? blockedFromAutomatedChecking(audit.brokenLinks).map((l) => l.url)
            : [];

    const copy = resolveCopy(issue, check, group);

    buckets[tier].push({
      key: issue.key,
      label: issue.label,
      tier,
      count: issue.count,
      countUnit: issue.countUnit,
      ...(issue.affectedPages !== undefined ? { affectedPages: issue.affectedPages } : {}),
      severity: issue.severity,
      effortBucketLabel: issue.effortBucketLabel,
      templateLevel: issue.templateLevel,
      whyItMatters: copy.whyItMatters,
      recommendation: copy.recommendation,
      affectedUrls,
      hasMoreAffectedUrls: affectedUrls.length > COVERAGE_URLS_INLINE_LIMIT,
    });
  }

  // Integrate AEO/GEO findings into the roadmap
  if (aeoChecks && aeoChecks.length > 0) {
    for (const aeoCheck of aeoChecks) {
      // Skip passing checks, not-applicable checks, and checks that
      // overlap with existing traditional SEO roadmap items
      if (aeoCheck.passed) continue;
      if (aeoCheck.applicabilityStatus === "not_applicable") continue;
      if (AEO_OVERLAP_KEYS.has(aeoCheck.key)) continue;
      // Also skip if the key already exists in the SEO roadmap (extra safety)
      if (seoIssueKeys.has(aeoCheck.key)) continue;

      const tier = aeoTierFor(aeoCheck);
      const item = aeoCheckToRoadmapItem(aeoCheck, tier);
      buckets[tier].push(item);
    }
  }

  // Sort each tier: traditional SEO items first (by priority score),
  // then AEO items (by effective priority weight)
  for (const tier of FIX_TIER_ORDER) {
    buckets[tier].sort((a, b) => {
      // Traditional SEO items come before AEO items within each tier
      const aIsAeo = a.key in AEO_FIX_FIRST_KEYS || a.key in AEO_FIX_NEXT_KEYS || a.key in AEO_OPTIMIZE_KEYS;
      const bIsAeo = b.key in AEO_FIX_FIRST_KEYS || b.key in AEO_FIX_NEXT_KEYS || b.key in AEO_OPTIMIZE_KEYS;
      if (aIsAeo !== bIsAeo) return aIsAeo ? 1 : -1; // SEO first
      // Within same type, sort by severity (critical first)
      const severityOrder = { critical: 0, moderate: 1, minor: 2 };
      return (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
    });
  }

  return { fixFirst: buckets.fixFirst, fixNext: buckets.fixNext, optimize: buckets.optimize };
}
