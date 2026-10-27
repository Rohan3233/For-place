/**
 * Shared types for the AI Search Optimization (AEO/GEO) section.
 *
 * DESIGN NOTE: this deliberately reuses the same flat shape as the
 * existing `CoverageCheck` (seoCheckCoverage.ts) / `IndexabilityCheckResult`
 * (indexabilityChecks.ts) pattern already used elsewhere in this report —
 * "always show, pass or fail" — rather than inventing a new visual
 * language. That means the AEO section can reuse the EXACT existing
 * `.checksGrid` / `.checkCard` markup + styles already defined in both
 * reportDocument.tsx and app/audit/[id]/page.tsx, just fed a different
 * data source. See PATCH_NOTES_AEO.md for the render-side wiring.
 */

import { SCHEMA_APPLICABILITY } from "./aeoCopy";

export type AeoCategory =
  | "AI Crawlability"
  | "AI Structured Data"
  | "AI Answer Readiness"
  | "Trust & Entity Signals"
  | "Content Quality Signals"
  | "AI Technical Readiness";

export type AeoPriority = "critical" | "high" | "medium" | "low" | "best_practice";
export type AeoDifficulty = "easy" | "medium" | "advanced" | "enterprise";
export type AeoImpact = "very_high" | "high" | "medium" | "low";

/**
 * Consulting metadata attached to every AI check — priority, difficulty,
 * estimated time, expected impact, and the business-outcome framing. Fed
 * from the static AEO_META map in aeoCopy.ts (with category-aware
 * defaults), so the PDF/web cards can present each issue like a
 * recommendation rather than a diagnostic row.
 */
export interface AeoMeta {
  priority: AeoPriority;
  difficulty: AeoDifficulty;
  timeLabel: string;
  expectedImpact: AeoImpact;
  /** Business-outcome framing of the issue (why a business owner should care). */
  businessImpact: string;
}

export interface AeoCodeSnippet {
  label: string;
  code: string;
}

export interface AeoCheck {
  key: string;
  label: string;
  category: AeoCategory;
  passed: boolean;
  affectedCount: number;
  /** Sample of affected URLs, capped — same convention as GroupedIssue instances. */
  affectedUrls: string[];
  statusText: string;
  whyItMatters: string;
  /** Empty string when passed — nothing to fix. */
  recommendedFix: string;
  /** Optional concrete example (e.g. a robots.txt rule or JSON-LD block) shown under the fix. Null when a snippet doesn't apply. */
  codeSnippet: AeoCodeSnippet | null;
  /** True when codeSnippet was generated specifically for THIS site (real
   * domain/entity name from the crawl) rather than a generic placeholder
   * example (e.g. "Product Name", "yoursite.com"). Client-facing reports
   * show only site-specific snippets; generic placeholder code is hidden
   * so it never reads as a ready-to-paste fix. */
  siteSpecificCode?: boolean;
  /** True when there are more affected URLs than affectedUrls contains — drives the "full list in the CSV export" note. */
  hasMoreAffectedUrls: boolean;
  /** What affectedCount counts — "pages" for per-page checks, but "links"
   * for broken_links_aeo, "chains" for redirect_chains_aeo, and "URLs" for
   * duplicate_content_aeo. Same unit the priority list uses, so a badge can
   * never call broken links "pages affected". Absent on checks built before
   * this field existed — renderers fall back to "pages". */
  countUnit?: string;
  /** Concise "Valid for" note explaining who a conditional (site-type-specific)
   * schema check is intended for, e.g. "Valid for: Ecommerce websites and
   * pages representing purchasable products…". Absent for checks that apply
   * to every site. */
  applicability?: string;
  /** Applicability decision for conditional schema checks, computed from
   * crawl evidence (see schemaApplicability.ts). "not_applicable" checks
   * are presented as "Not applicable — <reason>" instead of failing
   * priority items: they are excluded from the Recommended Implementation
   * Order, Quick Wins, and the AI readiness score, but stay visible in
   * the AI Structured Data section so the analysis isn't suppressed.
   * undefined / "unknown" keeps the existing priority + note. */
  applicabilityStatus?: "applicable" | "not_applicable" | "unknown";
  /** Client-facing reason for the applicability decision, e.g. "No product
   * or ecommerce pages detected in the crawl." */
  applicabilityReason?: string;
  /** For conditional schema checks: how many pages actually qualify for
   * this schema type (e.g. FAQPage: pages with genuine Q&A content). Used
   * by the ranking so a narrow check (6 qualifying pages) can never
   * outrank a fix affecting 100+ pages. */
  qualifiedPages?: number;

