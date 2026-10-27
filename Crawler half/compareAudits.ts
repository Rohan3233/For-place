import type { RunAuditResult, AuditComparison } from "./types";
import { genuineBrokenLinks } from "./brokenLinkClassification";

/**
 * Compares two audits of the same site (e.g. before/after a client fixes
 * issues) and produces exactly the data the business doc's "Re-audit"
 * feature needs to display:
 *
 *   Previous Score: 58
 *   Current Score: 82
 *   Problems fixed: ✓ Missing H1  ✓ Duplicate titles  ✓ Large images
 *   Overall improvement: +24 SEO Score
 *
 * This function is deliberately pure and has no persistence concerns —
 * fetching the "previous" audit (from Supabase, wherever you store audit
 * history) is the caller's job. This just diffs two results you already
 * have in hand.
 *
 * IMPORTANT for the AI-cost strategy from the business doc: the whole point
 * of separating "problemsFixed" from "newProblems" is so your AI-explanation
 * layer only needs to call the LLM for genuinely NEW issues — an issue that
 * was already explained in the previous audit and is now fixed just needs a
 * checkmark (conditional logic), no new AI call. That logic lives in
 * whatever calls this function, not here — this just gives you the two
 * clean lists to branch on.
 */
export function compareAudits(previous: RunAuditResult, current: RunAuditResult): AuditComparison {
  const previousFlags = collectAllFlags(previous);
  const currentFlags = collectAllFlags(current);

  const problemsFixed = Array.from(previousFlags).filter((f) => !currentFlags.has(f));
  const newProblems = Array.from(currentFlags).filter((f) => !previousFlags.has(f));

  // Genuine failures only — same canonical set the report's broken-link
  // counts use, so "broken links fixed/new" in a re-audit comparison never
  // counts transient or 403/429-crawler-blocked links as broken.
  const previousBrokenUrls = new Set(genuineBrokenLinks(previous.brokenLinks).map((b) => b.url));
  const currentBrokenUrls = new Set(genuineBrokenLinks(current.brokenLinks).map((b) => b.url));

  const brokenLinksFixed = Array.from(previousBrokenUrls).filter(
    (u) => !currentBrokenUrls.has(u)
  ).length;
  const brokenLinksNew = Array.from(currentBrokenUrls).filter(
    (u) => !previousBrokenUrls.has(u)
  ).length;

  return {
    previousScore: previous.score.overallScore,
    currentScore: current.score.overallScore,
    scoreDelta: current.score.overallScore - previous.score.overallScore,
    problemsFixed,
    newProblems,
    brokenLinksFixed,
    brokenLinksNew,
    previousAuditAt: previous.crawl.crawledAt,
    currentAuditAt: current.crawl.crawledAt,
  };
}

/**
 * Collects the set of unique flag TYPES present anywhere across a crawl
 * (e.g. "missing_h1", "missing_alt_text") — not per-page occurrences. For
 * a client-facing "problems fixed" checklist, what matters is whether the
 * issue type still exists anywhere on the site, not exactly which page had
 * it, since a single freelancer fix (e.g. a template change) often resolves
 * the same flag across many pages at once.
 */
function collectAllFlags(auditResult: RunAuditResult): Set<string> {
  const flags = new Set<string>();
  for (const page of auditResult.crawl.pages) {
    if (page.ok) {
      for (const flag of page.flags) flags.add(flag);
    }
  }
  return flags;
}
