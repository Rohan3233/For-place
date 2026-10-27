import { buildCategoryScores } from "./categoryScores";
import type { CategoryScore } from "./categoryScores";
import { buildExecutiveSummaryText } from "./executiveSummary";
import React from "react";
import path from "node:path";
import { Document, Page, Text, View, StyleSheet, Link, Font, Image, Svg, Polygon, Line, Circle, Text as SvgText } from "@react-pdf/renderer";
import { buildImprovementPotential } from "./scoreProjection";
import { buildIssueDistribution, countDistinctAffectedPages } from "./issueDistribution";
import { getCrawlScopeCounts } from "./crawlScope";
import { truncateToWordLimit } from "./textTruncate";
import { analyzeRedirectChains } from "./redirectChainAnalysis";
import { buildResponseCodeBreakdown } from "./responseCodeBreakdown";
import { buildRedirectChainSummary } from "./redirectChainSummary";
import { buildRobotsBlockedLinks } from "./robotsBlockedLinks";
import {
  buildSeoCheckCoverage,
  summarizeSeoCheckCoverage,
  COVERAGE_URLS_INLINE_LIMIT,
  type CoverageCheck,
} from "./seoCheckCoverage";
import { EFFORT_ESTIMATE_DISCLAIMER } from "./priorityIssues";
import { sampleRemainderText } from "./affectedUrlCopy";
import { buildInternalLinkGraph } from "./internalLinkGraph";
import { displayHost, fitLogoWithin } from "./agencyBranding";
import { buildBusinessImpactSummary } from "./businessImpactEstimate";
import { IMPLEMENTATION_NOTE } from "./codeSnippets";
import { CONTENT_FONT_STACK, fitContentText } from "./reportFonts";
import {
  buildEstimatedBusinessImpact,
  formatDollarAmount,
  formatClickCount,
  formatConversionCount,
  formatImpressionCount,
  formatCtr,
  type EstimatedBusinessImpactResult,
} from "./estimatedBusinessImpact";

// Helvetica (the default/built-in font) only covers WinAnsi — Thai and
// other non-Latin scripts render as garbled glyphs on it. NotoSansThai is a
// real font with Thai coverage AND full Latin coverage; NotoSansArabic adds
// Arabic (the script of the affected pages that originally exposed the
// stacked-glyph bug). Both are registered once at module load and applied
// only to text blocks that can contain scraped page content or AI-generated
// suggestions (the only places non-Latin text can actually appear) —
// structural report labels stay on Helvetica.
Font.register({
  family: "NotoSansThai",
  fonts: [
    { src: path.join(__dirname, "fonts", "NotoSansThai.ttf") },
    { src: path.join(__dirname, "fonts", "NotoSansThai.ttf"), fontWeight: "bold" },
    { src: path.join(__dirname, "fonts", "NotoSansThai.ttf"), fontStyle: "italic" },
    { src: path.join(__dirname, "fonts", "NotoSansThai.ttf"), fontStyle: "italic", fontWeight: "bold" },
  ],
});
Font.register({
  family: "NotoSansArabic",
  fonts: [
    { src: path.join(__dirname, "fonts", "NotoSansArabic.ttf") },
    { src: path.join(__dirname, "fonts", "NotoSansArabic.ttf"), fontWeight: "bold" },
    { src: path.join(__dirname, "fonts", "NotoSansArabic.ttf"), fontStyle: "italic" },
    { src: path.join(__dirname, "fonts", "NotoSansArabic.ttf"), fontStyle: "italic", fontWeight: "bold" },
  ],
});
Font.register({
  family: "NotoSansDevanagari",
  fonts: [
    { src: path.join(__dirname, "fonts", "NotoSansDevanagari-Regular.ttf") },
    { src: path.join(__dirname, "fonts", "NotoSansDevanagari-Bold.ttf"), fontWeight: "bold" },
    { src: path.join(__dirname, "fonts", "NotoSansDevanagari-Regular.ttf"), fontStyle: "italic" },
    { src: path.join(__dirname, "fonts", "NotoSansDevanagari-Bold.ttf"), fontStyle: "italic", fontWeight: "bold" },
  ],
});
import type { RunAuditResult, PageExplanationResult, ReportOptions } from "./types";
import { formatMs, formatCls, RATING_LABEL } from "./webVitals";
import { resolveCoreWebVitals } from "./coreWebVitals";
import {
  groupExplanationsByIssue,
  splitGroupedIssuesByCategory,
  mergeUrlSeoFindings,
  buildCwvGroupedIssues,
  buildCwvReportBlocks,
  URL_SEO_FLAGS,
  type GroupedIssue,
} from "./groupIssues";
import { humanReadableUrl } from "./urlSeo";
import { getRemediation, type RemediationEntry } from "./remediation";
import { groupBrokenLinksByCategory } from "./brokenLinks";
import {
  buildPriorityList,
  buildQuickWins,
  buildTopQuickActions,
  estimateBatchAwareTime,
  batchRecommendationSuffix,
  countUnitFor,
  type PriorityIssue,
} from "./priorityIssues";
import { suggestSchemaType, suggestSchemaTypeWithReason } from "./schemaSuggestions";
import { resolveOrganizationName } from "./organizationContext";
import { filterClientOwnedUrls } from "./urlOwnership";
import { buildBrokenLinksSmartNote, buildOversizedImagesSmartNote } from "./smartRecommendations";
import { buildNonDescriptiveImageFindings, type NonDescriptiveImageFinding } from "./imageFilename";
import type { CrawlPageSuccess } from "./types";
import { buildActionPlan, type ActionPlanWeek } from "./actionPlan";
import {
  buildFixRoadmap,
  FIX_TIER_META,
  FIX_TIER_ORDER,
  countFixRoadmapItems,
  fixTierFor,
} from "./fixRoadmap";
import { buildWhatsWorking, WHATS_WORKING_FALLBACK } from "./whatsWorking";
import { getScoreVerdict, getAiReadinessVerdict } from "./scoreVerdict";
import {
  buildIndexabilityChecks,
  buildIndexabilityDetailGroups,
  INDEXABILITY_CHECK_FLAGS,
  type IndexabilityCheckResult,
} from "./indexabilityChecks";
import { buildVitalsScale } from "./chartMath";
import { buildSitemapGuidance } from "./sitemapGuidance";
import { teamQuestionsForFlag } from "./teamQuestions";
import { impactLevelForIssue, IMPACT_LABEL } from "./impactLevel";
import {
  groupAeoChecksByCategory,
  buildAiReadinessDimensions,
  deriveAiReadinessSummary,
  withAeoMetaDefaults,
  rankAeoChecks,
  effectivePriorityWeight,
  type AeoCheck,
  type AeoPriority,
  type AeoDifficulty,
  type AeoImpact,
} from "./aeoTypes";
import { buildCitationReadiness, buildAiVisibilityOpportunities, buildAiQuickWins } from "./aeoReport";
import type { AiQuickWin } from "./aeoReport";
import type { CitationReadinessResult, AiVisibilityOpportunity } from "./aeoTypes";
import { splitBrokenLinks, brokenLinkScopeLabel, countBrokenLinkSourcePages, isCloudflareEmailObfuscation, genuineBrokenLinks } from "./brokenLinkClassification";
import { describeStatusCode } from "./statusCodeLabels";
import {

  MISSING_SCHEMA_COPY,
  PRESENT_SCHEMA_COPY,
} from "./auxiliaryIssueCopy";

/**
 * The actual visual design of the client-facing report. Deliberately plain
 * and structured rather than heavily styled — matches the business doc's
 * own example format (Issue / Why it matters / Recommended fix / Suggested
 * text) closely, since that's the proven format from the doc rather than
 * something invented here. Colors/spacing can be iterated on once a real
 * freelancer has actually looked at the output — no point over-designing
 * this before that feedback exists.
 */
/**
 * Global page grid — A4 landscape (297mm × 210mm). The whole report
 * renders in landscape; these constants define the grid in exactly one
 * place so every <Page> shares the same margins, content boundaries, and
 * footer-safe zone.
 *
 *   CONTENT_LEFT/RIGHT  = page padding (40pt) — nothing may touch the
 *                         physical page edge.
 *   CONTENT_TOP         = page padding (40pt).
 *   CONTENT_BOTTOM      = PAGE_HEIGHT - FOOTER_SAFE (539.28pt) — flow
 *                         content must never extend below this line.
 *   FOOTER_SAFE         = reserved bottom zone (56pt) — the fixed footer
 *                         (page number / branding) lives inside it, and
 *                         no card, table, paragraph, or code block may
 *                         ever enter it. The footer always wins.
 */
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const PAGE_MARGIN = 40;
const FOOTER_SAFE = 56;
const PAGE_SIZE: [number, number] = [PAGE_WIDTH, PAGE_HEIGHT];

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN,
    paddingBottom: FOOTER_SAFE,
    paddingLeft: PAGE_MARGIN,
    paddingRight: PAGE_MARGIN,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },

  // --- Landscape two-column helpers (dashboard, internal linking, roadmap) ---
  landRow: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap" },
  landCol: { flex: 1, marginRight: 14 },
  landColLast: { flex: 1 },
  landColWide: { flex: 1.35, marginRight: 18 },
  landColNarrow: { flex: 1 },
  scoreBlock: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  scopeBox: {
    backgroundColor: "#FAFAF8",
    border: "1pt solid #E0DFDA",
    borderRadius: 6,
    padding: "14pt 16pt",
    marginBottom: 20,
  },
  scopeBoxTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#555555", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  scopeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  scopeLabel: { fontSize: 10, color: "#555555" },
  scopeValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  scopeNote: { fontSize: 8, color: "#888888", fontStyle: "italic", marginTop: 8, lineHeight: 1.4 },
  runtimeDivider: { borderTopWidth: 1, borderTopColor: "#E0DFDA", marginTop: 6, marginBottom: 6 },
  scoreNumber: { fontSize: 48, fontFamily: "Helvetica-Bold", marginRight: 16 },
  scoreLabel: { fontSize: 10, color: "#555555" },
  sectionHeading: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 20,
    marginBottom: 10,
    borderBottom: "1pt solid #dddddd",
    paddingBottom: 4,
  },
  // Sub-section heading WITHIN a page (e.g. the "Links blocked from
  // automated checking" half of the Broken Links page) — smaller than a
  // real section heading, no page-break semantics.
  sectionSubHeading: {
    fontSize: 11.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
    color: "#1a1a1a",
  },
  issueBlock: { marginBottom: 10, paddingLeft: 8, borderLeft: "2pt solid #dddddd" },
  issueLabel: { fontFamily: "Helvetica-Bold", marginBottom: 1 },
  issueText: { marginBottom: 1, lineHeight: 1.3, width: "100%" },
  issueLabelKey: { color: "#555555", fontFamily: "Helvetica-Bold" },
  // --- Compact callout boxes that break up long issue copy ---
  businessImpactCallout: {
    marginTop: 4,
    marginBottom: 4,
    padding: 6,
    backgroundColor: "#F0F6FF",
    borderLeft: "2pt solid #1D6FD8",
    borderRadius: 3,
  },
  businessImpactCalloutLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#1D6FD8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  businessImpactCalloutText: { fontSize: 8.5, color: "#333333", lineHeight: 1.35 },
  fixCallout: {
    marginBottom: 4,
    padding: 6,
    backgroundColor: "#F5FBF7",
    borderLeft: "2pt solid #1F9D55",
    borderRadius: 3,
  },
  fixCalloutLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#1F9D55", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  fixCalloutText: { fontSize: 8.5, color: "#333333", lineHeight: 1.35 },

brokenLinkRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3 },
  brokenLinkUrlWrap: { flex: 1, marginRight: 8 },
  brokenLinkUrl: { fontSize: 8.5, fontFamily: CONTENT_FONT_STACK, color: "#555555", lineHeight: 1.3 },
  brokenLinkStatus: { width: 62, textAlign: "right", color: "#D9432E", fontSize: 8.5, paddingTop: 1 },
  brokenLinkCategoryLabel: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#0a5fb4", marginBottom: 4, marginTop: 4 },
  // Each duplicated value is its own card so groups never read as one
  // continuous run (the left-border strip made them blend together).
  duplicateGroup: {
    marginBottom: 10,
    padding: 10,
    border: "1pt solid #dddddd",
    borderLeft: "3pt solid #1D6FD8",
    borderRadius: 6,
    backgroundColor: "#F7F9FC",
  },
  duplicateValue: { fontFamily: CONTENT_FONT_STACK, marginBottom: 3, lineHeight: 1.3 },
  duplicateGroupCount: { fontSize: 8, color: "#888888", marginBottom: 4 },
  duplicateUrlRow: { color: "#555555", marginBottom: 1, fontFamily: CONTENT_FONT_STACK, fontSize: 9 },
  duplicateAffectedSummary: { fontSize: 9.5, color: "#333333", lineHeight: 1.5, marginBottom: 10 },