  // --- Actionability fields (WHAT/WHY/WHERE/WHAT/HOW/VERIFY) ---
  /** Concise description of what the crawler actually found (or didn't find). */
  finding?: string;
  /** Raw evidence: measured values, detected signals, or the absence thereof. */
  evidence?: string;
  /** The count of URLs affected by this issue. Derived from affectedUrls.length but
   * may differ when affectedUrls is a capped sample. */
  affectedUrlCount?: number;
  /** Where this fix should be applied. Derived from crawl data, not a generic
   * "apply sitewide" — e.g. "individual article/blog pages with identifiable authors"
   * or "robots.txt at the site root". */
  implementationScope?: string;
  /** Why this matters for AI search visibility — technically defensible, never
   * overclaiming (no "ChatGPT will cite you" / "AI will rank you higher"). */
  whyItMattersAi?: string;
  /** What specifically needs to be implemented (code, markup, content change). */
  whatToImplement?: string;
  /** Where exactly to add the implementation (template, specific files, meta tags). */
  whereToImplement?: string;
  /** Step-by-step implementation guidance. */
  implementationGuidance?: string;
  /** How to verify the fix was applied correctly (recrawl, schema validator, etc.). */
  verificationSteps?: string;
  /** One-line summary recommendation for the issue. */
  recommendation?: string;

  priority: AeoPriority;
  difficulty: AeoDifficulty;
  timeLabel: string;
  expectedImpact: AeoImpact;
  businessImpact: string;
}

export interface AeoBotAccessResult {
  bot: "GPTBot" | "ChatGPT-User" | "ClaudeBot" | "PerplexityBot" | "Google-Extended";
  status: "allowed" | "blocked" | "unknown";
  /** Specific paths disallowed for this bot (excludes root "/" which means everything). */
  blockedPaths: string[];
  /** Raw rules applicable to this bot (Allow/Disallow lines from its block). */
  relevantRules: string[];
  /** True when the bot is systematically blocked from accessing public informational content — not just private/admin paths. */
  systemicBlock: boolean;
}

export interface AeoAuditResult {
  botAccess: AeoBotAccessResult[];
  llmsTxt: { present: boolean; url: string };
  checks: AeoCheck[];
}

const AEO_META_DEFAULTS: AeoMeta = {
  priority: "medium",
  difficulty: "medium",
  timeLabel: "1 hour",
  expectedImpact: "medium",
  businessImpact:
    "Addressing this improves the site's AI visibility and its chances of being cited in AI-generated answers.",
};

/**
 * Normalizes checks from audits crawled BEFORE the consulting-metadata
 * fields existed (cached `audit_result` rows): every missing
 * priority/difficulty/time/impact/business-impact value is filled with a
 * neutral default, so the render layer can never crash on an undefined
 * field. Applied defensively wherever AEO checks enter the PDF/web views.
 *
 * Conditional schema checks that predate the applicability fields are also
 * backfilled with their static "Valid for" note — no site-type detection
 * involved, the guidance is identical for every report, and the check's
 * priority is never altered.
 */
