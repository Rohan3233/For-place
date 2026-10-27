import type { PriorityIssue } from "./priorityIssues";

/**
 * Single shared source of truth for "how bad is this issue" labeling —
 * used by both the PDF (reportDocument.tsx) and the web report
 * (app/audit/[id]/page.tsx) so a client never sees the same issue called
 * "critical" in one place and "high" in another. Deliberately just a
 * thin wrapper around PriorityIssue.severity (already computed in
 * priorityIssues.ts) rather than a second scoring system — this is a
 * presentation-layer mapping, not new logic.
 */
export type ImpactLevel = "high" | "medium" | "low";

export const IMPACT_FROM_SEVERITY: Record<PriorityIssue["severity"], ImpactLevel> = {
  critical: "high",
  moderate: "medium",
  minor: "low",
};

export const IMPACT_EMOJI: Record<ImpactLevel, string> = {
  high: "🔴",
  medium: "🟠",
  low: "🟢",
};

export const IMPACT_LABEL: Record<ImpactLevel, string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

/** Short imperative framing for the "fix this first" style grouping (#15). */
export const IMPACT_ACTION_LABEL: Record<ImpactLevel, string> = {
  high: "Fix this first",
  medium: "Fix this next",
  low: "Address when convenient",
};

export function impactLevelForIssue(issue: PriorityIssue): ImpactLevel {
  return IMPACT_FROM_SEVERITY[issue.severity];
}

export function impactBadgeText(issue: PriorityIssue): string {
  return `${IMPACT_EMOJI[impactLevelForIssue(issue)]} ${IMPACT_LABEL[impactLevelForIssue(issue)]}`;
}

/**
 * A 5-block "solid squares out of 5" bar (■■■□□) driven off the same
 * impactStars priorityIssues.ts already computes — reused rather than
 * re-derived, so this always agrees with the ★/☆ shown elsewhere.
 */
export function impactBarText(issue: PriorityIssue): string {
  return "■".repeat(issue.impactStars) + "□".repeat(5 - issue.impactStars);
}

export interface PriorityMatrixRow {
  level: ImpactLevel;
  emoji: string;
  actionLabel: string;
  issueTypeCount: number; // distinct issue types at this level
  affectedCount: number; // total pages/instances across those types
}

/**
 * Builds the "Priority matrix" summary block (#19) — one row per impact
 * level, with both the number of distinct issue TYPES and the total
 * pages/instances affected, since clients care about both "how many
 * different things" and "how big is each one."
 */
export function buildPriorityMatrix(priorityList: PriorityIssue[]): PriorityMatrixRow[] {
  const levels: ImpactLevel[] = ["high", "medium", "low"];
  return levels.map((level) => {
    const matching = priorityList.filter((i) => impactLevelForIssue(i) === level);
    return {
      level,
      emoji: IMPACT_EMOJI[level],
      actionLabel: IMPACT_ACTION_LABEL[level],
      issueTypeCount: matching.length,
      affectedCount: matching.reduce((sum, i) => sum + i.count, 0),
    };
  });
}

/**
 * "Top 5 issues specific to your site" intro copy (#20) — a short,
 * plain-English framing sentence per issue, built from data already on
 * PriorityIssue rather than a template that reads as auto-generated.
 * Kept deliberately varied/conversational — see buildPersonalizedIntro.
 */
export function buildPersonalizedIntro(priorityList: PriorityIssue[], domain: string): string {
  const top = priorityList.slice(0, 5);
  if (top.length === 0) {
    return `${domain} came back clean — no issues worth prioritizing right now. The rest of this report is mostly a record of what's already working.`;
  }
  const lead = top[0];
  const rest = top.slice(1);
  const restText =
    rest.length > 0
      ? ` After that, ${rest.map((i) => i.label.toLowerCase()).join(", ")} round out the list — same reasoning, smaller scale.`
      : "";
  return `Looking at ${domain}, the first thing worth fixing is ${lead.label.toLowerCase()} — it's flagged on ${lead.count} page${lead.count === 1 ? "" : "s"} and, based on how search engines weigh this kind of issue, it's the one most likely to be costing real visibility today.${restText}`;
}
