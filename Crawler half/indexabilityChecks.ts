import type { RunAuditResult, CrawlPageSuccess } from "./types";
import { buildInternalLinkGraph } from "./internalLinkGraph";
import { getIssueTemplate } from "./templates";
import { getCodeSnippet } from "./codeSnippets";
import { buildIssueGroupSmartNote } from "./smartRecommendations";
import type { GroupedIssue } from "./groupIssues";

export interface IndexabilityCheckResult {
  key: "noindex_meta_tag" | "noindex_x_robots_tag" | "orphan_page";
  label: string;
  passed: boolean;
  affectedCount: number;
  affectedUrls: string[];
  statusText: string;
}

/**
 * The three checks the Indexability grid always reports. Report surfaces
 * filter these flags OUT of the AI-derived issue streams and render the
 * check-derived groups instead, so the grid, the detail pages, and the CSV
 * all read the same affected-URL dataset (single source of truth).
 */
export const INDEXABILITY_CHECK_FLAGS: ReadonlySet<string> = new Set([
  "noindex_meta_tag",
  "noindex_x_robots_tag",
  "orphan_page",
]);

/**
 * Detailed issue groups for every FAILED indexability check, built from the
 * check's own real data (affectedUrls / affectedCount / statusText) plus the
 * shared per-flag templates (why it matters, business impact, recommended
 * fix) and code snippets. Passed checks return nothing — they stay concise
 * in the grid and never generate a detail page.
 *
 * This is what makes a failed check actionable: the same shared
 * GroupedIssue shape every other report section renders, so Indexability
 * details get the full treatment (priority, impact, effort, fix, affected
 * URLs, CSV link) without a second reporting architecture.
 */
export function buildIndexabilityDetailGroups(audit: RunAuditResult): GroupedIssue[] {
  const groups: GroupedIssue[] = [];
  for (const check of buildIndexabilityChecks(audit)) {
    if (check.passed) continue;
    const template = getIssueTemplate(check.key);
    const group: GroupedIssue = {
      flag: check.key,
      issueLabel: template?.issueLabel ?? check.label,
      whyItMatters: template?.whyItMatters ?? check.statusText,
      businessImpact: template?.businessImpact ?? check.statusText,
      recommendedFix: template?.recommendedFix ?? check.statusText,
      instances: check.affectedUrls.map((url) => ({
        url,
        suggestedText: null,
        aiGenerated: false,
        currentValue: null,
      })),
      instancesByUrl: new Set(check.affectedUrls),
      smartNote: "",
      codeSnippet: getCodeSnippet(check.key, undefined, null),
      remediation: null,
    };
    group.smartNote = buildIssueGroupSmartNote(group);
    groups.push(group);
  }
  return groups;
}

/**
 * These three checks must ALWAYS be reported — pass or fail — instead of
 * only appearing when a page happens to trip the flag. Silently omitting
 * a check when it passes makes "we checked, you're clean" indistinguishable
 * from "this report doesn't check that."
 */
export function buildIndexabilityChecks(audit: RunAuditResult): IndexabilityCheckResult[] {
  const okPages = audit.crawl.pages.filter((p): p is CrawlPageSuccess => p.ok);

  const noindexMetaPages = okPages.filter((p) => p.flags.includes("noindex_meta_tag"));
  const noindexXRobotsPages = okPages.filter((p) => p.flags.includes("noindex_x_robots_tag"));
  // Orphan set comes from the SAME shared graph helper the Internal Linking
  // Analysis page and the CSV export use — the three can never disagree.
  // (Defined as "zero internal links pointing at the page", not "not
  // reachable from the home page" — those are different metrics.)
  const { orphanPages } = buildInternalLinkGraph(audit);

  return [
    {
      key: "noindex_meta_tag",
      label: "Noindex meta tag",
      passed: noindexMetaPages.length === 0,
      affectedCount: noindexMetaPages.length,
      affectedUrls: noindexMetaPages.map((p) => p.url),
      statusText:
        noindexMetaPages.length === 0
          ? 'Checked — no pages are blocked from indexing by a <meta name="robots" content="noindex"> tag.'
          : `${noindexMetaPages.length} page${noindexMetaPages.length === 1 ? "" : "s"} carry a noindex meta tag and will not appear in search results.`,
    },
    {
      key: "noindex_x_robots_tag",
      label: "X-Robots-Tag noindex",
      passed: noindexXRobotsPages.length === 0,
      affectedCount: noindexXRobotsPages.length,
      affectedUrls: noindexXRobotsPages.map((p) => p.url),
      statusText:
        noindexXRobotsPages.length === 0
          ? "Checked — no pages are blocked from indexing via the X-Robots-Tag HTTP header."
          : `${noindexXRobotsPages.length} page${noindexXRobotsPages.length === 1 ? "" : "s"} are blocked at the server/header level — easy to miss since it never shows up in page source.`,
    },
    {
      key: "orphan_page",
      label: "Orphan pages",
      passed: orphanPages.length === 0,
      affectedCount: orphanPages.length,
      affectedUrls: orphanPages,
      statusText:
        orphanPages.length === 0
          ? "Checked — every crawled page has at least one internal link pointing to it (orphan = zero inbound internal links; distinct from pages not reached from the home page)."
          : `${orphanPages.length} page${orphanPages.length === 1 ? "" : "s"} have no internal links pointing to them.`,
    },
  ];
}