export function withAeoMetaDefaults(check: AeoCheck): AeoCheck {
  const normalized: AeoCheck = {
    ...check,
    priority: check.priority ?? AEO_META_DEFAULTS.priority,
    difficulty: check.difficulty ?? AEO_META_DEFAULTS.difficulty,
    timeLabel: check.timeLabel ?? AEO_META_DEFAULTS.timeLabel,
    expectedImpact: check.expectedImpact ?? AEO_META_DEFAULTS.expectedImpact,
    businessImpact: check.businessImpact ?? AEO_META_DEFAULTS.businessImpact,
  };
  if (normalized.applicability === undefined && SCHEMA_APPLICABILITY[check.key] !== undefined) {
    normalized.applicability = SCHEMA_APPLICABILITY[check.key];
  }
  return normalized;
}

/** Shared priority/impact/difficulty weights used by the ranking below.
 * (Previously defined in reportDocument.tsx — moved here so the PDF and
 * any other surface rank identically.) */
export const AEO_PRIORITY_WEIGHT: Record<AeoPriority, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  best_practice: 1,
};
export const AEO_IMPACT_WEIGHT: Record<AeoImpact, number> = {
  very_high: 5,
  high: 4,
  medium: 3,
  low: 2,
};
export const AEO_DIFF_WEIGHT: Record<AeoDifficulty, number> = {
  easy: 1,
  medium: 2,
  advanced: 3,
  enterprise: 4,
};

/**
 * Effective priority weight for ranking, clamped by applicability and by
 * how many pages actually qualify for the check:
 *  - "not_applicable" → -1 (never ranks; callers filter it out entirely).
 *  - A conditional schema check with few qualifying pages is stepped down
 *    so a narrow fix (e.g. FAQPage with 6 qualifying pages) can never
 *    outrank a sitewide fix affecting 100+ pages. Floor: medium.
 */
export function effectivePriorityWeight(c: AeoCheck): number {
  if (c.applicabilityStatus === "not_applicable") return -1;
  let w = AEO_PRIORITY_WEIGHT[c.priority];
  if (c.qualifiedPages !== undefined && c.qualifiedPages < 20) {
    const drop = c.qualifiedPages < 10 ? 2 : 1;
    w = Math.max(AEO_PRIORITY_WEIGHT.medium, w - drop);
  }
  return w;
}

/** Failing AI checks ranked by effective priority, then expected impact,
 * then ease — the order a client should implement them in. "Not
 * applicable" checks never enter the ranking. */
export function rankAeoChecks(checks: AeoCheck[]): AeoCheck[] {
  return checks
    .filter((c) => !c.passed && c.applicabilityStatus !== "not_applicable")
    .sort(
      (a, b) =>
        effectivePriorityWeight(b) - effectivePriorityWeight(a) ||
        AEO_IMPACT_WEIGHT[b.expectedImpact] - AEO_IMPACT_WEIGHT[a.expectedImpact] ||
        AEO_DIFF_WEIGHT[a.difficulty] - AEO_DIFF_WEIGHT[b.difficulty]
    );
}

/**
 * Pass/fail summary for the AI readiness score. "Not applicable" checks
 * are excluded entirely — they are neither a pass nor a failure, so an
 * irrelevant schema type can't drag a site's AI readiness score down.
 */
export function aeoSummary(checks: AeoCheck[]): { passCount: number; failCount: number } {
  const evaluated = checks.filter((c) => c.applicabilityStatus !== "not_applicable");
  return {
    passCount: evaluated.filter((c) => c.passed).length,
    failCount: evaluated.filter((c) => !c.passed).length,
  };
}

export function groupAeoChecksByCategory(checks: AeoCheck[]): { category: AeoCategory; checks: AeoCheck[] }[] {
  const order: AeoCategory[] = [
    "AI Crawlability",
    "AI Structured Data",
    "AI Answer Readiness",
    "Trust & Entity Signals",
    "Content Quality Signals",
    "AI Technical Readiness",
  ];
  return order
    .map((category) => ({ category, checks: checks.filter((c) => c.category === category) }))
    .filter((g) => g.checks.length > 0);
}