suggestedTextBlock: {
    marginTop: 2,
    padding: 8,
    backgroundColor: "#F2F7FD",
    borderRadius: 4,
    borderLeft: "3pt solid #1D6FD8",
    fontFamily: CONTENT_FONT_STACK,
  },
  aiTag: { fontSize: 7, color: "#1D6FD8", marginBottom: 3, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  suggestedTextValue: { fontSize: 9, color: "#1a1a1a", lineHeight: 1.5, fontFamily: CONTENT_FONT_STACK },
  beforeBlock: {
    marginTop: 2,
    padding: 8,
    backgroundColor: "#FBF1EF",
    borderRadius: 4,
    borderLeft: "3pt solid #D9432E",
    fontFamily: CONTENT_FONT_STACK,
  },
  beforeLabel: { fontSize: 7, color: "#D9432E", marginBottom: 3, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  beforeText: { textDecoration: "line-through", color: "#777777", fontFamily: CONTENT_FONT_STACK, fontSize: 9 },
  beforeAfterArrow: { fontSize: 10, color: "#999999", fontFamily: "Helvetica-Bold", textAlign: "center", paddingVertical: 2 },
  redirectRow: { marginBottom: 8, paddingLeft: 8, borderLeft: "2pt solid #dddddd" },
  redirectPath: { marginBottom: 2, lineHeight: 1.4 },
  redirectHops: { width: 110, textAlign: "right", color: "#D9432E", fontFamily: "Helvetica-Bold" },
  // A healthy (non-excessive) chain is not an error — neutral gray, aligned
  // exactly like the red excessive marker so the two columns line up.
  redirectHopsOk: { width: 110, textAlign: "right", color: "#555555" },
robotsBlockedRow: { marginBottom: 3, color: "#555555", fontSize: 9, fontFamily: CONTENT_FONT_STACK },
  vitalsGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  vitalCard: { width: "48%", marginRight: "2%", marginBottom: 6, padding: 8, border: "1pt solid #dddddd", borderRadius: 6 },
  vitalLabel: { fontSize: 8.5, color: "#555555", marginBottom: 2 },
  vitalValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  vitalPillGood: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1F9D55" },
  vitalPillWarn: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#D98A1A" },
  vitalPillFail: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#D9432E" },
  vitalCounts: { fontSize: 7, color: "#666666", marginTop: 2, lineHeight: 1.3 },
  vitalMissing: { fontSize: 7.5, color: "#B25E09", fontStyle: "italic", marginTop: 2, lineHeight: 1.35 },
  // Website-wide CWV summary stat cards (crawled / evaluated / passing /
  // failing / pass rate) — compact, uniform chips so the always-present
  // Performance page opens with a clear at-a-glance verdict.
  cwvSummaryGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  cwvSummaryCard: { width: "19%", marginRight: "1%", marginBottom: 4, padding: 6, border: "1pt solid #dddddd", borderRadius: 6, backgroundColor: "#F7F9FC" },
  cwvSummaryLabel: { fontSize: 6.5, color: "#555555", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 1 },
  cwvSummaryValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  // Insufficient-data banner — the always-present Performance page's honest
  // fallback when no page could be evaluated (never a fabricated score).
  cwvInsufficientBanner: { backgroundColor: "#FFF7E6", border: "1pt solid #E5C77C", borderRadius: 6, padding: 12, marginBottom: 12 },
  cwvInsufficientTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#8A5A00", marginBottom: 4 },
  cwvInsufficientText: { fontSize: 9, color: "#6B4B12", lineHeight: 1.45 },
  // Worst-pages table on the Performance page (page + poor vital + value).
  // Column widths follow the broken-link row convention: the URL column is
  // a flexible 1, the vital/value columns are FIXED widths (no flex, so
  // padding can never push the row past the content edge).
  cwvTableHead: { flexDirection: "row", borderBottom: "1pt solid #cccccc", paddingBottom: 4, marginBottom: 4 },
  cwvTableHeadCell: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555555", textTransform: "uppercase", letterSpacing: 0.3 },
  cwvTableRow: { flexDirection: "row", borderBottom: "0.5pt solid #eeeeee", paddingVertical: 4 },
  cwvTableCell: { fontSize: 8, fontFamily: CONTENT_FONT_STACK, color: "#333333" },
  cwvTableUrlCol: { flex: 1, paddingRight: 10 },
  cwvTableVitalCol: { width: 165 },
  cwvTableValueCol: { width: 70, textAlign: "right" },
  cwvTableValueWarn: { color: "#D98A1A", fontFamily: "Helvetica-Bold" },
  cwvTableValueFail: { color: "#D9432E", fontFamily: "Helvetica-Bold" },
  a11yHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  a11yTitle: { fontFamily: "Helvetica-Bold", fontSize: 12 },
 a11yScore: { fontFamily: "Helvetica-Bold", fontSize: 12, color: "#1D6FD8" },
  issueGroupBlock: { marginBottom: 8 },
  // Family heading for grouped findings (e.g. Heading & Content Structure)
  // — renders once above all member findings so related issues read as one
  // area of work instead of disconnected pages.
  issueFamilyTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginTop: 12, marginBottom: 3 },
  issueFamilyIntro: { fontSize: 9, color: "#555555", lineHeight: 1.45, marginBottom: 10, maxWidth: 780 },
  issueGroupHead: { flexDirection: "column", marginBottom: 4 },
  issueCountBadge: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1D6FD8" },
  instanceBlock: { marginTop: 6, paddingLeft: 8, borderLeft: "2pt solid #dddddd" },
 
moreInstancesNote: { fontSize: 9, color: "#888888", fontStyle: "italic", marginTop: 4 },  instanceUrl: { fontSize: 9, fontFamily: CONTENT_FONT_STACK, color: "#0a5fb4", marginBottom: 3 },
  urlSeoStatusNote: { fontSize: 8, color: "#B25E09", fontStyle: "italic", marginBottom: 4, lineHeight: 1.35 },
  reprLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555555", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  // Label + CSV action share one row, so the download link can never strand
  // alone on a continuation page when a long URL list splits.
  reprRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  // Left side of the label row: label + the "showing X of Y; N more"
  // remainder note, so the truncation arithmetic always sits with the
  // section label (never with a partial tail of the list).
  reprLabelWrap: { flex: 1, flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },
  // One offending image in the non-descriptive-filenames finding: the full
  // src (incl. proxied CDN URLs) with its decoded filename beneath. Atomic
  // so the src and its filename can never split across a page boundary.
  ndImageRow: { marginBottom: 6 },
  issueImpact: { fontSize: 9, color: "#1D6FD8", fontStyle: "italic", marginBottom: 2 },
  verdictPill: { fontSize: 11, fontFamily: "Helvetica-Bold", padding: "4pt 10pt", borderRadius: 4, marginTop: 6 },
  verdictPass: { backgroundColor: "#E7F6ED", color: "#1F9D55" },
  verdictWarn: { backgroundColor: "#FBF0DF", color: "#D98A1A" },
  verdictFail: { backgroundColor: "#FBE9E6", color: "#D9432E" },
  priorityColEffort: { width: 120, alignItems: "flex-end", justifyContent: "center" },
  priorityColBar: { width: 65, justifyContent: "center", paddingRight: 8 },
  csvLink: { fontSize: 9, color: "#1D6FD8", fontStyle: "normal", textDecoration: "underline" },
  csvDownloadLine: { marginTop: 4, marginBottom: 2 },
  // One shared section-intro paragraph style — every major section opens
  // with the same size/color/leading so the page rhythm never varies.
  priorityNote: { fontSize: 9.5, color: "#555555", lineHeight: 1.5, marginBottom: 12 },
  planCapacityNote: { fontSize: 8, color: "#888888", fontStyle: "italic", marginBottom: 12 },
  priorityRow: { flexDirection: "row", paddingVertical: 4, borderBottom: "0.5pt solid #eeeeee" },
  priorityRowHead: { flexDirection: "row", paddingBottom: 6, borderBottom: "1pt solid #dddddd", marginBottom: 2 },
  priorityColLabel: { flex: 1, fontSize: 10 },
priorityHigh: { color: "#D9432E", backgroundColor: "#FBE9E6", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, textAlign: "center" },
  priorityMedium: { color: "#D98A1A", backgroundColor: "#FBF0DF", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, textAlign: "center" },
  priorityLow: { color: "#1F9D55", backgroundColor: "#E7F6ED", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, textAlign: "center" },
  priorityColCount: { width: 80, fontSize: 10, color: "#555555", textAlign: "right" },
  priorityColHeadText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#555555" },
  quickWinRow: { flexDirection: "row", marginBottom: 8, alignItems: "flex-start" },
  quickWinCheckBox: { width: 8, height: 8, borderRadius: 2, backgroundColor: "#1F9D55", marginRight: 8, marginTop: 3 },
  quickWinText: { fontSize: 10, lineHeight: 1.5, marginBottom: 3 },
  quickWinCount: { color: "#555555" },
  // Compact "Valid for" context under a quick-win item when the check is
  // conditional on a site type (e.g. Organization schema) — so the client
  // sees who the recommendation is for right where the action appears.
  // NO lineHeight: react-pdf 4.x measures a Text with lineHeight inside
  // this panel's flex chain with ~110pt of phantom height.
  quickWinNote: { fontSize: 8.5, color: "#4C6B58", marginTop: 4, marginLeft: 20 },

  // --- AI/GenAI Quick Wins section ---
  aiQuickWinCard: {
    marginBottom: 10,
    padding: "8pt 10pt",
    border: "1pt solid #E0DFDA",
    borderRadius: 6,
    backgroundColor: "#FAFBFD",
    borderLeft: "3pt solid #1D6FD8",
  },
  aiQuickWinHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  aiQuickWinTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", flex: 1, paddingRight: 8 },
  aiQuickWinBadges: { flexDirection: "row", alignItems: "center", gap: 4 },
  aiQuickWinCount: { fontSize: 9, color: "#555555", marginBottom: 6 },
  aiQuickWinSection: { marginTop: 4 },
  aiQuickWinSectionLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1D6FD8", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 },
  aiQuickWinSectionText: { fontSize: 9, color: "#333333", lineHeight: 1.45 },

  // Fixed footer — absolute within the page's FOOTER_SAFE zone. Flow
  // content stops at CONTENT_BOTTOM (paddingBottom = FOOTER_SAFE), so the
  // footer always has clear space above it and is never covered.
  footer: {
    position: "absolute",
    bottom: 20,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    fontSize: 8,
    color: "#999999",
    textAlign: "center",
    borderTop: "0.5pt solid #eeeeee",
    paddingTop: 8,
  },
execSummaryText: { fontSize: 11, lineHeight: 1.6, color: "#333333", marginBottom: 4 },
  verdictDescription: { fontSize: 9, color: "#555555", marginTop: 6, maxWidth: 520, lineHeight: 1.4 },
  categoryBarsBlock: { marginTop: 24 },
  categoryRow: { marginBottom: 10 },
  categoryRowHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  categoryLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  categoryScoreText: { fontSize: 10, color: "#555555" },
  categoryBarTrack: { height: 8, borderRadius: 4, backgroundColor: "#EEEEEE", overflow: "hidden" },
  categoryBarFillGood: { height: 8, borderRadius: 4, backgroundColor: "#1F9D55" },
  categoryBarFillWarn: { height: 8, borderRadius: 4, backgroundColor: "#D98A1A" },
  categoryBarFillFail: { height: 8, borderRadius: 4, backgroundColor: "#D9432E" },
  categoryExplanationText: { fontSize: 8.5, color: "#888888", marginTop: 4, lineHeight: 1.3 },
  // No fixed top margin — the closing page vertically centers its content
  // (justifyContent on the Page itself), so the composition is intentional
  // regardless of how much text/projection content a given audit produces.
  closingTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 16, textAlign: "center" },

  // --- Agency white-label cover page (Agency tier only) ---
  // A professional, client-ready cover: logo dominant, one-line report
  // title, thin rule, then a clean meta block. Same page grid/margins as
  // every other page; no footer element on the cover itself.
  coverPage: {
    paddingTop: PAGE_MARGIN,
    paddingBottom: FOOTER_SAFE,
    paddingLeft: PAGE_MARGIN,
    paddingRight: PAGE_MARGIN,
    justifyContent: "center",
  },
  coverLogoWrap: { alignItems: "center", marginBottom: 34 },
  coverTitle: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 6,
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 18,
  },
  coverRule: {
    width: 90,
    height: 3,
    backgroundColor: "#1D6FD8",
    alignSelf: "center",
    marginBottom: 34,
  },
  coverMeta: { width: "72%", alignSelf: "center" },
  coverMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 9,
    borderBottom: "0.5pt solid #EEEEEE",
  },
  coverMetaRowLast: { borderBottomWidth: 0 },
  coverMetaLabel: { fontSize: 9, color: "#888888", textTransform: "uppercase", letterSpacing: 1 },
  coverMetaValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1a1a1a", maxWidth: "70%", textAlign: "right" },
  coverPowered: {
    position: "absolute",
    bottom: 24,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    textAlign: "center",
    fontSize: 7.5,
    color: "#BBBBBB",
    letterSpacing: 1,
  },

  // White-label footer — agency logo + name dominate, with a subtle,
  // secondary "Powered by" attribution. Lives in the same fixed FOOTER_SAFE
  // zone as the standard footer, so it can never collide with content.
  footerBranded: {
    position: "absolute",
    bottom: 20,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTop: "0.5pt solid #eeeeee",
    paddingTop: 8,
  },
  footerBrandLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  footerBrandName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#444444" },
  footerPowered: { fontSize: 7.5, color: "#BBBBBB", letterSpacing: 0.5 },
  projectionBox: {
    marginTop: 16,
    marginHorizontal: "10%",
    padding: "11pt 16pt",
    backgroundColor: "#EAF1FC",
    borderRadius: 8,
  },
  projectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1D6FD8", marginBottom: 10, textAlign: "center" },
  projectionRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, paddingBottom: 6, borderBottom: "0.5pt solid #C9DBF5" },
  projectionLabel: { fontSize: 10, color: "#333333" },
  projectionValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1D6FD8" },
  projectionDisclaimer: { fontSize: 7.5, color: "#5A7A99", marginTop: 8, lineHeight: 1.4, textAlign: "center" },
  // Inline hedge directly under the projected numbers — a projection is the
  // easiest part of a report to misread as a guarantee, so the "estimate,
  // not a guarantee" caveat sits adjacent to the numbers themselves (amber
  // highlight, impossible to miss) rather than only in the fine print at
  // the bottom of the box.
  projectionHedge: {
    marginTop: 8,
    padding: "6pt 10pt",
    backgroundColor: "#FBF0DF",
    border: "1pt solid #F0D7AC",
    borderRadius: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#B25E09",
    textAlign: "center",
    lineHeight: 1.4,
  },
  closingText: { fontSize: 11, lineHeight: 1.6, color: "#444444", textAlign: "center", maxWidth: 580, alignSelf: "center", marginBottom: 8 },
  closingMeta: { fontSize: 9, color: "#888888", textAlign: "center", marginTop: 24 },
  // --- Investment & Expected Return (honest ROI summary) ---
  roiBox: {
    marginTop: 14,
    backgroundColor: "#EAF1FC",
    border: "1pt solid #C9DBF5",
    borderRadius: 6,
    padding: "9pt 12pt",
  },
  roiTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: "#1D6FD8", marginBottom: 6 },
  roiRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, paddingBottom: 4, borderBottom: "0.5pt solid #C9DBF5" },
  roiLabel: { fontSize: 9, color: "#333333", paddingRight: 12 },
  roiValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#1D6FD8" },
  roiAssumptions: { fontSize: 7.5, color: "#5A7A99", marginTop: 6, lineHeight: 1.4 },
  roiHedge: {
    marginTop: 6,
    padding: "5pt 9pt",
    backgroundColor: "#FBF0DF",
    border: "1pt solid #F0D7AC",
    borderRadius: 4,
  },
  roiHedgeText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#B25E09", lineHeight: 1.4 },
  roiDisclaimer: { fontSize: 7, color: "#5A7A99", marginTop: 6, lineHeight: 1.4 },
  // --- Next Steps (closing page) ---
  nextStepsBox: {
    marginTop: 14,
    marginHorizontal: "8%",
    padding: "10pt 14pt",
    backgroundColor: "#FAFAF8",
    border: "1pt solid #E0DFDA",
    borderRadius: 6,
    alignSelf: "stretch",
  },
  nextStepsTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginBottom: 6, textAlign: "center" },
  nextStepsRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3 },
  nextStepsNum: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "#1D6FD8",
    color: "#FFFFFF",
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginRight: 7,
    marginTop: 1,
  },
  nextStepsText: { flex: 1, fontSize: 8.5, color: "#333333", lineHeight: 1.4 },
  // --- 30-Day Action Plan (structured roadmap) ---
  planGlance: { backgroundColor: "#FAFAF8", border: "1pt solid #E0DFDA", borderRadius: 6, padding: 12, marginBottom: 14 },
  planGlanceTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8, borderBottom: "1pt solid #dddddd", paddingBottom: 4 },
  planGlanceRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  planGlancePhase: { width: 70, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1D6FD8" },
  planGlanceDays: { width: 62, fontSize: 9, color: "#333333" },
  planGlanceFocus: { flex: 1, fontSize: 9, color: "#555555", lineHeight: 1.4, paddingRight: 8 },
  planGlanceCount: { width: 56, fontSize: 8.5, color: "#888888", textAlign: "right" },
  planPhase: { border: "1pt solid #E0DFDA", borderRadius: 6, backgroundColor: "#FFFFFF", padding: "10pt 12pt", marginBottom: 12 },
  // --- Fix Roadmap (Fix First / Fix Next / Optimize) ---
  roadmapTier: { marginBottom: 14 },
  roadmapTierHead: { marginBottom: 6 },
  roadmapTierTitle: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginBottom: 3 },
  roadmapTierBlurb: { fontSize: 8.5, color: "#555555", lineHeight: 1.4, marginBottom: 6 },
  roadmapItem: {
    border: "1pt solid #E0DFDA",
    borderLeft: "3pt solid #1D6FD8",
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    padding: "8pt 10pt",
    marginBottom: 8,
  },
  roadmapItemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 },
  roadmapItemLabel: { flex: 1, fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a", paddingRight: 8 },
  roadmapItemCount: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#1D6FD8", flexShrink: 0 },
  planPhaseHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  planPhaseBadge: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: "#EAF1FC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  planPhaseBadgeNum: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1D6FD8" },
  planPhaseHeadText: { flex: 1 },
  planPhaseTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  planPhaseDays: { fontSize: 8.5, color: "#555555", lineHeight: 1.4 },
  planPhaseLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  planIssueRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, alignItems: "flex-start" },
  planIssueLabel: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 3, paddingRight: 8 },
  planIssueMeta: { fontSize: 8.5, color: "#555555", textAlign: "right" },
  planIssueMetaWrap: { alignItems: "flex-end", marginLeft: 8, flexShrink: 0 },
  planPhaseOutcome: { marginTop: 8, paddingTop: 8, borderTop: "0.5pt solid #eeeeee" },
  planPhaseOutcomeLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#1F9D55",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  planPhaseOutcomeText: { fontSize: 8.5, color: "#555555", lineHeight: 1.45 },
  planFinal: { backgroundColor: "#EAF1FC", border: "1pt solid #C9DBF5", borderRadius: 6, padding: "12pt 14pt", marginTop: 4 },
  planFinalTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: "#0a5fb4", marginBottom: 6 },
  planFinalText: { fontSize: 9.5, color: "#333333", lineHeight: 1.5, marginBottom: 8 },
  planFinalNote: { marginTop: 8, paddingTop: 8, borderTop: "0.5pt solid #C9DBF5" },
  planFinalNoteText: { fontSize: 9, color: "#1a1a1a", lineHeight: 1.5, fontFamily: "Helvetica-Bold" },
  wwRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8, backgroundColor: "#E7F6ED", borderRadius: 4, padding: 8 },
  wwDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#1F9D55", marginRight: 8, marginTop: 3 },
  wwText: { flex: 1, fontSize: 10 },
  wwFallback: { fontSize: 10, color: "#555555", fontStyle: "italic" },
  issueDistBlock: { marginTop: 4, marginBottom: 20 },
  issueDistRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  issueDistLabel: { width: 130, fontSize: 9, color: "#333333" },
  issueDistBarTrack: { flex: 1, height: 10, backgroundColor: "#EEEEEE", borderRadius: 5, overflow: "hidden", marginRight: 8 },
  issueDistBarFill: { height: 10, backgroundColor: "#1D6FD8", borderRadius: 5 },
  issueDistCount: { width: 24, fontSize: 9, color: "#555555", textAlign: "right" },
  aiReviewNote: { fontSize: 7, color: "#888888", fontStyle: "italic", marginTop: 4 },

  // --- Indexability Checks (always-shown pass/fail grid) ---
  checksGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  // 3-across in landscape (was 2-across in portrait) — the wider canvas
  // comfortably fits three cards per row without cramping the status text.
  // Compact grid cards so the full check catalog fits two balanced pages in
  // landscape instead of spilling a sparse third page.
  checkCard: { width: "31.5%", marginRight: "1.75%", marginBottom: 8, padding: 7, border: "1pt solid #dddddd", borderRadius: 6 },
  checkCardHead: { flexDirection: "column", marginBottom: 3 },
  checkCardLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", lineHeight: 1.3, marginBottom: 2 },
  checkCardPass: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#1F9D55" },
  checkCardWarn: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#D98A1A" },
  checkCardFail: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#D9432E" },
  checkCardNa: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#888888" },
  checkCardStatus: { fontSize: 8.5, color: "#555555", lineHeight: 1.3 },

  // --- Complete SEO Check Coverage: summary strip + failed-check blocks ---
  coverageSummaryRow: { flexDirection: "row", marginBottom: 12 },
  // Crawl coverage warning — a crawl that stopped early is surfaced
  // prominently instead of reading as a normal successful audit.
  coverageWarningBox: {
    marginBottom: 12,
    padding: "9pt 12pt",
    backgroundColor: "#FBF0DF",
    border: "1pt solid #F0D7AC",
    borderLeft: "3pt solid #D98A1A",
    borderRadius: 5,
  },
  coverageWarningTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#B25E09", marginBottom: 4 },
  coverageWarningText: { fontSize: 8.5, color: "#6b4a12", lineHeight: 1.45 },
  coverageSummaryStat: {
    flex: 1,
    marginRight: 6,
    padding: 8,
    border: "1pt solid #dddddd",
    borderRadius: 6,
    backgroundColor: "#F7F9FC",
  },
  coverageSummaryStatTotal: { backgroundColor: "#F7F9FC" },
  coverageSummaryStatPass: { backgroundColor: "#E7F6ED", borderColor: "#BFE3CB" },
  coverageSummaryStatFail: { backgroundColor: "#FBE9E6", borderColor: "#EFC4BB" },
  coverageSummaryStatWarn: { backgroundColor: "#FBF0DF", borderColor: "#F0D7AC" },
  coverageSummaryNum: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginBottom: 2 },
  coverageSummaryLabel: {
    fontSize: 7,
    color: "#555555",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontFamily: "Helvetica-Bold",
  },
  // --- Complete SEO Check Coverage: compact status index ---
  coverageIndex: { marginTop: 14 },
  coverageGroup: { marginBottom: 12 },
  coverageGroupTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  coverageGroupList: {
    border: "1pt solid #E3E6EB",
    borderRadius: 5,
  },
  coverageGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  coverageGroupLabel: { flex: 1, paddingRight: 8, fontSize: 9.5, color: "#1a1a1a", lineHeight: 1.3 },
  coverageGroupBadgeFail: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#D9432E",
    backgroundColor: "#FBE9E6",
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  coverageGroupBadgeWarn: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#D98A1A",
    backgroundColor: "#FBF0DF",
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  coverageGroupBadgePass: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1F9D55",
    backgroundColor: "#E7F6ED",
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  coverageGroupCount: {
    fontSize: 8,
    color: "#555555",
    fontFamily: "Helvetica-Bold",
    flexShrink: 0,
    marginLeft: 8,
  },
  coverageSee: {
    marginTop: 4,
    fontSize: 8.5,
    color: "#555555",
    lineHeight: 1.4,
  },

  // --- Core Web Vitals: per-metric issues & fixes blocks ---
  cwvIssueBlock: {
    marginBottom: 10,
    padding: 10,
    border: "1pt solid #dddddd",
    borderLeft: "3pt solid #1D6FD8",
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  cwvIssueHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 },
  cwvIssueTitle: { flex: 1, paddingRight: 8, fontSize: 11, fontFamily: "Helvetica-Bold", lineHeight: 1.3 },

  // --- Impact / time-estimate badge restored on every issue card ---
  impactTimeRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, flexWrap: "wrap" },
  impactPill: { fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, marginRight: 8 },
  impactPillHigh: { color: "#D9432E", backgroundColor: "#FBE9E6" },
  impactPillMedium: { color: "#D98A1A", backgroundColor: "#FBF0DF" },
  impactPillLow: { color: "#1F9D55", backgroundColor: "#E7F6ED" },
  batchNoteText: { fontSize: 9, color: "#1D6FD8", fontFamily: "Helvetica-Bold", marginTop: 2, marginBottom: 4 },
  effortDisclaimer: { fontSize: 7.5, color: "#888888", fontStyle: "italic", marginTop: 4, marginBottom: 8, lineHeight: 1.4 },
  // One-line caveat under an effort/time estimate, only when the estimate
  // would otherwise look inconsistent next to a similarly-scoped issue.
  estimateRationaleText: { fontSize: 8, color: "#8A6D1A", backgroundColor: "#FBF4DF", padding: 4, borderRadius: 3, marginTop: 2, marginBottom: 6, lineHeight: 1.4 },
  templateBanner: {
    backgroundColor: "#FBF0DF",
    border: "1pt solid #F0D7AC",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  templateBannerTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#B25E09", marginBottom: 4 },
  templateBannerText: { fontSize: 9, color: "#555555", lineHeight: 1.4 },

  // --- Core Web Vitals scale bar (matches web report) ---
  vitalScaleTrack: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 4, marginBottom: 2 },
  vitalScaleLabelsRow: { flexDirection: "row", justifyContent: "space-between" },
  vitalScaleLabel: { fontSize: 6, color: "#888888" },

  // --- Domain Consistency (redesigned, always present) ---
  infoPageIntro: { fontSize: 9.5, color: "#555555", lineHeight: 1.5, marginBottom: 12 },
  findingBox: { backgroundColor: "#FAFAF8", border: "1pt solid #E0DFDA", borderRadius: 6, padding: 12, marginBottom: 14 },
  findingBoxLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#555555", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  variantRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  variantUrl: { fontSize: 9, color: "#333333" },
  variantResult: { fontSize: 9, color: "#555555" },
  passBanner: { backgroundColor: "#E7F6ED", borderRadius: 6, padding: 12, marginBottom: 14 },
  passBannerText: { fontSize: 10, color: "#1F9D55", fontFamily: "Helvetica-Bold" },

  // --- Sitemap page (redesigned to match Robots.txt quality) ---
  sitemapMetaRow: { flexDirection: "row", marginBottom: 6 },
  sitemapMetaLabel: { width: 110, fontSize: 9, color: "#555555" },
  sitemapMetaValue: { fontSize: 9, color: "#1a1a1a", fontFamily: "Helvetica-Bold" },

  // --- Status banners (Robots.txt / Sitemap informational pages) ---
  statusBanner: { borderRadius: 6, padding: 12, marginBottom: 12 },
  statusBannerTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  statusBannerText: { fontSize: 9.5, color: "#333333", lineHeight: 1.5 },

  // --- Explainer + impact callouts (Robots.txt / Sitemap pages) ---
  infoCallout: { backgroundColor: "#F4F6FB", borderLeft: "3pt solid #1D6FD8", borderRadius: 6, padding: 10, marginBottom: 12 },
  infoCalloutTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#0a5fb4", marginBottom: 3 },
  infoCalloutText: { fontSize: 9.5, color: "#444444", lineHeight: 1.55 },

  // --- URL SEO section callout (unmissable note about erroring URLs) ---
  urlSeoCallout: {
    backgroundColor: "#FBF0DF",
    border: "1pt solid #F0D7AC",
    borderLeft: "3pt solid #D98A1A",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  urlSeoCalloutTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#B25E09", marginBottom: 3 },
  urlSeoCalloutText: { fontSize: 9, color: "#555555", lineHeight: 1.5 },
  passCallout: { backgroundColor: "#E7F6ED", borderLeft: "3pt solid #1F9D55", borderRadius: 6, padding: 10, marginBottom: 12 },
  passCalloutLabel: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#1F9D55", marginBottom: 3 },
  passCalloutText: { fontSize: 9.5, color: "#333333", lineHeight: 1.55 },
  impactPanel: { borderRadius: 6, padding: 10, marginBottom: 12 },
  impactTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  impactText: { fontSize: 9.5, color: "#444444", lineHeight: 1.55 },
  directiveBlockLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginTop: 5, marginBottom: 2 },
  directiveRule: { fontSize: 8.5, color: "#555555", marginBottom: 2, fontFamily: CONTENT_FONT_STACK },
  directiveNote: { fontSize: 8, color: "#888888", fontStyle: "italic", marginTop: 6, lineHeight: 1.4 },

  // --- NEW: Redirect Chains styles ---
  redirectChainCard: { marginBottom: 12, padding: 12, border: "1pt solid #dddddd", borderRadius: 6 },
  redirectChainCardLoop: { borderColor: "#D9432E", backgroundColor: "#FBE9E6" },
  redirectChainPath: { fontSize: 9, color: "#0a5fb4", marginBottom: 4 },
  redirectChainBadge: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#555555" },
  redirectChainBadgeLoop: { color: "#D9432E" },
  redirectChainType: { fontSize: 9, color: "#555555", marginBottom: 4 },

  // --- NEW: Response Code Summary Bar styles ---
  responseCodeBlock: { marginTop: 4, marginBottom: 4 },
  responseCodeRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  responseCodeLabel: { width: 140, fontSize: 9, color: "#333333" },
  responseCodeBarTrack: { flex: 1, height: 10, backgroundColor: "#EEEEEE", borderRadius: 5, overflow: "hidden", marginRight: 8 },
  responseCodeBarFillGood: { height: 10, borderRadius: 5, backgroundColor: "#1F9D55" },
  responseCodeBarFillWarn: { height: 10, borderRadius: 5, backgroundColor: "#D98A1A" },
  responseCodeBarFillFail: { height: 10, borderRadius: 5, backgroundColor: "#D9432E" },
  responseCodeCount: { width: 30, fontSize: 9, color: "#555555", textAlign: "right" },

  // --- NEW: Code Snippet styles ---
  codeSnippetNote: { fontSize: 7.5, color: "#888888", fontStyle: "italic", marginTop: 6, marginBottom: 2 },
  codeSnippetBox: {
    marginBottom: 4,
    padding: 12,
    backgroundColor: "#0F172A",
    borderRadius: 6,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  codeSnippetLabel: { fontSize: 7, color: "#93C5FD", marginBottom: 3, fontFamily: "Helvetica-Bold" },
  codeSnippetText: { fontSize: 8, color: "#E2E8F0", fontFamily: "NotoSansDevanagari", lineHeight: 1.4, width: "100%", wordWrap: "break-word" as any },

  // --- NEW: Business Impact styles ---
  // Two-column card grid on the Business Impact page — each statement gets
  // half the landscape width so a page of impact statements stays compact.
  businessImpactGrid: { flexDirection: "row", flexWrap: "wrap" },
  businessImpactCard: {
    width: "48.5%",
    marginRight: "1.5%",
    backgroundColor: "#FAFAF8",
    border: "1pt solid #E0DFDA",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  businessImpactLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1D6FD8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  businessImpactText: { fontSize: 10, color: "#333333", lineHeight: 1.5 },
  businessImpactCitation: { fontSize: 7.5, color: "#888888", fontStyle: "italic", marginTop: 4 },

  // --- Estimated Business Impact (data-driven) ---
  // Rendered inside recommendation cards when BusinessMetrics are supplied.
  estimatedImpactBox: {
    marginTop: 6,
    marginBottom: 6,
    padding: 9,
    backgroundColor: "#F0F8F0",
    borderLeft: "3pt solid #1F9D55",
    borderRadius: 3,
  },
  estimatedImpactLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1F9D55", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  estimatedImpactText: { fontSize: 9, color: "#333333", lineHeight: 1.5 },
  estimatedImpactRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3, paddingBottom: 3, borderBottom: "0.5pt solid #D0E8D0" },
  estimatedImpactMetricLabel: { fontSize: 9, color: "#555555" },
  estimatedImpactMetricValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1F9D55" },
  estimatedImpactMethodology: { fontSize: 8, color: "#666666", marginTop: 4, lineHeight: 1.4, fontStyle: "italic" },
  estimatedImpactAssumptions: { marginTop: 4 },
  estimatedImpactAssumptionItem: { fontSize: 7.5, color: "#888888", marginBottom: 1, lineHeight: 1.3 },
  estimatedImpactHedge: {
    marginTop: 6,
    padding: "5pt 8pt",
    backgroundColor: "#FBF0DF",
    border: "1pt solid #F0D7AC",
    borderRadius: 4,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#B25E09",
    lineHeight: 1.4,
  },
  // Business Impact page — estimated opportunities grid
  estimatedOpportunityGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  estimatedOpportunityCard: {
    width: "48.5%",
    marginRight: "1.5%",
    backgroundColor: "#F0F8F0",
    border: "1pt solid #BFE3CB",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  estimatedOpportunityTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1F9D55", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  estimatedOpportunityRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, paddingBottom: 4, borderBottom: "0.5pt solid #D0E8D0" },
  estimatedOpportunityLabel: { fontSize: 9, color: "#333333" },
  estimatedOpportunityValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1F9D55" },
  estimatedOpportunityMethodology: { fontSize: 8, color: "#555555", marginTop: 6, lineHeight: 1.4 },
  estimatedOpportunityAssumptions: { marginTop: 6 },
  estimatedOpportunityAssumptionItem: { fontSize: 7.5, color: "#888888", marginBottom: 2, lineHeight: 1.3 },

  // --- Executive Dashboard ---
  dashBrand: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  dashTitle: { fontSize: 23, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  dashSubtitle: { fontSize: 11, color: "#555555", marginBottom: 16 },
  scorePairRow: { flexDirection: "row", marginBottom: 12 },
  scorePanel: {
    flex: 1,
    border: "1pt solid #E0DFDA",
    borderRadius: 8,
    padding: "12pt 14pt",
    backgroundColor: "#FAFAF8",
    marginRight: 10,
  },
  scorePanelLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#555555", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  scorePanelValue: { fontSize: 32, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  scorePanelSub: { fontSize: 9, color: "#555555", lineHeight: 1.4 },
  dashStatGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 4 },
  dashStatCard: {
    width: "23.5%",
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: "#FAFAF8",
    border: "1pt solid #E0DFDA",
    borderRadius: 6,
    alignItems: "center",
  },
  dashStatNum: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  dashStatLabel: { fontSize: 7, color: "#555555", textAlign: "center" },
  dashStatSub: { fontSize: 6.5, color: "#888888", textAlign: "center", lineHeight: 1.3, marginTop: 2 },
  dashDisclaimer: { fontSize: 7.5, color: "#888888", fontStyle: "italic", marginBottom: 6, lineHeight: 1.4 },
  dashPanel: { marginTop: 12 },
  dashPanelTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, borderBottom: "1pt solid #dddddd", paddingBottom: 4 },
  priorityActionRow: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  priorityActionNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#EAF1FC",
    color: "#1D6FD8",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "center",
    paddingTop: 2,
    marginRight: 8,
  },
  priorityActionLabel: { flex: 1, fontSize: 10 },
  priorityActionMeta: { fontSize: 9, color: "#555555", textAlign: "right", marginLeft: 8 },

  // --- "If You Only Do 5 Things" condensed section (right after the
  // dashboard) — numbered rows with a one-line fix, page count, and time,
  // sized for a stakeholder to scan in seconds. ---
  fiveThingsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#F7F9FC",
    borderRadius: 4,
    borderLeft: "3pt solid #1D6FD8",
  },
  fiveThingsNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#1D6FD8",
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textAlign: "center",
    paddingTop: 4,
    marginRight: 10,
  },
  fiveThingsBody: { flex: 1 },
  fiveThingsDesc: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginBottom: 2 },
  fiveThingsMeta: { fontSize: 9, color: "#666666" },
  fiveThingsNote: { fontSize: 8.5, color: "#888888", fontStyle: "italic", marginTop: 6, lineHeight: 1.4 },

  // --- Severity / effort pills & bars ---
  sevPill: { fontSize: 7.5, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, marginRight: 6 },
  sevPillCritical: { color: "#FFFFFF", backgroundColor: "#B42318" },
  sevPillHigh: { color: "#D9432E", backgroundColor: "#FBE9E6" },
  sevPillMedium: { color: "#D98A1A", backgroundColor: "#FBF0DF" },
  sevPillLow: { color: "#1F9D55", backgroundColor: "#E7F6ED" },
  effortPill: { fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 1, paddingHorizontal: 5, borderRadius: 3, alignSelf: "flex-start" },
  effortPillLow: { color: "#1F9D55", backgroundColor: "#E7F6ED" },
  effortPillMedium: { color: "#D98A1A", backgroundColor: "#FBF0DF" },
  effortPillHigh: { color: "#D9432E", backgroundColor: "#FBE9E6" },
  barTrack: { height: 7, borderRadius: 3.5, backgroundColor: "#EEEEEE", overflow: "hidden", alignSelf: "stretch" },
  barFill: { height: 7, borderRadius: 3.5 },

  // --- Issue summary card ---
  summaryCard: { backgroundColor: "#FAFAF8", border: "1pt solid #E0DFDA", borderRadius: 6, padding: 9, marginBottom: 10 },
  summaryTagRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  summaryTagRowSecond: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  cardRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  cardLabel: { width: 118, fontSize: 8, fontFamily: "Helvetica-Bold", color: "#555555", textTransform: "uppercase", letterSpacing: 0.3 },
  cardValue: { flex: 1, fontSize: 9.5, color: "#1a1a1a" },
  ownerTag: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1D6FD8", backgroundColor: "#EAF1FC", borderRadius: 3, paddingVertical: 1, paddingHorizontal: 5, marginLeft: 6 },
  priorityTag: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a", backgroundColor: "#E8E8E6", borderRadius: 3, paddingVertical: 1, paddingHorizontal: 5, marginLeft: 6 },
  effortSubText: { fontSize: 7.5, color: "#888888", marginTop: 2 },
  outcomeBox: {
    marginTop: 2,
    padding: 8,
    backgroundColor: "#F0F9F3",
    border: "1pt solid #CDE8D6",
    borderRadius: 4,
  },
  outcomeBoxLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#1F9D55", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  outcomeBoxText: { fontSize: 9, color: "#1a1a1a", lineHeight: 1.4 },

  // --- How-to-verify checklist ---
  verifyBox: { marginTop: 10, paddingTop: 8, borderTop: "0.5pt solid #dddddd" },
  verifyTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555555", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 },
  verifyRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3 },
  verifyCheck: { width: 7, height: 7, borderRadius: 2, border: "1pt solid #999999", marginRight: 6, marginTop: 2 },
  verifyText: { flex: 1, fontSize: 8.5, color: "#555555", lineHeight: 1.4 },
  teamQuestionsBox: {
    marginTop: 8,
    padding: "7pt 9pt",
    backgroundColor: "#F7F7F4",
    border: "0.5pt solid #E0DFDA",
    borderRadius: 4,
  },
  teamQuestionsTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555555", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  teamQuestionRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2 },
  teamQuestionBullet: { width: 9, fontSize: 8.5, color: "#B25E09", fontFamily: "Helvetica-Bold" },
  teamQuestionText: { flex: 1, fontSize: 8.5, color: "#444444", lineHeight: 1.4 },

  // --- Redirect chain flow ---
  redirectFlowCard: { marginBottom: 10, padding: 10, border: "1pt solid #E0DFDA", borderRadius: 6, backgroundColor: "#FAFAF8" },
  redirectFlowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  redirectFlowHops: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#555555" },
  redirectFlowHopsExcessive: { color: "#D9432E" },
  redirectStepUrl: { fontSize: 9, fontFamily: CONTENT_FONT_STACK, color: "#0a5fb4", marginBottom: 3 },
  redirectHopRow: { flexDirection: "row", alignItems: "center", marginBottom: 3, paddingLeft: 10 },
  redirectHopArrow: { width: 12, fontSize: 9, color: "#1D6FD8", fontFamily: "Helvetica-Bold" },
  redirectHopCode: { flex: 1, fontSize: 8.5, color: "#333333" },
  redirectHopStep: { fontSize: 7.5, color: "#888888", marginLeft: 8 },
  redirectHopMore: { fontSize: 8, color: "#888888", fontStyle: "italic", paddingLeft: 10, marginBottom: 2 },
  redirectFlowNote: { fontSize: 7.5, color: "#888888", fontStyle: "italic", marginTop: 6, lineHeight: 1.4 },
  redirectFinalRow: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  redirectStepFinal: { flex: 1, fontSize: 9, fontFamily: CONTENT_FONT_STACK, fontWeight: "bold", color: "#1a1a1a" },
  redirectFinalBadge: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#1F9D55", backgroundColor: "#E7F6ED", borderRadius: 3, paddingVertical: 1, paddingHorizontal: 5, marginLeft: 8 },

  // --- AI Readiness / Citation / Opportunities ---
  aiReadinessBlock: { marginBottom: 6 },
  citCheckFinding: { fontSize: 8.5, color: "#888888", fontStyle: "italic", marginTop: 2 },
  scaleGuide: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  scaleGuideRow: { flexDirection: "row", marginRight: 8 },
  scaleBlock: { width: 12, height: 9, borderRadius: 2, marginRight: 2 },
  scaleBlockFilled: { backgroundColor: "#1D6FD8" },
  scaleBlockEmpty: { backgroundColor: "#DCDCDC" },
  scaleGuideLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#555555" },
  oppCard: { backgroundColor: "#FAFAF8", border: "1pt solid #E0DFDA", borderRadius: 6, padding: 10, marginBottom: 10 },
  oppUnlocks: { marginTop: 4, marginBottom: 4, padding: 8, backgroundColor: "#F5FBF7", borderRadius: 4 },
  oppUnlocksTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1F9D55", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  oppUnlockRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 2 },
  oppUnlockCheck: { fontSize: 8.5, color: "#1F9D55", marginRight: 5, fontFamily: "Helvetica-Bold" },
  oppUnlockText: { flex: 1, fontSize: 8.5, color: "#333333", lineHeight: 1.4 },

  // --- AEO recommendation cards (premium per-issue presentation) ---
  // Plain column container (NOT a flex-wrap row) — cards taller than a
  // landscape page must be able to split across pages, which a wrap grid
  // cannot paginate without clipping.
  aeoGrid: { flexDirection: "column" },
  // Slightly tighter bottom padding so a card's border never lands exactly
  // on the page boundary — react-pdf creates a phantom empty page when an
  // unbreakable block's edge lands flush against it.
  aeoCard: { width: "100%", marginBottom: 8, padding: "10pt 12pt 8pt", border: "1pt solid #E0DFDA", borderRadius: 6, backgroundColor: "#FFFFFF" },
  aeoCardHead: { flexDirection: "column", marginBottom: 4 },
  aeoCardLabel: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  aeoBadge: { fontSize: 6.5, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3 },
  aeoBadgeRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 4, marginBottom: 4 },
  aeoBadgeItem: { marginRight: 14 },
  aeoBadgeCap: { fontSize: 6, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  aeoPriRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  aeoPriLabel: { width: 46, fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase", letterSpacing: 0.4 },
  aeoPriTrack: { width: 72, height: 6, borderRadius: 3, backgroundColor: "#EEEEEE", overflow: "hidden", marginRight: 8 },
  aeoPriFill: { height: 6, borderRadius: 3 },
  aeoPriValue: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#333333" },
  aeoImpactRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  aeoImpactLabel: { width: 114, flexShrink: 0, fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#888888", textTransform: "uppercase", letterSpacing: 0.4 },
  aeoImpactTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#EEEEEE", overflow: "hidden", marginRight: 8 },
  aeoImpactFill: { height: 8, borderRadius: 4, backgroundColor: "#1D6FD8" },
  aeoImpactValue: { width: 80, flexShrink: 0, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#333333" },
  aeoPanel: { marginTop: 12 },
  aeoPanelTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, borderBottom: "1pt solid #dddddd", paddingBottom: 4 },
  aeoCmpBox: { backgroundColor: "#FAFAF8", border: "1pt solid #E0DFDA", borderRadius: 6, padding: 12, marginTop: 12 },
  aeoCmpRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  aeoCmpLabel: { width: 128, fontSize: 9, color: "#333333" },
  aeoCmpTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#EEEEEE", overflow: "hidden", marginRight: 8 },
  aeoCmpFill: { height: 8, borderRadius: 4 },
  aeoCmpValue: { width: 48, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#333333", textAlign: "right" },
  aeoCmpNote: { fontSize: 7, color: "#888888", fontStyle: "italic", marginTop: 4, lineHeight: 1.4 },
  aeoOrderRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  aeoOrderNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EAF1FC",
    color: "#1D6FD8",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "center",
    paddingTop: 3,
    marginRight: 8,
  },
  aeoOrderLabelWrap: { flex: 1, paddingRight: 8 },
  aeoOrderLabel: { fontSize: 9 },
  aeoOrderCount: { fontSize: 7.5, color: "#888888" },
  aeoOrderValue: { width: 52, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555555", textAlign: "right" },

  // --- Executive Dashboard: Estimated SEO Opportunity ---
  oppPanelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  oppPanelLabel: { width: 150, fontSize: 8.5, color: "#333333" },
  oppPanelBarTrack: { flex: 1, height: 8, backgroundColor: "#EEEEEE", borderRadius: 4, overflow: "hidden", marginRight: 8 },
  oppPanelBarFill: { height: 8, borderRadius: 4 },
  oppPanelValue: { width: 100, flexShrink: 0, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#333333", textAlign: "right" },
  oppPanelNote: { fontSize: 7.5, color: "#888888", fontStyle: "italic", marginTop: 4 },
  priorityActionMore: { fontSize: 8, color: "#888888", fontStyle: "italic", marginTop: 2 },
  oppTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  oppBenefit: { fontSize: 9, color: "#1D6FD8", fontStyle: "italic", marginBottom: 4, lineHeight: 1.4 },
  oppAction: { fontSize: 9, color: "#333333", marginBottom: 5, lineHeight: 1.4 },
  oppEvidence: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#1F9D55", marginBottom: 5 },

  // --- Internal linking ---
  hubRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  // flex: 1 on both the label and the bar keeps the bar column perfectly
  // aligned across every row, even when long URLs wrap to two lines.
  hubLabel: { flex: 1, fontSize: 9, fontFamily: CONTENT_FONT_STACK, color: "#0a5fb4" },
  hubCount: { width: 26, fontSize: 9, color: "#555555", textAlign: "right" },
  weakRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  weakUrl: { flex: 1, fontSize: 9, fontFamily: CONTENT_FONT_STACK, color: "#333333" },
  weakInbound: { fontSize: 8.5, color: "#888888", marginLeft: 10 },

  // --- Success checklist ---
  successItemRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 5 },
  successCheck: { width: 8, height: 8, borderRadius: 2, backgroundColor: "#1F9D55", marginRight: 8, marginTop: 3 },
  successItemText: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },
  successGroupLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1D6FD8", marginTop: 8, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 },

  // --- Response code per-code bars ---
  codeRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  codeLabel: { width: 150, fontSize: 9, color: "#333333" },
  codeBarTrack: { flex: 1, height: 8, backgroundColor: "#EEEEEE", borderRadius: 4, overflow: "hidden", marginRight: 8 },
  codeBarFill: { height: 8, borderRadius: 4 },
  codeBarFillGreen: { backgroundColor: "#1F9D55" },
  codeBarFillAmber: { backgroundColor: "#D98A1A" },
  codeBarFillRed: { backgroundColor: "#D9432E" },
  codeCount: { width: 26, fontSize: 9, color: "#555555", textAlign: "right" },

  // --- Remediation Knowledge Base styles ---
  remediationBlock: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    backgroundColor: "#FAFCFF",
    border: "1pt solid #D6E4F0",
    borderRadius: 6,
  },
  remediationBlockTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    marginBottom: 6,
  },
  remediationLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#1D6FD8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3,
    marginTop: 6,
  },
  remediationText: {
    fontSize: 9,
    color: "#333333",
    lineHeight: 1.5,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3,
    paddingLeft: 4,
  },
  stepNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1D6FD8",
    color: "#FFFFFF",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 2,
    marginRight: 6,
    flexShrink: 0,
  },
  stepText: { flex: 1, fontSize: 9, color: "#333333", lineHeight: 1.4 },
  exampleBlock: {
    marginTop: 6,
    marginBottom: 6,
    padding: 8,
    borderRadius: 4,
  },
  exampleBadBlock: {
    backgroundColor: "#FBE9E6",
    borderLeft: "3pt solid #D9432E",
    marginBottom: 4,
  },
  exampleGoodBlock: {
    backgroundColor: "#E7F6ED",
    borderLeft: "3pt solid #1F9D55",
  },
  exampleLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  exampleText: {
    fontSize: 9,
    color: "#333333",
    lineHeight: 1.4,
    fontFamily: CONTENT_FONT_STACK,
  },
  platformBlock: {
    marginTop: 6,
    padding: 8,
    backgroundColor: "#FAFAF8",
    border: "1pt solid #E0DFDA",
    borderRadius: 4,
  },
  platformLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#555555",
    marginBottom: 2,
  },
  platformText: {
    fontSize: 8.5,
    color: "#555555",
    lineHeight: 1.4,
  },
  devInstructionsBox: {
    marginTop: 6,
    padding: 10,
    backgroundColor: "#0F172A",
    borderRadius: 6,
  },
  devInstructionsLabel: {
    fontSize: 7,
    color: "#93C5FD",
    marginBottom: 3,
    fontFamily: "Helvetica-Bold",
  },
  devInstructionsText: {
    fontSize: 8,
    color: "#E2E8F0",
    fontFamily: "NotoSansDevanagari",
    lineHeight: 1.4,
  },
  successBox: {
    marginTop: 6,
    padding: 8,
    backgroundColor: "#E7F6ED",
    borderRadius: 4,
    borderLeft: "3pt solid #1F9D55",
  },
  successLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#1F9D55",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  successText: {
    fontSize: 9,
    color: "#333333",
    lineHeight: 1.4,
  },
  effortDifficultyRow: {
    flexDirection: "row",
    marginTop: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  effortDifficultyPill: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  remediationEffortPill: { color: "#1D6FD8", backgroundColor: "#EAF1FC" },
  difficultyPill: { color: "#555555", backgroundColor: "#F0F0F0" },
});

/** Split an array into rows of two — used by the landscape 30-day roadmap so
 * two phases sit side by side instead of stacking full-width. */
function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

/**
 * Maps issue keys to concise business-impact statements. Only included
 * for issues where there's a clear, defensible connection between the
 * fix and a business outcome. Uses conditional language — never claims
 * definite revenue or traffic increases.
 *
 * Returns null when there's no strong business-impact statement to make,
 * so callers can simply omit the field rather than show a generic filler.
 */
function businessImpactForKey(key: string): string | null {
  // Crawlability & Indexability — highest business relevance
  if (["noindex_meta_tag", "noindex_x_robots_tag", "missing_canonical", "canonical_mismatch"].includes(key)) {
    return "Resolving indexation issues can increase the number of eligible pages available to search engines, creating more opportunities for organic traffic.";
  }
  // Broken links — user experience + crawl efficiency
  if (key === "broken_links") {
    return "Fixing broken links improves crawl efficiency and user experience, helping search engines access your content and reducing visitor frustration.";
  }
  // Redirect chains
  if (key === "redirect_chains") {
    return "Eliminating redirect chains speeds up page delivery and improves crawl efficiency, which can help search engines process more pages within their crawl budget.";
  }
  // Metadata — CTR impact
  if (["missing_title", "duplicate_title", "missing_meta_description", "duplicate_meta_description", "thin_title_tag"].includes(key)) {
    return "Stronger search-result presentation can improve click-through rates from existing search impressions, capturing more qualified traffic.";
  }
  // Headings
  if (["missing_h1", "multiple_h1", "heading_hierarchy", "duplicate_h1"].includes(key)) {
    return "Clear heading structure helps search engines understand content hierarchy, supporting better content comprehension and ranking potential.";
  }
  // Content quality
  if (["thin_content", "low_word_count", "duplicate_content"].includes(key)) {
    return "Richer, more comprehensive content increases the likelihood of ranking for relevant queries and provides more value to visitors, improving engagement.";
  }
  // Images
  if (["oversized_images", "missing_alt_text", "non_descriptive_filenames"].includes(key)) {
    return "Optimized images improve page performance, accessibility, and the likelihood of appearing in image search results, driving additional qualified traffic.";
  }
  // Performance
  if (["poor_core_web_vitals", "slow_page_speed", "large_page_size"].includes(key)) {
    return "Improving page experience can reduce bounce rates and improve engagement metrics, which supports both user satisfaction and search performance.";
  }
  // Internal linking
  if (["orphan_page", "low_internal_links"].includes(key)) {
    return "Stronger internal linking helps search engines discover and understand your content, distributing authority more effectively across your pages.";
  }
  // Sitemap
  if (["missing_sitemap", "broken_sitemap"].includes(key)) {
    return "A complete sitemap helps search engines discover and index your pages more efficiently, particularly for larger sites or new content.";
  }
  // Robots.txt
  if (["robots_txt_issues", "blocked_resources"].includes(key)) {
    return "Proper robots.txt configuration ensures search engines can access and render your pages correctly, preventing indexing issues.";
  }
  // Structured data — rich results + AI
  if (["missing_schema_markup", "invalid_schema_markup", "missing_org_schema", "missing_faq_schema", "missing_breadcrumb_schema"].includes(key)) {
    return "Structured data enables rich results in search and makes your content more discoverable in AI-generated answers, increasing visibility across search surfaces.";
  }
  return null;
}

/** Maximum tasks shown per phase card. The roadmap sequences the work — every
 * task remains fully detailed on its own issue page and in Top Priority Fixes
 * — so the cap keeps each phase card atomic and bounded (always fits one page)
 * without losing any information. */
const PLAN_PHASE_ISSUE_LIMIT = 6;

/** Maximum Fix Roadmap items shown per tier on the PDF roadmap page. The
 * roadmap is the concise "what to fix first" summary — every task stays
 * fully detailed in Top Priority Fixes, the coverage section, and the CSV,
 * so the cap keeps the page readable without losing any information. */
const FIX_ROADMAP_PDF_ITEMS_PER_TIER = 4;

/** One phase of the 30-Day Action Plan — an atomic card: phase head (badge +
 * title + days/focus), priority tasks with page counts and effort, and the
 * expected outcome. wrap={false} keeps the whole phase together; the task cap
 * bounds its height so a phase never splits or clips. */
function PlanPhaseCard({ phase }: { phase: ActionPlanWeek }) {
  const shown = phase.issues.slice(0, PLAN_PHASE_ISSUE_LIMIT);
  return (
    <View style={styles.planPhase} wrap={false}>
      <View style={styles.planPhaseHead} wrap={false}>
        <View style={styles.planPhaseBadge}>
          <Text style={styles.planPhaseBadgeNum}>{phase.weekNumber}</Text>
        </View>
        <View style={styles.planPhaseHeadText}>
          <Text style={styles.planPhaseTitle}>{phase.title}</Text>
          <Text style={styles.planPhaseDays}>
            {phase.days} · {phase.focus}
          </Text>
        </View>
      </View>
      <Text style={styles.planPhaseLabel}>Priority tasks</Text>
      {shown.map((issue) => (
        <View key={issue.key} style={styles.planIssueRow} wrap={false}>
          <View style={{ flex: 1, flexDirection: "column", paddingRight: 8 }}>
            <Text style={styles.planIssueLabel}>{issue.label}</Text>
            {(() => {
              const rem = getRemediation(issue.key);
              return rem ? (
                <Text style={{ fontSize: 8, color: "#555555", marginTop: 4, lineHeight: 1.4 }}>
                  Action: {rem.howToFix.length > 140 ? rem.howToFix.slice(0, 137) + "..." : rem.howToFix}
                </Text>
              ) : null;
            })()}
          </View>
          <View style={styles.planIssueMetaWrap}>
            <Text style={styles.planIssueMeta}>
              {issue.count} {countUnitFor(issue.count, issue.countUnit)}
            </Text>
            <View style={{ marginTop: 4 }}>
              <EffortBadge label={issue.effortBucketLabel} />
            </View>
            {issue.templateLevel && (
              <Text style={[styles.batchNoteText, { textAlign: "right", maxWidth: 170 }]}>
                Template-level fix
              </Text>
            )}
          </View>
        </View>
      ))}
      {phase.issues.length > shown.length && (
        <Text style={styles.moreInstancesNote}>
          + {phase.issues.length - shown.length} more — full ranked list in Top Priority Fixes
        </Text>
      )}
      <View style={styles.planPhaseOutcome}>
        <Text style={styles.planPhaseOutcomeLabel}>Expected outcome</Text>
        <Text style={styles.planPhaseOutcomeText}>{phase.outcome}</Text>
      </View>
    </View>
  );
}

/** Closing panel of the 30-Day Action Plan — final priorities (critical
 * issues first) and the plan-level expected outcome. Bounded so it always
 * fits below the phase pair on the last roadmap page. */
