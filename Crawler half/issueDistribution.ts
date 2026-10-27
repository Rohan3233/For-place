import type { PriorityIssue } from "./priorityIssues";
import type { RunAuditResult } from "./types";
import type { GroupedIssue } from "./groupIssues";
import { genuineBrokenLinks, blockedFromAutomatedChecking } from "./brokenLinkClassification";

export interface IssueDistributionItem {
  key: string;
  label: string;
  count: number;
  barWidthPct: number; // 0-100, relative to the largest count in the list
}

/**
 * Every issue type found, ranked by how many pages/instances it affects —
 * different ordering from priorityList (which ranks by severity first).
 * Feeds the "Issue Distribution" bar chart, which answers "what's most
 * widespread," not "what's most severe."
 *
 * FIX (was silently top-6 only): this previously sliced to `limit` (6)
 * unconditionally, so real issues — broken links, missing H1s, multiple
 * H1s, anything that wasn't in the top 6 by raw count — could vanish from
 * the report entirely with no indication anything was cut. An "Issues"
 * section that quietly drops issue types is worse than useless: it looks
 * complete. Now this returns every issue type by default (limit undefined
 * = no cap). Callers that genuinely want a condensed "top N" view (e.g. a
 * small chart that can't fit 15 rows) pass an explicit limit and get
 * `truncated`/`omittedCount` back so the UI can say "+N more" instead of
 * silently disappearing them.
 */
export function buildIssueDistribution(
  priorityList: PriorityIssue[],
  limit?: number
): IssueDistributionItem[] {
  const sorted = [...priorityList].sort((a, b) => b.count - a.count);
  const shown = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  const maxCount = shown.length > 0 ? shown[0].count : 1;
  return shown.map((issue) => ({
    key: issue.key,
    label: issue.label,
    count: issue.count,
    barWidthPct: Math.max(6, Math.round((issue.count / maxCount) * 100)),
  }));
}

/** Companion to buildIssueDistribution — how many issue types got left out
 * when a limit WAS passed, so the UI can render an honest "+N more issue
 * types" line instead of just stopping. */
export function issueDistributionOmittedCount(priorityList: PriorityIssue[], limit: number): number {
  return Math.max(0, priorityList.length - limit);
}

/**
 * Distinct pages carrying at least one issue, unioned across every issue
 * source the report knows about (per-page flag groups, broken links,
 * oversized images, duplicate titles, duplicate meta descriptions). This
 * is the denominator behind "X issue types affecting Y checks across Z
 * pages" — the Z that keeps the headline count honest: issue TYPES lead,
 * total checks and affected pages are the supporting detail, and a page
 * with five issues counts once, not five times.
 *
 * Shared by both report surfaces (PDF + web) so the number is always the
 * same regardless of which one a client reads.
 */
export function countDistinctAffectedPages(
  audit: RunAuditResult,
  groupedIssues: GroupedIssue[]
): number {
  const pages = new Set<string>();
  for (const group of groupedIssues) {
    for (const instance of group.instances) pages.add(instance.url);
  }
  // Genuine + blocked-from-checking links only — temporary failures
  // (timeouts, rate limits that clear on a rerun) are not an issue type in
  // the priority list, so their source pages shouldn't inflate the
  // headline "affected pages" figure either.
  for (const link of [...genuineBrokenLinks(audit.brokenLinks), ...blockedFromAutomatedChecking(audit.brokenLinks)]) {
    for (const from of link.linkedFrom) pages.add(from);
  }
  for (const image of audit.oversizedImages) {
    if (image.isOversized) for (const from of image.linkedFrom) pages.add(from);
  }
  for (const group of audit.crawl.duplicateTitles) {
    for (const url of group.urls) pages.add(url);
  }
  for (const group of audit.crawl.duplicateMetaDescriptions) {
    for (const url of group.urls) pages.add(url);
  }
  return pages.size;
}