// ---------------------------------------------------------------------------
// AI Readiness dimensions — a second lens over the same AEO checks. Instead
// of grouping by *what kind of check* each item is (crawlability, schema,
// etc.), these dimensions group by *why it matters to an AI system*:
// "can it understand the entity? format the answer? trust the source? cite
// it?" — the language a business owner / agency client actually cares about.
// ---------------------------------------------------------------------------

export interface AiReadinessDimension {
  key: string;
  label: string;
  /** One concise sentence explaining what feeds this dimension's score. */
  description: string;
  /** 0-100, passCount / totalCount for the checks mapped to this dimension. */
  score: number;
  passCount: number;
  totalCount: number;
}

/** Which check keys feed each AI-readiness dimension. A single check can
 * legitimately feed several dimensions (e.g. author_name strengthens both
 * Entity Clarity and Trust Signals) — that's intentional, the dimensions
 * answer different questions. */
const READINESS_DIMENSION_CHECKS: Record<string, string[]> = {
  entity_clarity: [
    "entity_consistency",
    "schema_organization",
    "schema_person",
    "schema_sameas",
    "about_page",
    "semantic_density",
  ],
  structured_data: [
    "schema_organization",
    "schema_localbusiness",
    "schema_person",
    "schema_article",
    "schema_faq",
    "schema_breadcrumb",
    "schema_product",
    "schema_sameas",
  ],
  answer_formatting: ["question_headings", "lists_tables", "heading_hierarchy", "missing_tldr", "missing_faq_opportunity"],
  trust_signals: [
    "author_name",
    "last_updated",
    "contact_info",
    "about_page",
    "entity_consistency",
    "numeric_density",
    "external_authority_links",
    "duplicate_content_aeo",
  ],
  content_structure: [
    "question_headings",
    "lists_tables",
    "heading_hierarchy",
    "missing_tldr",
    "internal_links_related",
    "thin_content_aeo",
    "missing_faq_opportunity",
    "semantic_density",
  ],
};

/**
 * Scores each AI-readiness dimension from the checks that feed it. The
 * "citation_readiness" dimension is fed separately (its checks live in the
 * dedicated AI Citation Readiness section, not audit.aeo.checks), so this
 * helper takes them as an optional second argument.
 */
export function buildAiReadinessDimensions(
  checks: AeoCheck[],
  citationChecks: CitationReadinessCheck[] = []
): AiReadinessDimension[] {
  const byKey = new Map(checks.map((c) => [c.key, c]));
  const dimensions: { key: string; label: string; description: string; keys: string[] }[] = [
    {
      key: "entity_clarity",
      label: "Entity Clarity",
      description: "How unambiguously AI systems can identify who this site is and what it represents.",
      keys: READINESS_DIMENSION_CHECKS.entity_clarity,
    },
    {
      key: "structured_data",
      label: "Structured Data",
      description: "Whether the site marks up its entities, content, and facts in machine-readable schema.",
      keys: READINESS_DIMENSION_CHECKS.structured_data,
    },
    {
      key: "answer_formatting",
      label: "Answer Formatting",
      description: "Whether content is structured so AI engines can extract a direct, citable answer.",
      keys: READINESS_DIMENSION_CHECKS.answer_formatting,
    },
    {
      key: "citation_readiness",
      label: "Citation Readiness",
      description: "Whether the site publishes the trust, contact, and provenance signals AI systems look for before citing a source.",
      keys: [], // fed from citationChecks below
    },
    {
      key: "trust_signals",
      label: "Trust Signals",
      description: "The authority and credibility markers (authorship, freshness, verifiable facts) AI engines weigh when ranking sources.",
      keys: READINESS_DIMENSION_CHECKS.trust_signals,
    },
    {
      key: "content_structure",
      label: "AI Content Structure",
      description: "How well page structure (headings, lists, summaries, internal links) supports AI parsing and retrieval.",
      keys: READINESS_DIMENSION_CHECKS.content_structure,
    },
  ];

  return dimensions.map((d) => {
    if (d.key === "citation_readiness") {
      const total = citationChecks.filter((c) => c.measured).length;
      const pass = citationChecks.filter((c) => c.measured && c.passed).length;
      return {
        key: d.key,
        label: d.label,
        description: d.description,
        score: total > 0 ? Math.round((pass / total) * 100) : 0,
        passCount: pass,
        totalCount: total,
      };
    }
    const applicable = d.keys.map((k) => byKey.get(k)).filter((c): c is AeoCheck => !!c);
    const total = applicable.length;
    const pass = applicable.filter((c) => c.passed).length;
    return {
      key: d.key,
      label: d.label,
      description: d.description,
      score: total > 0 ? Math.round((pass / total) * 100) : 0,
      passCount: pass,
      totalCount: total,
    };
  });
}

