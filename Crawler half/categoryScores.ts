import type { RunAuditResult } from "./types";
import { computeCategoryScores } from "./score";
import { resolveCoreWebVitals } from "./coreWebVitals";

export interface CategoryScore {
  key: string;
  label: string;
  score: number; // 0-100, rounded
}

/**
 * Lightweight category breakdown for the visual score bars on the report
 * cover page. This is now a thin wrapper around the shared computeCategoryScores
 * function from score.ts, ensuring category scores are consistent with the
 * overall score calculation.
 */
export function buildCategoryScores(audit: RunAuditResult): CategoryScore[] {
  // Extract AEO score when available for the AI Search Readiness pillar
  const aeoScore = audit.aeo?.checks
    ? (() => {
        const evaluated = audit.aeo.checks.filter(
          (c) => c.applicabilityStatus !== "not_applicable"
        );
        if (evaluated.length === 0) return null;
        const passCount = evaluated.filter((c) => c.passed).length;
        return Math.round((passCount / evaluated.length) * 100);
      })()
    : null;

  const c = computeCategoryScores(
    audit.crawl,
    audit.brokenLinks,
    audit.oversizedImages,
    resolveCoreWebVitals(audit),
    aeoScore
  );

  // Three-pillar display — each pillar is an independently bounded 0-100
  // score. The overall score is the weighted average of these three.
  return [
    {
      key: "onPage",
      label: "On-Page SEO",
      score: Math.round(c.onPage),
    },
    {
      key: "technical",
      label: "Technical SEO",
      score: Math.round(c.technical),
    },
    {
      key: "aiSearchReadiness",
      label: "AI Search Readiness (Schema)",
      score: Math.round(c.aiSearchReadiness),
    },
  ];
}