function PlanFinalPriorities({
  priorityList,
  quickWins,
}: {
  priorityList: PriorityIssue[];
  quickWins: PriorityIssue[];
}) {
  const fixFirst = priorityList.filter((i) => fixTierFor(i) === "fixFirst");
  const items = fixFirst.length > 0 ? fixFirst : quickWins.slice(0, 5);
  return (
    <View style={styles.planFinal} wrap={false}>
      <Text style={styles.planFinalTitle}>Final priorities & expected outcome</Text>
      <Text style={styles.planFinalText}>
        {fixFirst.length > 0
          ? "Work through the phases in order — the highest-priority fixes first — verifying each fix before moving on. These items carry the highest risk where they apply, so don't skip them, but the ranking below weighs reach and effort too."
          : "No high-priority issues remain — complete the quick wins and verify each fix as you go, then run the follow-up audit to confirm the improvements."}
      </Text>
      {items.map((issue) => (
        <View key={issue.key} style={styles.successItemRow} wrap={false}>
          <View style={styles.successCheck} />
          <Text style={styles.successItemText}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{issue.label}</Text>
            {" "}resolved across {issue.count} {countUnitFor(issue.count, issue.countUnit)}
            {issue.affectedPages
              ? ` · ${issue.affectedPages} page${issue.affectedPages === 1 ? "" : "s"}`
              : ""}
          </Text>
        </View>
      ))}
      <View style={styles.planFinalNote}>
        <Text style={styles.planFinalNoteText}>
          Expected outcome: with every phase implemented, the site should show measurable improvements in crawl
          efficiency, indexation, and AI visibility — confirmed by the follow-up audit.
        </Text>
      </View>
    </View>
  );
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Category id -> internal PDF anchor id, so clicking a category (bar row
 * or radar label) jumps straight to that section instead of leaving the
 * reader to hunt through a 30-page PDF. Anchor ids are placed on the
 * matching section heading further down this file (search "id=\"cat-").
 */
const CATEGORY_ANCHOR: Record<string, string> = {
  onPage: "cat-on-page-seo",
  technical: "cat-technical-seo",
  aiSearchReadiness: "cat-ai-search-readiness",
  // Deprecated backward-compatible keys
  performance: "cat-technical-seo",
  accessibility: "cat-technical-seo",
  metadata: "cat-on-page-seo",
  content: "cat-on-page-seo",
};

/**
 * Item #4: one concise sentence per category explaining what feeds its
 * score, so "Technical: 46/100" doesn't sit unexplained. Keyed the same
 * way as CATEGORY_ANCHOR. A category key outside this known set (e.g. a
 * future addition to buildCategoryScores) still renders — just with a
 * neutral generic sentence instead of no sentence at all.
 */
const CATEGORY_EXPLANATION: Record<string, string> = {
  onPage: "Title tags, meta descriptions, headings, word count, thin content, internal links, image alt text, and image filename quality.",
  technical: "Canonicals, noindex, robots.txt, sitemaps, broken links, redirects, URL structure, Core Web Vitals, and crawl health.",
  aiSearchReadiness: "JSON-LD schema coverage and structured data validity — this pillar score is separate from the full AI Readiness Score (AEO/GEO) shown on the Executive Dashboard, which evaluates 47+ checks across entity clarity, content structure, and citation readiness.",
  // Deprecated backward-compatible keys
  performance: "Core Web Vitals (LCP, INP, CLS, TTFB) and page-load speed from a live Lighthouse run.",
  accessibility: "Accessibility issues detected by Lighthouse during the performance scan.",
  metadata: "Title tags, meta descriptions, Open Graph tags, and duplicate metadata.",
  content: "Thin content, duplicate content, headings, and internal linking.",
};
const DEFAULT_CATEGORY_EXPLANATION = "Combines the issues detected in this category during the crawl.";

/**
 * Hand-built SVG radar chart. @react-pdf/renderer cannot render
 * Recharts/D3/Chart.js (they're DOM-based) — this uses react-pdf's own
 * Svg/Polygon/Line/Circle primitives directly, which IS supported.
 * Each axis label includes the numeric score (not just the category
 * name) since "which spike is longer" alone doesn't tell a reader
 * whether 69 vs 81 is a 12-point gap or a 60-point one.
 */
function CategoryRadarChart({ categories }: { categories: CategoryScore[] }) {
  // Canvas made larger than the plotted hexagon itself, specifically to
  // leave room for label text ("Metadata (77)" etc.) outside the chart.
  // Anything drawn past the viewBox edge is silently clipped by react-pdf
  // — that's what was cutting off "Metadata"/"Content"'s score numbers
  // and crowding "Performance" against the top edge.
  const width = 340, height = 260, cx = width / 2, cy = height / 2, maxR = 78;
  const labelOffset = 34;
  const n = categories.length;
  const step = 360 / n;
  const rings = [20, 40, 60, 80, 100];

  // Scores are clamped to 0-100 before plotting so a projected/edge-case
  // score above the ceiling can never distort the chart or render "104".
  const dataPts = categories.map((c, i) => polarPoint(cx, cy, (clampScore(c.score) / 100) * maxR, i * step));
  const dataPolygon = dataPts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {rings.map((score) => (
        <Polygon
          key={score}
          points={categories
            .map((_, i) => {
              const p = polarPoint(cx, cy, (score / 100) * maxR, i * step);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          stroke="#E0DFDA"
          strokeWidth={0.5}
          fill="none"
        />
      ))}
      {categories.map((_, i) => {
        const p = polarPoint(cx, cy, maxR, i * step);
        return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#E0DFDA" strokeWidth={0.5} />;
      })}
      <Polygon points={dataPolygon} fill="#1D6FD8" fillOpacity={0.25} stroke="#1D6FD8" strokeWidth={1.5} />
      {dataPts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#1D6FD8" />
      ))}
      {categories.map((cat, i) => {
        const lp = polarPoint(cx, cy, maxR + labelOffset, i * step);
        // Anchor each label so it grows AWAY from the chart center rather
        // than being centered on the vertex — a right-side label centered
        // on its point pushes half its own width further right, which is
        // exactly what was overflowing the canvas before. Points close to
        // straight up/down (small horizontal offset) still center, since
        // there's no left/right direction to lean into.
        const dx = lp.x - cx;
        const textAnchor: "start" | "middle" | "end" = dx > 8 ? "start" : dx < -8 ? "end" : "middle";
        return (
          <SvgText
            key={cat.key}
            x={lp.x}
            y={lp.y}
            textAnchor={textAnchor}
            style={{ fontSize: 8, fontFamily: "Helvetica-Bold", fill: "#333333" }}
          >
            {cat.label} ({clampScore(cat.score)})
          </SvgText>
        );
      })}
    </Svg>
  );
}

function scoreColor(score: number): string {
  // Same palette as the severity/verdict system so a score's color always
  // matches the pill next to it (pass/amber/fail), never a second green.
  if (score >= 80) return "#1F9D55";
  if (score >= 50) return "#D98A1A";
  return "#D9432E";
}

function responseGroupBarStyle(key: string) {
  if (key === "2xx") return styles.responseCodeBarFillGood;
  if (key === "3xx") return styles.responseCodeBarFillWarn;
  return styles.responseCodeBarFillFail; // 4xx, 5xx
}

/** Every score rendered anywhere in this report stays within 0-100, so a
 * crawl or projection edge case can never surface as "104" or "100+". */
function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Clean horizontal bar (replaces the old star/pip ratings — stars render
 * inconsistently in react-pdf; bars are scannable, professional, and fully
 * supported). `filled`/`total` on a 0-total scales to an empty bar. */
function renderBar(filled: number, total: number, color: string) {
  const pct = Math.max(0, Math.min(100, (filled / Math.max(1, total)) * 100));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function effortLevelOf(label: string): "low" | "medium" | "high" {
  const lower = label.toLowerCase();
  // Effort-bucket labels ("Trivial (< 30 mins)" / "Moderate (1–3 hours)" /
  // "Advanced (4+ hours)") — match the bucket word before falling through to
  // the minute/hour/day parsing used by granular labels.
  if (lower.includes("trivial")) return "low";
  if (lower.includes("moderate")) return "medium";
  if (lower.includes("advanced")) return "high";
  if (/\bday/.test(lower)) return "high";
  if (/\bhour/.test(lower)) {
    const match = lower.match(/(\d+(?:\.\d+)?)\s*hour/);
    const hours = match ? parseFloat(match[1]) : 1;
    return hours >= 4 ? "high" : "medium";
  }
  if (/\bminute/.test(lower)) {
    const match = lower.match(/(\d+(?:\.\d+)?)\s*minute/);
    const minutes = match ? parseFloat(match[1]) : 0;
    return minutes >= 45 ? "medium" : "low";
  }
  return "medium";
}

function parseTimeLabelToMinutes(label: string): number {
  const lower = label.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(minute|hour|day)/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  if (match[2] === "minute") return Math.round(value);
  if (match[2] === "hour") return Math.round(value * 60);
  return Math.round(value * 60 * 8); // working days
}

function formatTotalTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  // Plain ASCII only: the "≈" glyph isn't in Helvetica's WinAnsi charset
  // (renders as a broken bar in the PDF) and a bare "h" reads as an H —
  // spell the unit out instead.
  const hours = minutes / 60;
  if (hours < 1) return `~${Math.max(1, Math.round(minutes))} min`;
  if (hours < 48) return `~${Math.round(hours)} hours`;
  const days = Math.round(hours / 8);
  return `~${days} day${days === 1 ? "" : "s"}`;
}

/** Compact colored effort pill — the visual for every estimated fix time. */
function EffortBadge({ label }: { label: string }) {
  const level = effortLevelOf(label);
  const pillStyle =
    level === "high" ? styles.effortPillHigh : level === "medium" ? styles.effortPillMedium : styles.effortPillLow;
  const clean = label.replace("~", "").replace(" total", "").trim();
  return (
    <View style={[styles.effortPill, pillStyle]}>
      <Text>{clean}</Text>
    </View>
  );
}

/** What each AI visibility opportunity unlocks once implemented — shown as a
 * short ✓ list so the payoff is concrete rather than abstract. */
const OPPORTUNITY_UNLOCKS: Record<string, string[]> = {
  faq_opportunity: [
    "Better eligibility for AI answer-engine Overview-style responses",
    "Direct answers extracted from your existing Q&A content",
    "Rich results (expandable FAQ) in traditional search",
    "Stronger citation potential for question-style queries",
  ],
  step_by_step: [
    "Numbered steps quoted directly in 'how to' answers",
    "Each step individually extractable and citable",
    "Clearer task structure for both AI engines and readers",
  ],
  comparison: [
    "Side-by-side facts AI systems use to answer 'X vs Y' queries",
    "Eligibility for comparison-oriented rich results",
    "A single citable source for comparative questions",
  ],
  definitions: [
    "A crisp, quotable answer for 'What is…' queries",
    "Higher likelihood of being the cited definition",
    "Clearer topical intent signals for the page's main keyword",
  ],
  lists_tables: [
    "Facts parsed into structured answers (steps, rankings, comparisons)",
    "Better answer extraction from dense content",
    "Improved scannability and dwell time for readers",
  ],
  statistics: [
    "Concrete numbers AI engines can quote with confidence",
    "Stronger authority for data-driven claims",
    "Increased likelihood of appearing in stat-focused answers",
  ],
  product_specs: [
    "Product schema (price, availability, ratings) readable by AI shopping assistants",
    "Machine-readable specs that answer product queries directly",
    "Rich-result eligibility for product listings",
  ],
  local_intent: [
    "Structured hours, address, and service area for location-aware queries",
    "LocalBusiness schema eligibility for local results",
    "Consistent NAP data AI systems can trust",
  ],
};

/** Returns the human tier label for a 0-100 AI readiness score.
 * Uses getAiReadinessVerdict — the SINGLE source of truth for AI
 * readiness labels, shared with the dashboard card and executive summary. */
function scoreTierLabel(score: number): string {
  return getAiReadinessVerdict(score).label;
}

/**
 * Compact 5-block horizontal interpretation guide (█████ style) used under
 * AI Readiness / Citation Readiness scores so a bare number reads as a
 * meaningful assessment. Bars render reliably in react-pdf; the filled
 * block count derives directly from the score.
 */
function ScoreScaleGuide({ score }: { score: number }) {
  const filled = Math.max(1, Math.min(5, Math.round(clampScore(score) / 20)));
  return (
    <View style={styles.scaleGuide} wrap={false}>
      <View style={styles.scaleGuideRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.scaleBlock, i < filled ? styles.scaleBlockFilled : styles.scaleBlockEmpty]} />
        ))}
      </View>
      <Text style={styles.scaleGuideLabel}>{scoreTierLabel(score)}</Text>
    </View>
  );
}

// ===== AEO recommendation-card helpers (priority / effort / impact) =====
// Maps a check's consulting metadata to labels, badge colors, and bar
// fill levels — so every AI card presents urgency, effort, and payoff in
// the same visual language as the rest of the report (severity palette +
// horizontal bars, never stars).
const AEO_PRIORITY_LABEL: Record<AeoPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  best_practice: "Best Practice",
};
const AEO_PRIORITY_COLOR: Record<AeoPriority, string> = {
  critical: "#B42318",
  high: "#D9432E",
  medium: "#D98A1A",
  low: "#1F9D55",
  best_practice: "#1D6FD8",
};
const AEO_PRIORITY_BG: Record<AeoPriority, string> = {
  critical: "#FBE9E6",
  high: "#FBE9E6",
  medium: "#FBF0DF",
  low: "#E7F6ED",
  best_practice: "#EAF1FC",
};
// Neutral "N/A" presentation for conditional schema checks the crawl showed
// don't apply to this site (e.g. Product schema on a non-ecommerce site) —
// replaces the priority badge/bar so it's never read as a fix to schedule.
const AEO_DIFF_LABEL: Record<AeoDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  advanced: "Advanced",
  enterprise: "Enterprise",
};
const AEO_DIFF_COLOR: Record<AeoDifficulty, string> = {
  easy: "#1F9D55",
  medium: "#D98A1A",
  advanced: "#D9432E",
  enterprise: "#FFFFFF",
};
const AEO_DIFF_BG: Record<AeoDifficulty, string> = {
  easy: "#E7F6ED",
  medium: "#FBF0DF",
  advanced: "#FBE9E6",
  enterprise: "#52565C",
};
/** Qualitative band → compact label + bar fill for the dashboard's
 * "Estimated SEO Opportunity" panel. No numeric score projection anywhere:
 * the bands come from buildImprovementPotential (same impact ratings the
 * client sees in Top Priority Fixes), so the bar communicates direction and
 * scale without implying a guaranteed future score. */
const IMPROVEMENT_BAND_FILL: Record<string, number> = {
  "High improvement potential": 72,
  "Significant improvement potential": 86,
};
const IMPROVEMENT_BAND_SHORT: Record<string, string> = {
  "High improvement potential": "High potential",
  "Significant improvement potential": "Significant potential",
};

const AEO_IMPACT_LABEL: Record<AeoImpact, string> = {
  very_high: "Very High",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const AEO_IMPACT_FILL: Record<AeoImpact, number> = {
  very_high: 100,
  high: 80,
  medium: 60,
  low: 40,
};
/** Compact colored badge used for priority / effort / time on AI cards. */
function AeoBadge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return <Text style={[styles.aeoBadge, { backgroundColor: bg, color: fg }]}>{text}</Text>;
}

/** The "expected impact" horizontal bar shown on every failing AI card and
 * in the implementation-order ranking. */
function AeoImpactBar({ impact, width }: { impact: AeoImpact; width?: number }) {
  return (
    <View style={width ? [styles.aeoImpactTrack, { width }] : styles.aeoImpactTrack}>
      <View style={[styles.aeoImpactFill, { width: `${AEO_IMPACT_FILL[impact]}%` }]} />
    </View>
  );
}

function severityPillStyle(severity: string) {
  // PriorityIssue.severity is always critical | moderate | minor (see
  // priorityIssues.ts) — map moderate onto the amber pill and minor onto the
  // green pill so PDF severity colors match the web report exactly.
  // "high"/"medium" are kept as defensive fallbacks.
  if (severity === "critical") return styles.sevPillCritical;
  if (severity === "moderate") return styles.sevPillMedium;
  if (severity === "high") return styles.sevPillHigh;
  if (severity === "medium") return styles.sevPillMedium;
  return styles.sevPillLow;
}

/** Pill colors for the implementation-priority TIER (High/Medium/Low) —
 * used on ranking surfaces (Highest Priority Actions). Deliberately the
 * amber/green warn palette rather than the solid red severity pill, so a
 * "HIGH" priority chip can never be confused with a "CRITICAL" severity
 * badge. */
function priorityTierPillStyle(tier: string) {
  if (tier === "high") return styles.sevPillHigh;
  if (tier === "medium") return styles.sevPillMedium;
  return styles.sevPillLow;
}

/** Who should own a given fix — used by the issue summary cards. */
function ownerForFlag(flag: string): string {
  if (/title|meta_description|description|h1|heading|thin|content|duplicate|alt/.test(flag)) return "Content team";
  if (/link|orphan|internal/.test(flag)) return "Content team";
  return "Development";
}

/** The SEO-side consequence of leaving an issue unfixed — shown on summary cards. */
function seoImpactForFlag(flag: string): string {
  if (/title|description/.test(flag)) return "May reduce click-through rate in search results";
  if (/h1|heading/.test(flag)) return "Weakens topical relevance signals";
  if (/canonical|noindex/.test(flag)) return "Can block indexing or split ranking signals";
  if (/schema/.test(flag)) return "No rich-result eligibility in search";
  if (/redirect/.test(flag)) return "Wastes crawl budget and can leak link equity";
  if (/broken|404/.test(flag)) return "Wastes crawl budget; links lose their equity";
  if (/image|oversized|alt|lazy|srcset|dimension/.test(flag)) return "Slower pages and weaker image-search visibility";
  if (/speed|vital|performance/.test(flag)) return "Weaker Core Web Vitals signals";
  if (/link|orphan|internal/.test(flag)) return "Pages harder to discover and crawl";
  if (/thin|content|duplicate/.test(flag)) return "Dilutes topical authority";
  if (/url|slug/.test(flag)) return "Missed keyword relevance in URLs";
  if (/a11y|accessib/.test(flag)) return "Excludes a portion of search traffic";
  return "Limits visibility in search results";
}

/** The concrete business outcome of fixing an issue — shown on summary cards. */
/** Splits long copy into shorter paragraphs on sentence boundaries so dense
 * issue pages read as scannable blocks rather than walls of text. Only
 * splits when the text is genuinely long; short copy passes through intact. */
function splitParagraphs(text: string, targetChars = 300): string[] {
  if (!text) return [text];
  if (text.length <= targetChars + 60) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > targetChars) {
      paragraphs.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());
  return paragraphs.length > 1 ? paragraphs : [text];
}

/* Expected SEO & AI impact — what fixing this issue plausibly changes, in
 * defensible language. These are directional outcomes (measured, where
 * possible, by the follow-up audit), never guaranteed ranking or traffic
 * claims. Each statement is specific to the issue family so the report
 * never repeats one generic "improves visibility" sentence everywhere. */
function expectedOutcomeForFlag(flag: string): string {
  if (/title|description/.test(flag)) return "Expected: each page gets a clear, distinct entry in search results and AI summaries — the basis for earning the click and being quoted for the right query.";
  if (/h1|heading/.test(flag)) return "Expected: search and AI systems can confidently identify each page's main topic, so the page can be associated with the queries it actually answers.";
  if (/thin|content/.test(flag)) return "Expected: the page becomes a complete answer for its topic instead of a thin placeholder — the foundation for ranking and being cited for that topic.";
  if (/canonical|noindex/.test(flag)) return "Expected: each page consolidates its signals onto one indexable version, so the page can appear in results and be referenced by AI systems at all.";
  if (/schema/.test(flag)) return "Expected: the page becomes eligible for rich-result formats and gives AI systems explicit, machine-readable facts to quote instead of inferred ones.";
  if (/redirect/.test(flag)) return "Expected: faster crawling and consolidated link equity while pages move — the old URLs stop diluting the new ones.";
  if (/broken|404/.test(flag)) return "Expected: crawl budget stops being spent on dead URLs, so important pages are discovered and indexed sooner.";
  if (/image|oversized|alt|lazy|srcset|dimension|format/.test(flag)) return "Expected: faster page loads (supporting Core Web Vitals) and stronger image-search visibility for the affected images.";
  if (/speed|vital|performance/.test(flag)) return "Expected: better user-experience metrics on the affected pages; the follow-up audit measures whether the scores moved.";
  if (/link|orphan|internal/.test(flag)) return "Expected: reconnected pages become reachable by both crawlers and visitors, letting authority flow through the site instead of pooling.";
  if (/url|slug/.test(flag)) return "Expected: URLs that read clearly in results and when shared — a small, free relevance and trust signal.";
  return "Expected: a clearer signal to search and AI systems for this issue's topic area; the follow-up audit measures the result.";
}

/** Concrete verification steps per issue family — how to confirm THIS fix
 * actually landed, specific to what was changed (not a generic three-line
 * paragraph repeated on every issue). Two or three steps per family, each
 * naming the tool and exactly what to check in it. */
function verifyStepsForFlag(flag: string): { tool: string; step: string }[] {
  if (/schema/.test(flag))
    return [
      { tool: "Rich Results Test", step: "Paste the page URL and confirm the markup validates and the expected schema type is detected." },
      { tool: "HTML source", step: "View the page source and confirm exactly one valid JSON-LD block with the intended @type is present." },
    ];
  if (/canonical/.test(flag))
    return [
      { tool: "HTML source", step: "View the page source and confirm exactly one canonical tag exists and points to the preferred URL." },
      { tool: "URL Inspection", step: "Confirm the canonical target is the version Search Console reports as indexed." },
    ];
  if (/noindex|robots/.test(flag))
    return [
      { tool: "HTML source", step: "Confirm the noindex directive is gone from the page's meta robots tag or X-Robots-Tag header." },
      { tool: "URL Inspection", step: "Request re-indexing of the affected pages and confirm they are shown as eligible." },
    ];
  if (/h1|heading/.test(flag))
    return [
      { tool: "HTML source", step: "Confirm each page now has exactly one H1 and that supporting sections use H2/H3 as intended." },
      { tool: "Browser inspection", step: "Load the page and confirm the heading hierarchy reads naturally to a visitor." },
    ];
  if (/title|description|duplicate/.test(flag))
    return [
      { tool: "HTML source", step: "Confirm each affected page now has its own unique title and meta description." },
      { tool: "Google Search Console", step: "After the next crawl, confirm the new titles and descriptions appear in the index." },
    ];
  if (/alt/.test(flag))
    return [
      { tool: "HTML source", step: "Confirm every meaningful image now has descriptive alt text, and decorative images are marked empty." },
      { tool: "Browser inspection", step: "Inspect the rendered images and confirm the alt text describes what each one shows." },
    ];
  if (/image|oversized|lazy|srcset|dimension|format/.test(flag))
    return [
      { tool: "HTML source", step: "Confirm the image tags now carry the intended attributes (width/height, loading, srcset, or format)." },
      { tool: "PageSpeed Insights", step: "Re-run the test on the affected pages and compare the image-related metrics against the baseline in this report." },
    ];
  if (/redirect/.test(flag))
    return [
      { tool: "Redirect checker", step: "Trace each listed URL and confirm it now resolves in a single hop to the final destination." },
    ];
  if (/broken|404/.test(flag))
    return [
      { tool: "Link checker", step: "Re-test each listed URL and confirm it returns a healthy status." },
      { tool: "Google Search Console", step: "Confirm the next crawl no longer reports these URLs as errors." },
    ];
  if (/link|orphan|internal/.test(flag))
    return [
      { tool: "Browser inspection", step: "Open the page and confirm the new contextual links appear where intended." },
      { tool: "Google Search Console", step: "After the next crawl, confirm the previously orphaned or unlinked pages are now discovered." },
    ];
  if (/url|slug/.test(flag))
    return [
      { tool: "Browser inspection", step: "Open the old URL and confirm it redirects to the cleaned-up version." },
      { tool: "HTML source", step: "Confirm the cleaned URL carries a self-referencing canonical tag." },
    ];
  if (/thin|content/.test(flag))
    return [
      { tool: "Browser inspection", step: "Confirm the page now contains substantive content that fully answers its topic." },
      { tool: "Google Search Console", step: "After re-crawling, confirm the indexed content reflects the update." },
    ];
  if (/speed|vital|performance/.test(flag))
    return [
      { tool: "PageSpeed Insights", step: "Re-run the test on the affected pages and compare the metric against the baseline in this report." },
    ];
  if (/sitemap/.test(flag))
    return [
      { tool: "Google Search Console", step: "Resubmit the sitemap and confirm it parses without errors." },
      { tool: "HTML source", step: "Open the sitemap URL and confirm the corrected XML renders cleanly." },
    ];
  return [
    { tool: "Google Search Console", step: "Confirm the affected pages are indexed after the fix." },
    { tool: "Browser inspection", step: "Load the affected pages and confirm the fix behaves as expected." },
  ];
}

/** Impact + estimated-time row used on standalone sections (broken links,
 * duplicates, oversized images) — driven by the same PriorityIssue data the
 * summary cards and action plan use, so every surface agrees. */
function ImpactTimeRow({ priority }: { priority: PriorityIssue | undefined }) {
  if (!priority) return null;
  const level = impactLevelForIssue(priority);
  const pillStyle =
    level === "high" ? styles.impactPillHigh : level === "medium" ? styles.impactPillMedium : styles.impactPillLow;
  const estimate = estimateBatchAwareTime(priority);
  const suffix = batchRecommendationSuffix(estimate, priority.count);

  return (
    <View wrap={false}>
      <View style={styles.impactTimeRow}>
        <Text style={[styles.impactPill, pillStyle]}>{IMPACT_LABEL[level]}</Text>
        <EffortBadge label={estimate.label} />
      </View>
      <Text style={styles.effortDisclaimer}>{EFFORT_ESTIMATE_DISCLAIMER}</Text>
      {priority.estimateRationale && (
        <Text style={styles.estimateRationaleText}>{priority.estimateRationale}</Text>
      )}
      {suffix !== "" && (
        <Text style={styles.batchNoteText}>
          This issue appears to originate from a shared template. Updating the template once should resolve the issue
          across all affected pages while avoiding unnecessary manual edits.
        </Text>
      )}
    </View>
  );
}

/**
 * Core Web Vitals scale bar (item #6) — brings the PDF's vitals cards up
 * to the same good/needs-improvement/poor visual clarity the web report
 * already has, using the same buildVitalsScale() geometry as the web
 * report's inline bar so the two surfaces never disagree.
 */
function VitalScaleBar({
  value,
  goodMax,
  needsImprovementMax,
  scaleMax,
}: {
  value: number;
  goodMax: number;
  needsImprovementMax: number;
  scaleMax: number;
}) {
  const { segments, markerPct } = buildVitalsScale(value, goodMax, needsImprovementMax, scaleMax);
  return (
    <View>
      <View style={styles.vitalScaleTrack}>
        {segments.map((seg, i) => (
          <View key={i} style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color }} />
        ))}
      </View>
      <Svg width="100%" height={8} viewBox="0 0 200 8">
        <Line x1={2 + (markerPct / 100) * 196} y1={0} x2={2 + (markerPct / 100) * 196} y2={8} stroke="#1a1a1a" strokeWidth={2} />
      </Svg>
    </View>
  );
}

/**
 * Remediation Knowledge Base block — renders the structured remediation
 * data for an issue: what it means, step-by-step fix, examples, developer
 * instructions, platform-specific guidance, effort/difficulty, and success
 * condition. Full-width, paginates freely after the atomic consulting body.
 */
