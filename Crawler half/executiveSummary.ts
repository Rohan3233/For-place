/**
 * Builds the plain-English narrative for the report's Executive Summary
 * section — shared between the PDF (reportDocument.tsx) and the web
 * report (app/audit/[id]/page.tsx) so the two surfaces never say
 * different things about the same audit.
 *
 * COPY NOTE (item #8): the old version was one fixed sentence template
 * every single time — same clause order, same connective phrases. Read
 * across a handful of reports back to back, that's an instant tell that
 * it's machine-generated. This version keeps the same underlying facts
 * but assembles them with a couple of small structural variations, so
 * two reports with different numbers don't read like the same paragraph
 * with the blanks swapped.
 */
import { getAiReadinessVerdict } from "./scoreVerdict";

export interface ExecutiveSummaryInput {
  pagesCrawled: number;
  issueTypeCount: number;
  affectedChecks: number;
  /** Distinct pages carrying at least one issue — the figure that keeps the
   * total-findings number honest. affectedChecks sums instances across
   * heterogeneous units (pages, links, images, URLs), so the summary must
   * never imply those are all "pages"; when this is provided it states the
   * total as "individual findings" and adds the distinct-page count. */
  affectedPages?: number;
  criticalTypeCount: number;
  quickWinsCount: number;
  topIssueLabels: string[];
  /** Optional 0-100 AI Search Readiness score. When present, one concise
   * AEO/GEO sentence is appended to the summary (a headline differentiator
   * of this report) — never a repeat of the detailed AI section. The score
   * is the SHARE of AI-readiness checks passing (passCount / totalCount),
   * so the sentence always states it as a percentage with the underlying
   * check counts — it is a pass/fail share, not a weighted index. */
  aiReadinessScore?: number;
  aiReadinessChecks?: { passCount: number; totalCount: number };
}

/** Verdict label for the AI Search Readiness score — shared with the
 * dashboard panels via getAiReadinessVerdict so the summary sentence and
 * the score panels always agree. The AI-readiness scale is deliberately
 * separate from the SEO score's rubric (stricter pass/fail basis), and
 * every surface that shows its label makes that distinction visible. */
function aiReadinessTierLabel(score: number): string {
  return getAiReadinessVerdict(score).label;
}

export function buildExecutiveSummaryText(input: ExecutiveSummaryInput): string {
  const { pagesCrawled, issueTypeCount, affectedChecks, criticalTypeCount, quickWinsCount, topIssueLabels } = input;
  const pageWord = pagesCrawled === 1 ? "page" : "pages";

  const aiSentence =
    input.aiReadinessScore !== undefined
      ? buildAiReadinessSentence(input.aiReadinessScore, input.aiReadinessChecks)
      : "";

  if (issueTypeCount === 0) {
    return `We crawled ${pagesCrawled} ${pageWord} on this site and came back with nothing to flag — every page checked out clean. That's a genuinely strong result; most sites this size turn up at least a handful of small issues.${aiSentence}`;
  }

  const topIssuesSentence =
    topIssueLabels.length > 0
      ? `The issues carrying the most weight here are ${joinWithAnd(topIssueLabels)}.`
      : "";

  // Severity is reported separately from priority: "critical" describes how
  // damaging an issue is WHERE IT APPLIES, not what to fix first. What to
  // fix first is the Top Priority Fixes ranking (impact × reach ÷ effort),
  // which can legitimately put a wide quick fix above a single-page
  // critical one — so the summary must not tell the client to "jump the
  // queue" by severity alone.
  let riskSentence: string;
  if (criticalTypeCount === 0) {
    riskSentence = "None of these issues are critical in severity — no major blockers stopping search engines from indexing the site.";
  } else if (criticalTypeCount === 1) {
    riskSentence = "One of these is critical in severity, meaning it carries the highest risk where it applies — the ranked lists below weigh that against reach and effort.";
  } else {
    riskSentence = `${criticalTypeCount} of these are critical in severity — the highest-risk items where they apply, though what to fix first also weighs reach and effort (see the Top Priority Fixes ranking).`;
  }

  let closingSentence: string;
  if (quickWinsCount === 0) {
    closingSentence = "None of these are quick fixes — expect this to take some sustained content or technical work rather than an afternoon.";
  } else if (quickWinsCount === issueTypeCount) {
    closingSentence = `The encouraging part: all ${quickWinsCount} of these are quick, tag-level fixes — no rebuild required.`;
  } else {
    closingSentence = `${quickWinsCount} of these are quick, tag-level fixes — start there for the fastest visible movement, then work into the rest.`;
  }

  // The total-findings figure must never read as "N pages": it sums
  // instances in different units (a page can carry several findings, and
  // some issues count links, images, or URLs). When the distinct affected-
  // page count is available, phrase the total as "individual findings" and
  // anchor it to real pages so the arithmetic is unassailable.
  const scopeSentence =
    input.affectedPages !== undefined && input.affectedPages > 0
      ? `touching ${affectedChecks} individual finding${affectedChecks === 1 ? "" : "s"} (pages, links, images, and URLs combined) across ${input.affectedPages} distinct page${input.affectedPages === 1 ? "" : "s"}`
      : `touching ${affectedChecks} page${affectedChecks === 1 ? "" : "s"}/checks in total`;

  return `A crawl of ${pagesCrawled} ${pageWord} turned up ${issueTypeCount} distinct issue type${issueTypeCount === 1 ? "" : "s"}, ${scopeSentence}. ${topIssuesSentence} ${riskSentence} ${closingSentence}${aiSentence}`;
}

/** One concise sentence naming the site's AI Search Readiness — a
 * differentiator of this report — with the tier and a pointer to the AI
 * section for the detail. Reads as a consultant's note, not a template. */
function buildAiReadinessSentence(
  score: number,
  checks?: { passCount: number; totalCount: number }
): string {
  const level = aiReadinessTierLabel(score);
  const stance =
    level === "Excellent" || level === "Strong"
      ? "a genuine strength to build on for AI-driven discovery"
      : "a clear opportunity — the AI Search Readiness section shows exactly what would move it";
  // The AI Readiness score IS the percentage of checks passing (a
  // pass/fail share, not a weighted index) — say so explicitly so the
  // summary can never be read as a "55.55 rounded to 56 out of 100"
  // mystery number.
  const basis =
    checks !== undefined && checks.totalCount > 0
      ? ` — that is, ${checks.passCount} of the ${checks.totalCount} AI-readiness checks passing`
      : "";
  return ` Separately, AI Search Readiness — how well this site's content is accessible to and interpretable by AI retrieval systems — is assessed at ${score}%${basis} (${level} on the AI-readiness scale, a stricter pass/fail basis than the SEO score rubric): ${stance}.`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
