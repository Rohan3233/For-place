import type { PriorityIssue } from "./priorityIssues";
import type { AeoCheck } from "./aeoTypes";

/**
 * One phase of the suggested implementation sequence. Explicitly a
 * *suggested order*, not a guaranteed timeline — same honesty standard as
 * the impact/effort estimates elsewhere in the report (heuristics, not
 * measured facts). Phases with no issues are omitted rather than shown
 * empty.
 */
export interface ActionPlanWeek {
  weekNumber: 1 | 2 | 3 | 4;
  title: string;
  days: string; // the time window this phase covers, e.g. "Days 1–7"
  focus: string; // one-line rationale for why these issues are grouped here
  outcome: string; // one-line expected result once this phase is complete
  issues: PriorityIssue[];
}

const WEEK_TITLES: Record<ActionPlanWeek["weekNumber"], { title: string; days: string; focus: string; outcome: string }> = {
  1: {
    title: "Phase 1: Critical Technical & Indexation Fixes",
    days: "Days 1–7",
    focus: "Critical technical/indexation problems — broken canonicals, accidental noindex tags, broken links, and crawl errors that block search engines from indexing important pages.",
    outcome: "All critical indexation blockers resolved — search engines can now discover and index the site's important pages without obstruction.",
  },
  2: {
    title: "Phase 2: High-Impact On-Page SEO",
    days: "Days 8–14",
    focus: "High-impact on-page issues — titles, meta descriptions, headings, alt text, and image optimization across the site.",
    outcome: "Every page presents a clear, optimized message to search engines — titles, descriptions, and headings are consistent, unique, and within target lengths.",
  },
  3: {
    title: "Phase 3: Structured Data & AI Search Readiness",
    days: "Days 15–21",
    focus: "Structured data implementation and AI-search readiness — JSON-LD schema markup, entity consistency, and content structure for machine readability.",
    outcome: "Structured data implemented across relevant pages — the site's entities, content, and facts are machine-readable for both traditional search and AI answer engines.",
  },
  4: {
    title: "Phase 4: Content, Authority & Performance",
    days: "Days 22–30",
    focus: "Content quality improvements, internal linking, Core Web Vitals optimization, and entity/authority strengthening.",
    outcome: "Content quality elevated, internal linking strengthened, and performance optimized — the site is well-positioned for sustained organic growth.",
  },
};

/**
 * Explicit flag -> week mapping aligned with the three-pillar audit spec:
 *   Days 1–7: Critical technical/indexation problems (Pillar B)
 *   Days 8–14: High-impact on-page issues (Pillar A)
 *   Days 15–21: Structured data and AI-search readiness (Pillar C)
 *   Days 22–30: Content, authority, performance improvements
 *
 * Any flag key not listed here falls through to inferWeekFromFields()
 * below, so new issue types added later don't silently disappear.
 */
const WEEK_BY_FLAG: Record<string, ActionPlanWeek["weekNumber"]> = {
  // Week 1 — Critical Technical & Indexation (Pillar B: Technical SEO)
  // Broken links, canonical issues, accidental noindex, crawl errors
  broken_links: 1,
  missing_canonical: 1,
  canonical_mismatch: 1,
  noindex_meta_tag: 1,
  noindex_x_robots_tag: 1,
  www_inconsistent: 1,
  excessive_redirects: 1,
  missing_sitemap: 1,

  // Week 2 — High-Impact On-Page (Pillar A: On-Page SEO)
  // Titles, descriptions, headings, images, URL structure
  missing_title: 2,
  title_length_out_of_range: 2,
  missing_meta_description: 2,
  meta_description_length_out_of_range: 2,
  missing_h1: 2,
  multiple_h1: 2,
  duplicate_titles: 2,
  duplicate_meta_descriptions: 2,
  missing_alt_text: 2,
  duplicate_alt_text: 2,
  missing_image_dimensions: 2,
  missing_lazy_loading: 2,
  missing_responsive_images: 2,
  poor_image_filenames: 2,
  oversized_images: 2,
  non_optimized_image_format: 2,
  links_blocked_from_checking: 2,

  // Week 3 — Structured Data & AI Search Readiness (Pillar C)
  missing_schema_markup: 3,
  invalid_schema_markup: 3,

  // Week 4 — Content, Authority & Performance
  // Content quality, internal linking, CWV, URL structure
  thin_content: 4,
  missing_h2: 4,
  no_internal_links: 4,
  orphan_page: 4,
  url_too_long: 4,
  url_has_uppercase: 4,
  url_has_underscores: 4,
  url_has_parameters: 4,
  url_poor_readability: 4,
  url_has_encoded_characters: 4,
  url_has_tracking_parameters: 4,
  url_uses_image_proxy: 4,
  url_too_deep: 4,
  url_has_file_extension: 4,
  webvital_lcp_poor: 4,
  webvital_inp_poor: 4,
  webvital_cls_poor: 4,
  webvital_ttfb_poor: 4,
};