function RemediationBlock({ remediation }: { remediation: import("./remediation").RemediationEntry }) {
  const r = remediation;
  const hasSteps = r.stepByStepFix && r.stepByStepFix.length > 0;
  const hasExamples = r.exampleBad || r.exampleGood;
  const hasDevInstructions = !!r.developerInstructions;
  const hasPlatformInstructions = !!r.platformInstructions;

  return (
    <View style={styles.remediationBlock}>
      <Text style={styles.remediationBlockTitle}>Implementation Guide</Text>

      {/* What This Means */}
      <View wrap={false}>
        <Text style={styles.remediationLabel}>What this means</Text>
        <Text style={styles.remediationText}>{r.whatItMeans}</Text>
      </View>

      {/* How To Fix */}
      <View wrap={false}>
        <Text style={styles.remediationLabel}>How to fix</Text>
        <Text style={styles.remediationText}>{r.howToFix}</Text>
      </View>

      {/* Step-by-Step Fix */}
      {hasSteps && (
        <View wrap={false}>
          <Text style={styles.remediationLabel}>Step-by-step</Text>
          {r.stepByStepFix.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={{ fontSize: 8, color: "#FFFFFF", fontFamily: "Helvetica-Bold", textAlign: "center" }}>{i + 1}</Text></View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Examples */}
      {hasExamples && (
        <View style={styles.exampleBlock} wrap={false}>
          <Text style={styles.remediationLabel}>Examples</Text>
          {r.exampleBad && (
            <View style={[styles.exampleBlock, styles.exampleBadBlock]}>
              <Text style={[styles.exampleLabel, { color: "#D9432E" }]}>✖ Current / Bad</Text>
              <Text style={styles.exampleText}>{r.exampleBad}</Text>
            </View>
          )}
          {r.exampleGood && (
            <View style={[styles.exampleBlock, styles.exampleGoodBlock]}>
              <Text style={[styles.exampleLabel, { color: "#1F9D55" }]}>✔ Recommended</Text>
              <Text style={styles.exampleText}>{r.exampleGood}</Text>
            </View>
          )}
        </View>
      )}

      {/* Developer Instructions */}
      {hasDevInstructions && (
        <View wrap={false}>
          <Text style={styles.remediationLabel}>Developer instructions</Text>
          <View style={styles.devInstructionsBox}>
            <Text style={styles.devInstructionsLabel} wrap={false}>ISSUE:</Text>
            <Text style={styles.devInstructionsText}>{r.issueName}</Text>
            <Text style={[styles.devInstructionsLabel, { marginTop: 4 }]} wrap={false}>IMPLEMENTATION:</Text>
            <Text style={styles.devInstructionsText}>{r.developerInstructions}</Text>
            <Text style={[styles.devInstructionsLabel, { marginTop: 4 }]} wrap={false}>VERIFY:</Text>
            <Text style={styles.devInstructionsText}>{r.verificationMethod}</Text>
          </View>
        </View>
      )}

      {/* Platform-Specific Instructions */}
      {hasPlatformInstructions && (
        <View wrap={false}>
          <Text style={styles.remediationLabel}>Platform-specific instructions</Text>
          <View style={styles.platformBlock}>
            {r.platformInstructions!.wordpress && (
              <View style={{ marginBottom: 4 }}>
                <Text style={styles.platformLabel}>WordPress:</Text>
                <Text style={styles.platformText}>{r.platformInstructions!.wordpress}</Text>
              </View>
            )}
            {r.platformInstructions!.shopify && (
              <View style={{ marginBottom: 4 }}>
                <Text style={styles.platformLabel}>Shopify:</Text>
                <Text style={styles.platformText}>{r.platformInstructions!.shopify}</Text>
              </View>
            )}
            {r.platformInstructions!.rawHtml && (
              <View>
                <Text style={styles.platformLabel}>Raw HTML / Developer:</Text>
                <Text style={styles.platformText}>{r.platformInstructions!.rawHtml}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Success Condition */}
      <View style={styles.successBox} wrap={false}>
        <Text style={styles.successLabel}>Success condition</Text>
        <Text style={styles.successText}>{r.successCondition}</Text>
      </View>

      {/* Effort & Difficulty */}
      <View style={styles.effortDifficultyRow}>
        <Text style={[styles.effortDifficultyPill, styles.remediationEffortPill]}>⏱ {r.estimatedEffort}</Text>
        <Text style={[styles.effortDifficultyPill, styles.difficultyPill]}>⚙ {r.technicalDifficulty}</Text>
      </View>
    </View>
  );
}

/**
 * Renders the shared "issue card" layout — label, why it matters, business
 * impact, recommended fix, then affected URLs — used by Issues by Type,
 * Image SEO, and URL SEO alike. None of the image/URL flags ever carry an
 * AI suggestion, so instance.suggestedText is always null for them here;
 * the suggestion box below simply never renders for this content, exactly
 * as requested — just the URL list.
 */
function renderIssueGroupViews(
  groups: GroupedIssue[],
  options: ReportOptions,
  priorityList: PriorityIssue[] = [],
  nonDescriptiveImageFindings: NonDescriptiveImageFinding[] = [],
  opts?: { noBreak?: boolean; breakFirst?: boolean; familyHeading?: React.ReactNode; sectionHeading?: React.ReactNode; estimatedImpact?: EstimatedBusinessImpactResult }
) {
  // CSV links are only attached for Freelancer/Pro and Agency tiers — same
  // gate as the ReportDocument-level csvAvailable below (this helper runs
  // before that component body, so it derives the flag from options here).
  const csvAvailable = !!(options.reportUrl && !options.whiteLabel);
  const NON_DESCRIPTIVE_IMAGES_LIMIT = 20;
  return groups.map((group, groupIndex) => {
    const priority = priorityList.find((p) => p.key === group.flag);
    const templateLevel = priority?.templateLevel ?? false;
    return (
    // Each issue group gets its own Page so findings never flow into
    // each other. opts.familyHeading renders at the top of the first
    // family member's page. opts.sectionHeading renders the section
    // title on the first group's page so there's no blank heading page.
    <Page key={group.flag} size={PAGE_SIZE} style={styles.page} wrap>
    {opts?.sectionHeading && groupIndex === 0 && opts.sectionHeading}
    {opts?.familyHeading && groupIndex === 0 && opts.familyHeading}
    <View style={styles.issueGroupBlock}>
      {/* Issue head flows naturally — it's small enough to never need
          page-break protection. The two-column rows below are each atomic
          so a consulting card can never split mid-row. */}
      <View style={styles.issueGroupHead}>
        <Text style={styles.issueLabel}>{group.issueLabel}</Text>
        <Text style={styles.issueCountBadge}>
          {group.instances.length} page{group.instances.length === 1 ? "" : "s"}
        </Text>
      </View>
      {priority && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, marginBottom: 4 }}>
          <Text style={[styles.sevPill, severityPillStyle(priority.severity)]}>
            {priority.severity === "critical" ? "CRITICAL" : priority.severity === "moderate" ? "MODERATE" : "MINOR"}
          </Text>
          <Text style={[styles.effortPill, priority.effort === "quick" ? styles.effortPillLow : styles.effortPillMedium]}>
            {priority.estimatedTimeLabel}
          </Text>
          <Text style={{ fontSize: 7.5, color: '#666', marginLeft: 4 }}>
            {priority.effortBucketLabel}{priority.templateLevel ? " \u00b7 Template-level fix" : ""}
          </Text>
        </View>
      )}
      {templateLevel && (
        <View style={styles.templateBanner} wrap={false}>
          <Text style={styles.templateBannerTitle}>
            Template-Level Fix (Resolves {group.instances.length} page{group.instances.length === 1 ? "" : "s"})
          </Text>
          <Text style={styles.templateBannerText}>
            This issue originates from a shared layout or header/footer template. Updating the template file once will
            resolve it site-wide.
          </Text>
        </View>
      )}
      {/* Vertical-stack consulting layout: each section flows naturally
          with no fixed height or two-column row that can overflow the page.
          react-pdf handles vertical flow reliably; flex-direction: row does
          not. */}
      {group.remediation && (
        <Text style={[styles.issueText, { marginTop: 2, marginBottom: 2, fontStyle: 'italic', color: '#555', fontSize: 8.5 }]}>
          {truncateToWordLimit(group.remediation.whatItMeans, 100).truncated}
        </Text>
      )}
      <Text style={[styles.issueText, { fontSize: 8.5 }]}>
        <Text style={styles.issueLabelKey}>Why it matters: </Text>
        {truncateToWordLimit(group.whyItMatters, 150).truncated}
      </Text>
      <View style={styles.businessImpactCallout}>
        <Text style={styles.businessImpactCalloutLabel}>Business impact</Text>
        <Text style={styles.businessImpactCalloutText}>
          {truncateToWordLimit(group.businessImpact, 150).truncated}
        </Text>
      </View>
      {/* Visual heading context — when missing_h1 and some instances have a prominent image */}
      {group.flag === "missing_h1" && group.instances.some((inst) => inst.potentialVisualHeading) && (
        <View style={{ marginTop: 4, marginBottom: 4, padding: 5, backgroundColor: '#FFF8E1', borderLeft: '2px solid #F9A825', borderRadius: 3 }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#F57F17', marginBottom: 2 }}>
            Visual heading context
          </Text>
          <Text style={{ fontSize: 8, color: '#555', lineHeight: 1.3 }}>
            Some pages may have a prominent image near the top of the main content that visually functions as the page\u2019s heading, but it is not marked up as a semantic H1. Adding a real &lt;h1&gt; element is still recommended for search engines and screen readers.
          </Text>
        </View>
      )}
      {/* Estimated Traffic & Conversion Impact — only rendered when data-driven estimates exist */}
      {(() => {
        const ei = opts?.estimatedImpact;
        if (!ei || !ei.hasEstimates) return null;
        const matching = ei.estimates.find((e) => e.applicableFlags.includes(group.flag));
        if (!matching) return null;
        return (
          <View style={styles.estimatedImpactBox} wrap={false}>
            <Text style={styles.estimatedImpactLabel}>Potential Business Impact</Text>
            <Text style={[styles.estimatedImpactText, { fontSize: 8, color: '#555', marginBottom: 4 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Observed: </Text>{matching.observedData}
            </Text>
            <Text style={[styles.estimatedImpactText, { fontSize: 8, color: '#555', marginBottom: 4 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Source: </Text>{matching.source}
            </Text>
            <Text style={[styles.estimatedImpactText, { fontSize: 8, color: '#555', marginBottom: 6 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Scenario: </Text>{matching.scenarioAssumption}
            </Text>
            {matching.additionalClicks !== null && matching.additionalClicks > 0 && (
              <View style={styles.estimatedImpactRow}>
                <Text style={styles.estimatedImpactMetricLabel}>Estimated additional clicks</Text>
                <Text style={styles.estimatedImpactMetricValue}>+{formatClickCount(matching.additionalClicks)}/mo</Text>
              </View>
            )}
            {matching.additionalConversions !== null && matching.additionalConversions > 0 && (
              <View style={styles.estimatedImpactRow}>
                <Text style={styles.estimatedImpactMetricLabel}>Estimated additional conversions</Text>
                <Text style={styles.estimatedImpactMetricValue}>+{formatConversionCount(matching.additionalConversions)}/mo</Text>
              </View>
            )}
            {matching.revenueOpportunity !== null && matching.revenueOpportunity > 0 && (
              <View style={[styles.estimatedImpactRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={styles.estimatedImpactMetricLabel}>Estimated revenue opportunity</Text>
                <Text style={styles.estimatedImpactMetricValue}>+{formatDollarAmount(matching.revenueOpportunity)}/mo</Text>
              </View>
            )}
            <Text style={[styles.estimatedImpactText, { fontSize: 8, color: '#555', marginTop: 4, fontFamily: 'Helvetica-Bold' }]}>
              Calculation: {matching.calculation}
            </Text>
            {matching.benchmarkSource && (
              <Text style={[styles.estimatedImpactText, { fontSize: 7, color: '#888', marginTop: 2, fontStyle: 'italic' }]}>
                Benchmark: {matching.benchmarkSource}
              </Text>
            )}
            <View style={{ marginTop: 4, padding: '3pt 6pt', backgroundColor: matching.confidence === 'High' ? '#E7F6ED' : matching.confidence === 'Medium' ? '#FBF0DF' : '#FBE9E6', borderRadius: 3 }}>
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: matching.confidence === 'High' ? '#1F9D55' : matching.confidence === 'Medium' ? '#B25E09' : '#D9432E' }}>
                Confidence: {matching.confidence}
              </Text>
            </View>
            <View style={styles.estimatedImpactHedge}>
              These are potential estimates, not guaranteed outcomes. Actual results depend on implementation quality, competitive landscape, and search algorithm changes.
            </View>
          </View>
        );
      })()}
      <View style={styles.fixCallout}>
        <Text style={styles.fixCalloutLabel}>Recommended fix</Text>
        <Text style={styles.fixCalloutText}>{group.recommendedFix}</Text>
      </View>
      {group.afterFixing && (
        <Text style={[styles.issueText, { marginTop: 3, fontSize: 8.5 }]}>
          <Text style={styles.issueLabelKey}>After fixing: </Text>
          {truncateToWordLimit(group.afterFixing, 100).truncated}
        </Text>
      )}
      {group.smartNote && (
        <Text style={styles.aiReviewNote}>{group.smartNote}</Text>
      )}
      {/* Implementation guidance — step-by-step steps from remediation KB */}
      {group.remediation && group.remediation.stepByStepFix.length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.issueLabelKey, { marginBottom: 2, fontSize: 8 }]}>Implementation steps:</Text>
          <View style={{ marginLeft: 6 }}>
            {group.remediation.stepByStepFix.slice(0, 5).map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 1 }}>
                <Text style={{ fontSize: 7.5, color: '#333' }}>{i + 1}. </Text>
                <Text style={{ fontSize: 7.5, color: '#333' }}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {/* Code example from remediation KB — show good example if available, otherwise bad */}
      {group.remediation && group.remediation.exampleGood && (
        <View style={{ marginTop: 4, padding: 5, backgroundColor: '#F0FAF0', borderLeft: '2pt solid #1F9D55', borderRadius: 3 }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#1F9D55', marginBottom: 2 }}>Correct implementation</Text>
          <Text style={{ fontSize: 7, fontFamily: 'NotoSansDevanagari', color: '#333', lineHeight: 1.3 }}>{group.remediation.exampleGood}</Text>
        </View>
      )}
      {group.remediation && !group.remediation.exampleGood && group.remediation.exampleBad && (
        <View style={{ marginTop: 4, padding: 5, backgroundColor: '#FDF2F2', borderLeft: '2pt solid #D9432E', borderRadius: 3 }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#D9432E', marginBottom: 2 }}>Avoid this</Text>
          <Text style={{ fontSize: 7, fontFamily: 'NotoSansDevanagari', color: '#333', lineHeight: 1.3 }}>{group.remediation.exampleBad}</Text>
        </View>
      )}
      {/* Verification method — compact inline */}
      {group.remediation && group.remediation.verificationMethod && (
        <Text style={[styles.issueText, { marginTop: 3, marginBottom: 2, fontSize: 7.5 }]}>
          <Text style={styles.issueLabelKey}>Verify: </Text>
          {truncateToWordLimit(group.remediation.verificationMethod, 40).truncated}
        </Text>
      )}
      {group.codeSnippet && (
        <View style={{ marginTop: 4, padding: 5, backgroundColor: '#F7F9FC', borderRadius: 3 }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#1D6FD8', marginBottom: 2 }}>{group.codeSnippet.label}</Text>
          <Text style={{ fontSize: 7, fontFamily: 'NotoSansDevanagari', color: '#333', lineHeight: 1.3 }}>{group.codeSnippet.code}</Text>
        </View>
      )}
      {group.instances.length > 0 && (
        <View style={{ marginTop: 2 }}>
          <Text style={[styles.reprLabel, { marginBottom: 1, fontSize: 7.5 }]}>
            {group.instances.length} page{group.instances.length === 1 ? "" : "s"} affected
            {csvAvailable ? " — full list in CSV export" : ""}
          </Text>
        </View>
      )}
      {/* The finding is about the IMAGES, not just the pages — list the
          actual offending srcs (including proxied CDN URLs like
          /_next/image?url=...) with their decoded real filename, so a
          client can see exactly which image files to rename. */}
      {group.flag === "poor_image_filenames" && nonDescriptiveImageFindings.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.reprLabel}>Images with non-descriptive filenames</Text>
          {csvAvailable && (
            <Text style={styles.moreInstancesNote}>
              Full list of {nonDescriptiveImageFindings.length} non-descriptive image filenames available in the{" "}
              <Link src={`${options.reportUrl}&flag=poor_image_filenames`} style={styles.csvLink}>
                CSV export
              </Link>
              {"."}
            </Text>
          )}
        </View>
      )}
    </View>
    </Page>
    );
  });
}

/** Related findings that share a root cause and implementation strategy
 * render under ONE family heading with a shared intro, so the client reads
 * "this is one area of work" instead of several disconnected pages. Each
 * member finding keeps its own counts, URLs, fixes, and CSV links — only
 * the framing and the page-break behavior change. */
const ISSUE_FAMILIES: { title: string; intro: string; flags: ReadonlySet<string> }[] = [
  {
    title: "Heading & Content Structure",
    intro:
      "These findings all concern how each page's content is structured and presented — the H1/H2 hierarchy and the depth of the content itself. They typically share one root cause (a CMS template or an editing workflow) and are usually fixed together in a single pass: correct the template once, then review the affected pages listed below.",
    flags: new Set(["missing_h1", "multiple_h1", "missing_h2", "thin_content"]),
  },
];

/** Splits a group list into family sections (shared heading + intro) plus
 * standalone findings, preserving order. Singletons render exactly as
 * before — each on its own page; family members flow after the heading. */
function renderIssueFamilies(
  groups: GroupedIssue[],
  options: ReportOptions,
  priorityList: PriorityIssue[] = [],
  nonDescriptiveImageFindings: NonDescriptiveImageFinding[] = [],
  sectionHeading?: React.ReactNode,
  estimatedImpact?: EstimatedBusinessImpactResult
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const assigned = new Set<string>();
  let sectionHeadingUsed = false;
  for (const family of ISSUE_FAMILIES) {
    const members = groups.filter((g) => family.flags.has(g.flag));
    if (members.length === 0) continue;
    members.forEach((g) => assigned.add(g.flag));
    // Family heading renders on the first member's page; each member
    // gets its own Page.
    const familyHeading = (
      <View wrap={false}>
        <Text style={styles.issueFamilyTitle}>{family.title}</Text>
        <Text style={styles.issueFamilyIntro}>{family.intro}</Text>
      </View>
    );
    // Section heading goes on the first family member's page (before the family heading)
    const secH = !sectionHeadingUsed && sectionHeading ? sectionHeading : undefined;
    if (secH) sectionHeadingUsed = true;
    out.push(
      ...renderIssueGroupViews(members, options, priorityList, nonDescriptiveImageFindings, { familyHeading, sectionHeading: secH, estimatedImpact })
    );
  }
  const singletons = groups.filter((g) => !assigned.has(g.flag));
  if (singletons.length > 0) {
    // Section heading goes on the first singleton's page if not yet used
    const secH = !sectionHeadingUsed && sectionHeading ? sectionHeading : undefined;
    if (secH) sectionHeadingUsed = true;
    out.push(
      ...renderIssueGroupViews(singletons, options, priorityList, nonDescriptiveImageFindings, { sectionHeading: secH, estimatedImpact })
    );
  }
  return out;
}

/**
 * Compact summary card that opens every issue page — severity, business
 * impact, SEO impact, difficulty, estimated fix time, recommended owner,
 * and affected pages — so a client can scan the headline facts in seconds.
 */
function IssueSummaryCard({ group, priority }: { group: GroupedIssue; priority: PriorityIssue | undefined }) {
  const severity = priority?.severity ?? "medium";
  const level = priority ? impactLevelForIssue(priority) : "medium";
  const impactPillStyle =
    level === "high" ? styles.impactPillHigh : level === "medium" ? styles.impactPillMedium : styles.impactPillLow;
  const difficultyStars = priority?.difficultyStars ?? 2;
  const estimate = priority ? estimateBatchAwareTime(priority) : null;

  return (
    <View style={styles.summaryCard} wrap={false}>
      {/* Two explicit rows, deliberately NO flexWrap: react-pdf's
          flex-wrap is unreliable and a wrapped tag line can overlap the
          card rows beneath it (the "AFFECTED PAGES / SEO IMPACT / …"
          labels rendered on top of the tags). Each row is short enough
          to fit one line, so wrapping is never needed. */}
      <View style={styles.summaryTagRow}>
        <Text style={[styles.sevPill, severityPillStyle(severity)]}>
          {severity === "critical" ? "CRITICAL" : severity.toUpperCase()}
        </Text>
        <Text style={[styles.impactPill, impactPillStyle]}>{IMPACT_LABEL[level]} impact</Text>
      </View>
      <View style={styles.summaryTagRowSecond}>
        {/* Priority tier shown SEPARATELY from the severity pill: severity
            says how damaging the issue is where it applies, priority says
            where it sits in the fix-first ranking. */}
        {priority && (
          <Text style={styles.priorityTag}>
            Priority: {priority.priorityTier === "high" ? "High" : priority.priorityTier === "medium" ? "Medium" : "Low"}
          </Text>
        )}
        <Text style={styles.ownerTag}>Owner: {ownerForFlag(group.flag)}</Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Affected pages</Text>
        <Text style={styles.cardValue}>
          {group.instances.length} page{group.instances.length === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>SEO impact</Text>
        <Text style={styles.cardValue}>{seoImpactForFlag(group.flag)}</Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Difficulty</Text>
        <View style={{ flex: 1 }}>
          {renderBar(difficultyStars, 5, "#1D6FD8")}
          <Text style={styles.effortSubText}>
            {difficultyStars === 1 ? "Trivial" : difficultyStars === 2 ? "Straightforward" : difficultyStars === 3 ? "Moderate" : "Complex"}{" "}
            · {difficultyStars}/5
          </Text>
        </View>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Estimated time</Text>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          {estimate && <EffortBadge label={estimate.label} />}
          {!estimate && <Text style={styles.cardValue}>Not estimated</Text>}
        </View>
      </View>
      <Text style={styles.effortDisclaimer}>{EFFORT_ESTIMATE_DISCLAIMER}</Text>
      {priority?.estimateRationale && (
        <Text style={styles.estimateRationaleText}>{priority.estimateRationale}</Text>
      )}
    </View>
  );
}

/** "How to verify" checklist closing out every issue page — gives developers
 * concrete, issue-specific steps to confirm a fix actually landed (tool +
 * exactly what to check in it). */
function VerificationChecklist({ flag }: { flag: string }) {
  const steps = verifyStepsForFlag(flag);
  const questions = teamQuestionsForFlag(flag);
  return (
    <View>
      <View style={styles.verifyBox}>
        <Text style={styles.verifyTitle}>How to verify this fix</Text>
        {steps.map((s, i) => (
          <View key={i} style={styles.verifyRow} wrap={false}>
            <View style={styles.verifyCheck} />
            <Text style={styles.verifyText}>
              <Text style={{ fontFamily: "Helvetica-Bold", color: "#333333" }}>{s.tool}: </Text>
              {s.step}
            </Text>
          </View>
        ))}
      </View>
      {questions.length > 0 && (
        <View style={styles.teamQuestionsBox} wrap={false}>
          <Text style={styles.teamQuestionsTitle}>Questions to ask your team</Text>
          {questions.map((q, i) => (
            <View key={i} style={styles.teamQuestionRow} wrap={false}>
              <Text style={styles.teamQuestionBullet}>•</Text>
              <Text style={styles.teamQuestionText}>{q}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Visual redirect path — the same level of clarity the web report's
 * detailed chain cards provide, rendered with react-pdf-safe Views/Text.
 *
 * The crawler records each hop's HTTP status code (hopStatusCodes) and the
 * final destination, but not the intermediate destination URLs. Rather than
 * inventing placeholder targets, each hop renders as its status-code step;
 * a footnote states the limitation plainly so the path reads as a genuine
 * redirect sequence, not unfinished content.
 */
function RedirectChainFlow({
  chain,
}: {
  // key is declared explicitly so the component stays type-safe even when
  // the React JSX types aren't in scope (React itself strips `key` before
  // rendering, so it's never passed through as a prop).
  key?: string | number;
  chain: {
    originalUrl: string;
    finalUrl: string;
    hopCount: number;
    excessive: boolean;
    hopStatusCodes?: number[];
  };
}) {
  const codes =
    chain.hopStatusCodes && chain.hopStatusCodes.length > 0 ? chain.hopStatusCodes : Array.from({ length: Math.min(chain.hopCount, 4) }, () => 0);
  const shownSteps = codes.length > 0 ? codes : [];
  const omittedHops = Math.max(0, chain.hopCount - shownSteps.length);

  return (
    <View style={styles.redirectFlowCard} wrap={false}>
      <View style={styles.redirectFlowHead}>
        <Text style={styles.redirectFlowHops}>
          {chain.hopCount} hop{chain.hopCount === 1 ? "" : "s"}
          {chain.excessive ? " · excessive — shorten this chain" : ""}
        </Text>
      </View>
      <Text style={styles.redirectStepUrl}>{chain.originalUrl}</Text>
      {shownSteps.map((code, i) => (
        <View key={i} style={styles.redirectHopRow} wrap={false}>
          <Text style={styles.redirectHopArrow}>↓</Text>
          <Text style={styles.redirectHopCode}>
            {code !== 0 ? describeStatusCode(code) : `Redirect ${i + 1}`}
          </Text>
          <Text style={styles.redirectHopStep}>hop {i + 1} of {chain.hopCount}</Text>
        </View>
      ))}
      {omittedHops > 0 && (
        <Text style={styles.redirectHopMore}>… {omittedHops} more hop{omittedHops === 1 ? "" : "s"} (status not recorded)</Text>
      )}
      <View style={styles.redirectFinalRow}>
        <Text style={styles.redirectStepFinal}>{chain.finalUrl}</Text>
        <Text style={styles.redirectFinalBadge}>FINAL DESTINATION</Text>
      </View>
      <Text style={styles.redirectFlowNote}>
        Each arrow represents one redirect. The crawl records each hop's status code and the final destination; the
        intermediate destination URLs are not captured by the crawler. Updating the original link or rule to point
        directly at the final destination would collapse this chain into a single hop.
      </Text>
    </View>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

interface ReportDocumentProps {
  audit: RunAuditResult;
  explanations: PageExplanationResult[];
  options: ReportOptions;
}

export function ReportDocument({ audit, explanations, options }: ReportDocumentProps) {
  // Website-wide Core Web Vitals — the single source every performance
  // number on this page (and the coverage/priority sections) draws from.
  const cwv = resolveCoreWebVitals(audit);

  const domain = safeHostname(audit.crawl.rootUrl);
  // Client organization name, resolved from existing client/site data (the
  // agency-supplied client name when present, otherwise the entity name
  // derived from the site's own homepage title, otherwise the hostname) —
  // never invented. Used throughout headings, summaries, and contextual
  // copy so the report reads as generated for THIS client, with the audited
  // domain kept separately wherever the report displays it.
  const organizationName = resolveOrganizationName(audit, options) || domain;
  const date = new Date(audit.crawl.crawledAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // Compact, deterministic report reference — derived from the domain and
  // crawl date so a client can quote it when following up, without exposing
  // an internal database id.
  const reportId = (() => {
    const seed = `${domain}|${audit.auditDate || audit.crawl.crawledAt}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return `SA-${hash.toString(36).toUpperCase().padStart(5, "0").slice(0, 5)}`;
  })();
  // Whether the CSV export is genuinely reachable from this PDF (the route
  // only attaches CSV links for Freelancer/Pro and Agency tiers). Every
  // "+ N more — full list available in the CSV export." claim in this file
  // must be gated on this flag — never claim CSV availability otherwise.
  const csvAvailable = !!(options.reportUrl && !options.whiteLabel);
  const duplicateTitleUrlCount = audit.crawl.duplicateTitles.reduce((sum, g) => sum + g.urls.length, 0);
  const duplicateDescUrlCount = audit.crawl.duplicateMetaDescriptions.reduce((sum, g) => sum + g.urls.length, 0);
  // Canonical crawl-scope counts (pages crawled vs pages analyzed) — the
  // single source every page-count display draws from, so no section can
  // drift into its own separate number.
  const crawlScope = getCrawlScopeCounts(audit);
  const okPagesForScope = audit.crawl.pages.filter((p): p is CrawlPageSuccess => p.ok);
  const internalUrlsAnalyzed = new Set(okPagesForScope.flatMap((p) => p.internalLinks)).size;
  const imagesAnalyzed = okPagesForScope.reduce((sum, p) => sum + p.images.length, 0);
  const allFailedLinks = audit.brokenLinks.filter((b) => !b.ok && b.failureCategory !== "blocked_by_robots" && !isCloudflareEmailObfuscation(b.url));
  const { broken: brokenLinks, temporary: temporaryLinks } = splitBrokenLinks(allFailedLinks);
  // Distinct pages actually carrying a broken link — pairs with the
  // instance count so the section can say "3,012 broken link instances
  // across 284 pages" instead of ever implying 3,012 affected pages.
  const brokenLinkSourcePages = countBrokenLinkSourcePages(audit.brokenLinks);
  const brokenLinksByCategory = groupBrokenLinksByCategory(brokenLinks);
  const temporaryLinksByCategory = groupBrokenLinksByCategory(temporaryLinks);
  // "Blocked from automated checking" (403/401/429) is its own bucket —
  // the server refused our checker, which is NOT evidence the link is
  // broken. Same category-grouping structure as the broken list.

  // A single duplicate-title/description group can legitimately span most
  // of a site (a shared template with an unedited default meta
  // description is a very common real-world case, sometimes 100+ pages).
  // Rendering every URL inside a `wrap={false}` block — the previous
  // behavior — forces react-pdf to lay out an unbounded-height block as
  // one unbreakable unit, which corrupts/overlaps the text once it's
  // taller than a page. Cap what's shown per group here, same "+N more —
  // download CSV" pattern already used for broken links / schema / images.
  const DUPLICATE_GROUP_URL_LIMIT = 5;
  const ROBOTS_BLOCKED_PDF_LIMIT = 8;


const groupedIssues = mergeUrlSeoFindings(audit, groupExplanationsByIssue(audit, explanations));
// CWV issues: deterministic static content (no AI), same GroupedIssue
// structure as every other issue type. Merged here so the shared pipeline
// (fixRoadmap, priorityList, seoCheckCoverage, CSV export) all see them.
const cwvGroupedIssues = buildCwvGroupedIssues(cwv);
const allGroupedIssues = [...groupedIssues, ...cwvGroupedIssues];
const { imageIssues, urlIssues, otherIssues } = splitGroupedIssuesByCategory(allGroupedIssues);
const INDEXABILITY_FLAGS = new Set(["noindex_meta_tag", "noindex_x_robots_tag", "missing_canonical", "canonical_mismatch"]);
// Item #10: missing_schema_markup / invalid_schema_markup already get their
// own dedicated "Structured Data" and "Missing Structured Data" pages
// (below) with per-page suggested types — leaving them in "Issues by Type"
// too was the duplicate Structured Data section. Excluded here, not deleted
// anywhere: the dedicated pages remain the single source of truth.
const SCHEMA_FLAGS_HANDLED_ELSEWHERE = new Set(["missing_schema_markup", "invalid_schema_markup"]);
// These traditional On-Page SEO checks (title, description, alt text) are
// NO LONGER part of the AEO/GEO section — they appear only in the On-Page
// SEO section. This set is kept empty for backward compatibility but the
// filtering logic that used it has been removed.
// The three always-reported Indexability checks (noindex meta, X-Robots-Tag,
// orphan pages) are the AUTHORITATIVE source for their own detail pages —
// built from the check's real affected URLs via buildIndexabilityDetailGroups
// below. Their flags are filtered out of the AI-derived streams so the grid,
// the detail pages, and the CSV can never disagree or duplicate. The AI
// stream still contributes the OTHER indexability flags (canonical issues)
// that the grid doesn't cover.
const indexabilityDetailGroups = buildIndexabilityDetailGroups(audit);
const indexabilityIssues = otherIssues.filter(
  (g) => INDEXABILITY_FLAGS.has(g.flag) && !INDEXABILITY_CHECK_FLAGS.has(g.flag)
);
const otherIssuesRemaining = otherIssues.filter(
  (g) => !INDEXABILITY_FLAGS.has(g.flag)
    && !INDEXABILITY_CHECK_FLAGS.has(g.flag)
    && !SCHEMA_FLAGS_HANDLED_ELSEWHERE.has(g.flag)
    && !g.flag.startsWith("webvital_")
);
const filteredImageIssues = imageIssues;
const schemaOkPages = audit.crawl.pages.filter((p): p is CrawlPageSuccess => p.ok);
  const oversizedImagesAll = audit.oversizedImages.filter((img) => img.isOversized);

  // Non-descriptive image filenames — the actual offending IMAGES (src +
  // decoded filename + pages), shared with the web report so both surfaces
  // list exactly the same images under the Non-descriptive image filenames
  // finding. Same cap convention as the oversized-images list.

  const nonDescriptiveImageFindings = buildNonDescriptiveImageFindings(audit);
  // The indexability check-derived groups join the priority list in place
  // of the AI groups for the same flags (identical URLs, same priority
  // table), so a failed Indexability check shows its real priority / impact
  // / effort on the priority page and its own detail page.
  const priorityList = buildPriorityList(audit, [
    ...allGroupedIssues.filter((g) => !INDEXABILITY_CHECK_FLAGS.has(g.flag)),
    ...indexabilityDetailGroups,
  ]);
  const quickWins = buildQuickWins(priorityList);
  // "If You Only Do 5 Things" — top-leverage actions ranked by impact ×
  // reach ÷ effort, shared with the web report so both surfaces list the
  // exact same five items.
  const topQuickActions = buildTopQuickActions(priorityList);
  // Consolidated CWV report blocks — one self-contained block per failing
  // metric, consumed by the Issues & Fixes section below.
  const cwvReportBlocks = buildCwvReportBlocks(cwv, cwvGroupedIssues, priorityList);
  const whatsWorking = buildWhatsWorking(audit);
  const criticalTypeCount = priorityList.filter((i) => i.severity === "critical").length;
  // Instance-level count for the dashboard card so it shares units with
  // "Total Issues" (both are page/instance counts, not issue-type counts).
  const criticalInstanceCount = priorityList
    .filter((i) => i.severity === "critical")
    .reduce((sum, i) => sum + i.count, 0);
  const totalAffectedChecks = priorityList.reduce((sum, i) => sum + i.count, 0);
  // Distinct pages carrying at least one issue — the supporting figure that
  // keeps the headline stat honest: issue TYPES lead the dashboard, total
  // checks and affected pages are the secondary detail, and a page with
  // five issues counts once, not five times.
  const affectedPages = countDistinctAffectedPages(audit, allGroupedIssues);
  const verdict = getScoreVerdict(audit.score.overallScore);
  const categoryScores = buildCategoryScores(audit);
  // AI Readiness score — derived from the six readiness-dimension
  // breakdowns (the authoritative place the per-category check results
  // live), NOT counted separately from the raw check list. Summing the
  // dimensions keeps the dashboard headline and the AI Readiness Breakdown
  // below it in perfect agreement by construction — the two can never
  // drift apart again. Defined here because the Executive Summary (built
  // just below) mentions it; the rest of the report reuses it.
  const citationReadiness: CitationReadinessResult = buildCitationReadiness(audit);
  const aiReadinessDimensions = buildAiReadinessDimensions(audit.aeo.checks, citationReadiness.checks);
  const aeoCheckSummary = deriveAiReadinessSummary(aiReadinessDimensions);
  const aeoCheckTotal = aeoCheckSummary.totalCount;
  const aeoReadinessScore = aeoCheckTotal > 0 ? Math.round((aeoCheckSummary.passCount / aeoCheckTotal) * 100) : 0;
  // AI Readiness verdict — SEPARATE, stricter scale from the SEO score's
  // rubric (pass/fail check coverage vs weighted severity). Every surface
  // that shows its label renders the "(AI scale)" qualifier so the two
  // scores can never both read as the same bare verdict.
  const aeoVerdict = getAiReadinessVerdict(aeoReadinessScore);
  // Defensive normalization: audits crawled before the consulting-metadata
  // fields existed lack priority/difficulty/impact on their AEO checks —
  // fill neutral defaults so old cached reports render instead of crashing.
  const aeoChecks = audit.aeo.checks.map((c) => withAeoMetaDefaults(c));

  // Render-time re-derivation of broken_links_aeo from raw audit data,
  // so stale cached audits can never surface cdn-cgi/l/ false positives
  // in the AEO section. The Technical SEO Broken Links section already
  // reads from audit.brokenLinks with the same filter — this brings the
  // AEO section into alignment so the two can never disagree.
  {
    const gbl = genuineBrokenLinks(audit.brokenLinks);
    const idx = aeoChecks.findIndex((c) => c.key === "broken_links_aeo");
    if (idx !== -1) {
      aeoChecks[idx] = {
        ...aeoChecks[idx],
        passed: gbl.length === 0,
        affectedCount: gbl.length,
        affectedUrls: gbl.map((b) => b.url),
        statusText: gbl.length === 0
          ? "No broken links found."
          : `${gbl.length} broken link${gbl.length === 1 ? "" : "s"} found.`,
      };
    }
  }

  // Failing AI checks, ranked for the implementation order / quick wins
  // panels — shared ranking that excludes "Not applicable" schema checks
  // and steps down narrow-scope checks (see rankAeoChecks).
  const aeoFailingChecks = rankAeoChecks(aeoChecks);
  // AI/GenAI Quick Wins — top high-impact, easy/moderate-effort AEO fixes
  const aiQuickWins = buildAiQuickWins(aeoFailingChecks);
  const actionPlan = buildActionPlan(priorityList, aeoFailingChecks);
  const nextAuditDate = new Date(audit.crawl.crawledAt);
  nextAuditDate.setMonth(nextAuditDate.getMonth() + 1);
  const nextAuditDateLabel = nextAuditDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const issueDistribution = buildIssueDistribution(priorityList);
  // The closing page deliberately shows QUALITATIVE improvement potential
  // instead of exact projected scores: a precise "after fixes" number would
  // read as a guaranteed outcome the model can't honestly promise
  // (implementation quality and future site changes always move the
  // result). The bands derive from the SAME impact ratings already shown in
  // Top Priority Fixes, so they stay internally consistent with the report.
  const improvementPotential = buildImprovementPotential(audit.score.overallScore, priorityList);
  const currentScore = clampScore(audit.score.overallScore);
  // Effort mix for the Investment & Expected Return box — counts of fixes
  // per effort bucket (direct editing time), so the client sees the real
  // shape of the work instead of a vague "multi-week project" label.
  const effortMix = priorityList.reduce<Record<string, number>>((acc, i) => {
    acc[i.effortBucketLabel] = (acc[i.effortBucketLabel] ?? 0) + 1;
    return acc;
  }, {});
  const EFFORT_BUCKET_ORDER = ["Trivial (< 30 Mins)", "Moderate (1–3 Hours)", "Advanced (4+ Hours)", "Extensive (Multi-Day)"];
  const effortMixText =
    EFFORT_BUCKET_ORDER.filter((b) => effortMix[b])
      .map((b) => `${effortMix[b]} ${b.replace(/ \(.*\)$/, "").toLowerCase()}`)
      .join(" · ") || "—";

  // Item #2: always-computed, always-shown pass/fail indexability grid —
  // same source of truth the web report uses.
  const indexabilityChecks: IndexabilityCheckResult[] = buildIndexabilityChecks(audit);

  // Item #4 / #7: Domain Consistency page now always renders; these two
  // flags drive whether it shows a pass banner or the full finding/fix copy.
  const domainConsistencyChecked = !!audit.crawl.wwwConsistency?.checked;
  const domainConsistencyConsistent = !!audit.crawl.wwwConsistency?.consistent;

  // Item #11: redesigned Sitemap page reuses the same guidance builder the
  // web report already relies on, wrapped in a status banner + meta rows.
  const sitemapAudit = audit.crawl.sitemapAudit;
  const sitemapGuidance = buildSitemapGuidance(sitemapAudit, crawlScope.urlsCrawled);
  // Only the client's OWN URLs are shown in the sitemap inventory. A sitemap
  // can legitimately list URLs on other domains (Google-hosted assets,
  // partner CDNs, social profiles) — those are not client pages and must
  // never be presented as such (same filter the crawl itself applies when
  // seeding discovery). The external count is still surfaced so the
  // arithmetic stays honest about the file's contents.
  const clientSitemapUrls = filterClientOwnedUrls(sitemapAudit.urls ?? [], audit.crawl.rootUrl);
  const externalSitemapUrlCount = (sitemapAudit.urls?.length ?? 0) - clientSitemapUrls.length;

  // Real origin (e.g. https://example.com) so the robots.txt / sitemap pages
  // show the actual file locations instead of a generic placeholder.
  let siteOrigin: string | null = null;
  try {
    if (audit.crawl.pages.length > 0) siteOrigin = new URL(audit.crawl.pages[0].url).origin;
  } catch {
    siteOrigin = null;
  }
  
  // Schema data
  const pagesWithSchema = audit.crawl.pages.filter((p): p is CrawlPageSuccess & { structuredData: NonNullable<CrawlPageSuccess["structuredData"]> } => 
    "statusCode" in p && p.structuredData && p.structuredData.types && p.structuredData.types.length > 0
  );
  const pagesMissingSchema = audit.crawl.pages.filter((p): p is CrawlPageSuccess => 
    "statusCode" in p && (!p.structuredData || p.structuredData.types.length === 0)
  );


  // Schema aggregation — real crawl data, so the Structured Data pages can
  // answer "what did we actually find" (formats, most common types, most
  // relevant missing types) instead of just listing URLs.
  const schemaTypeCounts = new Map<string, number>();
  for (const p of pagesWithSchema) {
    for (const t of p.structuredData.types) {
      schemaTypeCounts.set(t, (schemaTypeCounts.get(t) ?? 0) + 1);
    }
  }
  const topSchemaTypes = [...schemaTypeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const schemaFormats = new Set<string>();
  for (const p of pagesWithSchema) {
    if (p.structuredData.format) schemaFormats.add(p.structuredData.format);
  }
  const missingSuggestionCounts = new Map<string, { count: number; reason: string }>();
  for (const p of pagesMissingSchema) {
    const s = suggestSchemaTypeWithReason(p);
    if (s.type === "Uncertain" || s.type === "Needs manual review") continue;
    const existing = missingSuggestionCounts.get(s.type);
    if (existing) {
      existing.count++;
    } else {
      missingSuggestionCounts.set(s.type, { count: 1, reason: s.reason });
    }
  }
  const topMissingSuggestions = [...missingSuggestionCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  const pctOfCrawled = (n: number) => Math.round((n / Math.max(1, audit.crawl.pages.length)) * 100);

  // NEW: Redirect chains and response code breakdown
  const redirectChainAnalyses = analyzeRedirectChains(audit.crawl.redirectChains);
  const responseCodeBreakdown = buildResponseCodeBreakdown(audit);
  const redirectChainSummary = buildRedirectChainSummary(audit.crawl);
  const robotsBlockedLinksSummary = buildRobotsBlockedLinks(audit.brokenLinks);
  const seoCheckCoverage = buildSeoCheckCoverage(audit, allGroupedIssues);
  // "X Passed · Y Failed" — derived from the SAME catalog the detailed
  // check list below renders, so the summary and the details can never
  // disagree (no second independent calculation).
  const coverageSummary = summarizeSeoCheckCoverage(seoCheckCoverage);
  // Executive summary — issueTypeCount derived from the SAME coverage
  // catalog that powers the "X Passed · Y Failed" strip, so the two
  // numbers can never disagree. Failed + needsImprovement = non-passing
  // checks, matching the coverage section exactly.
  const executiveSummaryText = buildExecutiveSummaryText({
    pagesCrawled: audit.crawl.pages.length,
    issueTypeCount: priorityList.length,
    affectedChecks: totalAffectedChecks,
    affectedPages,
    criticalTypeCount,
    quickWinsCount: quickWins.length,
    topIssueLabels: priorityList.slice(0, 3).map((i) => i.label.toLowerCase()),
    // Gate on aeoCheckTotal so a legacy audit that never measured AEO is not
    // claimed as a Poor 0/100 score in the summary.
    aiReadinessScore: aeoCheckTotal > 0 ? aeoReadinessScore : undefined,
    aiReadinessChecks:
      aeoCheckTotal > 0 ? { passCount: aeoCheckSummary.passCount, totalCount: aeoCheckTotal } : undefined,
  });
  // Fix Roadmap — Fix First / Fix Next / Optimize, built from the SAME
  // priority list + coverage evidence the rest of the report shows (no
  // second calculation, no invented URLs or copy).
  const fixRoadmap = buildFixRoadmap(priorityList, seoCheckCoverage, allGroupedIssues, audit, aeoFailingChecks);
  const fixRoadmapItemCount = countFixRoadmapItems(fixRoadmap);
  // The status index groups checks by the detailed section that carries
  // their evidence (the SAME seoCheckCoverage list the summary strip
  // counts), so each group can point at exactly one place for the full
  // findings. Sections with failed / needs-improvement checks come first;
  // all-pass sections follow. No URL, explanation, or recommendation is
  // rendered on this page — the coverage page is a compact index only.
  const coverageBySection = new Map<string, CoverageCheck[]>();
  for (const check of seoCheckCoverage) {
    const list = coverageBySection.get(check.sectionRef.name);
    if (list) list.push(check);
    else coverageBySection.set(check.sectionRef.name, [check]);
  }
  const coverageGroups = [...coverageBySection.entries()]
    .map(([name, checks]) => ({
      name,
      checks,
      hasAction: checks.some((c) => c.status !== "pass"),
    }))
    .sort((a, b) => Number(b.hasAction) - Number(a.hasAction));
  // Core Web Vitals issues — which metrics are actually problematic and
  // the affected pages behind each one, derived from the same aggregate
  // every surface reads (no second per-metric calculation anywhere).
  // Business Impact statements
  const impactStatements = buildBusinessImpactSummary(audit);

  // Estimated Business Impact — data-driven opportunity estimates when
  // BusinessMetrics are supplied. Only computed when metrics exist; otherwise
  // the report falls back to qualitative business-impact language.
  const allIssueFlags = [...new Set(allGroupedIssues.map((g) => g.flag))];
  const estimatedImpact = buildEstimatedBusinessImpact(audit, allIssueFlags, options.businessMetrics);

  const visibilityOpportunities: AiVisibilityOpportunity[] = buildAiVisibilityOpportunities(audit);

  // Aggregate estimated fix time for the executive dashboard — a rough total
  // across every prioritized issue, each already batch-aware.
  const totalFixMinutes = priorityList.reduce(
    (sum, issue) => sum + parseTimeLabelToMinutes(estimateBatchAwareTime(issue).label),
    0
  );

  // Internal Linking Analysis (item: expand beyond simple counts) — computed
  // from the crawl graph: inbound counts, link depth via BFS from the home
  // page, hubs, weakly connected pages, and link-flow opportunities. ALL of
  // the graph math (inbound/orphan/weakly-connected/reachability) lives in
  // buildInternalLinkGraph so the PDF, web, and CSV export always agree on
  // the exact same page sets — and so "orphan" (zero inbound links) and
  // "not reached within crawl depth" (no path from the home page) can never
  // drift into contradictory numbers.
  const {
    okCrawlPages,
    inboundCount,
    totalInternalLinks,
    orphanPages,
    weaklyConnected,
    maxLinkDepth,
    depthDistribution,
    depthDeepCount: depthDeep,
    notReachedWithinDepth,
  } = buildInternalLinkGraph(audit);
  const avgLinksPerPage = okCrawlPages.length > 0 ? (totalInternalLinks / okCrawlPages.length).toFixed(1) : "0";
  const hubPages = okCrawlPages
    .map((p) => ({ url: p.url, inbound: inboundCount.get(p.url) ?? 0 }))
    .filter((h) => h.inbound >= 2)
    .sort((a, b) => b.inbound - a.inbound)
    .slice(0, 5);
  const depthUnreachable = notReachedWithinDepth.length;
  const internalLinkOpportunities = orphanPages.slice(0, 8);
  const orphanTotal = orphanPages.length;

  // The overall SEO score is displayed on the dashboard — always clamped so
  // a score can never read above 100.
  const overallScore = clampScore(audit.score.overallScore);

  // Agency white-label cover (request-scoped branding only — never
  // persisted). Shown when an Agency-tier request supplied branding, and
  // only then; the non-branded report renders exactly as before.
  const branding = options.agencyBranding;
  const hasCover = !!(branding && (branding.logo || branding.agencyName));
  const coverLogo = branding?.logo ? fitLogoWithin(branding.logo.width, branding.logo.height, 520, 190) : null;
  const coverDate = branding?.reportDate || date;
  const coverWebsite = branding?.clientWebsite ? displayHost(branding.clientWebsite) : domain;

  return (
    <Document>
      {hasCover && (
        <Page size={PAGE_SIZE} style={styles.coverPage}>
          <View style={styles.coverLogoWrap}>
            {coverLogo && branding?.logo ? (
              <Image src={branding.logo.dataUrl} style={{ width: coverLogo.w, height: coverLogo.h }} />
            ) : null}
            <Text style={styles.coverTitle}>SEO AUDIT REPORT</Text>
            <View style={styles.coverRule} />
          </View>
          <View style={styles.coverMeta}>
            {branding?.agencyName ? (
              <View style={styles.coverMetaRow}>
                <Text style={styles.coverMetaLabel}>Prepared by</Text>
                <Text style={styles.coverMetaValue}>{branding.agencyName}</Text>
              </View>
            ) : null}
            {organizationName ? (
              <View style={styles.coverMetaRow}>
                <Text style={styles.coverMetaLabel}>Organization</Text>
                <Text style={styles.coverMetaValue}>{organizationName}</Text>
              </View>
            ) : null}
            <View style={styles.coverMetaRow}>
              <Text style={styles.coverMetaLabel}>Website</Text>
              <Text style={styles.coverMetaValue}>{coverWebsite}</Text>
            </View>
            <View style={[styles.coverMetaRow, styles.coverMetaRowLast]}>
              <Text style={styles.coverMetaLabel}>Date</Text>
              <Text style={styles.coverMetaValue}>{coverDate}</Text>
            </View>
          </View>
          <Text style={styles.coverPowered}>POWERED BY ROHAN SEO</Text>
        </Page>
      )}
      {/* Executive Dashboard — the 30-second read for a business owner.
          `wrap` is a safety net: if the dashboard content ever exceeds one
          page it flows to the next rather than clipping, which is strictly
          better than silently losing content. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={styles.dashBrand}>
          {branding?.agencyName || (options.whiteLabel && options.brandName ? options.brandName : "SEO Audit Report")}
        </Text>
        <Text style={styles.dashTitle}>Executive Dashboard</Text>
        <Text style={styles.dashSubtitle}>
          {organizationName !== domain ? `${organizationName} · ` : ""}{domain} — generated {date}
          {options.whiteLabel ? "" : ` · Report ${reportId}`}
        </Text>

        <View style={styles.scorePairRow} wrap={false}>
          <View style={styles.scorePanel}>
            <Text style={styles.scorePanelLabel}>Overall SEO Score</Text>
            <Text style={[styles.scorePanelValue, { color: scoreColor(overallScore) }]}>{overallScore}</Text>
            <Text
              style={[
                styles.verdictPill,
                verdict.tier === "pass" ? styles.verdictPass : verdict.tier === "warn" ? styles.verdictWarn : styles.verdictFail,
                { alignSelf: "flex-start", marginTop: 6, fontSize: 9 },
              ]}
            >
              {verdict.label}
            </Text>
            <Text style={styles.scorePanelSub}>
              {verdict.description}
            </Text>
            <Text style={[styles.scorePanelSub, { fontSize: 7, color: "#999999", marginTop: 4, lineHeight: 1.35 }]}>
              Weighted: On-Page 35% + Technical 40% + AI Search Readiness 25%
            </Text>
          </View>
          <View style={[styles.scorePanel, { marginRight: 0 }]}>
            <Text style={styles.scorePanelLabel}>AI Readiness Score (Full AEO/GEO)</Text>
            <Text
              style={[
                styles.scorePanelValue,
                { color: aeoCheckTotal > 0 ? scoreColor(aeoReadinessScore) : "#999999" },
              ]}
            >
              {aeoCheckTotal > 0 ? `${aeoReadinessScore}%` : "—"}
            </Text>
            {aeoCheckTotal > 0 && (
              <Text
                style={[
                  styles.verdictPill,
                  aeoVerdict.tier === "pass" ? styles.verdictPass : aeoVerdict.tier === "warn" ? styles.verdictWarn : styles.verdictFail,
                  { alignSelf: "flex-start", marginTop: 6, fontSize: 9 },
                ]}
              >
                {aeoVerdict.label} (AI scale)
              </Text>
            )}
            <Text style={styles.scorePanelSub}>
              {aeoCheckTotal > 0
                ? `What this means: how reliably an LLM can extract, trust, and cite this site's content to answer user queries across Generative Search Engines (ChatGPT Search, Google Gemini, Perplexity, Apple Intelligence). Traditional SEO weighs keyword density; AI Search Readiness measures your website's structural and semantic visibility to AI. Based on ${aeoCheckSummary.passCount} of ${aeoCheckTotal} AI checks passing — a stricter pass/fail scale than the SEO score, not a weighted index.`
                : "No AI checks measured"}
            </Text>
          </View>
        </View>

        <View style={styles.dashStatGrid}>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: "#D9432E" }]}>{criticalTypeCount}</Text>
            <Text style={styles.dashStatLabel}>Critical Issue Types</Text>
            <Text style={styles.dashStatSub}>
              affecting {criticalInstanceCount} instance{criticalInstanceCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: "#1a1a1a" }]}>{priorityList.length}</Text>
            <Text style={styles.dashStatLabel}>Issue Types</Text>
            <Text style={styles.dashStatSub}>
              affecting {totalAffectedChecks} check{totalAffectedChecks === 1 ? "" : "s"}
              {affectedPages > 0 ? ` across ${affectedPages} page${affectedPages === 1 ? "" : "s"}` : ""}
            </Text>
          </View>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: "#1F9D55" }]}>{quickWins.length}</Text>
            <Text style={styles.dashStatLabel}>Quick Wins</Text>
          </View>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: "#1D6FD8" }]}>{formatTotalTime(totalFixMinutes)}</Text>
            <Text style={styles.dashStatLabel}>Est. Fix Time</Text>
          </View>
        </View>
        <Text style={styles.dashDisclaimer}>
          Estimated implementation effort assumes a typical CMS with direct access. Actual time varies depending on
          platform, development workflow, and approval processes.
        </Text>

        <View style={styles.landRow} wrap={false}>
        <View style={styles.landCol}>
        <View style={styles.dashPanel} wrap={false}>
          <Text style={styles.dashPanelTitle}>Estimated SEO Opportunity</Text>
          <View style={styles.oppPanelRow} wrap={false}>
            <Text style={styles.oppPanelLabel}>Full Implementation</Text>
            <View style={styles.oppPanelBarTrack}>
              <View
                style={[
                  styles.oppPanelBarFill,
                  { width: `${IMPROVEMENT_BAND_FILL[improvementPotential.fullImplementation] ?? 70}%`, backgroundColor: "#1D6FD8" },
                ]}
              />
            </View>
            <Text style={styles.oppPanelValue}>{IMPROVEMENT_BAND_SHORT[improvementPotential.fullImplementation] ?? improvementPotential.fullImplementation}</Text>
          </View>
          <View style={styles.oppPanelRow} wrap={false}>
            <Text style={styles.oppPanelLabel}>Current Technical Health</Text>
            <View style={styles.oppPanelBarTrack}>
              <View style={[styles.oppPanelBarFill, { width: `${overallScore}%`, backgroundColor: scoreColor(overallScore) }]} />
            </View>
            <Text style={styles.oppPanelValue}>{overallScore}</Text>
          </View>
          <View style={styles.oppPanelRow} wrap={false}>
            <Text style={styles.oppPanelLabel}>AI Readiness (AEO/GEO)</Text>
            <View style={styles.oppPanelBarTrack}>
              <View style={[styles.oppPanelBarFill, { width: `${aeoReadinessScore}%`, backgroundColor: aeoCheckTotal > 0 ? scoreColor(aeoReadinessScore) : "#EEEEEE" }]} />
            </View>
            <Text style={styles.oppPanelValue}>{aeoCheckTotal > 0 ? aeoReadinessScore : "—"}</Text>
          </View>
          <Text style={styles.oppPanelNote}>
            These opportunity scores are calculated using issue severity, affected pages, implementation priority,
            and this audit's overall findings. They represent estimated improvement potential rather than guaranteed
            outcomes.
          </Text>
        </View>        </View>
        {priorityList.length > 0 && (
          <View style={styles.landColLast}>
          <View style={styles.dashPanel} wrap={false}>
            <Text style={styles.dashPanelTitle}>Highest Priority Actions</Text>
            {priorityList.slice(0, 4).map((issue, i) => (
              <View key={issue.key} style={styles.priorityActionRow} wrap={false}>
                <Text style={styles.priorityActionNum}>{i + 1}</Text>
                <Text style={styles.priorityActionLabel}>{issue.label}</Text>
                {/* Priority tier (not severity): this panel ranks what to
                    fix first — a single-page critical issue ranks below a
                    wide quick moderate one here. Severity is shown on the
                    issue detail pages. */}
                <Text style={[styles.sevPill, priorityTierPillStyle(issue.priorityTier)]}>
                  {issue.priorityTier.toUpperCase()}
                </Text>
                <Text style={styles.priorityActionMeta}>
                  {issue.count} {countUnitFor(issue.count, issue.countUnit)}
                  {issue.affectedPages
                    ? ` · ${issue.affectedPages} page${issue.affectedPages === 1 ? "" : "s"}`
                    : ""}
                </Text>
              </View>
            ))}
            <Text style={styles.priorityActionMore}>… full ranked list in the Top Priority Fixes section</Text>
          </View>
          </View>
        )}
        </View>

        {topQuickActions.length > 0 && (
          <>
            <Text break style={[styles.sectionHeading, { marginTop: 0 }]}>If You Only Do 5 Things</Text>
            <Text style={styles.priorityNote}>
              The five highest-leverage actions from this audit, ranked by impact, reach, and effort. If you only have
              time for a shortlist, start here — every item is explained in full later in this report.
            </Text>
            {topQuickActions.map((action, i) => (
              <View key={action.key} style={styles.fiveThingsRow} wrap={false}>
                <Text style={styles.fiveThingsNum}>{i + 1}</Text>
                <View style={styles.fiveThingsBody}>
                  <Text style={styles.fiveThingsDesc}>{action.description}</Text>
                  <Text style={styles.fiveThingsMeta}>
                    {action.pageCount} {countUnitFor(action.pageCount, action.countUnit)} · {action.estimatedTime}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={styles.fiveThingsNote}>
              Read the full report for the complete prioritized list, business impact, and step-by-step verification for
              every finding.
            </Text>
          </>
        )}

        <Text break style={[styles.sectionHeading, { marginTop: 0 }]}>Executive Summary</Text>
        <View style={styles.landRow}>
          <View style={styles.landColWide}>
            {organizationName !== domain && (
              <Text style={[styles.execSummaryText, { marginBottom: 8 }]}>
                This audit covers {organizationName}'s website at {domain}.
              </Text>
            )}
            {(() => {
              const execParagraphs = splitParagraphs(executiveSummaryText, 300);
              return execParagraphs.map((p, i) => (
                <Text
                  key={i}
                  style={[styles.execSummaryText, { marginBottom: i < execParagraphs.length - 1 ? 8 : 4 }]}
                >
                  {p}
                </Text>
              ));
            })()}
          </View>
          <View style={styles.landColNarrow}>
            <View style={styles.scopeBox} wrap={false}>
              <Text style={styles.scopeBoxTitle}>Score Snapshot</Text>
              <View style={styles.scopeRow}>
                <Text style={styles.scopeLabel}>Overall SEO Score</Text>
                <Text style={[styles.scopeValue, { color: scoreColor(overallScore) }]}>{overallScore}/100</Text>
              </View>
              <View style={styles.scopeRow}>
                <Text style={styles.scopeLabel}>AI Search Readiness</Text>
                <Text style={[styles.scopeValue, { color: aeoCheckTotal > 0 ? scoreColor(aeoReadinessScore) : "#999999" }]}>
                  {aeoCheckTotal > 0 ? `${aeoReadinessScore}/100` : "Not measured"}
                </Text>
              </View>
              <Text style={[styles.verdictPill, verdict.tier === "pass" ? styles.verdictPass : verdict.tier === "warn" ? styles.verdictWarn : styles.verdictFail, { alignSelf: "flex-start", marginTop: 6, fontSize: 8.5 }]}>
                {verdict.label}
              </Text>
              <Text style={[styles.verdictDescription, { maxWidth: 300 }]}>{verdict.description}</Text>
            </View>
            <View style={styles.scopeBox} wrap={false}>
              <Text style={styles.scopeBoxTitle}>Audit Scope</Text>
              <View style={styles.scopeRow}>
                <Text style={styles.scopeLabel}>Pages crawled</Text>
                <Text style={styles.scopeValue}>{crawlScope.urlsCrawled}</Text>
              </View>
              <View style={styles.scopeRow}>
                <Text style={styles.scopeLabel}>Internal URLs analyzed</Text>
                <Text style={styles.scopeValue}>{internalUrlsAnalyzed}</Text>
              </View>
              <View style={styles.scopeRow}>
                <Text style={styles.scopeLabel}>Images analyzed</Text>
                <Text style={styles.scopeValue}>{imagesAnalyzed}</Text>
              </View>
              <View style={styles.scopeRow}>
                <Text style={styles.scopeLabel}>Audit date</Text>
                <Text style={styles.scopeValue}>{date}</Text>
              </View>
              <Text style={styles.scopeNote}>
                Audit scope: {crawlScope.urlsCrawled} URLs were discovered/crawled; {crawlScope.pagesAnalyzed} substantive HTML pages were used for content, metadata, and AI-readiness analysis.
              </Text>
            </View>
          </View>
        </View>

        <Footer options={options} reportId={reportId} />
      </Page>

      {/* PAGE 2: Complete SEO Check Coverage — right after Executive Summary.
          A concise diagnostic index: result first (X Passed · Y Failed),
          then one compact row per check (name + status + count) grouped by
          the detailed section that carries its evidence. No URLs,
          explanations, or recommendations here — those live in the
          dedicated sections, and each group points the reader at the right
          one. All derived from the same seoCheckCoverage list, so the
          summary always matches the index. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Complete SEO Check Coverage</Text>
        <Text style={styles.priorityNote}>Every check this audit runs, whether or not it found a problem.</Text>

        {/* CRAWL COVERAGE WARNING — a crawl that stopped early must never
            read as a normal successful audit. Surfaced prominently whenever
            the post-crawl sanity check fired (few pages crawled but clear
            signals of more content: internal links, sitemap URLs,
            robots-blocked URLs, failed fetches). The reasons are the actual
            crawl metrics, not boilerplate. */}
        {crawlScope.lowCoverage.detected && (
          <View style={styles.coverageWarningBox} wrap={false}>
            <Text style={styles.coverageWarningTitle}>⚠️ Crawl coverage warning</Text>
            <Text style={styles.coverageWarningText}>
              Only {crawlScope.pagesAnalyzed} page{crawlScope.pagesAnalyzed === 1 ? "" : "s"} was successfully crawled, but the
              crawl found evidence of more content. {crawlScope.lowCoverage.reasons.join(" ")}{" "}
              The findings below may understate the site — review the crawl diagnostics before treating this
              audit as complete coverage.
            </Text>
          </View>
        )}

        {/* COVERAGE GAPS — URLs that were requested but could not be
            analyzed (blocked by bot protection, WAF, etc.). Surfaced as a
            disclosed limitation so the client never assumes full coverage
            when it doesn't exist. Uses the existing blocked-links data. */}
        
<View style={styles.coverageSummaryRow} wrap={false}>
          <View style={[styles.coverageSummaryStat, styles.coverageSummaryStatTotal]} wrap={false}>
            <Text style={styles.coverageSummaryNum}>{coverageSummary.total}</Text>
            <Text style={styles.coverageSummaryLabel}>Checks run</Text>
          </View>
          <View style={[styles.coverageSummaryStat, styles.coverageSummaryStatPass]} wrap={false}>
            <Text style={styles.coverageSummaryNum}>{coverageSummary.passed}</Text>
            <Text style={styles.coverageSummaryLabel}>Passed</Text>
          </View>
          <View style={[styles.coverageSummaryStat, styles.coverageSummaryStatFail]} wrap={false}>
            <Text style={styles.coverageSummaryNum}>{coverageSummary.failed}</Text>
            <Text style={styles.coverageSummaryLabel}>Failed</Text>
          </View>
          {coverageSummary.needsImprovement > 0 && (
            <View style={[styles.coverageSummaryStat, styles.coverageSummaryStatWarn]} wrap={false}>
              <Text style={styles.coverageSummaryNum}>{coverageSummary.needsImprovement}</Text>
              <Text style={styles.coverageSummaryLabel}>Need improvement</Text>
            </View>
          )}
        </View>

        {/* Compact status index — one row per check (name + status + count),
            grouped by the detailed section that carries its evidence. No
            URLs, explanations, or recommendations on this page: the
            detailed sections hold the full findings, and this page points
            the reader at the right one. Each group is atomic (wrap={false})
            so a heading can never be orphaned from its rows. */}
        <View style={styles.coverageIndex} wrap>
          {coverageGroups.map((group) => (
            <View key={group.name} style={styles.coverageGroup} wrap={false}>
              <Text style={styles.coverageGroupTitle}>{group.name}</Text>
              <View style={styles.coverageGroupList}>
                {group.checks.map((check) => (
                  <View key={check.key} style={styles.coverageGroupRow} wrap={false}>
                    <Text style={styles.coverageGroupLabel}>{check.label}</Text>
                    <Text
                      style={
                        check.status === "fail"
                          ? styles.coverageGroupBadgeFail
                          : check.status === "warn"
                          ? styles.coverageGroupBadgeWarn
                          : styles.coverageGroupBadgePass
                      }
                    >
                      {check.status === "fail"
                        ? "✗ Failed"
                        : check.status === "warn"
                        ? "Needs improvement"
                        : "✓ Passed"}
                    </Text>
                    {check.affectedCount > 0 && (
                      <Text style={styles.coverageGroupCount}>
                        {check.status === "warn"
                          ? `${check.affectedCount} ${countUnitFor(check.affectedCount, check.countUnit)} need${check.affectedCount === 1 ? "s" : ""} improvement`
                          : `${check.affectedCount} ${countUnitFor(check.affectedCount, check.countUnit)} affected`}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
              <Text style={styles.coverageSee}>
                For detailed findings, affected URLs, measurements, business impact, and recommended fixes, see the{" "}
                {group.name} section.
              </Text>
            </View>
          ))}
        </View>
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* PAGE 3: Breakdown by Category — follows SEO Check Coverage */}
      <Page size={PAGE_SIZE} style={styles.page}>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Breakdown by Category</Text>
        <View style={styles.landRow}>
          <View style={styles.landCol}>
            <View style={{ alignItems: "center", paddingTop: 6 }} wrap={false}>
              <CategoryRadarChart categories={categoryScores} />
            </View>
          </View>
          <View style={styles.landColLast}>
        <View style={styles.categoryBarsBlock}>
          {categoryScores.map((cat) => {
            const row = (
              <View style={styles.categoryRow} wrap={false}>
                <View style={styles.categoryRowHead}>
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                  <Text style={styles.categoryScoreText}>{clampScore(cat.score)}/100</Text>
                </View>
                <View style={styles.categoryBarTrack}>
                  <View
                    style={[
                      clampScore(cat.score) >= 80 ? styles.categoryBarFillGood : clampScore(cat.score) >= 50 ? styles.categoryBarFillWarn : styles.categoryBarFillFail,
                      { width: `${clampScore(cat.score)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.categoryExplanationText}>
                  {CATEGORY_EXPLANATION[cat.key] ?? DEFAULT_CATEGORY_EXPLANATION}
                </Text>
              </View>
            );
            const anchor = CATEGORY_ANCHOR[cat.key];
            return anchor ? (
              <Link key={cat.key} src={`#${anchor}`} style={{ textDecoration: "none", color: "inherit" }}>
                {row}
              </Link>
            ) : (
              <View key={cat.key}>{row}</View>
            );
          })}
        </View>
          </View>
        </View>
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* PAGE 4: Business Impact — placed right after the category breakdown,
          so the reader sees "what's wrong, by category" immediately followed
          by "why that actually matters for the business" before diving into
          the page-by-page issue detail further down. */}
      {impactStatements.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page}>
          <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Business Impact</Text>
          <View style={styles.businessImpactGrid}>
            {impactStatements.map((s) => (
              <View key={s.key} style={styles.businessImpactCard} wrap={false}>
                <Text style={styles.businessImpactLabel}>{s.label}</Text>
                <Text style={styles.businessImpactText}>{s.text}</Text>
                {s.citation && (
                  <Text style={styles.businessImpactCitation}>Source: {s.citation}</Text>
                )}
              </View>
            ))}
          </View>
          {/* Estimated Traffic & Conversion Impact — only when data-driven estimates exist */}
          {estimatedImpact.hasEstimates && (
            <>
              <Text style={[styles.sectionSubHeading, { marginTop: 16 }]}>Estimated Business Impact</Text>
              <Text style={[styles.priorityNote, { marginBottom: 10, fontSize: 9 }]}>
                The following estimates are derived from client-provided business metrics and audit data.
                Every number is traceable to its source. Assumptions are clearly labeled.
              </Text>
              <View style={styles.estimatedOpportunityGrid}>
                {estimatedImpact.estimates.map((est, i) => (
                  <View key={i} style={styles.estimatedOpportunityCard} wrap={false}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={styles.estimatedOpportunityTitle}>{est.label}</Text>
                      <View style={{ padding: '2pt 6pt', backgroundColor: est.confidence === 'High' ? '#E7F6ED' : est.confidence === 'Medium' ? '#FBF0DF' : '#FBE9E6', borderRadius: 3 }}>
                        <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: est.confidence === 'High' ? '#1F9D55' : est.confidence === 'Medium' ? '#B25E09' : '#D9432E' }}>
                          {est.confidence} confidence
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.estimatedOpportunityLabel, { marginBottom: 2 }]}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Observed: </Text>{est.observedData}</Text>
                    <Text style={[styles.estimatedOpportunityLabel, { marginBottom: 2 }]}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Source: </Text>{est.source}</Text>
                    <Text style={[styles.estimatedOpportunityLabel, { marginBottom: 6 }]}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Scenario: </Text>{est.scenarioAssumption}</Text>
                    {est.additionalClicks !== null && est.additionalClicks > 0 && (
                      <View style={styles.estimatedOpportunityRow}>
                        <Text style={styles.estimatedOpportunityLabel}>Estimated additional clicks</Text>
                        <Text style={styles.estimatedOpportunityValue}>+{formatClickCount(est.additionalClicks)}/mo</Text>
                      </View>
                    )}
                    {est.additionalConversions !== null && est.additionalConversions > 0 && (
                      <View style={styles.estimatedOpportunityRow}>
                        <Text style={styles.estimatedOpportunityLabel}>Estimated additional conversions</Text>
                        <Text style={styles.estimatedOpportunityValue}>+{formatConversionCount(est.additionalConversions)}/mo</Text>
                      </View>
                    )}
                    {est.revenueOpportunity !== null && est.revenueOpportunity > 0 && (
                      <View style={[styles.estimatedOpportunityRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                        <Text style={styles.estimatedOpportunityLabel}>Estimated revenue opportunity</Text>
                        <Text style={styles.estimatedOpportunityValue}>+{formatDollarAmount(est.revenueOpportunity)}/mo</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 8, color: '#555', marginTop: 4, fontFamily: 'Helvetica-Bold' }}>
                      Calculation: {est.calculation}
                    </Text>
                    {est.benchmarkSource && (
                      <Text style={{ fontSize: 7, color: '#888', marginTop: 2, fontStyle: 'italic' }}>
                        Benchmark: {est.benchmarkSource}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
              <View style={styles.estimatedImpactHedge} wrap={false}>
                <Text style={{ fontSize: 8, color: "#B25E09" }}>
                  All estimates are potential opportunities, not guaranteed outcomes. Confidence levels reflect the
                  quality of underlying data. Estimates based primarily on assumptions are marked Low confidence.
                </Text>
              </View>
            </>
          )}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* Issue Distribution + What's Working share one balanced page — both
          are compact summaries, so the landscape width lets them sit side by
          side instead of each wasting a whole page. Each column keeps its own
          section heading; when one side is empty the other takes the full
          width (same content as before, no information lost). */}
      <Page size={PAGE_SIZE} style={styles.page}>
        <View style={styles.landRow}>
          {issueDistribution.length > 0 && (
            <View style={styles.landCol}>
              <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Issue Distribution</Text>
              {issueDistribution.map((item) => (
                <View key={item.key} style={styles.issueDistRow} wrap={false}>
                  <Text style={styles.issueDistLabel}>{item.label}</Text>
                  <View style={styles.issueDistBarTrack}>
                    <View style={[styles.issueDistBarFill, { width: `${item.barWidthPct}%` }]} />
                  </View>
                  <Text style={styles.issueDistCount}>{item.count}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.landColLast}>
            <Text style={[styles.sectionHeading, { marginTop: 0 }]}>What's Working</Text>
            {whatsWorking.length === 0 ? (
              <Text style={styles.wwFallback}>{WHATS_WORKING_FALLBACK}</Text>
            ) : (
              whatsWorking.map((item) => (
                <View key={item.key} style={styles.wwRow} wrap={false}>
                  <View style={styles.wwDot} />
                  <Text style={styles.wwText}>{item.label}</Text>
                </View>
              ))
            )}
          </View>
        </View>
        <Footer options={options} reportId={reportId} />
      </Page>

      {(priorityList.length > 0 || quickWins.length > 0) && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          {priorityList.length > 0 && (
            <>
              <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Top Priority Fixes</Text>
              <Text style={styles.priorityNote}>
                Ranked by priority — issues that combine the highest impact, widest reach, and lowest effort come
                first. Severity (how damaging an issue is where it applies) and difficulty are shown per issue; a
                single-page critical issue can rank below a wide quick fix. Each fix below is explained in full on its
                dedicated page later in this report, with affected pages and step-by-step verification.
              </Text>
              <Text style={styles.priorityNote}>
                Impact, difficulty, and time estimates are calculated from issue type and scope, not guarantees.
                Effort buckets reflect the total estimated direct editing time for the whole fix (e.g. a large
                broken-link cleanup is a multi-day job, not minutes), excluding staging, testing, and deployment
                workflows.
              </Text>
              <View style={styles.priorityRowHead}>
                <Text style={[styles.priorityColLabel, styles.priorityColHeadText]}>Issue</Text>
                <Text style={[styles.priorityColBar, styles.priorityColHeadText]}>Impact</Text>
                <Text style={[styles.priorityColBar, styles.priorityColHeadText]}>Difficulty</Text>
                <Text style={[styles.priorityColCount, styles.priorityColHeadText]}>Count</Text>
                <Text style={[styles.priorityColEffort, styles.priorityColHeadText]}>Effort</Text>
              </View>
              {priorityList.slice(0, 6).map((issue) => (
                <View key={issue.key} style={styles.priorityRow} wrap={false}>
                  <Text style={styles.priorityColLabel}>{issue.label}</Text>
                  <View style={styles.priorityColBar}>
                    {renderBar(issue.impactStars, 5, issue.impactStars >= 4 ? "#D9432E" : issue.impactStars >= 3 ? "#D98A1A" : "#1F9D55")}
                  </View>
                  <View style={styles.priorityColBar}>{renderBar(issue.difficultyStars, 5, "#1D6FD8")}</View>
                  <Text style={styles.priorityColCount}>
                    {issue.count} {countUnitFor(issue.count, issue.countUnit)}
                  </Text>
                  <View style={styles.priorityColEffort}>
                    <EffortBadge label={issue.effortBucketLabel} />
                  </View>
                </View>
              ))}
              {priorityList.length > 6 && (
                <Text style={styles.moreInstancesNote}>
                  + {priorityList.length - 6} more issue{priorityList.length - 6 === 1 ? "" : "s"} ranked in the Issues by Type section.
                </Text>
              )}
            </>
          )}

          {quickWins.length > 0 && (
            <>
              <View wrap={false}>
                <Text style={[styles.sectionHeading, { marginTop: 20 }]}>Quick Wins</Text>
                <Text style={styles.priorityNote}>Fast, tag-level fixes — no content rewrite or dev work required. Each item below tells you exactly what to do, how long it takes, and what "done" looks like.</Text>
              </View>
              {quickWins.map((issue) => (
                <View key={issue.key} style={[styles.quickWinRow, { marginBottom: 8 }]} wrap={false}>
                  <View style={styles.quickWinCheckBox} />
                  <View style={{ flex: 1, flexDirection: "column" }}>
                    <Text style={styles.quickWinText}>
                      {issue.label}{" "}
                      <Text style={styles.quickWinCount}>
                        ({issue.count} {countUnitFor(issue.count, issue.countUnit)})
                      </Text>
                    </Text>
                    {(() => {
                      const rem = getRemediation(issue.key);
                      if (!rem) return null;
                      return (
                        <View style={{ marginTop: 4, marginLeft: 0 }}>
                          <Text style={{ fontSize: 8.5, color: "#555555", lineHeight: 1.4 }}>
                            {rem.howToFix.length > 180 ? rem.howToFix.slice(0, 177) + "..." : rem.howToFix}
                          </Text>
                          <Text style={{ fontSize: 8, color: "#1F9D55", fontFamily: "Helvetica-Bold", marginTop: 3 }}>
                            Done when: {rem.successCondition.length > 120 ? rem.successCondition.slice(0, 117) + "..." : rem.successCondition}
                          </Text>
                          {businessImpactForKey(issue.key) && (
                            <Text style={{ fontSize: 7.5, color: '#1a7f5a', fontStyle: 'italic', marginTop: 3 }}>
                              Business impact: {businessImpactForKey(issue.key)}
                            </Text>
                          )}
                          {(() => {
                            if (!estimatedImpact.hasEstimates) return null;
                            const matching = estimatedImpact.estimates.find((e) => e.applicableFlags.includes(issue.key));
                            if (!matching) return null;
                            return (
                              <View style={[styles.estimatedImpactBox, { marginTop: 3, marginBottom: 0, padding: 6 }]} wrap={false}>
                                <Text style={[styles.estimatedImpactLabel, { fontSize: 6.5 }]}>Potential Business Impact</Text>
                                <Text style={[styles.estimatedImpactText, { fontSize: 7, color: '#555', marginBottom: 1 }]}>Observed: {matching.observedData}</Text>
                                <Text style={[styles.estimatedImpactText, { fontSize: 7, color: '#555', marginBottom: 1 }]}>Scenario: {matching.scenarioAssumption}</Text>
                                {matching.additionalClicks !== null && matching.additionalClicks > 0 && (
                                  <Text style={[styles.estimatedImpactText, { fontSize: 7.5, marginBottom: 1, fontFamily: 'Helvetica-Bold', color: '#1a7f5a' }]}>+{formatClickCount(matching.additionalClicks)} clicks/mo</Text>
                                )}
                                {matching.additionalConversions !== null && matching.additionalConversions > 0 && (
                                  <Text style={[styles.estimatedImpactText, { fontSize: 7.5, marginBottom: 1 }]}>+{formatConversionCount(matching.additionalConversions)} conversions/mo</Text>
                                )}
                                {matching.revenueOpportunity !== null && matching.revenueOpportunity > 0 && (
                                  <Text style={[styles.estimatedImpactText, { fontSize: 7.5 }]}>+{formatDollarAmount(matching.revenueOpportunity)} revenue/mo</Text>
                                )}
                              </View>
                            );
                          })()}
                        </View>
                      );
                    })()}
                  </View>
                  <View style={{ width: 100, alignItems: "flex-end", flexShrink: 0 }}>
                    <EffortBadge label={estimateBatchAwareTime(issue).label} />
                  </View>
                </View>
              ))}
            </>
          )}

          {/* AI/GenAI Quick Wins — high-impact, easy/moderate-effort AEO fixes */}
          {aiQuickWins.length > 0 && (
            <>
              <View wrap={false}>
                <Text style={[styles.sectionHeading, { marginTop: 20 }]}>AI/GenAI Quick Wins</Text>
                <Text style={styles.priorityNote}>
                  The highest-impact AI search improvements from this audit — each one is a concrete action that
                  strengthens your site's visibility in AI-generated answers. Sorted by impact and ease of implementation.
                </Text>
              </View>
              {aiQuickWins.map((win) => (
                <View key={win.key} style={styles.aiQuickWinCard} wrap={false}>
                  <View style={styles.aiQuickWinHead}>
                    <Text style={styles.aiQuickWinTitle}>{win.label}</Text>
                    <View style={styles.aiQuickWinBadges}>
                      <AeoBadge
                        text={AEO_IMPACT_LABEL[win.impact]}
                        bg={win.impact === "very_high" ? "#FBE9E6" : "#FBF0DF"}
                        fg={win.impact === "very_high" ? "#D9432E" : "#D98A1A"}
                      />
                      <AeoBadge
                        text={AEO_DIFF_LABEL[win.effort]}
                        bg={AEO_DIFF_BG[win.effort]}
                        fg={AEO_DIFF_COLOR[win.effort]}
                      />
                      <AeoBadge text={win.timeLabel} bg="#EEEEEE" fg="#555555" />
                    </View>
                  </View>
                  <Text style={styles.aiQuickWinCount}>
                    {win.affectedCount} {countUnitFor(win.affectedCount, win.countUnit)} affected
                  </Text>
                  <View style={styles.aiQuickWinSection}>
                    <Text style={styles.aiQuickWinSectionLabel}>What to do:</Text>
                    <Text style={styles.aiQuickWinSectionText}>{win.action}</Text>
                  </View>
                  <View style={styles.aiQuickWinSection}>
                    <Text style={styles.aiQuickWinSectionLabel}>Why it matters for AI:</Text>
                    <Text style={styles.aiQuickWinSectionText}>{win.aiExplanation}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* On-Page SEO findings — titles, descriptions, headings, content, images */}
      {(() => {
        const onPageIssues = otherIssuesRemaining.filter((g) => {
          const p = priorityList.find((pl) => pl.key === g.flag);
          return p?.pillar === "onPage";
        });
        const onPageSectionHeading = (
          <>
            <Text id="cat-on-page-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>On-Page SEO</Text>
            <Text style={styles.priorityNote}>
              Title tags, meta descriptions, headings, word count, thin content, internal links, and image optimization —
              every finding below belongs to the On-Page SEO pillar.
            </Text>
          </>
        );
        return (
          <>
            {onPageIssues.length === 0 ? null : renderIssueFamilies(onPageIssues, options, priorityList, nonDescriptiveImageFindings, onPageSectionHeading, estimatedImpact)}
          </>
        );
      })()}


      {/* Duplicate Title Tags — standalone section */}
      {audit.crawl.duplicateTitles.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Duplicate Title Tags</Text>
          <Text style={[styles.priorityNote, { marginBottom: 6 }]}>
            {audit.crawl.duplicateTitles.length} shared title{audit.crawl.duplicateTitles.length === 1 ? "" : "s"} affect{audit.crawl.duplicateTitles.length === 1 ? "s" : ""} {duplicateTitleUrlCount} page{duplicateTitleUrlCount === 1 ? "" : "s"}.
            When multiple pages share the same title tag, search engines cannot tell them apart — only one can stand out for any given query.
          </Text>
          <ImpactTimeRow priority={priorityList.find((p) => p.key === "duplicate_titles")} />
          <View style={styles.businessImpactCallout}>
            <Text style={styles.businessImpactCalloutLabel}>Business impact</Text>
            <Text style={styles.businessImpactCalloutText}>
              A visitor scanning search results sees the same title twice and has no way to tell which page actually
              answers what they are looking for. This splits click-through rate across pages that should each have a
              distinct, compelling headline — and search engines may only index and rank one of them.
            </Text>
          </View>
          <Text style={[styles.issueText, { marginBottom: 2, fontSize: 8.5 }]}>
            <Text style={styles.issueLabelKey}>Why it matters: </Text>
            These pages share an identical title tag. Only one of them can rank for a given query with that title —
            the rest are effectively competing against a copy of themselves, diluting ranking signals.
          </Text>
          <View style={styles.fixCallout}>
            <Text style={styles.fixCalloutLabel}>Recommended fix</Text>
            <Text style={styles.fixCalloutText}>Write a distinct, descriptive 50–60 character title for each affected page, focused on what is unique about that page's content.</Text>
          </View>
          <Text style={[styles.issueText, { marginTop: 3, marginBottom: 2, fontSize: 8.5 }]}>
            <Text style={styles.issueLabelKey}>After fixing: </Text>
            Each affected page will have a unique, compelling title that accurately represents its content.
            This helps search engines show the most relevant result for each query and gives users a clear reason to click.
          </Text>
          <View style={{ marginTop: 2, marginBottom: 4 }}>
            <Text style={[styles.issueLabelKey, { marginBottom: 2, fontSize: 8 }]}>Implementation:</Text>
            <View style={{ marginLeft: 6 }}>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>1. </Text><Text style={{ fontSize: 8, color: "#333" }}>Review each group of pages below.</Text></View>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>2. </Text><Text style={{ fontSize: 8, color: "#333" }}>For each page, identify its unique value proposition.</Text></View>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>3. </Text><Text style={{ fontSize: 8, color: "#333" }}>Write a 50–60 character title focused on what makes that page different.</Text></View>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>4. </Text><Text style={{ fontSize: 8, color: "#333" }}>Update the title tag in your CMS or HTML.</Text></View>
            </View>
          </View>
          {(() => {
            const DUPLICATE_GROUP_URL_LIMIT = 5;
            return audit.crawl.duplicateTitles.map((group, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 4, padding: 5, backgroundColor: "#FFF8F0", borderLeft: "2pt solid #E67E22", borderRadius: 3 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#333", marginBottom: 1 }}>
                  "{group.value}"
                </Text>
                <Text style={{ fontSize: 7, color: "#888", marginBottom: 1 }}>
                  {group.urls.length} page{group.urls.length === 1 ? "" : "s"} share this title
                </Text>
                {group.urls.slice(0, DUPLICATE_GROUP_URL_LIMIT).map((url, j) => (
                  <Text key={j} style={{ fontSize: 6.5, color: "#1D6FD8", marginBottom: 0.3 }}>{url}</Text>
                ))}
                {group.urls.length > DUPLICATE_GROUP_URL_LIMIT && csvAvailable && (
                  <Text style={{ fontSize: 6, color: "#888", fontStyle: "italic", marginTop: 0.5 }}>
                    +{group.urls.length - DUPLICATE_GROUP_URL_LIMIT} more — full list in the CSV export
                  </Text>
                )}
              </View>
            ));
          })()}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* Duplicate Meta Descriptions — standalone section */}
      {audit.crawl.duplicateMetaDescriptions.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Duplicate Meta Descriptions</Text>
          <Text style={[styles.priorityNote, { marginBottom: 6 }]}>
            {audit.crawl.duplicateMetaDescriptions.length} shared description{audit.crawl.duplicateMetaDescriptions.length === 1 ? "" : "s"} affect{audit.crawl.duplicateMetaDescriptions.length === 1 ? "s" : ""} {duplicateDescUrlCount} page{duplicateDescUrlCount === 1 ? "" : "s"}.
            When multiple pages show the same preview text in search results, visitors cannot tell which one answers their question.
          </Text>
          <ImpactTimeRow priority={priorityList.find((p) => p.key === "duplicate_meta_descriptions")} />
          <View style={styles.businessImpactCallout}>
            <Text style={styles.businessImpactCalloutLabel}>Business impact</Text>
            <Text style={styles.businessImpactCalloutText}>
              A visitor scanning search results sees the same preview text twice and has no way to tell which page actually
              answers what they are looking for. This reduces click-through rates and splits user attention across pages that
              should each have a distinct, compelling summary.
            </Text>
          </View>
          <Text style={[styles.issueText, { marginBottom: 2, fontSize: 8.5 }]}>
            <Text style={styles.issueLabelKey}>Why it matters: </Text>
            These pages share an identical meta description. Only one of them can stand out with it in search results —
            the rest are effectively competing against a copy of themselves.
          </Text>
          <View style={styles.fixCallout}>
            <Text style={styles.fixCalloutLabel}>Recommended fix</Text>
            <Text style={styles.fixCalloutText}>Write a distinct 120–160 character description for each affected page, focused on what is unique about that page's content.</Text>
          </View>
          <Text style={[styles.issueText, { marginTop: 3, marginBottom: 2, fontSize: 8.5 }]}>
            <Text style={styles.issueLabelKey}>After fixing: </Text>
            Each affected page will have a unique, compelling description that accurately represents its content.
            This helps search engines show the most relevant result for each query and gives users a clear reason to click.
          </Text>
          <View style={{ marginTop: 2, marginBottom: 4 }}>
            <Text style={[styles.issueLabelKey, { marginBottom: 2, fontSize: 8 }]}>Implementation:</Text>
            <View style={{ marginLeft: 6 }}>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>1. </Text><Text style={{ fontSize: 8, color: "#333" }}>Review each group of pages below.</Text></View>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>2. </Text><Text style={{ fontSize: 8, color: "#333" }}>For each page, identify its unique value proposition.</Text></View>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>3. </Text><Text style={{ fontSize: 8, color: "#333" }}>Write a 120–160 character description focused on what makes that page different.</Text></View>
              <View style={{ flexDirection: "row", marginBottom: 1 }}><Text style={{ fontSize: 8, color: "#333" }}>4. </Text><Text style={{ fontSize: 8, color: "#333" }}>Update the meta description in your CMS or HTML.</Text></View>
            </View>
          </View>
          {(() => {
            const DUPLICATE_GROUP_URL_LIMIT = 5;
            return audit.crawl.duplicateMetaDescriptions.map((group, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 4, padding: 5, backgroundColor: "#FFF8F0", borderLeft: "2pt solid #E67E22", borderRadius: 3 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#333", marginBottom: 1 }}>
                  "{group.value}"
                </Text>
                <Text style={{ fontSize: 7, color: "#888", marginBottom: 1 }}>
                  {group.urls.length} page{group.urls.length === 1 ? "" : "s"} share this description
                </Text>
                {group.urls.slice(0, DUPLICATE_GROUP_URL_LIMIT).map((url, j) => (
                  <Text key={j} style={{ fontSize: 6.5, color: "#1D6FD8", marginBottom: 0.3 }}>{url}</Text>
                ))}
                {group.urls.length > DUPLICATE_GROUP_URL_LIMIT && csvAvailable && (
                  <Text style={{ fontSize: 6, color: "#888", fontStyle: "italic", marginTop: 0.5 }}>
                    +{group.urls.length - DUPLICATE_GROUP_URL_LIMIT} more — full list in the CSV export
                  </Text>
                )}
              </View>
            ));
          })()}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* Indexation & Crawl Health — canonicals, noindex, URL structure. 
          Note: this section covers a SUBSET of the Technical SEO pillar (indexation
          and URL-structure findings). Other Technical SEO findings — broken links,
          oversized images, Core Web Vitals, crawl errors — appear in their own
          dedicated sections below. The Technical SEO *score* reflects the full
          pillar; this section's pass/fail state covers only the checks listed here. */}
      {(() => {
        const technicalIssues = otherIssuesRemaining.filter((g) => {
          const p = priorityList.find((pl) => pl.key === g.flag);
          return p?.pillar === "technical";
        });
        const techSectionHeading = (
          <>
            <Text id="cat-technical-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>Indexation & Crawl Health</Text>
            <Text style={styles.priorityNote}>
              Canonicals, noindex directives, URL structure, and indexability — every finding below belongs to the Technical SEO pillar.
              Other Technical SEO findings (broken links, performance, crawl errors) appear in their own dedicated sections.
            </Text>
          </>
        );
        return (
          <>
            {technicalIssues.length === 0 ? null : renderIssueFamilies(technicalIssues, options, priorityList, nonDescriptiveImageFindings, techSectionHeading, estimatedImpact)}
          </>
        );
      })()}

      <>
        {filteredImageIssues.length === 0 && oversizedImagesAll.length === 0 ? (
          <Page size={PAGE_SIZE} style={styles.page} wrap>
            <Text id="cat-on-page-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>On-Page SEO: Image Optimization</Text>
            <View style={styles.passCallout} wrap={false}>
              <Text style={styles.passCalloutLabel}>✓ No image issues found</Text>
              <Text style={styles.passCalloutText}>
                Alt text, dimensions, and formats all look good. No image optimization issues were found across the crawled pages.
              </Text>
            </View>
            <Footer options={options} reportId={reportId} />
          </Page>
        ) : filteredImageIssues.length > 0 ? (
          renderIssueGroupViews(filteredImageIssues, options, priorityList, nonDescriptiveImageFindings, {
            sectionHeading: (
              <>
                <Text id="cat-on-page-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>On-Page SEO: Image Optimization</Text>
              </>
            ),
            estimatedImpact
          })
        ) : null}
      </>

      {/* Oversized images get their own dedicated page — never shared with
          the other image-issue groups, so the section reads as one complete
          finding with its own heading, impact, and evidence. */}
      {oversizedImagesAll.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Oversized Images</Text>
          <View style={styles.issueGroupBlock}>
            <View style={styles.issueGroupHead} wrap={false}>
              <Text style={styles.issueLabel}>Oversized images</Text>
              <Text style={styles.issueCountBadge}>
                {oversizedImagesAll.length} image{oversizedImagesAll.length === 1 ? "" : "s"}
              </Text>
            </View>
            <ImpactTimeRow priority={priorityList.find((p) => p.key === "oversized_images")} />
            <Text style={styles.issueText} wrap={false}>
              <Text style={styles.issueLabelKey}>Why it matters: </Text>
              {getRemediation("oversized_images")?.whyItMatters ?? "Large image files slow down page load, which hurts both user experience and performance-based ranking signals."}
            </Text>
            <Text style={styles.issueImpact} wrap={false}>
              {getRemediation("oversized_images")?.whatItMeans ?? "Unnecessarily large images are one of the most common causes of a slow-loading page."}
            </Text>
            <Text style={styles.issueText} wrap={false}>
              <Text style={styles.issueLabelKey}>Recommended fix: </Text>
              {getRemediation("oversized_images")?.howToFix ?? "Compress these images or convert them to a modern format like WebP or AVIF."}
            </Text>
            <Text style={styles.aiReviewNote}>{buildOversizedImagesSmartNote(oversizedImagesAll.length)}</Text>
            {csvAvailable && (
              <Text style={styles.moreInstancesNote}>
                Full list of {oversizedImagesAll.length} oversized images available in the{" "}
                <Link src={`${options.reportUrl}&flag=oversized_images`} style={styles.csvLink}>
                  CSV export
                </Link>
                {"."}
              </Text>
            )}
          </View>
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      <>
        {urlIssues.length === 0 ? (
          <Page size={PAGE_SIZE} style={styles.page} wrap>
            <Text id="cat-technical-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>Technical SEO: URL Structure</Text>
            <View style={styles.passCallout} wrap={false}>
              <Text style={styles.passCalloutLabel}>✓ No URL structure issues found</Text>
              <Text style={styles.passCalloutText}>
                URLs are clean in length, readability, encoding, and parameters across all crawled pages. No URL-structure issues were found.
              </Text>
            </View>
            <Footer options={options} reportId={reportId} />
          </Page>
        ) : renderIssueGroupViews(urlIssues, options, priorityList, nonDescriptiveImageFindings, {
          sectionHeading: (
            <>
              <Text id="cat-technical-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>Technical SEO: URL Structure</Text>
              <View style={styles.urlSeoCallout} wrap={false}>
                <Text style={styles.urlSeoCalloutTitle}>A note about the URLs below</Text>
                <Text style={styles.urlSeoCalloutText}>
                  Every URL in this section is listed because of its URL structure (length, readability, encoding, or
                  parameters) — not because it is broken. If a URL listed here currently returns an error (404, 410, 5xx)
                  or non-HTML content, it is intentionally included: the URL-structure fix applies whether the page works
                  today or not, and that URL is additionally reported in the Broken Links / error sections of this report.
                  URLs are shown decoded for readability; the working address is what the crawler checked.
                </Text>
              </View>
            </>
          ),
          estimatedImpact
        })}
      </>
      {pagesWithSchema.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          <Text id="cat-ai-search-readiness" style={[styles.sectionHeading, { marginTop: 0 }]}>AI Search Readiness (AEO/GEO)</Text>
          <Text style={[styles.sectionSubHeading, { marginTop: 0 }]}>Structured Data</Text>

          <View style={styles.infoCallout} wrap={false}>
            <Text style={styles.infoCalloutTitle}>What structured data is</Text>
            <Text style={styles.infoCalloutText}>
              Structured data (Schema.org markup) tells search engines what a page represents — a product, an article,
              a business, a set of FAQs — and can make it eligible for richer result formats like star ratings, FAQ
              dropdowns, or breadcrumbs. It does not directly improve rankings; without it those formats simply aren't
              available.
            </Text>
          </View>

          <View style={styles.findingBox} wrap={false}>
            <Text style={styles.findingBoxLabel}>What this audit found</Text>
            <View style={styles.sitemapMetaRow}>
              <Text style={styles.sitemapMetaLabel}>Pages with markup</Text>
              <Text style={styles.sitemapMetaValue}>{pagesWithSchema.length} of {audit.crawl.pages.length} crawled pages ({pctOfCrawled(pagesWithSchema.length)}%)</Text>
            </View>
            <View style={styles.sitemapMetaRow}>
              <Text style={styles.sitemapMetaLabel}>Format used</Text>
              <Text style={styles.sitemapMetaValue}>{[...schemaFormats].join(", ") || "Not recorded"}</Text>
            </View>
            <View style={styles.sitemapMetaRow}>
              <Text style={styles.sitemapMetaLabel}>Most common types</Text>
              <Text style={styles.sitemapMetaValue}>{topSchemaTypes.map(([t, n]) => `${t} (${n})`).join(", ") || "—"}</Text>
            </View>
          </View>

          <View style={styles.businessImpactCallout} wrap={false}>
            <Text style={styles.businessImpactCalloutLabel}>What this enables</Text>
            <Text style={styles.businessImpactCalloutText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Structured data is present on {pagesWithSchema.length} of your crawled pages. </Text>
              {PRESENT_SCHEMA_COPY.businessImpact}
            </Text>
          </View>

          <View style={styles.fixCallout} wrap={false}>
            <Text style={styles.fixCalloutLabel}>Recommendation</Text>
            <Text style={styles.fixCalloutText}>{PRESENT_SCHEMA_COPY.recommendedFix}</Text>
          </View>

          {csvAvailable && (
            <Text style={styles.moreInstancesNote}>
              Full list of {pagesWithSchema.length} pages with structured data available in the{" "}
              <Link src={`${options.reportUrl}&flag=has_structured_data`} style={styles.csvLink}>
                CSV export
              </Link>
              {"."}
            </Text>
          )}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {pagesMissingSchema.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          <Text id="cat-ai-search-readiness" style={[styles.sectionHeading, { marginTop: 0 }]}>AI Search Readiness (AEO/GEO)</Text>
          <Text style={[styles.sectionSubHeading, { marginTop: 0 }]}>Missing Structured Data</Text>

          <View style={styles.infoCallout} wrap={false}>
            <Text style={styles.infoCalloutTitle}>What this finding means</Text>
            <Text style={styles.infoCalloutText}>
              {MISSING_SCHEMA_COPY.whyItMatters} Without it, search engines have to infer what each page is about from the visible text alone — which also rules out rich-result formats for those pages.
            </Text>
          </View>

          <View style={styles.findingBox} wrap={false}>
            <Text style={styles.findingBoxLabel}>How significant is this?</Text>
            <View style={styles.sitemapMetaRow}>
              <Text style={styles.sitemapMetaLabel}>Pages without markup</Text>
              <Text style={styles.sitemapMetaValue}>{pagesMissingSchema.length} of {audit.crawl.pages.length} crawled pages ({pctOfCrawled(pagesMissingSchema.length)}%)</Text>
            </View>
            <View style={styles.sitemapMetaRow}>
              <Text style={styles.sitemapMetaLabel}>Most relevant types</Text>
              <Text style={styles.sitemapMetaValue}>{topMissingSuggestions.map(([t, v]) => `${t} (${v.count})`).join(", ") || "—"}</Text>
            </View>
          </View>

          <ImpactTimeRow priority={priorityList.find((p) => p.key === "missing_schema_markup")} />

          <View style={styles.businessImpactCallout} wrap={false}>
            <Text style={styles.businessImpactCalloutLabel}>Business impact</Text>
            <Text style={styles.businessImpactCalloutText}>{MISSING_SCHEMA_COPY.businessImpact}</Text>
          </View>

          <View style={styles.fixCallout} wrap={false}>
            <Text style={styles.fixCalloutLabel}>Recommended fix</Text>
            <Text style={styles.fixCalloutText}>
              {(() => {
                // Specific, data-driven recommendation: the suggested types
                // come from THIS crawl's pages (URL/title patterns), never a
                // generic "add schema" instruction.
                const suggestionSummary = topMissingSuggestions
                  .map(([t, v]) => `${t} (${v.count} page${v.count === 1 ? "" : "s"})`)
                  .join(", ");
                return suggestionSummary
                  ? `Add JSON-LD structured data matching each page's actual content. Based on this crawl, the most relevant types are ${suggestionSummary} — each page below lists its own suggested type and why it fits.`
                  : MISSING_SCHEMA_COPY.recommendedFix;
              })()}
            </Text>
          </View>

          {csvAvailable && (
            <Text style={styles.moreInstancesNote}>
              Full list of {pagesMissingSchema.length} pages missing structured data available in the{" "}
              <Link src={`${options.reportUrl}&flag=missing_schema_markup`} style={styles.csvLink}>
                CSV export
              </Link>
              {"."}
            </Text>
          )}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* Performance & Core Web Vitals — OVERVIEW page. The summary cards
          and per-vital scale bars stay here (result at a glance); the
          "which metrics are problematic + why + how to fix" analysis and
          the affected-pages evidence each get their own page below, so no
          single page crams everything together. */}
      <Page size={PAGE_SIZE} style={styles.page}>
        <Text id="cat-technical-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>Technical SEO: Performance & Core Web Vitals</Text>
        <Text style={[styles.priorityNote, { marginBottom: 4 }]}>
          {cwv.scopeNote}
        </Text>

        {cwv.evaluatedPages === 0 ? (
          <View style={styles.cwvInsufficientBanner} wrap={false}>
            <Text style={styles.cwvInsufficientTitle}>Insufficient data — Core Web Vitals could not be evaluated</Text>
            <Text style={styles.cwvInsufficientText}>
              {cwv.sampleSize > 0
                ? `PageSpeed Insights did not return usable performance data for this audit — none of the ${cwv.sampleSize} page${cwv.sampleSize === 1 ? "" : "s"} attempted could be evaluated.`
                : `No performance data exists for this audit — the Core Web Vitals check did not run.`}
              Re-run the audit (or check the PageSpeed API key) to get performance measurements.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.cwvSummaryGrid}>
              {[
                { label: "Pages crawled", value: String(cwv.totalPages) },
                { label: "Pages tested", value: String(cwv.sampleSize) },
                { label: "Evaluated", value: String(cwv.evaluatedPages) },
                {
                  label: "Templates",
                  value: cwv.templatesRepresented != null ? String(cwv.templatesRepresented) : "—",
                },
                { label: "Passing", value: String(cwv.passingPages) },
                { label: "Failing", value: String(cwv.failingPages) },
                { label: "Pass rate", value: cwv.passRate !== null ? `${cwv.passRate}%` : "—" },
              ].map((s) => (
                <View key={s.label} style={styles.cwvSummaryCard} wrap={false}>
                  <Text style={styles.cwvSummaryLabel}>{s.label}</Text>
                  <Text style={styles.cwvSummaryValue}>{s.value}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.reprLabel, { marginBottom: 6, fontSize: 7.5, lineHeight: 1.35 }]}>
              Website-wide score: {cwv.score !== null ? `${cwv.score}%` : "—"} — share of evaluated pages where every measurable official vital (LCP, INP, CLS) is good. TTFB shown as supporting metric.
            </Text>

            <View style={styles.vitalsGrid}>
              {(
                [
                  {
                    label: "Largest Contentful Paint",
                    value: cwv.lcp.median !== null ? formatMs(cwv.lcp.median) : "—",
                    raw: cwv.lcp.median,
                    goodMax: 2500,
                    needsImprovementMax: 4000,
                    scaleMax: 6000,
                    scaleLabel: "Good 0–2.5s · Needs improvement 2.5–4s · Poor 4s+",
                    agg: cwv.lcp,
                  },
                  {
                    label: "Interaction to Next Paint",
                    value: cwv.inp.median !== null ? formatMs(cwv.inp.median) : "—",
                    raw: cwv.inp.median,
                    goodMax: 200,
                    needsImprovementMax: 500,
                    scaleMax: 800,
                    scaleLabel: "Good 0–200ms · Needs improvement 200–500ms · Poor 500ms+",
                    agg: cwv.inp,
                  },
                  {
                    label: "Cumulative Layout Shift",
                    value: cwv.cls.median !== null ? formatCls(cwv.cls.median) : "—",
                    raw: cwv.cls.median,
                    goodMax: 10,
                    needsImprovementMax: 25,
                    scaleMax: 50,
                    scaleLabel: "Good 0–0.1 · Needs improvement 0.1–0.25 · Poor 0.25+",
                    agg: cwv.cls,
                  },
                  {
                    label: "Time to First Byte",
                    value: cwv.ttfb.median !== null ? formatMs(cwv.ttfb.median) : "—",
                    raw: cwv.ttfb.median,
                    goodMax: 800,
                    needsImprovementMax: 1800,
                    scaleMax: 3000,
                    scaleLabel: "Good 0–800ms · Needs improvement 800–1800ms · Poor 1800ms+",
                    agg: cwv.ttfb,
                  },
                ] as const
              ).map((vital, i) => {
                const rating = vital.agg.rating;
                const pillStyle =
                  rating === "good" ? styles.vitalPillGood : rating === "needs-improvement" ? styles.vitalPillWarn : styles.vitalPillFail;
                return (
                  <View key={i} style={styles.vitalCard} wrap={false}>
                    <Text style={styles.vitalLabel}>{vital.label}</Text>
                    <Text style={styles.vitalValue}>{vital.value}</Text>
                    {vital.raw !== null && (
                      <VitalScaleBar value={vital.raw} goodMax={vital.goodMax} needsImprovementMax={vital.needsImprovementMax} scaleMax={vital.scaleMax} />
                    )}
                    <Text style={styles.vitalScaleLabel}>{vital.scaleLabel}</Text>
                    <Text style={styles.vitalCounts}>
                      {vital.agg.rated} page{vital.agg.rated === 1 ? "" : "s"} rated · {vital.agg.good} good ·{" "}
                      {vital.agg.needsImprovement} needs improvement · {vital.agg.poor} poor
                    </Text>
                    {cwv.sampleSize - vital.agg.rated > 0 && (
                      <Text style={styles.vitalMissing}>
                        {cwv.sampleSize - vital.agg.rated} page{cwv.sampleSize - vital.agg.rated === 1 ? "" : "s"} without
                        available {vital.label} data — not counted as passing or failing
                      </Text>
                    )}
                    {rating && <Text style={[pillStyle, { marginTop: 4 }]}>{RATING_LABEL[rating]} website-wide</Text>}
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Footer options={options} reportId={reportId} />
      </Page>
      {/* Core Web Vitals — ISSUES & FIXES: one self-contained block per
          failing metric. Each block contains a merged explanation,
          recommended fix, optional code snippet, and inline affected-URLs
          list — all in a single unbreakable unit. */}
      {cwvReportBlocks.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page}>
          <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Core Web Vitals — Issues & Fixes</Text>
          <Text style={styles.priorityNote}>
            {cwvReportBlocks.length} Core Web Vital{cwvReportBlocks.length === 1 ? " is" : "s are"} not in the
            good range. Each metric below explains what it measures, why it
            matters, its business impact, and how to fix it.
          </Text>
          {cwvReportBlocks.map((block) => {
            const pillStyle =
              block.rating === "good" ? styles.vitalPillGood : block.rating === "needs-improvement" ? styles.vitalPillWarn : styles.vitalPillFail;
            return (
              <View key={block.key} wrap={false} style={{ marginBottom: 12 }}>
                {/* Header: metric name + count */}
                <Text style={[styles.issueLabel, { fontSize: 11, marginBottom: 2 }]}>
                  {block.label} — {block.affectedCount} page{block.affectedCount === 1 ? "" : "s"} not in the good range
                </Text>
                {block.rating && (
                  <Text style={[pillStyle, { marginBottom: 4 }]}>{RATING_LABEL[block.rating]} website-wide{block.impactLabel ? ` · ${block.impactLabel}` : ""}</Text>
                )}
                {/* What it is */}
                {block.whatItIs && (
                  <Text style={[styles.issueText, { marginTop: 4, marginBottom: 3, fontSize: 8.5 }]}>
                    <Text style={styles.issueLabelKey}>What it is: </Text>
                    {truncateToWordLimit(block.whatItIs, 120).truncated}
                  </Text>
                )}
                {/* Why it matters */}
                {block.whyItMatters && (
                  <Text style={[styles.issueText, { marginBottom: 3, fontSize: 8.5 }]}>
                    <Text style={styles.issueLabelKey}>Why it matters: </Text>
                    {truncateToWordLimit(block.whyItMatters, 150).truncated}
                  </Text>
                )}
                {/* Business impact */}
                {block.businessImpact && (
                  <View style={styles.businessImpactCallout}>
                    <Text style={styles.businessImpactCalloutLabel}>Business impact</Text>
                    <Text style={styles.businessImpactCalloutText}>
                      {truncateToWordLimit(block.businessImpact, 150).truncated}
                    </Text>
                  </View>
                )}
                {/* Recommended fix */}
                {block.recommendedFix && (
                  <View style={styles.fixCallout}>
                    <Text style={styles.fixCalloutLabel}>Recommended fix</Text>
                    <Text style={styles.fixCalloutText}>{block.recommendedFix}</Text>
                  </View>
                )}
                {/* After fixing */}
                {block.afterFixing && (
                  <Text style={[styles.issueText, { marginTop: 3, fontSize: 8.5 }]}>
                    <Text style={styles.issueLabelKey}>After fixing: </Text>
                    {truncateToWordLimit(block.afterFixing, 100).truncated}
                  </Text>
                )}
                {/* Implementation steps */}
                {block.implementationSteps.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[styles.issueLabelKey, { marginBottom: 2, fontSize: 8 }]}>Implementation steps:</Text>
                    <View style={{ marginLeft: 8 }}>
                      {block.implementationSteps.slice(0, 5).map((step, i) => (
                        <View key={i} style={{ flexDirection: 'row', marginBottom: 1 }}>
                          <Text style={{ fontSize: 8, color: "#333333", lineHeight: 1.35 }}>{i + 1}. </Text>
                          <Text style={{ fontSize: 8, color: "#333333", lineHeight: 1.35 }}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {/* Code snippet */}
                {block.codeSnippet && (
                  <View style={{ marginTop: 4, marginBottom: 4, padding: 8, backgroundColor: "#0F172A", borderRadius: 6 }}>
                    <Text style={{ fontSize: 7, color: "#93C5FD", marginBottom: 3, fontFamily: "Helvetica-Bold" }}>{block.codeSnippet.label}</Text>
                    <Text style={{ fontSize: 7, color: "#E2E8F0", fontFamily: "NotoSansDevanagari", lineHeight: 1.4 }}>{block.codeSnippet.code}</Text>
                  </View>
                )}
              </View>
            );
          })}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* Accessibility is deliberately NOT part of this product's audit
          scope (it is not factored into the SEO score, and the audit does
          not claim to audit it) — the PageSpeed-derived accessibility
          score/issues are therefore intentionally not rendered in this
          client-facing SEO report. */}

      {/* Broken Links - only render when there are actual broken links. Pass noted in coverage summary. */}
      {brokenLinks.length > 0 && (
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text id="cat-technical-seo" style={[styles.sectionHeading, { marginTop: 0 }]}>Technical SEO: Broken Links</Text>
          <>
            <Text style={styles.priorityNote}>
              {brokenLinkScopeLabel(brokenLinks.length, brokenLinkSourcePages)} — grouped by why they failed.
              Multiple broken links on the same page each count separately, so this counts link instances, not
              affected pages. These are confirmed failures (not found, gone, or unreachable) — they won't resolve
              on their own.
            </Text>
            <ImpactTimeRow priority={priorityList.find((p) => p.key === "broken_links")} />
            <Text style={styles.aiReviewNote}>{buildBrokenLinksSmartNote(brokenLinks.length)}</Text>
            {csvAvailable && (
              <Text style={styles.moreInstancesNote}>
                Full list of {brokenLinks.length} broken links available in the {" "}
                <Link src={`${options.reportUrl}&flag=broken_links`} style={styles.csvLink}>
                  CSV export
                </Link>
                {"."}
              </Text>
            )}
          </>
        <Footer options={options} reportId={reportId} />
      </Page>
      )}

      {/* Internal Linking Analysis */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Internal Linking Analysis</Text>
        <View style={styles.dashStatGrid}>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: "#1a1a1a" }]}>{totalInternalLinks}</Text>
            <Text style={styles.dashStatLabel}>Internal Links</Text>
          </View>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: "#1a1a1a" }]}>{avgLinksPerPage}</Text>
            <Text style={styles.dashStatLabel}>Avg Links / Page</Text>
          </View>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: orphanTotal > 0 ? "#D9432E" : "#1F9D55" }]}>{orphanTotal}</Text>
            <Text style={styles.dashStatLabel}>Orphan Pages</Text>
          </View>
          <View style={styles.dashStatCard} wrap={false}>
            <Text style={[styles.dashStatNum, { color: "#1a1a1a" }]}>{maxLinkDepth >= 0 ? maxLinkDepth : "—"}</Text>
            <Text style={styles.dashStatLabel}>Max Link Depth</Text>
          </View>
        </View>
        <View style={styles.dashPanel} wrap={false}>
          <Text style={styles.dashPanelTitle}>Internal linking opportunities</Text>
          <Text style={styles.priorityNote}>
            {orphanTotal} page{orphanTotal === 1 ? "" : "s"} {orphanTotal === 1 ? "receives" : "receive"} no internal
            links at all. Adding one contextual link to each (from a relevant hub or related page above) is one of the
            highest-leverage fixes in this report.
          </Text>
          {csvAvailable && (
            <Text style={styles.moreInstancesNote}>
              Full list of {orphanTotal} orphan pages available in the{" "}
              <Link src={`${options.reportUrl}&flag=orphan_pages`} style={styles.csvLink}>
                CSV export
              </Link>
              {"."}
            </Text>
          )}
        </View>
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* Indexability Checks — its own page. These are always checked and
          always reported, pass or fail, so the section reads as a
          deliberate "we looked, here's what we found" panel rather than
          a diagnostic row buried between other sections. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Indexability Checks</Text>
        <Text style={styles.priorityNote}>These are always checked and always reported, whether or not an issue was found.</Text>
        <View style={styles.checksGrid}>
          {indexabilityChecks.map((check) => (
            <View key={check.key} style={styles.checkCard} wrap={false}>
              <View style={styles.checkCardHead}>
                <Text style={styles.checkCardLabel}>{check.label}</Text>
                <Text style={check.passed ? styles.checkCardPass : styles.checkCardFail}>
                  {check.passed ? "✓ Correctly configured" : `${check.affectedCount} affected`}
                </Text>
              </View>
              <Text style={styles.checkCardStatus}>{check.statusText}</Text>
            </View>
          ))}
        </View>
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* Redirect Chain — dedicated page only when chains exist (has real findings).
          When no chains: appears as one-line pass in the coverage summary only. */}
      {redirectChainSummary.hasChains && (
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Redirect Chain</Text>
        <Text style={styles.infoPageIntro}>
          A redirect that resolves in a single hop (e.g. /ebook &rarr; /ebooks) is normal and worth leaving alone. A
          redirect chain is two or more sequential hops before a URL reaches its final destination &mdash; each hop adds
          latency and consumes crawl budget, which is what this section checks for.
        </Text>
        {!redirectChainSummary.hasChains ? (
          <View style={styles.passBanner} wrap={false}>
            <Text style={styles.passBannerText}>✓ {redirectChainSummary.healthyMessage}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.priorityNote}>
              {redirectChainSummary.chains.length} redirect chain{redirectChainSummary.chains.length === 1 ? "" : "s"} found
              {redirectChainSummary.excessiveCount > 0
                ? `, ${redirectChainSummary.excessiveCount} excessive (4+ hops).`
                : "."}
            </Text>
            {redirectChainSummary.chains.map((redirect, i) => (
              <View key={i} style={styles.redirectRow} wrap={false}>
                <Text style={styles.redirectPath}>{redirect.originalUrl} → {redirect.finalUrl}</Text>
                <Text style={redirect.excessive ? styles.redirectHops : styles.redirectHopsOk}>
                  {redirect.hopCount} hops{redirect.excessive ? " · excessive" : ""}
                </Text>
              </View>
            ))}
            {(() => {
              const multiHop = redirectChainSummary.chains;
              if (multiHop.length === 0) return null;
              return (
                <>
                  <Text style={[styles.issueLabel, { fontSize: 12, marginTop: 14, marginBottom: 4 }]}>Chain paths</Text>
                  <Text style={styles.priorityNote}>
                    Each hop adds latency and consumes crawl budget. The paths below show how each URL reaches its final
                    destination, hop by hop. The crawler records each hop's status code and the final destination;
                    intermediate destination URLs are not captured, so each arrow represents one redirect.
                  </Text>
                  {csvAvailable && (
                    <Text style={styles.moreInstancesNote}>
                      Full list of {multiHop.length} redirect chains available in the{" "}
                      <Link src={`${options.reportUrl}&flag=redirect_chains`} style={styles.csvLink}>
                        CSV export
                      </Link>
                      {"."}
                    </Text>
                  )}
                </>
              );
            })()}
          </>
        )}
        {redirectChainSummary.singleHops.length > 0 && (
          <Text style={styles.priorityNote} wrap={false}>
            {redirectChainSummary.singleHops.length} single-hop redirect{redirectChainSummary.singleHops.length === 1 ? "" : "s"} in place
            {(() => {
              const examples = redirectChainSummary.singleHops
                .slice(0, 2)
                .map((r) => `${r.originalUrl} → ${r.finalUrl}`)
                .join(", ");
              return examples ? ` (e.g. ${examples})` : "";
            })()}
            {" — normal and not worth changing; no action needed."}
          </Text>
        )}
        <Footer options={options} reportId={reportId} />
      </Page>
      )}

      {/* Domain Consistency — only renders a dedicated page when there's a finding (not consistent).
          When consistent, it appears as a one-line pass in the SEO Check Coverage section only. */}
      {!domainConsistencyConsistent && (
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Domain Consistency</Text>
        <Text style={styles.infoPageIntro}>
          Your domain can usually be reached several ways — with or without &ldquo;www&rdquo;, over http or https. This
          check confirms all of those variants consistently redirect to ONE canonical version, rather than serving
          content (or splitting ranking signals) across several.
        </Text>

        {(() => {
          const probes = audit.crawl.wwwConsistency.variantProbes ?? [];
          const hasProbes = probes.length > 0;
          // Show healthy when: checked + consistent + (has probes OR no probes = legacy audit, trust legacy data)
          const showHealthy = domainConsistencyChecked && domainConsistencyConsistent;
          return showHealthy ? (
            <View style={styles.passBanner} wrap={false}>
              <Text style={styles.passBannerText}>✓ Domain is consistent — all tested variants resolve to the same canonical URL.</Text>
            </View>
          ) : domainConsistencyChecked ? (
          <View style={styles.findingBox} wrap={false}>
            <Text style={styles.findingBoxLabel}>Why it matters</Text>
            <Text style={styles.issueText}>
              When www/non-www or http/https variants don't all funnel to one destination, search engines can
              index them as separate sites — splitting backlink and ranking signals between copies of the same
              content instead of consolidating them onto one.
            </Text>
            <Text style={[styles.findingBoxLabel, { marginTop: 10 }]}>Current findings</Text>
            <Text style={styles.issueText}>{audit.crawl.wwwConsistency.issue || "Domain consistency check completed but no specific issue was identified. Re-run the audit with fresh data for detailed variant analysis."}</Text>
          </View>
        ) : (
          <View style={styles.findingBox} wrap={false}>
            <Text style={styles.issueText}>This check couldn't be completed for this audit — none of the domain variants responded during the crawl.</Text>
          </View>
        );
        })()}

        {domainConsistencyChecked && (audit.crawl.wwwConsistency.variantProbes ?? []).length > 0 && (
          <View style={styles.findingBox}>
            <Text style={styles.findingBoxLabel}>URL variant details</Text>
            {(audit.crawl.wwwConsistency.variantProbes ?? []).map((p, i) => {
              const isCanonicalInput = p.status === "canonical";
              const inputLabel = isCanonicalInput ? " (input URL)" : "";
              const statusIcon = (
                p.status === "canonical" || p.status === "direct" || p.status === "redirects_to_canonical"
              ) ? "✓" : (p.status === "redirects_elsewhere" ? "⚠" : "✗");
              const statusColor = (
                p.status === "canonical" || p.status === "direct" || p.status === "redirects_to_canonical"
              ) ? "#1a7f37" : (p.status === "redirects_elsewhere" ? "#bf8700" : "#cf222e");
              return (
                <View key={i} style={styles.variantRow} wrap={false}>
                  <Text style={styles.variantUrl}>{p.requestedUrl}{inputLabel}</Text>
                  <Text style={[styles.variantResult, { color: statusColor }]}>\n                    {statusIcon} {p.explanation}
                  </Text>
                  {p.redirectChain.length > 0 && (
                    <Text style={[styles.variantResult, { marginLeft: 12, fontSize: 8, color: "#888888" }]}>
                      Redirect chain: {p.redirectChain.map((h) => `${h.statusCode}`).join(" \u2192 ")}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {!domainConsistencyConsistent && domainConsistencyChecked && (
          <View style={styles.findingBox} wrap={false}>
            <Text style={styles.findingBoxLabel}>Recommended fix</Text>
            <Text style={styles.issueText}>
              Set ONE canonical version of your domain (decide www vs. non-www, and always https), then add a
              permanent (301) redirect from every other variant to it at the server/DNS level — not just a canonical
              tag, which search engines treat as a hint rather than a guarantee.
            </Text>
          </View>
        )}

        <Footer options={options} reportId={reportId} />
      </Page>
      )}

      {/* Indexability details page — renders whenever any Indexability check
          FAILED (check-derived groups built from the real affected URLs,
          so a failed check is never a dead end) or when canonical
          indexability findings exist from the AI stream. Passed checks
          stay concise on the checks page and never appear here. */}
      {(() => {
        const detailGroups = [...indexabilityDetailGroups, ...indexabilityIssues];
        if (detailGroups.length === 0) return null;
        return (
          renderIssueGroupViews(detailGroups, options, priorityList, nonDescriptiveImageFindings, {
            sectionHeading: (
              <>
                <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Indexability & Discoverability — Details</Text>
                <Text style={styles.priorityNote}>
                  Whether search engines can actually index each page — noindex directives, canonical targeting, and robots.txt blocks all affect this. Each issue below lists the exact pages affected, why it matters, and how to fix it.
                </Text>
              </>
            ),
            estimatedImpact
          })
        );
      })()}

{/* NEW: Response Code Breakdown page with summary bars and text */}
<Page size={PAGE_SIZE} style={styles.page} wrap>
  <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Response Code Breakdown</Text>
  <Text style={styles.priorityNote}>
    {responseCodeBreakdown.totalChecked} of {crawlScope.urlsCrawled} crawled page{crawlScope.urlsCrawled === 1 ? "" : "s"} returned an HTTP
    response
    {crawlScope.urlsCrawled - responseCodeBreakdown.totalChecked > 0
      ? ` — the remaining ${crawlScope.urlsCrawled - responseCodeBreakdown.totalChecked} failed before returning a response.`
      : "."}
  </Text>
  {responseCodeBreakdown.probeStatus.blockedCount > 0 &&
    (() => {
      const p = responseCodeBreakdown.probeStatus;
      return (
        <Text style={[styles.priorityNote, { color: "#6B7280" }]}>
          {`The counts above are for crawled pages only. Separately, ${p.blockedCount} link destination${p.blockedCount === 1 ? "" : "s"} returned ${p.forbidden} forbidden (401/403) and ${p.rateLimited} rate-limited (429) response${p.blockedCount === 1 ? "" : "s"} to the automated link checker — these are separate probe requests and a refusal there does not mean the page itself failed.`}
        </Text>
      );
    })()}
  {(() => {
    const errorCount = responseCodeBreakdown.groups.find((g) => g.key === "4xx")?.count ?? 0;
    const serverErrorCount = responseCodeBreakdown.groups.find((g) => g.key === "5xx")?.count ?? 0;
    const totalErrors = errorCount + serverErrorCount;
    if (totalErrors === 0) return null;
    return (
      <View style={[styles.findingBox, { backgroundColor: "#FBF0DF", borderLeft: "3pt solid #D98A1A" }]} wrap={false}>
        <Text style={styles.findingBoxLabel}>Pages not included in content analysis</Text>
        <Text style={styles.issueText}>
          {errorCount > 0 && `${errorCount} page${errorCount === 1 ? "" : "s"} returned 4xx errors (403 Forbidden, 404 Not Found, etc.) — these pages could not be crawled for on-page analysis.`}
          {errorCount > 0 && serverErrorCount > 0 && " "}
          {serverErrorCount > 0 && `${serverErrorCount} page${serverErrorCount === 1 ? "" : "s"} returned 5xx server errors.`}
          {" "}These URLs are excluded from the substantive content analysis (titles, meta descriptions, headings, etc.)
          because their content could not be read. If these are real pages on your site, the 403 errors likely indicate
          bot-protection or WAF rules blocking automated access — spot-check a sample in a browser to confirm. If the
          pages load fine for visitors, consider whitelisting the crawler in your WAF settings.
        </Text>
      </View>
    );
  })()}
  {responseCodeBreakdown.groups.length === 0 ? (
    <View style={styles.passBanner} wrap={false}>
      <Text style={styles.passBannerText}>✓ No response codes recorded — nothing to flag.</Text>
    </View>
  ) : (
    <>
      {/* Text summary — matches the web report format: "2xx — Success: 467 (46%)" */}
      <View style={styles.responseCodeBlock} wrap={false}>
        {responseCodeBreakdown.groups.map((group) => {
          const pct = responseCodeBreakdown.totalChecked > 0
            ? Math.round((group.count / responseCodeBreakdown.totalChecked) * 100)
            : 0;
          return (
            <Text key={group.key} style={{ fontSize: 9, color: "#333333", marginBottom: 2 }}>
              {group.label}: {group.count} ({pct}%)
            </Text>
          );
        })}
      </View>

      {/* Summary bars — one per group (2xx/3xx/4xx/5xx), green/amber/red,
          width proportional to the group's share of totalChecked. */}
      <View style={styles.responseCodeBlock} wrap={false}>
        {responseCodeBreakdown.groups.map((group) => {
          const widthPct = responseCodeBreakdown.totalChecked > 0
            ? Math.max(4, Math.round((group.count / responseCodeBreakdown.totalChecked) * 100))
            : 0;
          return (
            <View key={group.key} style={styles.responseCodeRow} wrap={false}>
              <Text style={styles.responseCodeLabel}>{group.label}</Text>
              <View style={styles.responseCodeBarTrack}>
                <View style={[responseGroupBarStyle(group.key), { width: `${widthPct}%` }]} />
              </View>
              <Text style={styles.responseCodeCount}>{group.count}</Text>
            </View>
          );
        })}
      </View>

      {/* Per-status-code detail — every code (200, 301, 302, 404, 410, 429,
          500, 503, …) with a bar proportional to its share of totalChecked,
          so the real response mix is scannable at a glance. */}
      {responseCodeBreakdown.groups.map((group) => (
        <View key={group.key} style={{ marginBottom: 10 }} wrap={false}>
          <Text style={styles.brokenLinkCategoryLabel}>{group.label} ({group.count})</Text>
          {group.codes.map((c) => {
            const widthPct =
              responseCodeBreakdown.totalChecked > 0
                ? Math.max(3, Math.round((c.count / responseCodeBreakdown.totalChecked) * 100))
                : 0;
            const barColor =
              c.code < 300 ? styles.codeBarFillGreen : c.code === 429 ? styles.codeBarFillAmber : c.code < 400 ? styles.codeBarFillAmber : styles.codeBarFillRed;
            return (
              <View key={c.code} style={styles.codeRow} wrap={false}>
                <Text style={styles.codeLabel}>{describeStatusCode(c.code)}</Text>
                <View style={styles.codeBarTrack}>
                  <View style={[styles.codeBarFill, barColor, { width: `${widthPct}%` }]} />
                </View>
                <Text style={styles.codeCount}>{c.count}</Text>
              </View>
            );
          })}
        </View>
      ))}
      <Text style={styles.codeSnippetNote}>
        This chart reflects the HTTP responses received for crawled pages only. Static assets and background resource
        requests are excluded.
      </Text>
    </>
  )}
  <Footer options={options} reportId={reportId} />
</Page>

      {/* Item #4: Robots.txt and Sitemap now each get their own dedicated
          page instead of sharing one. Each page follows the same hierarchy:
          what it is -> current status -> what was detected -> business
          impact -> recommendation. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Robots.txt</Text>
        <View style={styles.infoCallout} wrap={false}>
          <Text style={styles.infoCalloutTitle}>What is robots.txt?</Text>
          <Text style={styles.infoCalloutText}>
            A short text file at your site's root that tells search-engine crawlers which paths they may fetch. It
            controls crawling, not indexing — a blocked page can still appear in results (without its content) if
            other pages link to it, and robots.txt can never remove a page from search.
          </Text>
        </View>
        {(() => {
          const rb = audit.crawl.robotsAudit;
          const rbInfo = robotsInfoCard(rb);
          if (!rb) {
            return (
              <View style={[styles.statusBanner, { backgroundColor: "#F4F4F2" }]} wrap={false}>
                <Text style={[styles.statusBannerTitle, { color: "#555555" }]}>Not checked in this crawl</Text>
                <Text style={styles.statusBannerText}>
                  This audit run predates the robots.txt check. Re-run the audit to see the status of your robots.txt file.
                </Text>
              </View>
            );
          }
          const disallowed = rb.status === "found" ? rb.disallowedPaths : [];
          const banner =
            rb.status === "not_found"
              ? { bg: "#FBF0DF", fg: "#B25E09", title: "No robots.txt found", text: "Not an error — without a file, every path on the site is crawlable by default." }
              : rb.status === "fetch_error"
              ? { bg: "#F4F4F2", fg: "#555555", title: "Couldn't be verified during this crawl", text: "robots.txt could not be checked because of a network error." }
              : disallowed.length === 0
              ? { bg: "#E7F6ED", fg: "#1F9D55", title: "✓ Healthy — no disallowed paths", text: "Every path on this site is currently crawlable by search engines." }
              : { bg: "#FBF0DF", fg: "#B25E09", title: `${disallowed.length} disallowed path${disallowed.length === 1 ? "" : "s"} found`, text: "These paths are excluded from crawling — often intentional." };
          const impact =
            rb.status === "not_found"
              ? { bg: "#FBF0DF", accent: "#D98A1A", fg: "#B25E09", text: "For most sites this is fine — but with no file in place you can't guide crawlers toward what matters, or keep them away from low-value areas as the site grows." }
              : rb.status === "fetch_error"
              ? { bg: "#F4F4F2", accent: "#999999", fg: "#555555", text: "This audit can't confirm whether any important pages are being blocked until the file is reachable again." }
              : disallowed.length === 0
              ? null
              : { bg: "#FBF0DF", accent: "#D98A1A", fg: "#B25E09", text: `${disallowed.length} path${disallowed.length === 1 ? " is" : "s are"} excluded from crawling, so search engines can't read their content — and a blocked URL can still be indexed (without its content) if it's linked to from elsewhere. If these are genuinely internal (admin, staging), the file is working as intended.` };
          const showRecommendation = rb.status !== "found" || disallowed.length > 0;
          const worksWell = rb.status === "found" && disallowed.length === 0;
          return (
            <>
              <View style={[styles.statusBanner, { backgroundColor: banner.bg }]} wrap={false}>
                <Text style={[styles.statusBannerTitle, { color: banner.fg }]}>{banner.title}</Text>
                <Text style={styles.statusBannerText}>{banner.text}</Text>
              </View>
              <View style={styles.findingBox} wrap={false}>
                <View style={styles.sitemapMetaRow}>
                  <Text style={styles.sitemapMetaLabel}>Location</Text>
                  <Text style={styles.sitemapMetaValue}>{siteOrigin ? `${siteOrigin}/robots.txt` : rbInfo.expectedLocation}</Text>
                </View>
                {rb.httpStatus !== undefined && (
                  <View style={styles.sitemapMetaRow}>
                    <Text style={styles.sitemapMetaLabel}>HTTP status</Text>
                    <Text style={styles.sitemapMetaValue}>{rb.httpStatus}</Text>
                  </View>
                )}
                {disallowed.length > 0 && (
                  <View style={styles.sitemapMetaRow}>
                    <Text style={styles.sitemapMetaLabel}>Disallowed paths</Text>
                    <Text style={styles.sitemapMetaValue}>{disallowed.length}</Text>
                  </View>
                )}
              </View>
              {/* The directives panel must NOT be wrap={false}: a robots.txt
                  with many user-agent blocks can make it taller than one
                  page, and react-pdf lays out an unbounded non-wrappable
                  block by overflowing it — the stacked/overlapping text bug.
                  Each rule row paginates naturally; the panel can spill onto
                  a second page instead of clipping. */}
              {rb.directives && rb.directives.length > 0 && (
                <View style={styles.dashPanel}>
                  <Text style={styles.dashPanelTitle}>Directives detected in robots.txt</Text>
                  {rb.directives.slice(0, 6).map((blk, i) => (
                    <View key={i}>
                      {/* Only rules that BLOCK paths are shown — allowed paths
                          are normal/expected (most files allow everything by
                          default) and only add noise. A block that only
                          allows paths is skipped entirely. */}
                      {blk.disallows.length > 0 && (
                        <Text style={styles.directiveBlockLabel}>User-agent: {blk.userAgent || "(no user-agent)"}</Text>
                      )}
                      {blk.disallows.map((d, j) => (
                        <Text key={`d${j}`} style={styles.directiveRule}><Text style={{ fontFamily: "Helvetica-Bold", color: "#333333" }}>Blocks: </Text>{d}</Text>
                      ))}
                      {blk.disallows.length === 0 && blk.allows.length === 0 && (
                        <Text style={styles.directiveRule}>No allow or disallow rules under this agent.</Text>
                      )}
                    </View>
                  ))}
                  {rb.directives.length > 6 && (
                    <Text style={styles.moreInstancesNote}>
                      + {rb.directives.length - 6} more rule blocks
                      {siteOrigin ? ` — full file available at ${siteOrigin}/robots.txt` : ""}
                    </Text>
                  )}
                  {rb.sitemapDirective && (
                    <Text style={[styles.directiveRule, { marginTop: 4 }]}>
                      <Text style={{ fontFamily: "Helvetica-Bold", color: "#333333" }}>Sitemap: </Text>{rb.sitemapDirective}
                    </Text>
                  )}
                  <Text style={styles.directiveNote}>
                    Disallow rules tell crawlers which paths they may not fetch. Rules apply only to the crawler named in
                    their User-agent line — the &quot;*&quot; block applies to all crawlers.
                  </Text>
                </View>
              )}
              {!rb.directives && disallowed.length > 0 && (
                <View style={styles.dashPanel}>
                  <Text style={styles.dashPanelTitle}>Disallowed paths found in this crawl</Text>
                  {disallowed.map((p, i) => (
                    <Text key={i} style={styles.robotsBlockedRow}>{p}</Text>
                  ))}
                </View>
              )}
              {audit.crawl.pagesSkippedRobots.length > 0 && (
                <View style={styles.issueGroupBlock}>
                  {/* NOT wrap={false}: on sites with many blocked paths the
                      label + intro + every URL is taller than a page, and a
                      wrap={false} wrapper taller than the page makes react-pdf
                      double-draw the content at overlapping positions. The
                      rows must be free to flow across pages. */}
                  <Text style={styles.issueLabel}>Pages blocked during this crawl</Text>
                  {/* maxWidth slightly under the content box: react-pdf's line
                      wrapping can let a long first line run ~3pt past the page
                      margin on this paragraph, which breaks the grid. */}
                  <Text style={[styles.issueText, { maxWidth: 756 }]}>
                    These pages were discovered but not crawled, because the site's robots.txt disallows the path.
                    Blocking may be intentional (admin areas, staging content) — but confirm that no pages you intend to
                    rank are being excluded from search results.
                  </Text>
                  {audit.crawl.pagesSkippedRobots.slice(0, ROBOTS_BLOCKED_PDF_LIMIT).map((u, i) => (
                    <Text key={i} style={styles.robotsBlockedRow}>{u}</Text>
                  ))}
                  <Text style={styles.moreInstancesNote}>
                    {audit.crawl.pagesSkippedRobots.length > ROBOTS_BLOCKED_PDF_LIMIT
                      ? sampleRemainderText(audit.crawl.pagesSkippedRobots.length, ROBOTS_BLOCKED_PDF_LIMIT, "URL")
                      : ""}
                    {csvAvailable && (
                      <>
                        {"Full list available in the "}
                        <Link src={`${options.reportUrl}&flag=blocked_by_robots`} style={styles.csvLink}>
                          CSV export
                        </Link>
                        {"."}
                      </>
                    )}
                  </Text>
                  {csvAvailable && (
                    <Text style={styles.csvDownloadLine}>
                      <Link src={`${options.reportUrl}&flag=blocked_by_robots`} style={styles.csvLink}>
                        Download CSV of affected URLs
                      </Link>
                    </Text>
                  )}
                </View>
              )}
              {robotsBlockedLinksSummary.count > 0 && (
                <View style={styles.issueGroupBlock}>
                  {/* Deliberately NOT wrap={false}: the whole group (title +
                      intro + every blocked link) is routinely taller than a
                      page on real sites (hundreds of links). A wrap={false}
                      wrapper taller than the page makes react-pdf double-
                      draw the content at overlapping positions instead of
                      paginating it — the rows must be free to flow across
                      pages. */}
                  <Text style={styles.issueLabel}>Links blocked by robots.txt</Text>
                  <Text style={[styles.issueText, { maxWidth: 756 }]}>
                    Links on your site that point into paths robots.txt disallows were never checked during this crawl —
                    a block is not evidence the link is broken. Confirm these paths are intentionally excluded (admin
                    areas, staging, archives); if any should be reachable, allow them in robots.txt.
                  </Text>
                  {robotsBlockedLinksSummary.links.map((link, i) => (
                    <View key={i} style={styles.brokenLinkRow}>
                      <View style={styles.brokenLinkUrlWrap}>
                        <Text style={styles.brokenLinkUrl}>{link.url}</Text>
                      </View>
                      <Text style={styles.brokenLinkStatus}>
                        {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                  ))}
                  {csvAvailable && robotsBlockedLinksSummary.count > 0 && (
                    <Text style={styles.moreInstancesNote}>
                      {robotsBlockedLinksSummary.count} blocked link{robotsBlockedLinksSummary.count === 1 ? "" : "s"} listed — full
                      list available in the{" "}
                      <Link src={`${options.reportUrl}&flag=robots_blocked_links`} style={styles.csvLink}>
                        CSV export
                      </Link>
                      .
                    </Text>
                  )}
                </View>
              )}
              {impact && (
                <View style={[styles.impactPanel, { backgroundColor: impact.bg, borderLeft: `3pt solid ${impact.accent}` }]} wrap={false}>
                  <Text style={[styles.impactTitle, { color: impact.fg }]}>What this means for your business</Text>
                  <Text style={styles.impactText}>{impact.text}</Text>
                </View>
              )}
              {worksWell && (
                <View style={styles.passBanner} wrap={false}>
                  <Text style={styles.passBannerText}>✓ What's working well</Text>
                  <Text style={[styles.impactText, { marginTop: 3 }]}>
                    With no disallowed paths, crawlers can reach every part of the site — nothing important is being
                    blocked{rb.sitemapDirective ? ", and the file points crawlers to your sitemap" : ""}. Keep it that way;
                    if you later add areas you don't want crawled, add them here.
                  </Text>
                </View>
              )}
              {showRecommendation && (
                <View style={styles.findingBox} wrap={false}>
                  <Text style={styles.issueLabel}>Recommendation</Text>
                  <Text style={styles.issueText}>{rbInfo.recommendation}</Text>
                </View>
              )}
            </>
          );
        })()}
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* Item #11: Sitemap page — what it is, current status, what was
          detected (real URLs from the crawl), business impact, and a
          recommendation or "what's working" close. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Sitemap</Text>
        <View style={styles.infoCallout} wrap={false}>
          <Text style={styles.infoCalloutTitle}>What is a sitemap?</Text>
          <Text style={styles.infoCalloutText}>
            A sitemap.xml lists the pages you want search engines to know about — your site's preferred URL inventory.
            It helps discovery, especially for deep or lightly linked pages, but listing a page here does not
            guarantee it gets indexed or ranks; discovery is just the first step.
          </Text>
        </View>
        {sitemapGuidance.show ? (
          <>
            <View
              style={[
                styles.statusBanner,
                { backgroundColor: sitemapAudit.status === "fetch_error" ? "#F4F4F2" : "#FBF0DF" },
              ]}
              wrap={false}
            >
              <Text
                style={[
                  styles.statusBannerTitle,
                  { color: sitemapAudit.status === "fetch_error" ? "#555555" : "#B25E09" },
                ]}
              >
                {sitemapAudit.status === "not_found"
                  ? "Missing sitemap.xml"
                  : sitemapAudit.status === "invalid"
                  ? "Found, but couldn't be parsed"
                  : "Couldn't be verified during this crawl"}
              </Text>
              <Text style={styles.statusBannerText}>
                {sitemapAudit.status === "fetch_error"
                  ? "The sitemap could not be checked because of a network error. Verify manually that the file loads and returns a 200 status, then re-run the audit."
                  : sitemapGuidance.affectedPagesNote}
              </Text>
            </View>
            <View style={styles.findingBox} wrap={false}>
              <View style={styles.sitemapMetaRow}>
                <Text style={styles.sitemapMetaLabel}>Location</Text>
                <Text style={styles.sitemapMetaValue}>{siteOrigin ? `${siteOrigin}/sitemap.xml` : sitemapInfoCard(sitemapAudit).expectedLocation}</Text>
              </View>
              {sitemapAudit.httpStatus !== undefined && (
                <View style={styles.sitemapMetaRow}>
                  <Text style={styles.sitemapMetaLabel}>HTTP status</Text>
                  <Text style={styles.sitemapMetaValue}>{sitemapAudit.httpStatus}</Text>
                </View>
              )}
            </View>
            <View style={[styles.impactPanel, { backgroundColor: sitemapAudit.status === "fetch_error" ? "#F4F4F2" : "#FBF0DF", borderLeft: sitemapAudit.status === "fetch_error" ? "3pt solid #999999" : "3pt solid #D98A1A" }]} wrap={false}>
              <Text style={[styles.impactTitle, { color: sitemapAudit.status === "fetch_error" ? "#555555" : "#B25E09" }]}>What this means for your business</Text>
              <Text style={styles.impactText}>
                {sitemapAudit.status === "fetch_error"
                  ? "This audit can't confirm whether your site benefits from sitemap-based discovery until the file is reachable again."
                  : sitemapAudit.status === "invalid"
                  ? "A sitemap file exists but search engines can't read it, which makes it effectively the same as having none — your pages rely entirely on link-based discovery."
                  : "Search engines can still find your pages by following links, but discovery is slower and less complete — deep or lightly linked pages can take much longer to be indexed, or be missed entirely."}
              </Text>
            </View>
            {sitemapAudit.status !== "fetch_error" && (
              <View style={styles.findingBox} wrap={false}>
                <Text style={styles.issueLabel}>Recommended fix</Text>
                <Text style={styles.issueText}>{sitemapGuidance.howToFix}</Text>
                <View style={[styles.sitemapMetaRow, { marginTop: 4 }]}>
                  <Text style={styles.sitemapMetaLabel}>Time estimate</Text>
                  <Text style={styles.sitemapMetaValue}>{sitemapGuidance.timeEstimate}</Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {sitemapAudit.httpStatus !== undefined && sitemapAudit.httpStatus >= 400 ? (
              <View style={[styles.statusBanner, { backgroundColor: "#FBF0DF" }]} wrap={false}>
                <Text style={[styles.statusBannerTitle, { color: "#B25E09" }]}>⚠ Found — but primary sitemap returned HTTP {sitemapAudit.httpStatus}</Text>
                <Text style={styles.statusBannerText}>
                  The sitemap was found and parsed successfully ({sitemapAudit.urlCount} URL{sitemapAudit.urlCount === 1 ? "" : "s"}), but the primary location returned an HTTP {sitemapAudit.httpStatus} status. This likely means the sitemap was discovered from an alternative location or robots.txt. Search engines hitting the primary location may see the same error — verify that {siteOrigin ? `${siteOrigin}/sitemap.xml` : "the expected sitemap location"} returns a 200 status.
                </Text>
              </View>
            ) : (
              <View style={[styles.statusBanner, { backgroundColor: "#E7F6ED" }]} wrap={false}>
                <Text style={[styles.statusBannerTitle, { color: "#1F9D55" }]}>✓ Healthy — found</Text>
                <Text style={styles.statusBannerText}>
                  Found — {sitemapAudit.urlCount} URL{sitemapAudit.urlCount === 1 ? "" : "s"} listed at {siteOrigin ? `${siteOrigin}/sitemap.xml` : "the expected location"}. The file parses cleanly and gives search engines a clear list of the pages you've chosen to surface. Verify that all important canonical, indexable pages are represented — a sitemap is a discovery aid, not a guarantee of indexing or ranking.
                </Text>
              </View>
            )}
            <View style={styles.findingBox} wrap={false}>
              <View style={styles.sitemapMetaRow}>
                <Text style={styles.sitemapMetaLabel}>Location</Text>
                <Text style={styles.sitemapMetaValue}>{siteOrigin ? `${siteOrigin}/sitemap.xml` : sitemapInfoCard(sitemapAudit).expectedLocation}</Text>
              </View>
              {sitemapAudit.httpStatus !== undefined && (
                <View style={styles.sitemapMetaRow}>
                  <Text style={styles.sitemapMetaLabel}>HTTP status</Text>
                  <Text style={styles.sitemapMetaValue}>{sitemapAudit.httpStatus}</Text>
                </View>
              )}
              <View style={styles.sitemapMetaRow}>
                <Text style={styles.sitemapMetaLabel}>URLs listed</Text>
                <Text style={styles.sitemapMetaValue}>{sitemapAudit.urlCount}</Text>
              </View>
              {sitemapAudit.urls && (
                <View style={styles.sitemapMetaRow}>
                  <Text style={styles.sitemapMetaLabel}>Homepage listed</Text>
                  <Text style={styles.sitemapMetaValue}>
                    {sitemapAudit.urls.some((u) => {
                      try {
                        return new URL(u).pathname === "/";
                      } catch {
                        return false;
                      }
                    })
                      ? "Yes"
                      : "No"}
                  </Text>
                </View>
              )}
            </View>
            {clientSitemapUrls.length > 0 && (
              <View style={styles.dashPanel} wrap={false}>
                <Text style={styles.dashPanelTitle}>Pages included in the sitemap</Text>
                {clientSitemapUrls.slice(0, 8).map((u, i) => (
                  <Text key={i} style={styles.robotsBlockedRow}>{u}</Text>
                ))}
                {clientSitemapUrls.length > 8 && (
                  <Text style={styles.moreInstancesNote}>
                    + {clientSitemapUrls.length - 8} more URL{clientSitemapUrls.length - 8 === 1 ? "" : "s"} on this domain listed in the file
                  </Text>
                )}
                {externalSitemapUrlCount > 0 && (
                  <Text style={styles.moreInstancesNote}>
                    The sitemap also lists {externalSitemapUrlCount} URL{externalSitemapUrlCount === 1 ? "" : "s"} outside this
                    domain (e.g. Google-hosted assets, partner CDNs, social profiles) — those are not pages this
                    organization controls, so they are not included above.
                  </Text>
                )}
              </View>
            )}
          </>
        )}
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* AI Search Readiness (AEO/GEO) — each category gets its own
          dedicated page instead of being crammed together. The outer
          <Page wrap> still lets a long category spill onto a second
          physical page if it has many checks; what "wrap={false}" was
          doing before (on the whole category block) was forcing
          react-pdf to lay out an unbounded-height block as one
          unbreakable unit, which is what clipped/overlapped content on
          categories with a lot of checks (AI Technical Readiness
          especially). Only individual check cards stay wrap={false}. */}
      {/* AI Search Readiness (AEO/GEO) — executive overview page first
          (score, dimension breakdown, comparison, implementation order,
          quick wins), then ONE dedicated page per category. AI Crawlability
          gets its own page and never starts halfway down the overview. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>AI Search Readiness (AEO/GEO)</Text>
        <Text style={styles.priorityNote}>
          How discoverable and citable this site is to AI answer engines (ChatGPT, Claude, Perplexity, Gemini, and
          similar) — a complementary lens to the traditional SEO checks in this report. When someone asks an AI
          assistant about your products, services, or industry, these checks measure how likely your site is to be
          named and cited as the source.
        </Text>
        <View style={styles.scoreBlock} wrap={false}>
          <Text style={[styles.scoreNumber, { fontSize: 32, color: scoreColor(aeoReadinessScore) }]}>
            {aeoReadinessScore}%
          </Text>
          <View>
            <Text style={styles.scoreLabel}>AI Readiness Score{"\n"}(% of checks passing)</Text>
            <Text style={{ fontSize: 8, color: "#888888", marginTop: 2 }}>
              The score above is the share of AI-readiness checks passing ({aeoCheckSummary.passCount} of {aeoCheckTotal}) — a pass/fail share, not a weighted index.
            </Text>
            <ScoreScaleGuide score={aeoReadinessScore} />
          </View>
        </View>
        <View style={styles.landRow} wrap={false}>
          <View style={styles.landCol}>
        <View style={styles.aiReadinessBlock}>
          <Text style={[styles.issueLabel, { fontSize: 12, marginBottom: 6 }]}>AI Readiness Breakdown</Text>
          {aiReadinessDimensions.map((dim) => (
            <View key={dim.key} style={styles.categoryRow} wrap={false}>
              <View style={styles.categoryRowHead}>
                <Text style={styles.categoryLabel}>{dim.label}</Text>
                <Text style={styles.categoryScoreText}>
                  {clampScore(dim.score)}/100
                  {dim.totalCount > 0 ? ` · ${dim.passCount}/${dim.totalCount} checks` : ""}
                </Text>
              </View>
              <View style={styles.categoryBarTrack}>
                <View
                  style={[
                    clampScore(dim.score) >= 80
                      ? styles.categoryBarFillGood
                      : clampScore(dim.score) >= 50
                      ? styles.categoryBarFillWarn
                      : styles.categoryBarFillFail,
                    { width: `${clampScore(dim.score)}%` },
                  ]}
                />
              </View>
              <Text style={styles.categoryExplanationText}>{dim.description}</Text>
            </View>
          ))}
        </View>
          </View>
          <View style={styles.landColLast}>
        <View style={styles.aeoCmpBox} wrap={false}>
          <Text style={[styles.issueLabel, { fontSize: 12, marginBottom: 6 }]}>AI Readiness Comparison</Text>
          <View style={styles.aeoCmpRow}>
            <Text style={styles.aeoCmpLabel}>Your Website</Text>
            <View style={styles.aeoCmpTrack}>
              <View style={[styles.aeoCmpFill, { width: `${aeoReadinessScore}%`, backgroundColor: scoreColor(aeoReadinessScore) }]} />
            </View>
            <Text style={styles.aeoCmpValue}>{aeoReadinessScore}%</Text>
          </View>
          <View style={styles.aeoCmpRow}>
            <Text style={styles.aeoCmpLabel}>Typical Range</Text>
            <View style={styles.aeoCmpTrack}>
              <View style={[styles.aeoCmpFill, { width: "50%", backgroundColor: "#888888" }]} />
            </View>
            <Text style={styles.aeoCmpValue}>40–60%</Text>
          </View>
          <View style={styles.aeoCmpRow}>
            <Text style={styles.aeoCmpLabel}>Recommended Target</Text>
            <View style={styles.aeoCmpTrack}>
              <View style={[styles.aeoCmpFill, { width: "90%", backgroundColor: "#1F9D55" }]} />
            </View>
            <Text style={styles.aeoCmpValue}>90%</Text>
          </View>
          <Text style={styles.aeoCmpNote}>
            Your score is measured from this audit. The typical range is an illustrative benchmark for sites of
            comparable size and sector — not a measured industry statistic. The recommended target reflects what
            strong AI visibility typically requires.
          </Text>
        </View>
          </View>
        </View>
        <View break style={styles.landRow} wrap={false}>
          <View style={styles.landCol}>
        <View style={styles.aeoPanel} wrap={false}>
          <Text style={styles.aeoPanelTitle}>Recommended Implementation Order</Text>
          {aeoFailingChecks.slice(0, 6).map((c, i) => (
            <View key={c.key} style={styles.aeoOrderRow} wrap={false}>
              <Text style={styles.aeoOrderNum}>{i + 1}</Text>
              <View style={styles.aeoOrderLabelWrap}>
                <Text style={styles.aeoOrderLabel}>
                  {c.label}
                  {c.qualifiedPages !== undefined && c.qualifiedPages > 0 && (
                    <Text style={styles.aeoOrderCount}> · {c.qualifiedPages} qualifying page{c.qualifiedPages === 1 ? "" : "s"}</Text>
                  )}
                </Text>
              </View>
              <AeoImpactBar impact={c.expectedImpact} width={90} />
              <Text style={styles.aeoOrderValue}>{AEO_IMPACT_LABEL[c.expectedImpact]}</Text>
            </View>
          ))}
          {aeoFailingChecks.length === 0 && (
            <Text style={styles.priorityNote}>No failing AI checks — nothing to sequence.</Text>
          )}
        </View>
          </View>
          <View style={styles.landColLast}>
        <View style={styles.aeoPanel} wrap={false}>
          <Text style={styles.aeoPanelTitle}>Quick Wins (Under 30 Minutes)</Text>
          {(() => {
            const quickWins = aeoFailingChecks
              .filter((c) => c.difficulty === "easy" && parseTimeLabelToMinutes(c.timeLabel) <= 30 && c.expectedImpact !== "low")
              .slice(0, 5);
            return quickWins.length > 0 ? (
              // Flattened to DIRECT panel children: react-pdf 4.x measures a
              // Text/View nested inside a wrapper View in this flex chain with
              // ~110pt of phantom height, but direct panel children (the row
              // Views and the title Text above) lay out correctly.
              (() => {
                const rows: React.ReactNode[] = [];
                quickWins.forEach((c) => {
                  rows.push(
                    <View key={c.key} style={styles.wwRow} wrap={false}>
                      <View style={styles.quickWinCheckBox} />
                      <Text style={styles.quickWinText}>
                        {c.label} <Text style={styles.quickWinCount}>· {c.timeLabel}</Text>
                      </Text>
                    </View>
                  );
                  if (c.applicability) {
                    rows.push(<Text key={`${c.key}-note`} style={styles.quickWinNote}>{c.applicability}</Text>);
                  }
                });
                return rows;
              })()
            ) : (
              <Text style={styles.priorityNote}>No failing AI check can be resolved in under 30 minutes.</Text>
            );
          })()}
        </View>
          </View>
        </View>
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* One dedicated page per AEO category — AI Crawlability included, on
          its own page with its own heading and spacing. */}
      {groupAeoChecksByCategory(aeoChecks).map((group) => {
        // Every FAILING check is a "thing" in the report — each gets its own
        // page so findings never flow mid-page into the next one. (react-pdf
        // only honors `break` on direct Page children, so each card is its
        // own Page.) The category heading + intro share one page, and the
        // compact informational cards (not-applicable / passed) pack at the
        // bottom of the last failing check's page.
        const failingChecks = group.checks
          .filter((c) => !c.passed && c.applicabilityStatus !== "not_applicable")
          .sort(
            (a, b) =>
              effectivePriorityWeight(b) - effectivePriorityWeight(a) ||
              Number(b.qualifiedPages !== undefined) - Number(a.qualifiedPages !== undefined)
          );
        return [
        failingChecks.slice(0, 6).map((check, checkIndex) => (
                <Page key={check.key} size={PAGE_SIZE} style={styles.page} wrap>
                {checkIndex === 0 && (
                  <>
                    <Text style={[styles.sectionHeading, { marginTop: 0 }]}>{group.category}</Text>
                    <Text style={styles.priorityNote}>
                      {(() => {
                        const na = group.checks.filter((c) => c.applicabilityStatus === "not_applicable").length;
                        const failing = group.checks.filter((c) => !c.passed && c.applicabilityStatus !== "not_applicable").length;
                        const total = group.checks.length;
                        if (failing === 0) {
                          return `All ${total} check${total === 1 ? "" : "s"} in this category are healthy.`;
                        }
                        return `${failing} of ${total} check${total === 1 ? "" : "s"} in this category need attention — priorities and impact are marked below${na > 0 ? `; ${na} check${na === 1 ? "" : "s"} are marked as not applicable to this website` : ""}.`;
                      })()}
                    </Text>
                  </>
                )}
                  <View style={styles.aeoCard}>
                    <View style={styles.aeoCardHead}>
                      <Text style={styles.aeoCardLabel}>{check.label}</Text>
                      <Text style={styles.checkCardStatus}>{check.statusText}</Text>
                    </View>
                  {!check.passed && (
                    <>
                      {/* Conditional schema checks always show their
                          "Valid for" applicability note, so a client can
                          tell whether the recommendation applies to their
                          type of website. */}
                      {check.applicability && (
                        <Text style={[styles.issueText, { marginTop: 2, marginBottom: 2 }]}>
                          <Text style={styles.issueLabelKey}>Applicability: </Text>
                          {check.applicability}
                        </Text>
                      )}
                      <View style={styles.aeoBadgeRow} wrap={false}>
                        <View style={styles.aeoBadgeItem}>
                          <Text style={styles.aeoBadgeCap}>Priority</Text>
                          <AeoBadge text={AEO_PRIORITY_LABEL[check.priority]} bg={AEO_PRIORITY_BG[check.priority]} fg={AEO_PRIORITY_COLOR[check.priority]} />
                        </View>
                        <View style={styles.aeoBadgeItem}>
                          <Text style={styles.aeoBadgeCap}>Effort</Text>
                          <AeoBadge text={AEO_DIFF_LABEL[check.difficulty]} bg={AEO_DIFF_BG[check.difficulty]} fg={AEO_DIFF_COLOR[check.difficulty]} />
                        </View>
                        <View style={styles.aeoBadgeItem}>
                          <Text style={styles.aeoBadgeCap}>Estimated time</Text>
                          <AeoBadge text={check.timeLabel} bg="#EEEEEE" fg="#555555" />
                        </View>
                      </View>
                      {/* Two-column consulting layout: impact framing on the
          left, the actionable fix + code on the right — uses the
          landscape width. Wrappable so long cards can break across
          pages instead of overflowing into the footer. */}
                      <View style={styles.landRow}>
                        <View style={styles.landCol}>
                          <View style={styles.businessImpactCallout}>
                            <Text style={styles.businessImpactCalloutLabel}>Business impact</Text>
                            <Text style={styles.businessImpactCalloutText}>{check.businessImpact}</Text>
                          </View>
                          <Text style={[styles.issueText, { marginBottom: 8 }]}>
                            <Text style={styles.issueLabelKey}>AI search impact: </Text>
                            {check.whyItMatters}
                          </Text>
                        </View>
                        <View style={styles.landColLast}>
                          <View style={styles.fixCallout}>
                            <Text style={styles.fixCalloutLabel}>Recommended fix</Text>
                            <Text style={styles.fixCalloutText}>{check.recommendedFix}</Text>
                          </View>
                          {/* Actionability fields (WHAT/WHY/WHERE/WHAT/HOW/VERIFY) */}
                          {check.implementationScope && (
                            <View style={{ marginTop: 4 }}>
                              <Text style={styles.issueText}><Text style={styles.issueLabelKey}>Where to apply: </Text>{check.implementationScope}</Text>
                            </View>
                          )}
                          {check.whatToImplement && (
                            <View style={{ marginTop: 2 }}>
                              <Text style={styles.issueText}><Text style={styles.issueLabelKey}>What to implement: </Text>{check.whatToImplement}</Text>
                            </View>
                          )}
                          {check.whereToImplement && (
                            <View style={{ marginTop: 2 }}>
                              <Text style={styles.issueText}><Text style={styles.issueLabelKey}>Where to implement: </Text>{check.whereToImplement}</Text>
                            </View>
                          )}
                          {check.implementationGuidance && (
                            <View style={{ marginTop: 2 }}>
                              <Text style={styles.issueText}><Text style={styles.issueLabelKey}>How to implement: </Text>{check.implementationGuidance}</Text>
                            </View>
                          )}
                          {check.verificationSteps && (
                            <View style={{ marginTop: 2 }}>
                              <Text style={styles.issueText}><Text style={styles.issueLabelKey}>How to verify: </Text>{check.verificationSteps}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* Impact bar moved outside the two-column layout so it
                          can break to a new page independently instead of
                          pushing the entire column past the page height. */}
                      <View style={styles.aeoImpactRow} wrap={false}>
                        <Text style={styles.aeoImpactLabel}>Expected SEO & AI impact</Text>
                        <AeoImpactBar impact={check.expectedImpact} />
                        <Text style={styles.aeoImpactValue}>{AEO_IMPACT_LABEL[check.expectedImpact]}</Text>
                      </View>
                    </>
                  )}
                  {/* Only snippets generated for THIS site (real domain/
                      entity name) are shown — generic placeholder code
                      ("Product Name", "yoursite.com", ...) is hidden so it
                      never reads as a ready-to-paste fix. */}
                  {!check.passed && check.codeSnippet && check.siteSpecificCode && (
                    <View style={{ marginTop: 12, marginBottom: 8 }}>
                      <Text style={styles.codeSnippetNote}>{IMPLEMENTATION_NOTE}</Text>
                      <View style={styles.codeSnippetBox}>
                        <Text style={styles.codeSnippetLabel} wrap={false}>{check.codeSnippet.label.toUpperCase()}</Text>
                        <Text style={styles.codeSnippetText}>{check.codeSnippet.code}</Text>
                      </View>
                    </View>
                  )}
                  {!check.passed && (
                    <>
                      {/* The URL list plus its CSV line stay together so a
                          list can never split with a lone CSV line stranded
                          on its own continuation page. */}
                      <View wrap={false}>
                      {check.affectedUrls.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          {/* The remainder + CSV reference always render when
                              the CSV is available — a page that lists URLs
                              must say where the complete list lives, even
                              when all of them are shown here. */}
                          <Text style={styles.reprLabel}>
                            {check.hasMoreAffectedUrls ? "Representative affected URLs" : "Affected URLs"}
                          </Text>
                          {check.affectedUrls.slice(0, 5).map((u, i) => (
                            <Text key={i} style={styles.instanceUrl}>{u}</Text>
                          ))}
                          {csvAvailable && (
                            <Text style={styles.moreInstancesNote}>
                              {check.hasMoreAffectedUrls
                                ? sampleRemainderText(check.affectedUrls.length, 5, "page")
                                : `All ${check.affectedUrls.length} affected page${check.affectedUrls.length === 1 ? "" : "s"} listed.`}{" "}
                              {"Complete list available in the "}
                              <Link src={`${options.reportUrl}&flag=${encodeURIComponent(check.key)}`} style={styles.csvLink}>
                                CSV export
                              </Link>
                              {"."}
                            </Text>
                          )}
                        </View>
                      )}
                      {check.hasMoreAffectedUrls && csvAvailable && (
                        <Text style={styles.csvDownloadLine}>
                          <Link src={`${options.reportUrl}&flag=${encodeURIComponent(check.key)}`} style={styles.csvLink}>
                            Download complete list of affected URLs
                          </Link>
                        </Text>
                      )}
                      </View>
                    </>
                  )}
                  </View>
                {/* Not-applicable + passed informational cards pack at the
                    bottom of the LAST failing check's page — compact, never
                    on their own sparse pages. */}
                {checkIndex === failingChecks.length - 1 && (
                <>
            {/* "Not applicable" schema checks — kept visible (the analysis
                isn't suppressed) but presented as neutral informational
                cards, never as failing priority items: no priority badge,
                no fix, no impact bar. */}
            {(() => {
              const na = group.checks.filter((c) => c.applicabilityStatus === "not_applicable");
              if (na.length === 0) return null;
              return (
                <View style={styles.checksGrid}>
                  {na.map((check) => (
                    <View key={check.key} style={[styles.aeoCard, { width: "48.5%", marginRight: "1.5%" }]}>
                      <View style={styles.aeoCardHead}>
                      <Text style={styles.aeoCardLabel}>{check.label}</Text>
                        <Text style={styles.checkCardNa}>Not applicable</Text>
                      </View>
                      <Text style={styles.checkCardStatus}>{check.statusText}</Text>
                      {check.applicability && (
                        <Text style={[styles.issueText, { marginTop: 2, marginBottom: 2 }]}>
                          <Text style={styles.issueLabelKey}>Applicability: </Text>
                          {check.applicability}
                        </Text>
                      )}
                      <Text style={[styles.issueText, { marginTop: 2, color: "#888888" }]}>
                        This is not a required fix for your website — it is shown only so you know the check was considered.
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })()}
            {/* Passed checks pack 2-across at the end of the category, so
                they fit into the last page instead of stranding on their
                own sparse continuation page. */}
            {(() => {
              const passed = group.checks.filter((c) => c.passed);
              if (passed.length === 0) return null;
              return (
                <View style={styles.checksGrid}>
                  {passed.map((check) => (
                    <View key={check.key} style={[styles.aeoCard, { width: "48.5%", marginRight: "1.5%" }]}>
                      <View style={styles.aeoCardHead}>
                      <Text style={styles.aeoCardLabel}>{check.label}</Text>
                        <Text style={styles.checkCardPass}>✓ Optimized</Text>
                      </View>
                      <Text style={styles.checkCardStatus}>{check.statusText}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}
                </>
                )}
                <Footer options={options} reportId={reportId} />
                </Page>
              )),
              // Overflow: compact summary page for checks beyond the per-page cap
              failingChecks.length > 6 && (
                <Page key={`${group.category}-overflow`} size={PAGE_SIZE} style={styles.page} wrap>
                  <Text style={[styles.sectionSubHeading, { marginTop: 0 }]}>Additional {group.category} Findings</Text>
                  <Text style={styles.priorityNote}>
                    {failingChecks.length - 6} more check{failingChecks.length - 6 === 1 ? "" : "s"} need attention — summary below. Full details for every check are in the CSV export.
                  </Text>
                  {failingChecks.slice(6).map((check) => (
                    <View key={check.key} style={[styles.aeoCard, { width: "48.5%", marginRight: "1.5%" }]}>
                      <View style={styles.aeoCardHead}>
                      <Text style={styles.aeoCardLabel}>{check.label}</Text>
                        <Text style={styles.checkCardFail}>
                          {check.affectedCount > 0 ? `${check.affectedCount} ${countUnitFor(check.affectedCount, check.countUnit ?? "pages")} affected` : "Action needed"}
                        </Text>
                      </View>
                      <Text style={styles.checkCardStatus}>{check.statusText}</Text>
                      <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
                        <AeoBadge text={AEO_PRIORITY_LABEL[check.priority]} bg={AEO_PRIORITY_BG[check.priority]} fg={AEO_PRIORITY_COLOR[check.priority]} />
                        <AeoBadge text={AEO_DIFF_LABEL[check.difficulty]} bg={AEO_DIFF_BG[check.difficulty]} fg={AEO_DIFF_COLOR[check.difficulty]} />
                        <AeoBadge text={check.timeLabel} bg="#EEEEEE" fg="#555555" />
                      </View>
                      {check.affectedUrls.length > 0 && csvAvailable && (
                        <Text style={[styles.moreInstancesNote, { marginTop: 4 }]}>
                          {check.affectedUrls.length} affected page{check.affectedUrls.length === 1 ? "" : "s"} — {" "}
                          <Link src={`${options.reportUrl}&flag=${encodeURIComponent(check.key)}`} style={styles.csvLink}>CSV export</Link>
                        </Text>
                      )}
                    </View>
                  ))}
                  <Footer options={options} reportId={reportId} />
                </Page>
              )
          ]
        })}

      {/* AI Citation Readiness — a dedicated trust/provenance assessment:
          the signals AI answer engines (and readers deciding whether to
          trust a citation) look for before citing a source. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>AI Citation Readiness</Text>
        <Text style={styles.priorityNote}>
          Whether this site is likely to be trusted and cited by AI systems. AI answer engines weigh provenance — who
          wrote it, who is behind it, whether it is current and verifiable — before referencing a source.
        </Text>
        {citationReadiness.score === null ? (
          <View style={styles.findingBox} wrap={false}>
            <Text style={styles.issueText}>
              This audit's crawl did not collect the signals needed for this assessment, so a score could not be
              computed. A fresh audit will evaluate every signal below.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.scoreBlock} wrap={false}>
              <Text style={[styles.scoreNumber, { fontSize: 30, color: scoreColor(citationReadiness.score) }]}>
                {clampScore(citationReadiness.score)}
              </Text>
              <View>
                <Text style={styles.scoreLabel}>Citation Readiness Score{"\n"}out of 100</Text>
                <Text style={{ fontSize: 8, color: "#888888", marginTop: 2 }}>
                  {citationReadiness.passCount} of {citationReadiness.measuredCount} trust & provenance signals present.
                </Text>
                <ScoreScaleGuide score={clampScore(citationReadiness.score)} />
              </View>
            </View>
            {citationReadiness.measuredCount < citationReadiness.checks.length && (
              <Text style={styles.priorityNote}>
                {citationReadiness.measuredCount} of {citationReadiness.checks.length} signals were evaluated in this
                audit. The signals marked &ldquo;Not evaluated&rdquo; require a fresh crawl to measure — they will be
                included on the next audit. The score above reflects only the signals this audit could assess.
              </Text>
            )}
            {/* Citation checks render 2-across in landscape — each card is a
                compact signal row, so the grid packs two per row instead of
                stranding the final check on its own page. */}
            <View style={styles.checksGrid}>
              {citationReadiness.checks.map((check) => (
                <View key={check.key} style={[styles.checkCard, { width: "48.5%", marginRight: "1.5%" }]} wrap={false}>
                  <View style={styles.checkCardHead}>
                    <Text style={styles.checkCardLabel}>{check.label}</Text>
                    {check.measured ? (
                      <Text style={check.passed ? styles.checkCardPass : styles.checkCardFail}>
                        {check.passed ? "PRESENT" : "MISSING"}
                      </Text>
                    ) : (
                      <Text style={styles.checkCardFail}>NOT EVALUATED</Text>
                    )}
                  </View>
                  <Text style={styles.checkCardStatus}>{check.statusText}</Text>
                  <Text style={styles.citCheckFinding}>Checked: {check.finding}</Text>
                  {check.measured && !check.passed && (
                    <Text style={[styles.issueText, { marginTop: 4 }]}>
                      <Text style={styles.issueLabelKey}>Recommended action: </Text>
                      {check.recommendation}
                    </Text>
                  )}
                  {check.applicability && (
                    <Text style={[styles.quickWinNote, { marginTop: 4 }]}>{check.applicability}</Text>
                  )}
                </View>
              ))}
            </View>
          </>
        )}
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* AI Visibility Opportunities — opportunity framing instead of only
          problems: concrete content formats that make this site more likely
          to be surfaced and cited by AI answer engines. */}
      {visibilityOpportunities.length > 0 && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          <Text style={[styles.sectionHeading, { marginTop: 0 }]}>AI Visibility Opportunities</Text>
          <Text style={styles.priorityNote}>
            Beyond fixing what's broken, these content formats make the site measurably more discoverable and citable
            in AI answer engines — each one is derived from this crawl's data, not generic advice.
          </Text>
          {visibilityOpportunities.map((opp) => (
            <View key={opp.key} style={styles.oppCard} wrap={false}>
              <Text style={styles.oppTitle}>{opp.title}</Text>
              {opp.applicability && <Text style={styles.quickWinNote}>{opp.applicability}</Text>}
              <Text style={styles.oppBenefit}>{opp.benefit}</Text>
              <Text style={styles.oppAction}>
                <Text style={styles.issueLabelKey}>What to do: </Text>
                {opp.action}
              </Text>
              {(OPPORTUNITY_UNLOCKS[opp.key] ?? []).length > 0 && (
                <View style={styles.oppUnlocks}>
                  <Text style={styles.oppUnlocksTitle}>What fixing this unlocks</Text>
                  {(OPPORTUNITY_UNLOCKS[opp.key] ?? []).map((u, i) => (
                    <View key={i} style={styles.oppUnlockRow} wrap={false}>
                      <Text style={styles.oppUnlockCheck}>✓</Text>
                      <Text style={styles.oppUnlockText}>{u}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.oppEvidence}>{opp.evidence}</Text>
              {opp.pages.length > 0 && (
                <View>
                  {opp.pages.slice(0, 4).map((u, i) => (
                    <Text key={i} style={styles.instanceUrl}>{u}</Text>
                  ))}
                  {opp.pageCount > 4 ? (
                    <Text style={styles.moreInstancesNote}>
                      {sampleRemainderText(opp.pages.length, 4, "page")}
                      {csvAvailable && (
                        <>
                          {" — full list available in the "}
                          <Link src={`${options.reportUrl}&flag=opportunity_${encodeURIComponent(opp.key)}`} style={styles.csvLink}>
                            CSV export
                          </Link>
                          {"."}
                        </>
                      )}
                    </Text>
                  ) : csvAvailable ? (
                    <Text style={styles.moreInstancesNote}>
                      {"Full list available in the "}
                      <Link src={`${options.reportUrl}&flag=opportunity_${encodeURIComponent(opp.key)}`} style={styles.csvLink}>
                        CSV export
                      </Link>
                      {"."}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          ))}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* Fix Roadmap — Fix First / Fix Next / Optimize: the client-facing
          "what to fix first" answer. Every item is a real finding from the
          SAME priority list + coverage evidence as Top Priority Fixes,
          with why-it-matters and the recommended action reused from the
          existing copy — nothing is invented. Bounded per tier so this
          stays a concise summary page; the full ranked list lives in Top
          Priority Fixes and every affected URL is in the CSV export.
          Each item is atomic (never splits mid-item); the Page wrap
          paginates naturally if a tier is long. */}
      {fixRoadmapItemCount > 0 && (
        <Page size={PAGE_SIZE} style={styles.page} wrap>
          <Text style={[styles.sectionHeading, { marginTop: 0 }]}>Fix Roadmap &mdash; What to Fix First</Text>
          <Text style={styles.priorityNote}>
            Every item below is a real finding from this audit, ranked by impact, reach, and effort. Fix First items
            can materially affect crawling, indexing, access to important content, or core user experience; Fix Next
            items are important but less urgent; Optimize items are lower-impact improvements. Each item is explained
            in full (why it matters, how to fix it, how to verify it) on its dedicated page earlier in this report,
            and the CSV export always contains the complete URL list for every finding.
          </Text>
          {FIX_TIER_ORDER.filter((t) => fixRoadmap[t].length > 0).map((tier) => {
            const items = fixRoadmap[tier];
            const shown = items.slice(0, FIX_ROADMAP_PDF_ITEMS_PER_TIER);
            return (
              <View key={tier} style={styles.roadmapTier}>
                <View style={styles.roadmapTierHead} wrap={false}>
                  <Text style={styles.roadmapTierTitle}>{FIX_TIER_META[tier].title}</Text>
                  <Text style={styles.roadmapTierBlurb}>{FIX_TIER_META[tier].blurb}</Text>
                </View>
                {shown.map((item) => (
                  <View key={item.key} style={styles.roadmapItem} wrap={false}>
                    <View style={styles.roadmapItemHead} wrap={false}>
                      <Text style={styles.roadmapItemLabel}>
                        {item.label}
                        {item.templateLevel ? " (template-level fix)" : ""}
                      </Text>
                      <Text style={styles.roadmapItemCount}>
                        {item.count} {countUnitFor(item.count, item.countUnit)}
                      </Text>
                    </View>
                    <Text style={styles.issueText}>
                      <Text style={styles.issueLabelKey}>Why: </Text>
                      {item.whyItMatters}
                    </Text>
                    <Text style={[styles.issueText, { marginBottom: businessImpactForKey(item.key) ? 4 : 6 }]}>
                      <Text style={styles.issueLabelKey}>Action: </Text>
                      {item.recommendation}
                    </Text>
                    {businessImpactForKey(item.key) && (
                      <Text style={[styles.issueText, { marginBottom: 6, fontSize: 8, color: '#1a7f5a', fontStyle: 'italic' }]}>
                        Business impact: {businessImpactForKey(item.key)}
                      </Text>
                    )}
                    {(() => {
                      if (!estimatedImpact.hasEstimates) return null;
                      const matching = estimatedImpact.estimates.find((e) => e.applicableFlags.includes(item.key));
                      if (!matching) return null;
                      return (
                        <View style={[styles.estimatedImpactBox, { marginTop: 4, marginBottom: 6 }]} wrap={false}>
                          <Text style={styles.estimatedImpactLabel}>Potential Business Impact</Text>
                          <Text style={[styles.estimatedImpactText, { fontSize: 8, color: '#555', marginBottom: 2 }]}>Observed: {matching.observedData}</Text>
                          <Text style={[styles.estimatedImpactText, { fontSize: 8, color: '#555', marginBottom: 2 }]}>Scenario: {matching.scenarioAssumption}</Text>
                          {matching.additionalClicks !== null && matching.additionalClicks > 0 && (
                            <Text style={[styles.estimatedImpactText, { fontSize: 8.5, marginBottom: 1, fontFamily: 'Helvetica-Bold', color: '#1a7f5a' }]}>+{formatClickCount(matching.additionalClicks)} clicks/mo</Text>
                          )}
                          {matching.additionalConversions !== null && matching.additionalConversions > 0 && (
                            <Text style={[styles.estimatedImpactText, { fontSize: 8.5, marginBottom: 1 }]}>+{formatConversionCount(matching.additionalConversions)} conversions/mo</Text>
                          )}
                          {matching.revenueOpportunity !== null && matching.revenueOpportunity > 0 && (
                            <Text style={[styles.estimatedImpactText, { fontSize: 8.5 }]}>+{formatDollarAmount(matching.revenueOpportunity)} revenue/mo</Text>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                ))}
                {items.length > shown.length && (
                  <Text style={styles.moreInstancesNote}>
                    + {items.length - shown.length} more &mdash; full ranked list in Top Priority Fixes
                  </Text>
                )}
              </View>
            );
          })}
          <Footer options={options} reportId={reportId} />
        </Page>
      )}

      {/* 30-Day Action Plan — a deliberate strategic roadmap with its own
          dedicated template: an overview page (plan at a glance), then one
          page per pair of phases, each phase an atomic card (head + tasks +
          expected outcome) that never splits, and a final-priorities panel
          closing the last phase page. Pagination is explicit — no phase is
          ever orphaned from its tasks and no page inherits random breaks
          from the rest of the report. */}
      {options.includeActionPlan !== false && actionPlan.length > 0 && (
        <>
          {/* ACTION PLAN OVERVIEW (Template A — section intro) */}
          <Page size={PAGE_SIZE} style={styles.page} wrap>
            <Text style={[styles.sectionHeading, { marginTop: 0 }]}>30-Day Action Plan</Text>
            <Text style={styles.priorityNote}>
              A suggested sequence based on impact and effort — not a guaranteed timeline. Every item here is detailed
              on its dedicated page (why it matters, how to fix it, how to verify it), so this roadmap only sequences
              the work. Work through the phases in order: each one is arranged so the highest-impact, lowest-effort
              fixes come first.
            </Text>
            <Text style={styles.planCapacityNote}>
              Based on a single person working full-time. Adjust for your team&rsquo;s capacity. Effort buckets estimate
              direct active editing time per element, excluding staging, testing, and deployment workflows.
            </Text>
            <View style={styles.planGlance} wrap={false}>
              <Text style={styles.planGlanceTitle}>The plan at a glance</Text>
              {actionPlan.map((phase) => (
                <View key={phase.weekNumber} style={styles.planGlanceRow} wrap={false}>
                  <Text style={styles.planGlancePhase}>Phase {phase.weekNumber}</Text>
                  <Text style={styles.planGlanceDays}>{phase.days}</Text>
                  <Text style={styles.planGlanceFocus}>{phase.focus}</Text>
                  <Text style={styles.planGlanceCount}>
                    {phase.issues.length} task{phase.issues.length === 1 ? "" : "s"}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.infoCallout} wrap={false}>
              <Text style={styles.infoCalloutTitle}>How to use this plan</Text>
              <Text style={styles.infoCalloutText}>
                Each phase is a logical group of fixes with a shared objective — complete the tasks inside it, verify
                them with the tools listed on each issue's page, then move to the next phase. When every phase is
                done, run the follow-up audit to confirm the improvements and catch anything new.
              </Text>
            </View>
            {/* Investment & Expected Return — an honest ROI summary: the
                effort shape of the work is real audit data, but monetary ROI
                is NOT fabricated. The box states exactly what is measured
                (findings, quick wins, effort mix, AI improvements) and what
                would be needed to calculate a real return figure. */}
            <View style={styles.roiBox} wrap={false}>
              <Text style={styles.roiTitle}>Investment & Expected Return</Text>
              <View style={styles.roiRow}>
                <Text style={styles.roiLabel}>Actionable findings</Text>
                <Text style={styles.roiValue}>{priorityList.length}</Text>
              </View>
              <View style={styles.roiRow}>
                <Text style={styles.roiLabel}>Quick wins (each under 30 minutes)</Text>
                <Text style={styles.roiValue}>{quickWins.length}</Text>
              </View>
              <View style={styles.roiRow}>
                <Text style={styles.roiLabel}>AI-readiness improvements identified</Text>
                <Text style={styles.roiValue}>{aeoFailingChecks.length}</Text>
              </View>
              <View style={styles.roiRow}>
                <Text style={styles.roiLabel}>Total estimated effort mix</Text>
                <Text style={[styles.roiValue, { fontSize: 9 }]}>{effortMixText}</Text>
              </View>
              <Text style={styles.roiAssumptions}>
                Effort estimates reflect direct active editing time per element, excluding staging, testing, and
                deployment workflows. Priority order (impact × reach ÷ effort) is the best sequence to follow — not
                effort alone.
              </Text>
              <View style={styles.roiHedge} wrap={false}>
                <Text style={styles.roiHedgeText}>
                  Monetary ROI cannot be reliably quantified from crawl data alone — it depends on the site's actual
                  traffic, conversion rates, and revenue per visit. Directional return: every finding lists its expected
                  SEO & AI impact, and the follow-up audit measures the score actually achieved.
                </Text>
              </View>
              <Text style={styles.roiDisclaimer}>
                DIRECTIONAL ESTIMATE — ACTUAL RESULTS MAY VARY. Figures above derive from this audit's findings, not
                financial projections. To calculate a concrete ROI, provide traffic, conversion, and revenue data.
              </Text>
            </View>
            <Footer options={options} reportId={reportId} />
          </Page>

          {/* One page per pair of phases; the last page closes with Final
              Priorities. Each pair is atomic (wrap={false}) so the two phase
              cards always sit side by side and never split mid-row. */}
          {chunkPairs(actionPlan).map((pair, rowIdx) => (
            <Page key={rowIdx} size={PAGE_SIZE} style={styles.page} wrap>
              <View style={styles.landRow} wrap={false}>
                {pair.map((phase, colIdx) => (
                  <View key={phase.weekNumber} style={colIdx === pair.length - 1 ? styles.landColLast : styles.landCol}>
                    <PlanPhaseCard phase={phase} />
                  </View>
                ))}
              </View>
              {rowIdx === chunkPairs(actionPlan).length - 1 && (
                <PlanFinalPriorities priorityList={priorityList} quickWins={quickWins} />
              )}
              <Footer options={options} reportId={reportId} />
            </Page>
          ))}
        </>
      )}
      {/* SEO Success Checklist — a professional completion checklist of
          everything to finish after implementing this audit, before the
          follow-up audit is run. */}
      <Page size={PAGE_SIZE} style={styles.page} wrap>
        <Text style={[styles.sectionHeading, { marginTop: 0 }]}>SEO Success Checklist</Text>
        <Text style={styles.priorityNote}>
          Once the applicable items below have been completed and verified, the major prioritized issues identified in
          this audit should be resolved.
        </Text>
        <Text style={styles.priorityNote}>
          Fix instructions, affected pages, and verification steps for each item live on its dedicated page earlier in
          this report — this checklist is the completion record, not a repeat of the guidance.
        </Text>
        {(() => {
          const critical = priorityList.filter((i) => i.severity === "critical").slice(0, 5);
          const high = priorityList.filter((i) => i.severity !== "critical").slice(0, 7);
          return (
            <>
              {critical.length > 0 && (
                <>
                  {/* Grouped by SEVERITY (not priority order) — the label
                      says so explicitly so the checklist can't be read as
                      a fix-first ranking. */}
                  <Text style={styles.successGroupLabel}>Critical-severity fixes</Text>
                  {critical.map((issue) => (
                    <View key={issue.key} style={styles.successItemRow} wrap={false}>
                      <View style={styles.successCheck} />
                      <Text style={styles.successItemText}>
                        <Text style={{ fontFamily: "Helvetica-Bold" }}>{issue.label}</Text>
                        {" "}resolved across {issue.count} {countUnitFor(issue.count, issue.countUnit)}
                        {issue.affectedPages
                          ? ` · ${issue.affectedPages} page${issue.affectedPages === 1 ? "" : "s"}`
                          : ""}
                      </Text>
                    </View>
                  ))}
                </>
              )}
              {high.length > 0 && (
                <>
                  <Text style={styles.successGroupLabel}>Moderate & minor fixes</Text>
                  {high.map((issue) => (
                    <View key={issue.key} style={styles.successItemRow} wrap={false}>
                      <View style={styles.successCheck} />
                      <Text style={styles.successItemText}>
                        <Text style={{ fontFamily: "Helvetica-Bold" }}>{issue.label}</Text>
                        {" "}resolved across {issue.count} {countUnitFor(issue.count, issue.countUnit)}
                        {issue.affectedPages
                          ? ` · ${issue.affectedPages} page${issue.affectedPages === 1 ? "" : "s"}`
                          : ""}
                      </Text>
                    </View>
                  ))}
                </>
              )}
              {quickWins.length > 0 && (
                <>
                  <Text style={styles.successGroupLabel}>Quick wins</Text>
                  <View style={styles.successItemRow} wrap={false}>
                    <View style={styles.successCheck} />
                    <Text style={styles.successItemText}>
                      All {quickWins.length} quick win{quickWins.length === 1 ? "" : "s"} implemented
                    </Text>
                  </View>
                </>
              )}
              <Text style={styles.successGroupLabel}>Verification & follow-up</Text>
              <View style={styles.successItemRow} wrap={false}>
                <View style={styles.successCheck} />
                <Text style={styles.successItemText}>Sitemap submitted and up to date in Google Search Console</Text>
              </View>
              <View style={styles.successItemRow} wrap={false}>
                <View style={styles.successCheck} />
                <Text style={styles.successItemText}>Key pages re-indexed (URL Inspection in Search Console)</Text>
              </View>
              <View style={styles.successItemRow} wrap={false}>
                <View style={styles.successCheck} />
                <Text style={styles.successItemText}>Fix verification completed with the tools listed on each issue page</Text>
              </View>
              <View style={styles.successItemRow} wrap={false}>
                <View style={styles.successCheck} />
                <Text style={styles.successItemText}>Follow-up audit run within 30 days to confirm the improvements</Text>
              </View>
            </>
          );
        })()}
        <Footer options={options} reportId={reportId} />
      </Page>

      {/* Closing page — vertically centered composition, content bounded so
          it always clears the footer-safe zone (never wraps/clips). */}
      <Page size={PAGE_SIZE} style={[styles.page, { justifyContent: "center" }]}>
        <Text style={styles.closingTitle}>Audit Complete</Text>
        <Text style={styles.closingText}>
          This audit identified the highest-impact technical and on-page SEO issues affecting{" "}
          {organizationName !== domain ? `${organizationName}'s website (${domain})` : "your website"}, and every
          recommendation in this report is tied to a specific finding from the crawl.
        </Text>

        <View style={styles.nextStepsBox} wrap={false}>
          <Text style={styles.nextStepsTitle}>Next Steps</Text>
          <View style={styles.nextStepsRow} wrap={false}>
            <Text style={styles.nextStepsNum}>1</Text>
            <Text style={styles.nextStepsText}>
              Implement the top-priority fixes — the Top Priority Fixes and Issues by Type sections list exactly what
              to do, in order.
            </Text>
          </View>
          <View style={styles.nextStepsRow} wrap={false}>
            <Text style={styles.nextStepsNum}>2</Text>
            <Text style={styles.nextStepsText}>
              Validate the changes — every finding page includes issue-specific verification steps and tools.
            </Text>
          </View>
          <View style={styles.nextStepsRow} wrap={false}>
            <Text style={styles.nextStepsNum}>3</Text>
            <Text style={styles.nextStepsText}>
              Run a follow-up audit in 30 days ({nextAuditDateLabel}) to measure the improvement and catch anything new.
            </Text>
          </View>
          <View style={styles.nextStepsRow} wrap={false}>
            <Text style={styles.nextStepsNum}>4</Text>
            <Text style={styles.nextStepsText}>
              Book implementation or strategy support if you want hands-on help applying these fixes.
            </Text>
          </View>
        </View>

        <View style={styles.projectionBox} wrap={false}>
          <Text style={styles.projectionTitle}>Improvement Potential</Text>
          <View style={styles.projectionRow}>
            <Text style={styles.projectionLabel}>Current SEO Score</Text>
            <Text style={styles.projectionValue}>{currentScore}</Text>
          </View>
          <View style={styles.projectionRow}>
            <Text style={styles.projectionLabel}>Quick Wins</Text>
            <Text style={styles.projectionValue}>{improvementPotential.quickWins}</Text>
          </View>
          <View style={styles.projectionRow}>
            <Text style={styles.projectionLabel}>Full Implementation</Text>
            <Text style={styles.projectionValue}>{improvementPotential.fullImplementation}</Text>
          </View>
          <Text style={styles.projectionHedge}>
            These are estimates of improvement potential, not a guarantee of a specific score — actual results depend
            on implementation quality and future website changes.
          </Text>
          <Text style={styles.projectionDisclaimer}>
            Improvement potential is derived from the impact ratings in the Top Priority Fixes section. A follow-up
            audit is the only way to measure the score actually achieved.
          </Text>
        </View>

        <Text style={styles.closingMeta}>
          Report generated: {date}{options.whiteLabel ? "" : ` · Report ID: ${reportId}`}
        </Text>
        <Text style={styles.closingMeta}>Recommended next audit: {nextAuditDateLabel}</Text>
        {!options.whiteLabel && <Text style={styles.closingMeta}>seoaudit.ai · support@seoaudit.ai</Text>}
        <Footer options={options} reportId={reportId} />
      </Page>
    </Document>
  );
}

function Footer({ options, reportId }: { options: ReportOptions; reportId: string }) {
  // `fixed` is required for any element that should repeat on every
  // physical page produced by an auto-paginating <Page wrap> — without
  // it, an element placed once in the JSX tree only renders on whichever
  // single physical page it happens to land on, not on every page the
  // content overflows into.
  const branding = options.agencyBranding;
  if (options.whiteLabel || branding) {
    const name = branding?.agencyName || options.brandName;
    if (branding?.logo || name) {
      const logo = branding?.logo ? fitLogoWithin(branding.logo.width, branding.logo.height, 150, 26) : null;
      return (
        <View style={styles.footerBranded} fixed>
          <View style={styles.footerBrandLeft}>
            {logo && branding?.logo ? (
              <Image src={branding.logo.dataUrl} style={{ width: logo.w, height: logo.h, marginRight: 8 }} />
            ) : null}
            {name ? <Text style={styles.footerBrandName}>{name}</Text> : null}
          </View>
          <Text style={styles.footerPowered}>Powered by Rohan SEO</Text>
        </View>
      );
    }
    return null;
  }
  return <Text style={styles.footer} fixed>Prepared by SEOAudit AI  ·  seoaudit.ai  ·  support@seoaudit.ai  ·  Report {reportId}  ·  v1.4</Text>;
}

interface StructuredInfo {
  severity: "Informational" | "Attention";
  finding: string;
  recommendation: string;
  expectedLocation: string;
}

function robotsInfoCard(info: { status: "found" | "not_found" | "fetch_error"; disallowedPaths: string[] } | undefined): StructuredInfo {
  if (!info || info.status === "not_found") {
    return {
      severity: "Informational",
      finding: "No robots.txt found.",
      recommendation:
        "Not required — the site is fully crawlable by default without one. Adding a robots.txt still has value: it gives you explicit control over what search engines crawl, and is the standard place to point crawlers to your sitemap.",
      expectedLocation: "yourdomain.com/robots.txt",
    };
  }
  if (info.status === "fetch_error") {
    return {
      severity: "Informational",
      finding: "Couldn't check robots.txt during this audit (network error).",
      recommendation: "Verify manually that the file loads and returns a 200 status, then re-run the audit.",
      expectedLocation: "yourdomain.com/robots.txt",
    };
  }
  if (info.disallowedPaths.length === 0) {
    return {
      severity: "Informational",
      finding: "Found, with no disallowed paths.",
      recommendation: "No action needed — every path on the site is currently crawlable.",
      expectedLocation: "yourdomain.com/robots.txt",
    };
  }
  return {
    severity: "Informational",
    finding: `Found — ${info.disallowedPaths.length} disallowed path${info.disallowedPaths.length === 1 ? "" : "s"}: ${info.disallowedPaths.join(", ")}`,
    recommendation: "Confirm none of these paths are unintentionally blocking pages you actually want indexed (a common mistake is a leftover staging-site rule left in place after launch).",
    expectedLocation: "yourdomain.com/robots.txt",
  };
}

function sitemapInfoCard(info: { status: "found" | "not_found" | "invalid" | "fetch_error"; urlCount: number } | undefined): StructuredInfo {
  if (!info || info.status === "not_found") {
    return {
      severity: "Attention",
      finding: "No sitemap.xml found.",
      recommendation:
        "Generate a sitemap listing your important URLs and host it at the location below — most CMS platforms (WordPress, Shopify, Webflow — can do this via a plugin or built-in setting), publish it at yourdomain.com/sitemap.xml, and submit it in Google Search Console.",
      expectedLocation: "yourdomain.com/sitemap.xml",
    };
  }
  if (info.status === "invalid") {
    return {
      severity: "Attention",
      finding: "A sitemap.xml file exists, but it couldn't be parsed.",
      recommendation: "Validate the file's XML structure — a malformed sitemap is effectively the same as having none, since search engines can't read it.",
      expectedLocation: "yourdomain.com/sitemap.xml",
    };
  }
  if (info.status === "fetch_error") {
    return {
      severity: "Informational",
      finding: "Couldn't check sitemap.xml during this audit (network error).",
      recommendation: "Verify manually that the file loads and returns a 200 status, then re-run the audit.",
      expectedLocation: "yourdomain.com/sitemap.xml",
    };
  }
  return {
    severity: "Informational",
    finding: `Found — ${info.urlCount} URL${info.urlCount === 1 ? "" : "s"} listed.`,
    recommendation: "No action needed — keep it updated as pages are added or removed.",
    expectedLocation: "yourdomain.com/sitemap.xml",
  };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