/**
 * Top-level AI-readiness summary, DERIVED from the six readiness-dimension
 * breakdowns rather than counted separately from the raw check list.
 *
 * The dimensions are the authoritative place the check results actually
 * live (each dimension sums the pass/total of the checks that feed it), and
 * a single check can legitimately feed several dimensions — so the top-line
 * "X of Y checks passing" figure is the SUM of the dimension counts, not a
 * count of unique checks. Deriving it here guarantees the dashboard
 * headline and the breakdown below it can never drift apart again: the
 * identity sum(dim.passCount) === headline passCount and
 * sum(dim.totalCount) === headline totalCount holds by construction.
 */
export function deriveAiReadinessSummary(dimensions: AiReadinessDimension[]): {
  passCount: number;
  totalCount: number;
} {
  return dimensions.reduce(
    (acc, d) => ({ passCount: acc.passCount + d.passCount, totalCount: acc.totalCount + d.totalCount }),
    { passCount: 0, totalCount: 0 }
  );
}

// ---------------------------------------------------------------------------
// AI Citation Readiness — dedicated trust/provenance assessment
// ---------------------------------------------------------------------------

export interface CitationReadinessCheck {
  key: string;
  label: string;
  /** What exactly was looked for on the crawled pages. */
  finding: string;
  passed: boolean;
  /** True when the crawl actually collected this signal (false for audits
   * cached before this section existed — those can't be evaluated yet). */
  measured: boolean;
  statusText: string;
  recommendation: string;
  /** "Who this signal is for" note for checks that only matter for certain
   * site types (e.g. an editorial-policy page is a publisher/E-E-A-T
   * signal, not a requirement for a pure product store). Absent for
   * signals that apply to every site. */
  applicability?: string;
}

export interface CitationReadinessResult {
  /** 0-100, or null when nothing was measured. */
  score: number | null;
  passCount: number;
  measuredCount: number;
  checks: CitationReadinessCheck[];
}

// ---------------------------------------------------------------------------
// AI Visibility Opportunities — opportunity framing instead of problems only
// ---------------------------------------------------------------------------

export interface AiVisibilityOpportunity {
  key: string;
  title: string;
  /** Why this content format wins in AI answer engines. */
  benefit: string;
  /** One sentence on the specific action this site can take. */
  action: string;
  /** Affected/eligible URLs (capped sample) — pages this opportunity applies to. */
  pages: string[];
  /** Full count of eligible pages (before the sample cap). */
  pageCount: number;
  /** Evidence the opportunity exists, e.g. "6 pages answer 2+ questions without FAQPage schema". */
  evidence: string;
  /** "Who this is for / who can ignore it" note for opportunities that only
   * make sense for certain site types (step-by-step how-to content, local
   * business presence, ecommerce product pages). Absent for advice that
   * applies to every site. */
  applicability?: string;
}