/**
 * AEO check key -> week mapping for AI Search Readiness findings.
 * Only non-overlapping AEO checks are mapped here (overlapping ones
 * are handled by the traditional SEO mapping above).
 */
const AEO_WEEK_BY_FLAG: Record<string, ActionPlanWeek["weekNumber"]> = {
  // Week 1 — Critical AI access blockers
  // Bot access blocking, indexability issues that affect AI crawlers
  gptbot: 1,
  "chatgpt-user": 1,
  claudebot: 1,
  perplexitybot: 1,

  // Week 3 — Foundational AI understanding
  // Structured data, entity consistency, content structure for AI
  schema_organization: 3,
  schema_localbusiness: 3,
  schema_person: 3,
  schema_article: 3,
  schema_faq: 3,
  schema_breadcrumb: 3,
  schema_product: 3,
  schema_sameas: 3,
  entity_consistency: 3,
  llms_txt: 3,
  render_mode: 3,
  question_headings: 3,
  lists_tables: 3,

  // Week 4 — Content quality & trust signals for AI
  // Lower-priority AEO improvements
  author_name: 4,
  last_updated: 4,
  numeric_density: 4,
  duplicate_content_aeo: 4,
  missing_faq_opportunity: 4,
  missing_tldr: 4,
  internal_links_related: 4,
  external_authority_links: 4,
  semantic_density: 4,
  og_tags: 4,
  twitter_card_tags: 4,
};

/**
 * Fallback for any issue key not in WEEK_BY_FLAG (e.g. a new flag added
 * later that this file hasn't been updated for). Keeps the plan
 * exhaustive rather than dropping unrecognized issues silently:
 *   - quick-effort + critical/moderate-leaning -> Week 2 (metadata-style)
 *   - standard-effort -> Week 3 (content-style)
 * This is intentionally coarse; a new flag should get an explicit entry
 * above rather than relying on this indefinitely.
 */
function inferWeekFromFields(issue: PriorityIssue): ActionPlanWeek["weekNumber"] {
  return issue.effort === "quick" ? 2 : 3;
}

/**
 * AEO check keys that overlap with existing traditional SEO issues.
 * These are DEDUPLICATED — the traditional SEO roadmap item takes
 * precedence since it already covers the same fix.
 */
const AEO_OVERLAP_KEYS = new Set([
  "heading_hierarchy",
  "alt_text_aeo",
  "meta_title_aeo",
  "meta_description_aeo",
  "broken_links_aeo",
  "indexability_aeo",
  "canonicals_aeo",
  "robots_sitemap_aeo",
  "redirect_chains_aeo",
  "core_web_vitals_aeo",
]);

/**
 * Determines the week for an AEO check based on its priority and key.
 */
function inferAeoWeek(check: AeoCheck): ActionPlanWeek["weekNumber"] {
  // Critical/high-priority AI access blockers → Week 1
  if (check.priority === "critical" || check.priority === "high") {
    return 1;
  }
  // Medium priority → Week 3 (structured data / AI understanding)
  if (check.priority === "medium") {
    return 3;
  }
  // Low/best-practice → Week 4 (optimization)
  return 4;
}

/**
 * Builds the 4-week suggested sequence from the already-computed
 * priorityList. No new data fetched, no AI calls — pure bucketing of
 * data we already have. Weeks with no issues are omitted rather than
 * shown empty (e.g. a site with zero performance issues won't show a
 * blank Week 4).
 *
 * When AEO checks are supplied, failing non-overlapping AEO checks are
 * integrated into the appropriate weeks based on their priority and
 * category. AEO checks that overlap with existing SEO issues are
 * deduplicated (the SEO item takes precedence).
 */
export function buildActionPlan(
  priorityList: PriorityIssue[],
  aeoChecks?: AeoCheck[]
): ActionPlanWeek[] {
  const buckets: Record<ActionPlanWeek["weekNumber"], PriorityIssue[]> = { 1: [], 2: [], 3: [], 4: [] };
  const seoKeys = new Set(priorityList.map((i) => i.key));

  for (const issue of priorityList) {
    const week = WEEK_BY_FLAG[issue.key] ?? inferWeekFromFields(issue);
    buckets[week].push(issue);
  }

  // Integrate AEO checks as PriorityIssue-shaped items for the action plan
  if (aeoChecks && aeoChecks.length > 0) {
    for (const aeoCheck of aeoChecks) {
      if (aeoCheck.passed) continue;
      if (aeoCheck.applicabilityStatus === "not_applicable") continue;
      if (AEO_OVERLAP_KEYS.has(aeoCheck.key)) continue;
      if (seoKeys.has(aeoCheck.key)) continue;

      const week = AEO_WEEK_BY_FLAG[aeoCheck.key] ?? inferAeoWeek(aeoCheck);

      // Convert AEO check to a PriorityIssue-shaped item for the action plan
      const aeoAsIssue: PriorityIssue = {
        key: aeoCheck.key,
        label: aeoCheck.label,
        pillar: "aiSearchReadiness",
        severity: aeoCheck.priority === "critical" ? "critical" : aeoCheck.priority === "high" ? "moderate" : "minor",
        effort: aeoCheck.difficulty === "easy" || aeoCheck.difficulty === "medium" ? "quick" : "standard",
        count: aeoCheck.affectedCount,
        estimatedTimeLabel: aeoCheck.timeLabel,
        effortBucketLabel: aeoCheck.timeLabel,
        templateLevel: aeoCheck.affectedCount > 20,
        impactStars: aeoCheck.expectedImpact === "very_high" ? 5 : aeoCheck.expectedImpact === "high" ? 4 : aeoCheck.expectedImpact === "medium" ? 3 : 2,
        difficultyStars: aeoCheck.difficulty === "easy" ? 1 : aeoCheck.difficulty === "medium" ? 2 : aeoCheck.difficulty === "advanced" ? 4 : 5,
        priorityScore: 0,
        priorityTier: aeoCheck.priority === "critical" || aeoCheck.priority === "high" ? "high" : aeoCheck.priority === "medium" ? "medium" : "low",
        impactLabel: aeoCheck.priority === "critical" ? "🔴 High Impact" : aeoCheck.priority === "high" ? "🟠 Medium Impact" : "🟢 Low Impact",
        difficultyLabel: aeoCheck.difficulty === "easy" ? "Easy" : aeoCheck.difficulty === "medium" ? "Medium" : "Hard",
        batchFixPossible: false,
        countUnit: aeoCheck.countUnit ?? "pages",
      };

      buckets[week].push(aeoAsIssue);
    }
  }

  const weeks: ActionPlanWeek[] = [];
  for (const weekNumber of [1, 2, 3, 4] as const) {
    if (buckets[weekNumber].length === 0) continue;
    weeks.push({
      weekNumber,
      title: WEEK_TITLES[weekNumber].title,
      days: WEEK_TITLES[weekNumber].days,
      focus: WEEK_TITLES[weekNumber].focus,
      outcome: WEEK_TITLES[weekNumber].outcome,
      issues: buckets[weekNumber],
    });
  }
  return weeks;
}