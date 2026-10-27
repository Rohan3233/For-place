import { groupBrokenLinksByCategory } from "@/lib/crawler/brokenLinks";
import AgencyDownloadButton from "./AgencyDownloadButton";
import AgencyBrandingPanel from "./AgencyBrandingPanel";
import { deriveAuditTier } from "@/lib/tier"; // top of file
import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import type {
  RunAuditResult,
  PageExplanationResult,
  CrawlPageSuccess,
} from "@/lib/crawler/types";
import { formatMs, formatCls } from "@/lib/crawler/webVitals";
import { resolveCoreWebVitals } from "@/lib/crawler/coreWebVitals";
import {
  groupExplanationsByIssue,
  splitGroupedIssuesByCategory,
  mergeUrlSeoFindings,
  buildCwvGroupedIssues,
  buildCwvReportBlocks,
  URL_SEO_FLAGS,
} from "@/lib/crawler/groupIssues";
import { humanReadableUrl } from "@/lib/crawler/urlSeo";
import { buildNonDescriptiveImageFindings, type NonDescriptiveImageFinding } from "@/lib/crawler/imageFilename";
import {
  buildPriorityList,
  buildQuickWins,
  buildTopQuickActions,
  countUnitFor,
} from "@/lib/crawler/priorityIssues";
import { buildPieSlices, SEVERITY_COLORS, buildRadarChart } from "@/lib/crawler/chartMath";
import { suggestSchemaType, suggestSchemaTypeWithReason } from "@/lib/crawler/schemaSuggestions";
import {
  DUPLICATE_TITLES_COPY,
  DUPLICATE_META_DESCRIPTIONS_COPY,
  MISSING_SCHEMA_COPY,
  PRESENT_SCHEMA_COPY,
} from "@/lib/crawler/auxiliaryIssueCopy";
import { buildBrokenLinksSmartNote, buildOversizedImagesSmartNote } from "@/lib/crawler/smartRecommendations";
import { buildActionPlan } from "@/lib/crawler/actionPlan";
import { buildWhatsWorking, WHATS_WORKING_FALLBACK } from "@/lib/crawler/whatsWorking";
import { getScoreVerdict, getAiReadinessVerdict } from "@/lib/crawler/scoreVerdict";
import { buildCategoryScores } from "@/lib/crawler/categoryScores";
import { buildExecutiveSummaryText } from "@/lib/crawler/executiveSummary";
import { buildIssueDistribution, countDistinctAffectedPages } from "@/lib/crawler/issueDistribution";
import { getCrawlScopeCounts } from "@/lib/crawler/crawlScope";
import { formatDuration, totalRuntimeMs } from "@/lib/crawler/duration";
import { truncateToWordLimit } from "@/lib/crawler/textTruncate";
import {
  buildIndexabilityChecks,
  buildIndexabilityDetailGroups,
  INDEXABILITY_CHECK_FLAGS,
} from "@/lib/crawler/indexabilityChecks";
import { buildSitemapGuidance } from "@/lib/crawler/sitemapGuidance";
import { analyzeRedirectChains } from "@/lib/crawler/redirectChainAnalysis";
import { buildResponseCodeBreakdown } from "@/lib/crawler/responseCodeBreakdown";
import { buildRedirectChainSummary } from "@/lib/crawler/redirectChainSummary";
import { buildRobotsBlockedLinks } from "@/lib/crawler/robotsBlockedLinks";
import {
  buildSeoCheckCoverage,
  summarizeSeoCheckCoverage,
  COVERAGE_URLS_INLINE_LIMIT,
  type CoverageCheck,
} from "@/lib/crawler/seoCheckCoverage";
import {
  buildFixRoadmap,
  FIX_TIER_META,
  FIX_TIER_ORDER,
  countFixRoadmapItems,
  type FixRoadmapItem,
} from "@/lib/crawler/fixRoadmap";
import { buildBusinessImpactSummary } from "@/lib/crawler/businessImpactEstimate";
import { IMPLEMENTATION_NOTE } from "@/lib/crawler/codeSnippets";
import {
  buildEstimatedBusinessImpact,
  formatDollarAmount,
  formatClickCount,
  formatConversionCount,
  formatImpressionCount,
  formatCtr,
} from "@/lib/crawler/estimatedBusinessImpact";
import { teamQuestionsForFlag } from "@/lib/crawler/teamQuestions";
import {
  groupAeoChecksByCategory,
  buildAiReadinessDimensions,
  deriveAiReadinessSummary,
  withAeoMetaDefaults,
  rankAeoChecks,
} from "@/lib/crawler/aeoTypes";
import { buildCitationReadiness, buildAiQuickWins } from "@/lib/crawler/aeoReport";
import type { AiQuickWin } from "@/lib/crawler/aeoReport";
import { splitBrokenLinks, brokenLinkScopeLabel, countBrokenLinkSourcePages, isCloudflareEmailObfuscation, genuineBrokenLinks } from "@/lib/crawler/brokenLinkClassification";
import { describeStatusCode } from "@/lib/crawler/statusCodeLabels";
import { buildMoreAffectedCopy } from "@/lib/crawler/affectedUrlCopy";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

// Item #4: one concise sentence per category explaining what feeds its
// score. Keyed the same way as buildCategoryScores' category keys. A key
// outside this known set still renders, with a neutral fallback sentence.
const CATEGORY_EXPLANATION: Record<string, string> = {
  onPage: "Title tags, meta descriptions, headings, word count, thin content, internal links, and image optimization.",
  technical: "Canonicals, noindex, robots.txt, sitemaps, broken links, redirects, URL structure, Core Web Vitals, and crawl health.",
  aiSearchReadiness: "JSON-LD schema coverage and structured data validity — this pillar score is separate from the full AI Readiness Score (AEO/GEO) shown in the AI Search Readiness section, which evaluates 47+ checks across entity clarity, content structure, and citation readiness.",
  performance: "Core Web Vitals (LCP, INP, CLS, TTFB) and page-load speed.",
  metadata: "Title tags, meta descriptions, Open Graph tags, and duplicate metadata.",
  content: "Thin content, duplicate content, headings, and internal linking.",
};
const DEFAULT_CATEGORY_EXPLANATION = "Weighted from the issues detected in this category during the crawl.";

function describeLinkFailure(link: { errorMessage: string | null; statusCode: number | null }): string {
  if (link.errorMessage) return link.errorMessage;
  if (link.statusCode !== null) return describeStatusCode(link.statusCode);
  return "Failed";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

function buildVitalScale(value: number, thresholds: { good: number; poor: number }, max: number) {
  const segments = [
    { widthPct: (thresholds.good / max) * 100, color: "#1F9D55" },
    { widthPct: ((thresholds.poor - thresholds.good) / max) * 100, color: "#D98A1A" },
    { widthPct: ((max - thresholds.poor) / max) * 100, color: "#D9432E" },
  ];
  const markerPct = Math.min((value / max) * 100, 100);
  return { segments, markerPct };
}

function impactBadgeText(priority: { impactLabel: string }): string {
  return priority.impactLabel;
}

/** Impact-bar color for the priority table — mirrors the PDF's severity
 * palette (high red / medium amber / low green) by impact stars. */
function webImpactColor(stars: number): string {
  if (stars >= 4) return "#D9432E";
  if (stars >= 3) return "#D98A1A";
  return "#1F9D55";
}

/**
 * Maps issue keys to concise business-impact statements (PDF mirror).
 * Only included for issues where there's a clear, defensible connection
 * between the fix and a business outcome.
 */
function businessImpactForKey(key: string): string | null {
  if (["noindex_meta_tag", "noindex_x_robots_tag", "missing_canonical", "canonical_mismatch"].includes(key)) {
    return "Resolving indexation issues can increase the number of eligible pages available to search engines, creating more opportunities for organic traffic.";
  }
  if (key === "broken_links") {
    return "Fixing broken links improves crawl efficiency and user experience, helping search engines access your content and reducing visitor frustration.";
  }
  if (key === "redirect_chains") {
    return "Eliminating redirect chains speeds up page delivery and improves crawl efficiency, which can help search engines process more pages within their crawl budget.";
  }
  if (["missing_title", "duplicate_title", "missing_meta_description", "duplicate_meta_description", "thin_title_tag"].includes(key)) {
    return "Stronger search-result presentation can improve click-through rates from existing search impressions, capturing more qualified traffic.";
  }
  if (["missing_h1", "multiple_h1", "heading_hierarchy", "duplicate_h1"].includes(key)) {
    return "Clear heading structure helps search engines understand content hierarchy, supporting better content comprehension and ranking potential.";
  }
  if (["thin_content", "low_word_count", "duplicate_content"].includes(key)) {
    return "Richer, more comprehensive content increases the likelihood of ranking for relevant queries and provides more value to visitors, improving engagement.";
  }
  if (["oversized_images", "missing_alt_text", "non_descriptive_filenames"].includes(key)) {
    return "Optimized images improve page performance, accessibility, and the likelihood of appearing in image search results, driving additional qualified traffic.";
  }
  if (["poor_core_web_vitals", "slow_page_speed", "large_page_size"].includes(key)) {
    return "Improving page experience can reduce bounce rates and improve engagement metrics, which supports both user satisfaction and search performance.";
  }
  if (["orphan_page", "low_internal_links"].includes(key)) {
    return "Stronger internal linking helps search engines discover and understand your content, distributing authority more effectively across your pages.";
  }
  if (["missing_sitemap", "broken_sitemap"].includes(key)) {
    return "A complete sitemap helps search engines discover and index your pages more efficiently, particularly for larger sites or new content.";
  }
  if (["robots_txt_issues", "blocked_resources"].includes(key)) {
    return "Proper robots.txt configuration ensures search engines can access and render your pages correctly, preventing indexing issues.";
  }
  if (["missing_schema_markup", "invalid_schema_markup", "missing_org_schema", "missing_faq_schema", "missing_breadcrumb_schema"].includes(key)) {
    return "Structured data enables rich results in search and makes your content more discoverable in AI-generated answers, increasing visibility across search surfaces.";
  }
  return null;
}

function IssueGroupList({
  groups,
  emptyTitle,
  emptyText,
  priorityList,
  nonDescriptiveImageFindings = [],
  estimatedImpact,
}: {
  groups: ReturnType<typeof groupExplanationsByIssue>;
  emptyTitle: string;
  emptyText: string;
  priorityList: ReturnType<typeof buildPriorityList>;
  nonDescriptiveImageFindings?: NonDescriptiveImageFinding[];
  estimatedImpact?: import("@/lib/crawler/estimatedBusinessImpact").EstimatedBusinessImpactResult;
}) {
  // Template-level issues (affecting >80% of crawled pages) get a distinct
  // header + emphasis line so 40+ affected pages read as one shared-layout
  // fix rather than 40 separate tasks. Driven by the same templateLevel flag
  // the PDF uses, so both surfaces always agree.
  const templateBanner = (group: (typeof groups)[number], priority: ReturnType<typeof buildPriorityList>[number] | undefined) =>
    priority?.templateLevel ? (
      <div className="sa-template-banner">
        <p className="sa-template-banner-title">Template-Level Fix (Resolves {group.instances.length} page{group.instances.length === 1 ? "" : "s"})</p>
        <p className="sa-template-banner-text">
          This issue originates from a shared layout or header/footer template. Updating the template file once will resolve it site-wide.
        </p>
      </div>
    ) : null;
  if (groups.length === 0) {
    return (
      <div className="sa-empty sa-empty-pass">
        <p className="sa-empty-title">{emptyTitle}</p>
        <p className="sa-empty-text">{emptyText}</p>
      </div>
    );
  }
  return (
    <>
      {groups.map((group) => {
        const priority = priorityList.find((p) => p.key === group.flag);
        return (
          <div key={group.flag} className="sa-issue-group">
            <div className="sa-issue-group-head">
              <p className="sa-issue-title">{group.issueLabel}</p>
              <span className="sa-issue-count">{group.instances.length} page{group.instances.length === 1 ? "" : "s"}</span>
            </div>
            {templateBanner(group, priority)}
            {priority && (
              <p className="sa-impact-badge">
                {impactBadgeText(priority)} · {priority.effortBucketLabel}
              </p>
            )}
            {priority?.estimateRationale && (
              <p className="sa-estimate-rationale">{priority.estimateRationale}</p>
            )}
            <p className="sa-issue-why">{group.whyItMatters}</p>
            <p className="sa-issue-impact">{group.businessImpact}</p>
            {group.flag === 'missing_h1' && group.instances.some((inst) => inst.potentialVisualHeading) && (
              <div style={{ marginTop: 6, padding: '8px 10px', backgroundColor: '#FFF8E1', borderLeft: '3px solid #F9A825', borderRadius: 4 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#F57F17', margin: 0, marginBottom: 4 }}>
                  Visual heading context
                </p>
                <p style={{ fontSize: 11, color: '#555', margin: 0, lineHeight: 1.5 }}>
                  Some pages may have a prominent image near the top of the main content that visually functions as the page's heading, but it is not marked up as a semantic H1. Adding a real &lt;h1&gt; element is still recommended for search engines and screen readers.
                </p>
              </div>
            )}
            {/* Per-recommendation estimated traffic & conversion impact — only when data exists */}
            {(() => {
              if (!estimatedImpact || !estimatedImpact.hasEstimates) return null;
              const matching = estimatedImpact.estimates.find((e) => e.applicableFlags.includes(group.flag));
              if (!matching) return null;
              return (
                <div style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  backgroundColor: '#F0F8F0',
                  borderLeft: '3px solid #1F9D55',
                  borderRadius: 4,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#1F9D55', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
                      Potential Business Impact
                    </p>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 3,
                      backgroundColor: matching.confidence === 'High' ? '#E7F6ED' : matching.confidence === 'Medium' ? '#FBF0DF' : '#FBE9E6',
                      color: matching.confidence === 'High' ? '#1F9D55' : matching.confidence === 'Medium' ? '#B25E09' : '#D9432E',
                    }}>
                      {matching.confidence} confidence
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#555', marginBottom: 2 }}><strong>Observed:</strong> {matching.observedData}</p>
                  <p style={{ fontSize: 11, color: '#555', marginBottom: 2 }}><strong>Source:</strong> {matching.source}</p>
                  <p style={{ fontSize: 11, color: '#555', marginBottom: 8 }}><strong>Scenario:</strong> {matching.scenarioAssumption}</p>
                  {matching.additionalClicks !== null && matching.additionalClicks > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: '#333' }}>Estimated additional clicks</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1F9D55' }}>+{formatClickCount(matching.additionalClicks)}/mo</span>
                    </div>
                  )}
                  {matching.additionalConversions !== null && matching.additionalConversions > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: '#333' }}>Estimated additional conversions</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1F9D55' }}>+{formatConversionCount(matching.additionalConversions)}/mo</span>
                    </div>
                  )}
                  {matching.revenueOpportunity !== null && matching.revenueOpportunity > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#333' }}>Estimated revenue opportunity</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1F9D55' }}>+{formatDollarAmount(matching.revenueOpportunity)}/mo</span>
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: '#555', marginTop: 4, fontWeight: 700 }}>Calculation: {matching.calculation}</p>
                  {matching.benchmarkSource && (
                    <p style={{ fontSize: 10, color: '#888', fontStyle: 'italic', marginTop: 2 }}>Benchmark: {matching.benchmarkSource}</p>
                  )}
                  <p style={{ fontSize: 10, color: '#B25E09', fontWeight: 700, marginTop: 6, padding: '4px 8px', backgroundColor: '#FBF0DF', border: '1px solid #F0D7AC', borderRadius: 4, lineHeight: 1.4 }}>
                    These are potential estimates, not guaranteed outcomes. Confidence reflects data quality.
                  </p>
                </div>
              );
            })()}
            <p className="sa-issue-fix"><strong>Recommended fix:</strong> {group.recommendedFix}</p>
            {teamQuestionsForFlag(group.flag).length > 0 && (
              <div className="sa-team-questions">
                <p className="sa-team-questions-title">Questions to ask your team</p>
                {teamQuestionsForFlag(group.flag).map((q, i) => (
                  <p key={i} className="sa-team-question">{q}</p>
                ))}
              </div>
            )}
            {group.codeSnippet && (
              <div className="sa-code-snippet">
                <p className="sa-code-snippet-note">{IMPLEMENTATION_NOTE}</p>
                <p className="sa-code-snippet-label">{group.codeSnippet.label}</p>
                <pre className="sa-code-snippet-pre"><code>{group.codeSnippet.code}</code></pre>
              </div>
            )}
            {group.smartNote && <p className="sa-ai-review-note">{group.smartNote}</p>}

            <div className="sa-instance-list">
              {group.instances.slice(0, 8).map((instance, i) => (
                <div key={i} className="sa-instance">
                  {/* URL SEO lists its URLs decoded for readability (image-proxy
                      and percent-encoded URLs especially); other sections show
                      the raw address. */}
                  <p className="sa-instance-url">
                    {URL_SEO_FLAGS.has(group.flag) ? humanReadableUrl(instance.url) : instance.url}
                  </p>
                  {URL_SEO_FLAGS.has(group.flag) && instance.statusNote && (
                    <p className="sa-url-seo-status">{instance.statusNote}</p>
                  )}
                  <InstanceSuggestion instance={instance} />
                </div>
              ))}
            </div>

            {group.instances.length > 8 && (
              <details className="sa-instance-expand">
                <summary className="sa-instance-expand-label">
                  Show all {group.instances.length} pages
                </summary>
                <div className="sa-instance-list">
                  {group.instances.slice(8).map((instance, i) => (
                    <div key={i} className="sa-instance">
                      <p className="sa-instance-url">
                        {URL_SEO_FLAGS.has(group.flag) ? humanReadableUrl(instance.url) : instance.url}
                      </p>
                      {URL_SEO_FLAGS.has(group.flag) && instance.statusNote && (
                        <p className="sa-url-seo-status">{instance.statusNote}</p>
                      )}
                      <InstanceSuggestion instance={instance} />
                    </div>
                  ))}
                </div>
              </details>
            )}
            {/* The finding is about the IMAGES — list the actual offending
                srcs (incl. proxied CDN URLs like /_next/image?url=...) with
                their decoded real filename, matching the PDF. */}
            {group.flag === "poor_image_filenames" && nonDescriptiveImageFindings.length > 0 && (
              <div className="sa-nd-image-list">
                <p className="sa-repr-label">Images with non-descriptive filenames</p>
                {nonDescriptiveImageFindings.map((f) => (
                  <div key={f.src} className="sa-nd-image-row">
                    <p className="sa-nd-image-src">{f.src}</p>
                    <p className="sa-nd-image-name">{f.filename}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function InstanceSuggestion({
  instance,
}: {
  instance: { suggestedText: string | null; aiGenerated: boolean; currentValue: string | null };
}) {
  if (!instance.suggestedText) return null;
  const { truncated, wasTruncated } = truncateToWordLimit(instance.suggestedText);
  return (
    <div className="sa-before-after">
      {instance.currentValue && (
        <p className="sa-before"><span className="sa-ba-label">Current:</span> {instance.currentValue}</p>
      )}
      {wasTruncated ? (
        <details className="sa-suggestion-expand">
          <summary className="sa-after-summary">
            <span className="sa-ba-label">AI Suggested:</span> {truncated}
          </summary>
          <p className="sa-after sa-after-full">
            <span className="sa-ba-label">Full suggestion:</span> {instance.suggestedText}
          </p>
        </details>
      ) : (
        <p className="sa-after"><span className="sa-ba-label">AI Suggested:</span> {instance.suggestedText}</p>
      )}
      {instance.aiGenerated && (
        <p className="sa-ai-review-note">AI-generated — please review before publishing.</p>
      )}
    </div>
  );
}

/** One item in the Fix Roadmap: issue -> affected count -> why it matters
 * -> the action -> the actual affected URLs (small sets inline, large sets
 * behind an expander; the full set is never lost and the CSV always holds
 * the complete list). Every field comes from the shared roadmap builder,
 * which reuses the existing audit data — nothing here is invented. */
function RoadmapItemCard({ item, csvAvailable }: { item: FixRoadmapItem; csvAvailable: boolean }) {
  const shown = item.affectedUrls.slice(0, COVERAGE_URLS_INLINE_LIMIT);
  const expanded = item.affectedUrls.slice(COVERAGE_URLS_INLINE_LIMIT);
  return (
    <div className="sa-roadmap-item">
      <div className="sa-roadmap-item-head">
        <p className="sa-roadmap-item-title">
          {item.label}
          {item.templateLevel && <span className="sa-td-muted"> (template-level fix)</span>}
        </p>
        <div className="sa-roadmap-item-meta">
          <span className="sa-roadmap-item-count">
            {item.count} {countUnitFor(item.count, item.countUnit)}
          </span>
          <span className="sa-roadmap-item-effort">{item.effortBucketLabel}</span>
        </div>
      </div>
      <p className="sa-issue-why"><strong>Why:</strong> {item.whyItMatters}</p>
      <p className="sa-issue-fix"><strong>Action:</strong> {item.recommendation}</p>
      {businessImpactForKey(item.key) && (
        <p className="sa-issue-fix" style={{ color: '#1a7f5a', fontStyle: 'italic', marginTop: 4 }}>
          <strong>Business impact:</strong> {businessImpactForKey(item.key)}
        </p>
      )}
      {item.affectedUrls.length === 0 ? (
        <p className="sa-repr-label">Affected URLs are unavailable for this check.</p>
      ) : (
        <>
          <p className="sa-repr-label">{item.hasMoreAffectedUrls ? "Affected pages (sample)" : "Affected pages"}</p>
          <div className="sa-instance-list">
            {shown.map((u, i) => (
              <p key={i} className="sa-instance-url">
                {URL_SEO_FLAGS.has(item.key) ? humanReadableUrl(u) : u}
              </p>
            ))}
          </div>
          {expanded.length > 0 && (
            <details className="sa-instance-expand">
              <summary className="sa-instance-expand-label">Show all {item.affectedUrls.length} pages</summary>
              <div className="sa-instance-list">
                {expanded.map((u, i) => (
                  <p key={i} className="sa-instance-url">
                    {URL_SEO_FLAGS.has(item.key) ? humanReadableUrl(u) : u}
                  </p>
                ))}
              </div>
            </details>
          )}
          {item.hasMoreAffectedUrls && csvAvailable && (
            <p className="sa-ai-review-note">
              {buildMoreAffectedCopy(item.affectedUrls.length, shown.length, "page", true)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
const { data: row, error } = await supabase
    .from("audits")
    .select("id, target_url, overall_score, pages_crawled, audit_result, explanations, created_at, paid_audit_id, subscription_id, share_token, subscriptions(plan)")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return (
      <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
        <div className="sa-notfound">
          <p className="sa-notfound-text">Report not found — it may not exist, or may belong to a different account.</p>
          <Link href="/dashboard" className="sa-link">&larr; Back to dashboard</Link>
        </div>
        <style>{reportStyles}</style>
      </main>
    );
  }

const subscription =
  Array.isArray(row.subscriptions)
    ? row.subscriptions[0]
    : row.subscriptions;

const tier = deriveAuditTier(row, subscription?.plan ?? null);
// The CSV export is only attached for Freelancer/Pro and Agency tiers
// (same gate as the PDF route's includeCsvLink). Every "+ N more — full
// list available in the CSV export." claim on this page must be gated on
// this flag — never claim CSV availability on a tier that can't get it.
const csvAvailable = tier === "freelancer" || tier === "agency";
const audit = row.audit_result as RunAuditResult;
const explanations = row.explanations as PageExplanationResult[];
const date = new Date(row.created_at).toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const allFailedLinks = audit.brokenLinks.filter((b) => !b.ok && b.failureCategory !== "blocked_by_robots" && !isCloudflareEmailObfuscation(b.url));
const { broken: brokenLinks, temporary: temporaryLinks, blocked: blockedLinks } = splitBrokenLinks(allFailedLinks);
// Distinct pages actually carrying a broken link — pairs with the
// instance count so the section can say "3,012 broken link instances
// across 284 pages" instead of ever implying 3,012 affected pages.
const brokenLinkSourcePages = countBrokenLinkSourcePages(audit.brokenLinks);
const scoreCls = scoreClass(row.overall_score);
const verdict = getScoreVerdict(row.overall_score);
const robotsBlocked = audit.crawl.pagesSkippedRobots;
const robotsAudit = audit.crawl.robotsAudit;
const sitemapAudit = audit.crawl.sitemapAudit;
const groupedIssues = mergeUrlSeoFindings(audit, groupExplanationsByIssue(audit, explanations));
// Website-wide Core Web Vitals — declared early so CWV grouped issues
// can merge into allGroupedIssues before priorityList / seoCheckCoverage.
const cwv = resolveCoreWebVitals(audit);
// CWV issues: deterministic static content (no AI), same GroupedIssue
// structure as every other issue type. Merged here so the shared pipeline
// (fixRoadmap, priorityList, seoCheckCoverage) all see them.
const cwvGroupedIssues = buildCwvGroupedIssues(cwv);
const allGroupedIssues = [...groupedIssues, ...cwvGroupedIssues];
const { imageIssues, urlIssues, robotsIssues, otherIssues } = splitGroupedIssuesByCategory(allGroupedIssues);
// The three always-reported Indexability checks are the authoritative source
// for their own detail groups (real affected URLs, shared templates) — their
// flags are filtered out of the AI-derived streams so the grid, the detail
// section, and the CSV always agree. The AI stream still supplies the other
// indexability flags (canonical issues) the grid doesn't cover.
const indexabilityDetailGroups = buildIndexabilityDetailGroups(audit);
const indexabilityIssues = robotsIssues.filter((g) => !INDEXABILITY_CHECK_FLAGS.has(g.flag));
const oversizedImages = audit.oversizedImages.filter((img) => img.isOversized);
const priorityList = buildPriorityList(audit, [
  ...allGroupedIssues.filter((g) => !INDEXABILITY_CHECK_FLAGS.has(g.flag)),
  ...indexabilityDetailGroups,
]);
const quickWins = buildQuickWins(priorityList);
const cwvReportBlocks = buildCwvReportBlocks(cwv, cwvGroupedIssues, priorityList);
const whatsWorking = buildWhatsWorking(audit);
const issueDistribution = buildIssueDistribution(priorityList);
const criticalTypeCount = priorityList.filter((i) => i.severity === "critical").length;
// Instance-level count for the "Critical" stat so it shares units with
// "Issues Found" (both are page/instance counts, not issue-type counts).
const criticalInstanceCount = priorityList
  .filter((i) => i.severity === "critical")
  .reduce((sum, i) => sum + i.count, 0);
const totalAffectedChecks = priorityList.reduce((sum, i) => sum + i.count, 0);
// Distinct pages carrying at least one issue — the supporting figure that
// keeps the headline stat honest: issue TYPES lead the dashboard, total
// checks and affected pages are the secondary detail, and a page with
// five issues counts once, not five times. Same helper as the PDF report.
const affectedPages = countDistinctAffectedPages(audit, allGroupedIssues);
// Canonical crawl-scope counts (pages crawled vs pages analyzed) — the
// single source every page-count display draws from, so no section can
// drift into its own separate number. Same helper as the PDF report.
const crawlScope = getCrawlScopeCounts(audit);
// Structured phase timings (optional — cached audits predate them). The
// runtime line below reads ONLY this field, so a missing value hides it
// instead of inventing one.
const auditTimings = audit.timings;
const categoryScores = buildCategoryScores(audit);
// Render-time re-derivation of broken_links_aeo from raw audit data,
// so stale cached audits can never surface cdn-cgi/l/ false positives
// in the AEO section. Matches the Technical SEO Broken Links section's
// filtering so the two surfaces can never disagree.
{
  const gbl = genuineBrokenLinks(audit.brokenLinks);
  const idx = audit.aeo.checks.findIndex((c) => c.key === "broken_links_aeo");
  if (idx !== -1) {
    audit.aeo.checks[idx] = {
      ...audit.aeo.checks[idx],
      passed: gbl.length === 0,
      affectedCount: gbl.length,
      affectedUrls: gbl.map((b) => b.url),
      statusText: gbl.length === 0
        ? "No broken links found."
        : `${gbl.length} broken link${gbl.length === 1 ? "" : "s"} found.`,
    };
  }
}

// AI Readiness score — same arithmetic as the PDF: derived from the six
// readiness-dimension breakdowns (the authoritative per-category results),
// so the headline and the breakdown can never drift apart. Defined here
// because the Executive Summary (built just below) mentions it.
const aiReadinessDimensions = buildAiReadinessDimensions(
  audit.aeo.checks,
  buildCitationReadiness(audit).checks
);
const aeoCheckSummary = deriveAiReadinessSummary(aiReadinessDimensions);
const aeoCheckTotal = aeoCheckSummary.totalCount;
const aeoReadinessScore = aeoCheckTotal > 0 ? Math.round((aeoCheckSummary.passCount / aeoCheckTotal) * 100) : 0;
// AI/GenAI Quick Wins — top high-impact, easy/moderate-effort AEO fixes
const aeoFailingChecks = rankAeoChecks(audit.aeo.checks.map((c) => withAeoMetaDefaults(c)));
const aiQuickWins = buildAiQuickWins(aeoFailingChecks);
const actionPlan = buildActionPlan(priorityList, aeoFailingChecks);
const businessImpactStatements = buildBusinessImpactSummary(audit);

// Estimated Business Impact — data-driven opportunity estimates when
// BusinessMetrics are supplied via ReportOptions.
const allIssueFlags = [...new Set(allGroupedIssues.map((g) => g.flag))];
const estimatedImpact = buildEstimatedBusinessImpact(audit, allIssueFlags, {}); // no businessMetrics in web report by default

// These traditional On-Page SEO checks (title, description, alt text) are
// NO LONGER part of the AEO/GEO section — they appear only in the On-Page
// SEO section. No filtering needed here.

// Filter out indexability flags only
const otherIssuesFiltered = otherIssues.filter(
  (g) => !INDEXABILITY_CHECK_FLAGS.has(g.flag)
    && !g.flag.startsWith("webvital_")
);
const imageIssuesFiltered = imageIssues;
// Actual offending images for the Non-descriptive image filenames finding —
// same shared computation as the PDF, so both surfaces list the same srcs.
const nonDescriptiveImageFindings = buildNonDescriptiveImageFindings(audit);

// NEW: severity pie chart data
const severityPie = buildPieSlices(
  [
    { key: "critical", label: "Critical", value: criticalTypeCount, color: SEVERITY_COLORS.critical },
    { key: "moderate", label: "Moderate", value: priorityList.filter(i => i.severity === "moderate").length, color: SEVERITY_COLORS.moderate },
    { key: "minor", label: "Minor", value: priorityList.filter(i => i.severity === "minor").length, color: SEVERITY_COLORS.minor },
  ],
  60, 60, 55, 0.55 // cx, cy, radius, donut ratio
);

// NEW: radar chart data
const radar = buildRadarChart(
  categoryScores.map(c => ({ label: c.label, score: c.score })),
  100, 100, 80
);

// Schema data
const pagesWithSchema = audit.crawl.pages.filter((p): p is CrawlPageSuccess => 
  p.ok && p.structuredData.present && p.structuredData.types.length > 0
);
const pagesMissingSchema = audit.crawl.pages.filter((p): p is CrawlPageSuccess => 
  p.ok && (!p.structuredData.present || p.structuredData.types.length === 0)
);
const SCHEMA_WEB_LIMIT = 8;
const duplicateTitleUrlCount = audit.crawl.duplicateTitles.reduce((s, g) => s + g.urls.length, 0);
const duplicateDescUrlCount = audit.crawl.duplicateMetaDescriptions.reduce((s, g) => s + g.urls.length, 0);
const schemaTypeCounts = new Map<string, number>();
for (const p of pagesWithSchema) {
  for (const t of p.structuredData.types) schemaTypeCounts.set(t, (schemaTypeCounts.get(t) ?? 0) + 1);
}
const topSchemaTypes = [...schemaTypeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
const schemaFormats = new Set<string>();
for (const p of pagesWithSchema) if (p.structuredData.format) schemaFormats.add(p.structuredData.format);
const missingSuggestionCounts = new Map<string, number>();
for (const p of pagesMissingSchema) {
  const s = suggestSchemaType(p);
  if (s === "Uncertain" || s === "Needs manual review") continue;
  missingSuggestionCounts.set(s, (missingSuggestionCounts.get(s) ?? 0) + 1);
}
const topMissingSuggestions = [...missingSuggestionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
const pctOfCrawled = (n: number) => Math.round((n / Math.max(1, audit.crawl.pages.length)) * 100);

// Core Web Vitals scale bars (cwv declared above with groupedIssues)
const lcpScale = buildVitalScale(cwv.lcp.median ?? 0, { good: 2500, poor: 4000 }, 6000);
const inpScale = buildVitalScale(cwv.inp.median ?? 0, { good: 200, poor: 500 }, 800);
const clsScale = buildVitalScale((cwv.cls.median ?? 0) * 100, { good: 10, poor: 25 }, 50);
const ttfbScale = buildVitalScale(cwv.ttfb.median ?? 0, { good: 800, poor: 1800 }, 3000);

// Indexability checks
const indexabilityChecks = buildIndexabilityChecks(audit);

// Sitemap guidance
const sitemapGuidance = buildSitemapGuidance(audit.crawl.sitemapAudit, crawlScope.urlsCrawled);

// Real origin (e.g. https://example.com) for the robots.txt / sitemap file locations.
let webSiteOrigin: string | null = null;
try {
  if (audit.crawl.pages.length > 0) webSiteOrigin = new URL(audit.crawl.pages[0].url).origin;
} catch {
  webSiteOrigin = null;
}

// NEW: Redirect chains and response code breakdown
const redirectChainAnalyses = analyzeRedirectChains(audit.crawl.redirectChains);
// Multi-hop chains only — single-hop redirects are normal, not findings.
const multiHopChainAnalyses = redirectChainAnalyses.filter((c) => c.hopCount >= 2);
const responseCodeBreakdown = buildResponseCodeBreakdown(audit);
const redirectChainSummary = buildRedirectChainSummary(audit.crawl);
const robotsBlockedLinksSummary = buildRobotsBlockedLinks(audit.brokenLinks);
const seoCheckCoverage = buildSeoCheckCoverage(audit, allGroupedIssues);
// "X Passed · Y Failed" — derived from the SAME list the detailed checks
// below render, so the summary and details can never disagree.
const coverageSummary = summarizeSeoCheckCoverage(seoCheckCoverage);
// Executive summary — issueTypeCount derived from the SAME coverage
// catalog that powers the "X Passed · Y Failed" strip, so the two
// numbers can never disagree.
const executiveSummaryText = buildExecutiveSummaryText({
  pagesCrawled: audit.crawl.pages.length,
  issueTypeCount: priorityList.length,
  affectedChecks: totalAffectedChecks,
  affectedPages,
  criticalTypeCount,
  quickWinsCount: quickWins.length,
  topIssueLabels: priorityList.slice(0, 3).map((i) => i.label.toLowerCase()),
  aiReadinessScore: aeoCheckTotal > 0 ? aeoReadinessScore : undefined,
  aiReadinessChecks:
    aeoCheckTotal > 0 ? { passCount: aeoCheckSummary.passCount, totalCount: aeoCheckTotal } : undefined,
});
// Fix Roadmap — Fix First / Fix Next / Optimize, built from the SAME
// priority list and coverage evidence the rest of the report shows (no
// second calculation, no invented URLs or copy).
const fixRoadmap = buildFixRoadmap(priorityList, seoCheckCoverage, allGroupedIssues, audit, aeoFailingChecks);
const fixRoadmapItemCount = countFixRoadmapItems(fixRoadmap);
const failedCoverageChecks = seoCheckCoverage.filter((c) => c.status === "fail");
const warnCoverageChecks = seoCheckCoverage.filter((c) => c.status === "warn");
// The status index groups checks by the detailed section that carries their
// evidence (the SAME seoCheckCoverage list the summary strip counts), so
// each group points at exactly one place for the full findings. Sections
// with failed / needs-improvement checks come first; all-pass sections
// follow. No URL, explanation, or recommendation is rendered here — the
// coverage section is a compact diagnostic index only.
const coverageBySection = new Map<string, CoverageCheck[]>();
for (const check of seoCheckCoverage) {
  const list = coverageBySection.get(check.sectionRef.name);
  if (list) list.push(check);
  else coverageBySection.set(check.sectionRef.name, [check]);
}
const coverageGroups = [...coverageBySection.entries()]
  .map(([name, checks]) => ({
    name,
    anchor: checks[0].sectionRef.anchor,
    checks,
    hasAction: checks.some((c) => c.status !== "pass"),
  }))
  .sort((a, b) => Number(b.hasAction) - Number(a.hasAction));
// Core Web Vitals issues — per-metric affected pages, derived from the
// same aggregate the cards above use (no second calculation).
const aeoReadinessClass = scoreClass(aeoReadinessScore);
// AI Readiness verdict — SEPARATE, stricter scale from the SEO score's
// rubric (pass/fail check coverage vs weighted severity). The label is
// always rendered with the "AI scale" qualifier so the two scores can
// never both read as the same bare verdict.
const aeoVerdict = getAiReadinessVerdict(aeoReadinessScore);
// "If You Only Do 5 Things" — top-leverage actions ranked by impact ×
// reach ÷ effort, shared with the PDF so both surfaces list the exact
// same five items.
const topQuickActions = buildTopQuickActions(priorityList);

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <header className="sa-nav">
        <span className="sa-logo">SEOAudit AI</span>
        <Link href="/dashboard" className="sa-link">&larr; Dashboard</Link>
      </header>

      <section className="sa-report-head">
        <p className="sa-eyebrow">Audit report · {date}</p>
        <h1 className="sa-h1-sm">{row.target_url}</h1>

<div className="sa-summary">
<div className={`sa-score-block ${scoreCls}`}>
            <span className="sa-score-num">{row.overall_score}</span>
            <span className="sa-score-max">/100</span>
          </div>
          <div>
            <span className={`sa-verdict-pill sa-verdict-${verdict.tier}`}>{verdict.label}</span>
            <p className="sa-verdict-description">{verdict.description}</p>
            <p className="sa-score-methodology">Weighted: On-Page 35% + Technical 40% + AI Search Readiness 25%</p>
          </div>
</div>

        <p className="sa-exec-summary">{executiveSummaryText}</p>
        <p className="sa-scope-note">
          Audit scope: {crawlScope.urlsCrawled} URLs were discovered/crawled; {crawlScope.pagesAnalyzed} substantive HTML pages were used for content, metadata, and AI-readiness analysis.
        </p>
        {/* CRAWL COVERAGE WARNING — same rule as the PDF: a crawl that
            stopped early must never read as a normal successful audit. */}
        {crawlScope.lowCoverage.detected && (
          <div className="sa-coverage-warning">
            <strong>⚠️ Crawl coverage warning:</strong> only {crawlScope.pagesAnalyzed} page{crawlScope.pagesAnalyzed === 1 ? "" : "s"} was
            successfully crawled, but the crawl found evidence of more content. {crawlScope.lowCoverage.reasons.join(" ")}{" "}
            The findings below may understate the site — review the crawl diagnostics before treating this audit as
            complete coverage.
          </div>
        )}
        {/* COVERAGE GAPS — URLs blocked from automated checking that were
            NOT included in on-page analysis. Disclosed as a limitation so
            the client never assumes full coverage. */}
        {(() => {
          const blockedIssue = priorityList.find((i) => i.key === "links_blocked_from_checking");
          if (!blockedIssue || blockedIssue.count === 0) return null;
          return (
            <div className="sa-coverage-warning" style={{ backgroundColor: "#F4F6FB", borderLeftColor: "#1D6FD8" }}>
              <strong style={{ color: "#0a5fb4" }}>📋 Coverage gaps — pages not analyzed:</strong> {blockedIssue.count} URL{blockedIssue.count === 1 ? " was" : "s were"} blocked from automated checking (403/401/429 responses from bot protection or WAF rules) and were NOT included in on-page analysis.
              These pages may contain titles, meta descriptions, headings, and other SEO elements that this audit could not evaluate.
              Spot-check a sample in a browser to confirm whether these are real pages that should be audited separately.
            </div>
          );
        })()}
        {/* High-level runtime only — individual per-stage durations
            ("Crawl 1s · Broken links 2s ...") are internal debug detail that
            doesn't help the client make a decision, so they are not shown. */}
        {auditTimings && (
          <p className="sa-runtime-note">
            Runtime: {formatDuration(totalRuntimeMs(audit.auditStartedAt, row.created_at, auditTimings.totalMs) ?? auditTimings.totalMs)}
          </p>
        )}
        
        {/* NEW: radar chart */}
        {radar.axes.length > 0 && (
          <div className="sa-radar-block">
            <svg viewBox="0 0 200 200" width="220" height="220">
              {radar.gridPolygons.map((pts, i) => (
                <polygon key={i} points={pts} fill="none" stroke="#E0DFDA" strokeWidth="1" />
              ))}
              <polygon points={radar.polygonPoints} fill="#1D6FD8" fillOpacity="0.25" stroke="#1D6FD8" strokeWidth="2" />
              {radar.axes.map((a) => (
                <text key={a.label} x={a.labelX} y={a.labelY} fontSize="9" textAnchor="middle" fill="#52565C">{a.label}</text>
              ))}
            </svg>
          </div>
        )}

<div className="sa-exec-stats-grid">
          <div className="sa-exec-stat-card">
            <span className="sa-exec-stat-icon">📄</span>
            <span className="sa-exec-stat-num">{row.pages_crawled}</span>
            <span className="sa-exec-stat-label">Pages Crawled</span>
          </div>
          <div className="sa-exec-stat-card">
            <span className="sa-exec-stat-icon">⚠️</span>
            <span className="sa-exec-stat-num">{priorityList.length}</span>
            <span className="sa-exec-stat-label">Issue Types</span>
            <span className="sa-exec-stat-sub">
              affecting {totalAffectedChecks} check{totalAffectedChecks === 1 ? "" : "s"}
              {affectedPages > 0 ? ` across ${affectedPages} page${affectedPages === 1 ? "" : "s"}` : ""}
            </span>
          </div>
          <div className="sa-exec-stat-card">
            <span className="sa-exec-stat-icon">🚨</span>
            <span className="sa-exec-stat-num">{criticalTypeCount}</span>
            <span className="sa-exec-stat-label">Critical Types</span>
            <span className="sa-exec-stat-sub">affecting {criticalInstanceCount} instance{criticalInstanceCount === 1 ? "" : "s"}</span>
          </div>
          <div className="sa-exec-stat-card">
            <span className="sa-exec-stat-icon">⚡</span>
            <span className="sa-exec-stat-num">{quickWins.length}</span>
            <span className="sa-exec-stat-label">Quick Wins</span>
          </div>
        </div>

        {/* If You Only Do 5 Things — the condensed stakeholder shortlist,
            directly after the dashboard, before the detailed sections. Same
            shared selection as the PDF (impact × reach ÷ effort). */}
        {topQuickActions.length > 0 && (
          <div className="sa-five-things">
            <h2 className="sa-h2">If You Only Do 5 Things</h2>
            <p className="sa-priority-note">
              The five highest-leverage actions from this audit, ranked by impact, reach, and effort. If you only have
              time for a shortlist, start here — every item is explained in full further down this report.
            </p>
            {topQuickActions.map((action, i) => (
              <div key={action.key} className="sa-five-thing-row">
                <span className="sa-five-thing-num">{i + 1}</span>
                <div className="sa-five-thing-body">
                  <p className="sa-five-thing-desc">{action.description}</p>
                  <p className="sa-five-thing-meta">
                    {action.pageCount} {countUnitFor(action.pageCount, action.countUnit)} · {action.estimatedTime}
                  </p>
                </div>
              </div>
            ))}
            <p className="sa-five-things-note">
              Read the full report for the complete prioritized list, business impact, and step-by-step verification
              for every finding.
            </p>
          </div>
        )}

        {/* NEW: Business Impact section */}
        {businessImpactStatements.length > 0 && (
          <div className="sa-business-impact">
            <h2 className="sa-h2">Business Impact</h2>
            {businessImpactStatements.map((s) => (
              <div key={s.key} className="sa-impact-card">
                <p className="sa-impact-card-label">{s.label}</p>
                <p className="sa-impact-card-text">{s.text}</p>
                {s.citation && <p className="sa-impact-card-citation">Source: {s.citation}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Estimated Traffic & Conversion Impact */}
        <div className="sa-business-impact" style={{ marginTop: 16 }}>
          <h2 className="sa-h2">Estimated Traffic &amp; Conversion Impact</h2>
          {estimatedImpact.hasEstimates && (
            <>
              <p style={{ fontSize: 13, color: '#555555', marginBottom: 12, lineHeight: 1.5 }}>
                Every number below is traceable to its source. Assumptions are clearly labeled.
                Confidence levels reflect data quality.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {estimatedImpact.estimates.map((est, i) => (
                  <div key={i} style={{
                    width: 'calc(50% - 6px)',
                    backgroundColor: '#F0F8F0',
                    border: '1px solid #BFE3CB',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#1F9D55', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
                        {est.label}
                      </p>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        backgroundColor: est.confidence === 'High' ? '#E7F6ED' : est.confidence === 'Medium' ? '#FBF0DF' : '#FBE9E6',
                        color: est.confidence === 'High' ? '#1F9D55' : est.confidence === 'Medium' ? '#B25E09' : '#D9432E',
                      }}>
                        {est.confidence} confidence
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#555', marginBottom: 3 }}><strong>Observed:</strong> {est.observedData}</p>
                    <p style={{ fontSize: 12, color: '#555', marginBottom: 3 }}><strong>Source:</strong> {est.source}</p>
                    <p style={{ fontSize: 12, color: '#555', marginBottom: 10 }}><strong>Scenario:</strong> {est.scenarioAssumption}</p>
                    {est.additionalClicks !== null && est.additionalClicks > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: '#333' }}>Estimated additional clicks</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1F9D55' }}>+{formatClickCount(est.additionalClicks)}/mo</span>
                      </div>
                    )}
                    {est.additionalConversions !== null && est.additionalConversions > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: '#333' }}>Estimated additional conversions</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1F9D55' }}>+{formatConversionCount(est.additionalConversions)}/mo</span>
                      </div>
                    )}
                    {est.revenueOpportunity !== null && est.revenueOpportunity > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: '#333' }}>Estimated revenue opportunity</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1F9D55' }}>+{formatDollarAmount(est.revenueOpportunity)}/mo</span>
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: '#555', marginTop: 4, fontWeight: 700 }}>Calculation: {est.calculation}</p>
                    {est.benchmarkSource && (
                      <p style={{ fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 2 }}>Benchmark: {est.benchmarkSource}</p>
                    )}
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 12,
                padding: '8px 12px',
                backgroundColor: '#FBF0DF',
                border: '1px solid #F0D7AC',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                color: '#B25E09',
                lineHeight: 1.4,
              }}>
                All estimates are potential opportunities, not guaranteed outcomes. Confidence levels reflect
                the quality of underlying data. Estimates based primarily on assumptions are marked Low confidence.
              </div>
            </>
          )}
        </div>

        <div className="sa-category-bars">
          {categoryScores.map((cat) => (
            <div key={cat.key} className="sa-category-row">
              <div className="sa-category-row-head">
                <span className="sa-category-label">{cat.label}</span>
                <span className="sa-category-score">{cat.score}/100</span>
              </div>
              <div className="sa-category-track">
                <div
                  className={`sa-category-fill ${cat.score >= 80 ? "sa-category-good" : cat.score >= 50 ? "sa-category-warn" : "sa-category-fail"}`}
                  style={{ width: `${cat.score}%` }}
                />
              </div>
              <p className="sa-category-explanation">{CATEGORY_EXPLANATION[cat.key] ?? DEFAULT_CATEGORY_EXPLANATION}</p>
            </div>
          ))}
        </div>

        {/* NEW: Response Code Breakdown */}
{responseCodeBreakdown.groups.length > 0 && (
  <div className="sa-response-codes">
    <h2 className="sa-h2" style={{ fontSize: 14, marginBottom: 12 }}>Response Code Breakdown</h2>
    <div className="sa-response-code-track">
      {responseCodeBreakdown.groups.map((bucket) => {
        let color = "#1F9D55"; // default green for 2xx
        if (bucket.key === "3xx") color = "#D98A1A";
        else if (bucket.key === "4xx") color = "#D9432E";
        else if (bucket.key === "5xx") color = "#D9432E";
        
        return (
          <div
            key={bucket.key}
            className="sa-response-code-segment"
            style={{ width: `${(bucket.count / responseCodeBreakdown.totalChecked) * 100}%`, background: color }}
            title={`${bucket.label}: ${bucket.count} (${Math.round((bucket.count / responseCodeBreakdown.totalChecked) * 100)}%)`}
          />
        );
      })}
    </div>
    <div className="sa-response-code-legend">
      {responseCodeBreakdown.groups.map((bucket) => {
        let color = "#1F9D55";
        if (bucket.key === "3xx") color = "#D98A1A";
        else if (bucket.key === "4xx") color = "#D9432E";
        else if (bucket.key === "5xx") color = "#D9432E";
        
        return (
          <div key={bucket.key} className="sa-response-code-legend-row">
            <span className="sa-response-code-swatch" style={{ background: color }} />
            {bucket.label}: {bucket.count} ({Math.round((bucket.count / responseCodeBreakdown.totalChecked) * 100)}%)
          </div>
        );
      })}
    </div>
  </div>
)}

        {issueDistribution.length > 0 && (
          <div className="sa-issue-dist">
            <h2 className="sa-h2">Issue Distribution</h2>
            {issueDistribution.map((item) => (
              <div key={item.key} className="sa-issue-dist-row">
                <span className="sa-issue-dist-label">{item.label}</span>
                <div className="sa-issue-dist-track">
                  <div className="sa-issue-dist-fill" style={{ width: `${item.barWidthPct}%` }} />
                </div>
                <span className="sa-issue-dist-count">{item.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* NEW: severity pie chart */}
        {severityPie.length > 0 && (
          <div className="sa-pie-block">
            <svg viewBox="0 0 120 120" width="140" height="140">
              {severityPie.map((s) => <path key={s.key} d={s.pathD} fill={s.color} />)}
            </svg>
            <div className="sa-pie-legend">
              {severityPie.map((s) => (
                <div key={s.key} className="sa-pie-legend-row">
                  <span className="sa-pie-swatch" style={{ background: s.color }} />
                  {s.label}: {s.value} ({s.percent}%)
                </div>
              ))}
            </div>
          </div>
        )}

{tier === "free" ? (
  <Link href={`/audit/${row.id}/thank-you?tier=free`} className="sa-btn sa-btn-primary">
    Download PDF report
  </Link>
) : tier === "payg" ? (
  <Link href={`/audit/${row.id}/thank-you?tier=payg`} className="sa-btn sa-btn-primary">
    Download PDF report
  </Link>
) : tier === "agency" ? (
  <AgencyBrandingPanel auditId={row.id} defaultWebsite={row.target_url} />
) : (
  <a href={`/api/audits/${row.id}/pdf`} className="sa-btn sa-btn-primary">
    Download PDF report
  </a>
)}
      </section>

      <section className="sa-whatsworking">
        <h2 className="sa-h2">What&rsquo;s Working</h2>
        {whatsWorking.length === 0 ? (
          <p className="sa-ww-fallback">{WHATS_WORKING_FALLBACK}</p>
        ) : (
          <ul className="sa-ww-list">
            {whatsWorking.map((item) => (
              <li key={item.key} className="sa-ww-item">
                <span className="sa-ww-dot" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* NEW: Indexability Checks section */}
      <section className="sa-indexability-checks" id="indexability-checks">
        <h2 className="sa-h2">Indexability Checks</h2>
        <p className="sa-priority-note">
          These are always checked and always reported, whether or not an issue was found.
        </p>
        <div className="sa-checks-grid">
          {indexabilityChecks.map((check) => (
            <div key={check.key} className="sa-check-card">
              <div className="sa-check-head">
                <span className="sa-check-label">{check.label}</span>
                <span className={check.passed ? "sa-check-pass" : "sa-check-fail"}>
                  {check.passed ? "✓ Correctly configured" : `${check.affectedCount} affected`}
                </span>
              </div>
              <p className="sa-check-status">{check.statusText}</p>
              {!check.passed && (
                <a
                  href="#indexability-details"
                  className="sa-check-details-link"
                >
                  View details &amp; fix &rarr;
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Priority List - always render */}
      <section className="sa-priority">          <h2 className="sa-h2">Top Priority Fixes</h2>
        <p className="sa-priority-note">
          Ranked by priority — impact, reach, and effort weighed together, not by severity alone: a single-page critical issue can rank below a wide quick fix. Severity is shown per issue in the column to the right. Impact, difficulty, and time estimates are calculated from issue type and scope, not guarantees.
        </p>
        <p className="sa-plan-capacity-note">
          Effort buckets are estimates of direct active editing time per element, excluding staging, testing, and deployment workflows.
        </p>
        {priorityList.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No priority issues found</p>
            <p className="sa-empty-text">Everything is in good shape. This section is healthy.</p>
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Severity</th>
                  <th>Impact</th>
                  <th>Difficulty</th>
                  <th>Count</th>
                  <th>Est. Time</th>
                </tr>
              </thead>
              <tbody>
                {priorityList.slice(0, 8).map((issue) => (
                  <tr key={issue.key}>
                    <td className="sa-td-site">{issue.label}</td>
                    <td>
                      <span className={`sa-priority-pill sa-priority-${issue.severity}`}>
                        {issue.severity === "critical" ? "Critical" : issue.severity === "moderate" ? "Moderate" : "Minor"}
                      </span>
                    </td>
                    <td className="sa-td-muted">
                      <span className="sa-mini-bar-track"><span className="sa-mini-bar-fill" style={{ width: `${(issue.impactStars / 5) * 100}%`, background: webImpactColor(issue.impactStars) }} /></span>
                      {issue.severity === "critical" ? "High Impact" : issue.severity === "moderate" ? "Medium Impact" : "Low Impact"}
                    </td>
                    <td className="sa-td-muted">
                      <span className="sa-mini-bar-track sa-mini-bar-blue"><span className="sa-mini-bar-fill" style={{ width: `${(issue.difficultyStars / 5) * 100}%` }} /></span>
                      {issue.difficultyLabel}
                    </td>
                    <td className="sa-td-mono sa-td-muted">
                      {issue.count} {countUnitFor(issue.count, issue.countUnit)}
                    </td>
                    <td className="sa-td-mono sa-td-muted">
                      {issue.effortBucketLabel}{issue.templateLevel ? " · Template-level fix" : ""}
                      {issue.estimateRationale && (
                        <span className="sa-estimate-rationale-table">{issue.estimateRationale}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quick Wins - always render */}
      <section className="sa-quickwins">
        <h2 className="sa-h2">Quick Wins</h2>
        <p className="sa-priority-note">Fast, tag-level fixes — no content rewrite or dev work required.</p>
        {quickWins.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No quick wins available</p>
            <p className="sa-empty-text">No tag-level fixes needed at this time. This section is healthy.</p>
          </div>
        ) : (
          <ul className="sa-quickwin-list">
            {quickWins.map((issue) => (
              <li key={issue.key} className="sa-quickwin-item">
                <span className="sa-quickwin-check">✓</span>
                <span>
                  {issue.label}{" "}
                  <span className="sa-td-muted">
                    ({issue.count} {countUnitFor(issue.count, issue.countUnit)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AI/GenAI Quick Wins — high-impact, easy/moderate-effort AEO fixes */}
      <section className="sa-ai-quickwins">
        <h2 className="sa-h2">AI/GenAI Quick Wins</h2>
        <p className="sa-priority-note">
          The highest-impact AI search improvements from this audit — each one is a concrete action that
          strengthens your site&apos;s visibility in AI-generated answers.
        </p>
        {aiQuickWins.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No AI quick wins available</p>
            <p className="sa-empty-text">No high-impact, low-effort AI improvements detected at this time.</p>
          </div>
        ) : (
          <div className="sa-ai-quickwin-list">
            {aiQuickWins.map((win) => (
              <div key={win.key} className="sa-ai-quickwin-card">
                <div className="sa-ai-quickwin-head">
                  <h3 className="sa-ai-quickwin-title">{win.label}</h3>
                  <div className="sa-ai-quickwin-badges">
                    <span className="sa-aeo-badge" style={{ background: win.impact === 'very_high' ? '#FBE9E6' : '#FBF0DF', color: win.impact === 'very_high' ? '#D9432E' : '#D98A1A' }}>
                      {win.impact === 'very_high' ? 'Very High' : 'High'} Impact
                    </span>
                    <span className="sa-aeo-badge" style={{ background: '#E7F6ED', color: '#1F9D55' }}>
                      {win.effort === 'easy' ? 'Easy' : 'Moderate'} Effort
                    </span>
                    <span className="sa-aeo-badge" style={{ background: '#EEEEEE', color: '#555555' }}>
                      {win.timeLabel}
                    </span>
                  </div>
                </div>
                <p className="sa-ai-quickwin-count">
                  {win.affectedCount} {countUnitFor(win.affectedCount, win.countUnit)} affected
                </p>
                <div className="sa-ai-quickwin-section">
                  <span className="sa-ai-quickwin-label">What to do:</span>
                  <p className="sa-ai-quickwin-text">{win.action}</p>
                </div>
                <div className="sa-ai-quickwin-section">
                  <span className="sa-ai-quickwin-label">Why it matters for AI:</span>
                  <p className="sa-ai-quickwin-text">{win.aiExplanation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sa-vitals" id="performance-core-web-vitals">
        <h2 className="sa-h2">Technical SEO: Performance &amp; Core Web Vitals</h2>
        <p className="sa-priority-note">
          Measured live via Google PageSpeed Insights on {cwv.fullCrawlCoverage ? "every crawled page" : "a representative sample of pages across the site's page types"} — lab data, not an estimate.
        </p>
        <p className="sa-priority-note">{cwv.scopeNote}</p>

        {cwv.evaluatedPages === 0 ? (
          <div className="sa-cwv-insufficient">
            <p className="sa-cwv-insufficient-title">Insufficient data — Core Web Vitals could not be evaluated</p>
            <p className="sa-cwv-insufficient-text">
              {cwv.sampleSize > 0
                ? `PageSpeed Insights did not return usable performance data for this audit — none of the ${
                    cwv.sampleSize
                  } page${cwv.sampleSize === 1 ? "" : "s"} attempted could be evaluated (${cwv.totalPages} page${
                    cwv.totalPages === 1 ? "" : "s"
                  } were crawled). `
                : `No performance data exists for this audit — the Core Web Vitals check did not run (${cwv.totalPages} page${
                    cwv.totalPages === 1 ? "" : "s"
                  } were crawled). `}
              This usually means the PageSpeed API was unavailable, timed out, or hit its rate limit. Nothing here
              should be read as a pass or fail — re-run the audit (or check the PageSpeed API key) to get performance
              measurements.
            </p>
          </div>
        ) : (
          <>
            <div className="sa-cwv-summary">
              {[
                { label: "Pages crawled", value: String(cwv.totalPages) },
                { label: "Pages performance-tested", value: String(cwv.sampleSize) },
                { label: "Pages evaluated", value: String(cwv.evaluatedPages) },
                {
                  label: "Templates represented",
                  value: cwv.templatesRepresented != null ? String(cwv.templatesRepresented) : "—",
                },
                { label: "Passing CWV", value: String(cwv.passingPages) },
                { label: "Failing CWV", value: String(cwv.failingPages) },
                { label: "Pass rate", value: cwv.passRate !== null ? `${cwv.passRate}%` : "—" },
              ].map((s) => (
                <div key={s.label} className="sa-cwv-chip">
                  <p className="sa-cwv-chip-label">{s.label}</p>
                  <p className="sa-cwv-chip-value">{s.value}</p>
                </div>
              ))}
            </div>
            <p className="sa-cwv-score-note">
              Website-wide Core Web Vitals score: {cwv.score !== null ? `${cwv.score}%` : "—"} — the share of
              evaluated pages where every measurable official vital (LCP, INP, CLS) is in the good range. TTFB is
              shown below as a supporting metric but is not an official Core Web Vital.
            </p>

            <div className="sa-vitals-grid">
              {[
                {
                  vitalKey: "lcp",
                  label: "Largest Contentful Paint",
                  value: cwv.lcp.median !== null ? formatMs(cwv.lcp.median) : "—",
                  scale: lcpScale,
                  thresholds: (
                    <>
                      <span>Good (0–2.5s)</span>
                      <span>Needs improvement</span>
                      <span>Poor</span>
                    </>
                  ),
                  agg: cwv.lcp,
                },
                {
                  vitalKey: "inp",
                  label: "Interaction to Next Paint",
                  value: cwv.inp.median !== null ? formatMs(cwv.inp.median) : "—",
                  scale: inpScale,
                  thresholds: (
                    <>
                      <span>Good (0–200ms)</span>
                      <span>Needs improvement</span>
                      <span>Poor</span>
                    </>
                  ),
                  agg: cwv.inp,
                },
                {
                  vitalKey: "cls",
                  label: "Cumulative Layout Shift",
                  value: cwv.cls.median !== null ? formatCls(cwv.cls.median) : "—",
                  scale: clsScale,
                  thresholds: (
                    <>
                      <span>Good (0–0.1)</span>
                      <span>Needs improvement</span>
                      <span>Poor</span>
                    </>
                  ),
                  agg: cwv.cls,
                },
                {
                  vitalKey: "ttfb",
                  label: "Time to First Byte",
                  value: cwv.ttfb.median !== null ? formatMs(cwv.ttfb.median) : "—",
                  scale: ttfbScale,
                  thresholds: (
                    <>
                      <span>Good (0–800ms)</span>
                      <span>Needs improvement</span>
                      <span>Poor</span>
                    </>
                  ),
                  agg: cwv.ttfb,
                },
              ].map((card) => (
                <div key={card.label} className="sa-vital-card">
                  <p className="sa-vital-label">{card.label}</p>
                  <p className="sa-vital-value">{card.value}</p>
                  <div className="sa-vitals-scale">
                    {card.scale.segments.map((seg, i) => (
                      <div key={i} style={{ width: `${seg.widthPct}%`, background: seg.color }} />
                    ))}
                    <div className="sa-vitals-marker" style={{ left: `${card.scale.markerPct}%` }} />
                  </div>
                  <div className="sa-vitals-scale-labels">{card.thresholds}</div>
                  <p className="sa-vital-counts">
                    {card.agg.rated} page{card.agg.rated === 1 ? "" : "s"} rated · {card.agg.good} good ·{" "}
                    {card.agg.needsImprovement} needs improvement · {card.agg.poor} poor
                  </p>
                  {cwv.sampleSize - card.agg.rated > 0 && (
                    <p className="sa-vital-missing">
                      {cwv.sampleSize - card.agg.rated} page{cwv.sampleSize - card.agg.rated === 1 ? "" : "s"} without
                      available {card.label} data — not counted as passing or failing
                    </p>
                  )}
                  {/* Why it matters / business impact / recommended fix for
                      each non-good metric lives with its affected pages
                      below (one copy per metric, same source the PDF and
                      coverage rows use) — the cards above stay a clean
                      overview. */}
                </div>
              ))}
            </div>

            {cwvReportBlocks.length > 0 && (
              <div className="sa-cwv-issues">
                <p className="sa-subhead">Pages not in the good range</p>
                <p className="sa-priority-note">
                  Every evaluated page whose measurement for a problematic metric is not in the good range, with its
                  measured value. Each group below also explains why the metric matters, its business impact, and the
                  recommended fix. &ldquo;Needs improvement&rdquo; is amber, &ldquo;Poor&rdquo; is red.
                </p>
                {cwvReportBlocks.map((block) => (
                    <div key={block.key} className="sa-cwv-issue-group">
                      <p className="sa-cwv-issue-title">
                        {block.label} — {block.affectedCount} page{block.affectedCount === 1 ? "" : "s"} not in the good range
                      </p>
                      {block.rating && (
                        <span className={block.rating === "poor" ? "sa-verdict-pill sa-verdict-fail" : block.rating === "needs-improvement" ? "sa-verdict-pill sa-verdict-warn" : "sa-verdict-pill sa-verdict-pass"}>
                          {block.rating === "poor" ? "Poor" : block.rating === "needs-improvement" ? "Needs improvement" : "Good"} website-wide
                        </span>
                      )}
                      {block.whatItIs && (
                        <p className="sa-issue-why"><strong>What it is:</strong> {block.whatItIs}</p>
                      )}
                      {block.whyItMatters && (
                        <p className="sa-issue-why"><strong>Why it matters:</strong> {block.whyItMatters}</p>
                      )}
                      {block.businessImpact && (
                        <p className="sa-issue-impact"><strong>Business impact:</strong> {block.businessImpact}</p>
                      )}
                      {block.recommendedFix && (
                        <p className="sa-issue-fix"><strong>Recommended fix:</strong> {block.recommendedFix}</p>
                      )}
                      {block.afterFixing && (
                        <p className="sa-issue-fix"><strong>After fixing:</strong> {block.afterFixing}</p>
                      )}
                      {block.implementationSteps.length > 0 && (
                        <div className="sa-vital-fix" style={{ marginTop: 8 }}>
                          <p style={{ fontWeight: 'bold', marginBottom: 4 }}>Implementation steps:</p>
                          <ol style={{ margin: 0, paddingLeft: 20 }}>
                            {block.implementationSteps.slice(0, 5).map((step, i) => (
                              <li key={i} style={{ marginBottom: 2, fontSize: 14 }}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {block.codeSnippet && (
                        <pre style={{ backgroundColor: '#0F172A', color: '#E2E8F0', padding: 12, borderRadius: 6, fontSize: 13, marginTop: 8, overflow: 'auto' }}>
                          <strong style={{ color: '#93C5FD' }}>{block.codeSnippet.label}</strong>{"\n"}
                          {block.codeSnippet.code}
                        </pre>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Accessibility is deliberately NOT part of this product's audit
                scope (it is not factored into the SEO score) — the
                PageSpeed-derived accessibility score/issues are intentionally
                not rendered in this client-facing SEO report. */}
          </>
        )}
      </section>

      {/* Pages Blocked by Robots.txt - always render */}
      <section className="sa-issues">
        <h2 className="sa-h2">Pages Blocked by Robots.txt</h2>
        <p className="sa-robots-note">
          These pages were discovered but not crawled — the site&rsquo;s robots.txt disallows it. May be intentional (admin pages, staging content) — worth a quick check that nothing here should actually be indexable.
        </p>
        {robotsBlocked.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No pages blocked by robots.txt</p>
            <p className="sa-empty-text">All discovered pages were crawlable. This section is healthy.</p>
          </div>
        ) : (
          <div className="sa-page-block">
            {robotsBlocked.map((u, i) => (
              <p key={i} className="sa-robots-url">{u}</p>
            ))}
          </div>
        )}
      </section>

      <section className="sa-issues" id="ai-search-readiness">
        <h2 className="sa-h2">AI Search Readiness (AEO/GEO)</h2>
        <h3 className="sa-h3" style={{ marginTop: 0 }}>Structured Data</h3>
        <div className="sa-infobox">
          <p className="sa-info-line" style={{ margin: 0 }}>
            <span className="sa-info-label">What it is.</span>{" "}
            Structured data (Schema.org markup) is a standardized way to tell search engines what a page is about — a product, an article, a business, a set of FAQs. It helps search engines understand the entities on your pages and, in some cases, makes them eligible for richer result formats like star ratings, FAQ dropdowns, or breadcrumbs. It does not directly improve rankings, but without it those formats simply aren&rsquo;t available.
          </p>
        </div>
        <div className="sa-infobox">
          <p className="sa-info-line">
            <span className="sa-info-label">Pages with markup:</span> {pagesWithSchema.length} of {audit.crawl.pages.length} ({pctOfCrawled(pagesWithSchema.length)}%)
          </p>
          {schemaFormats.size > 0 && (
            <p className="sa-info-line">
              <span className="sa-info-label">Format used:</span> {[...schemaFormats].join(", ")}
            </p>
          )}
          {topSchemaTypes.length > 0 && (
            <p className="sa-info-line">
              <span className="sa-info-label">Most common types:</span> {topSchemaTypes.map(([t, n]) => `${t} (${n})`).join(", ")}
            </p>
          )}
        </div>
        {pagesWithSchema.length === 0 ? (
          <div className="sa-empty">
            <p className="sa-empty-title">No pages with structured data</p>
            <p className="sa-empty-text">None of the crawled pages have Schema.org markup yet.</p>
          </div>
        ) : (
          <>
            <p className="sa-issue-impact">{PRESENT_SCHEMA_COPY.businessImpact}</p>
            <p className="sa-issue-fix"><strong>Recommendation:</strong> {PRESENT_SCHEMA_COPY.recommendedFix}</p>
            <div className="sa-schema-grid">
              {pagesWithSchema.slice(0, SCHEMA_WEB_LIMIT).map((p) => (
                <div key={p.url} className="sa-schema-card">
                  <p className="sa-instance-url">{p.url}</p>
                  <div className="sa-schema-pills">
                    {p.structuredData.types.length > 0 ? (
                      p.structuredData.types.map((t) => (
                        <span key={t} className="sa-schema-chip sa-schema-chip-pass">{t}</span>
                      ))
                    ) : (
                      <span className="sa-schema-chip sa-schema-chip-warn">Present ({p.structuredData.format})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {pagesWithSchema.length > SCHEMA_WEB_LIMIT && (
              <details className="sa-instance-expand">
                <summary className="sa-instance-expand-label">
                  Show all {pagesWithSchema.length} pages with schema
                </summary>
                <div className="sa-schema-grid">
                  {pagesWithSchema.slice(SCHEMA_WEB_LIMIT).map((p) => (
                    <div key={p.url} className="sa-schema-card">
                      <p className="sa-instance-url">{p.url}</p>
                      <div className="sa-schema-pills">
                        {p.structuredData.types.map((t) => (
                          <span key={t} className="sa-schema-chip sa-schema-chip-pass">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      <section className="sa-issues" id="ai-search-readiness-missing">
        <h3 className="sa-h3">Missing Structured Data</h3>
        <div className="sa-infobox">
          <p className="sa-info-line" style={{ margin: 0 }}>
            <span className="sa-info-label">What this finding means.</span>{" "}
            {MISSING_SCHEMA_COPY.whyItMatters} Without it, search engines have to infer what each page is about from the visible text alone — which also rules out rich-result formats for those pages.
          </p>
        </div>
        <div className="sa-infobox">
          <p className="sa-info-line">
            <span className="sa-info-label">Pages without markup:</span> {pagesMissingSchema.length} of {audit.crawl.pages.length} ({pctOfCrawled(pagesMissingSchema.length)}%)
          </p>
          {topMissingSuggestions.length > 0 && (
            <p className="sa-info-line">
              <span className="sa-info-label">Most relevant types:</span> {topMissingSuggestions.map(([t, n]) => `${t} (${n})`).join(", ")}
            </p>
          )}
        </div>
        {pagesMissingSchema.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">Every page has structured data</p>
            <p className="sa-empty-text">Nothing missing here — rich-result eligibility isn&rsquo;t limited by markup on these pages.</p>
          </div>
        ) : (
          <>
            <p className="sa-issue-impact">{MISSING_SCHEMA_COPY.businessImpact}</p>
            <p className="sa-issue-fix"><strong>Recommended fix:</strong> {MISSING_SCHEMA_COPY.recommendedFix}</p>
            <div className="sa-schema-grid">
              {pagesMissingSchema.slice(0, SCHEMA_WEB_LIMIT).map((p) => (
                <div key={p.url} className="sa-schema-card">
                  <p className="sa-instance-url">{p.url}</p>
                  <span className="sa-schema-chip sa-schema-chip-fail">Missing — suggested: {suggestSchemaTypeWithReason(p).type}</span>
                      {suggestSchemaTypeWithReason(p).type !== "Uncertain" && suggestSchemaTypeWithReason(p).type !== "Needs manual review" && (
                        <span className="sa-schema-reason" style={{display:"block",fontSize:"0.75rem",color:"#6b7280",marginTop:"4px"}}>{suggestSchemaTypeWithReason(p).reason}</span>
                      )}
                </div>
              ))}
            </div>
            {pagesMissingSchema.length > SCHEMA_WEB_LIMIT && (
              <details className="sa-instance-expand">
                <summary className="sa-instance-expand-label">
                  Show all {pagesMissingSchema.length} pages missing schema
                </summary>
                <div className="sa-schema-grid">
                  {pagesMissingSchema.slice(SCHEMA_WEB_LIMIT).map((p) => (
                    <div key={p.url} className="sa-schema-card">
                      <p className="sa-instance-url">{p.url}</p>
                      <span className="sa-schema-chip sa-schema-chip-fail">Missing — suggested: {suggestSchemaTypeWithReason(p).type}</span>
                      {suggestSchemaTypeWithReason(p).type !== "Uncertain" && suggestSchemaTypeWithReason(p).type !== "Needs manual review" && (
                        <span className="sa-schema-reason" style={{display:"block",fontSize:"0.75rem",color:"#6b7280",marginTop:"4px"}}>{suggestSchemaTypeWithReason(p).reason}</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      {audit.crawl.duplicateTitles.length > 0 && (
        <section className="sa-issues" id="duplicate-title-tags">
          <h2 className="sa-h2">Duplicate Title Tags</h2>
          <div className="sa-infobox">
            <p className="sa-info-line" style={{ margin: 0 }}>
              <span className="sa-info-label">What it is.</span>{" "}
              {DUPLICATE_TITLES_COPY.whyItMatters} When search engines cannot tell two pages apart, they have less evidence about what makes each one worth showing — and a user scanning the results sees the same headline twice instead of a clear choice.
            </p>
          </div>
          <div className="sa-infobox">
            <p className="sa-info-line">
              <span className="sa-info-label">Pages affected:</span> {duplicateTitleUrlCount} of {audit.crawl.pages.length} ({pctOfCrawled(duplicateTitleUrlCount)}%)
            </p>
            <p className="sa-info-line">
              <span className="sa-info-label">Shared titles:</span> {audit.crawl.duplicateTitles.length} in use
            </p>
          </div>
          {priorityList.find((p) => p.key === "duplicate_titles") && (
            <p className="sa-impact-badge">
              {impactBadgeText(priorityList.find((p) => p.key === "duplicate_titles")!)} · {priorityList.find((p) => p.key === "duplicate_titles")!.effortBucketLabel}
            </p>
          )}
          <p className="sa-issue-impact">{DUPLICATE_TITLES_COPY.businessImpact}</p>
          <p className="sa-issue-fix"><strong>Recommended fix:</strong> {DUPLICATE_TITLES_COPY.recommendedFix}</p>
          <div className="sa-schema-grid">
            {audit.crawl.duplicateTitles.map((group, i) => (
              <div key={i} className="sa-schema-card">
                <p className="sa-issue-title">&ldquo;{group.value}&rdquo;</p>
                <span className="sa-schema-chip sa-schema-chip-warn">{group.urls.length} page{group.urls.length === 1 ? "" : "s"}</span>
                <div className="sa-instance-list">
                  {group.urls.slice(0, 8).map((u) => (
                    <p key={u} className="sa-instance-url">{u}</p>
                  ))}
                </div>
                {group.urls.length > 8 && (
                  <details className="sa-instance-expand">
                    <summary className="sa-instance-expand-label">Show all {group.urls.length} pages</summary>
                    <div className="sa-instance-list">
                      {group.urls.slice(8).map((u) => (
                        <p key={u} className="sa-instance-url">{u}</p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {audit.crawl.duplicateMetaDescriptions.length > 0 && (
        <section className="sa-issues" id="duplicate-meta-descriptions">
          <h2 className="sa-h2">Duplicate Meta Descriptions</h2>
          <div className="sa-infobox">
            <p className="sa-info-line" style={{ margin: 0 }}>
              <span className="sa-info-label">What it is.</span>{" "}
              {DUPLICATE_META_DESCRIPTIONS_COPY.whyItMatters} The meta description is the preview text shown under your result — when several pages show the same preview, a searcher has no way to tell which one actually answers their question.
            </p>
          </div>
          <div className="sa-infobox">
            <p className="sa-info-line">
              <span className="sa-info-label">Pages affected:</span> {duplicateDescUrlCount} of {audit.crawl.pages.length} ({pctOfCrawled(duplicateDescUrlCount)}%)
            </p>
            <p className="sa-info-line">
              <span className="sa-info-label">Shared descriptions:</span> {audit.crawl.duplicateMetaDescriptions.length} in use
            </p>
          </div>
          {priorityList.find((p) => p.key === "duplicate_meta_descriptions") && (
            <p className="sa-impact-badge">
              {impactBadgeText(priorityList.find((p) => p.key === "duplicate_meta_descriptions")!)} · {priorityList.find((p) => p.key === "duplicate_meta_descriptions")!.effortBucketLabel}
            </p>
          )}
          <p className="sa-issue-impact">{DUPLICATE_META_DESCRIPTIONS_COPY.businessImpact}</p>
          <p className="sa-issue-fix"><strong>Recommended fix:</strong> {DUPLICATE_META_DESCRIPTIONS_COPY.recommendedFix}</p>
          <div className="sa-schema-grid">
            {audit.crawl.duplicateMetaDescriptions.map((group, i) => (
              <div key={i} className="sa-schema-card">
                <p className="sa-issue-title">&ldquo;{group.value}&rdquo;</p>
                <span className="sa-schema-chip sa-schema-chip-warn">{group.urls.length} page{group.urls.length === 1 ? "" : "s"}</span>
                <div className="sa-instance-list">
                  {group.urls.slice(0, 8).map((u) => (
                    <p key={u} className="sa-instance-url">{u}</p>
                  ))}
                </div>
                {group.urls.length > 8 && (
                  <details className="sa-instance-expand">
                    <summary className="sa-instance-expand-label">Show all {group.urls.length} pages</summary>
                    <div className="sa-instance-list">
                      {group.urls.slice(8).map((u) => (
                        <p key={u} className="sa-instance-url">{u}</p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sa-issues" id="image-seo">
        <h2 className="sa-h2">On-Page SEO: Image Optimization</h2>
        {imageIssuesFiltered.length === 0 && oversizedImages.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No image issues found</p>
            <p className="sa-empty-text">Alt text, dimensions, and formats all look good. No missing alt text, no images without dimensions, and no non-optimized formats were found across the {audit.crawl.pages.length} crawled pages.</p>
          </div>
        ) : (
          <IssueGroupList
            groups={imageIssuesFiltered}
            emptyTitle="No image issues found"
            emptyText="Alt text, dimensions, and formats all look good."
            priorityList={priorityList}
            nonDescriptiveImageFindings={nonDescriptiveImageFindings}
            estimatedImpact={estimatedImpact}
          />
        )}
        {oversizedImages.length > 0 && (
          <div className="sa-issue-group">
            <div className="sa-issue-group-head">
              <p className="sa-issue-title">Oversized images</p>
              <span className="sa-issue-count">{oversizedImages.length} image{oversizedImages.length === 1 ? "" : "s"}</span>
            </div>
            <p className="sa-issue-why">Large image files slow down page load, which hurts both user experience and performance-based ranking signals.</p>
            <p className="sa-issue-impact">Unnecessarily large images are one of the most common causes of a slow-loading page.</p>
            <p className="sa-issue-fix"><strong>Recommended fix:</strong> Compress these images or convert them to a modern format like WebP or AVIF.</p>
            <p className="sa-ai-review-note">{buildOversizedImagesSmartNote(oversizedImages.length)}</p>

            <div className="sa-instance-list">
              {oversizedImages.slice(0, 8).map((img, i) => (
                <div key={i} className="sa-instance">
                  <p className="sa-instance-url">{img.src}</p>
                  <p className="sa-issue-why">{formatBytes(img.contentLengthBytes)} — linked from {img.linkedFrom.length} page{img.linkedFrom.length === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>

            {oversizedImages.length > 8 && (
              <details className="sa-instance-expand">
                <summary className="sa-instance-expand-label">
                  Show all {oversizedImages.length} images
                </summary>
                <div className="sa-instance-list">
                  {oversizedImages.slice(8).map((img, i) => (
                    <div key={i} className="sa-instance">
                      <p className="sa-instance-url">{img.src}</p>
                      <p className="sa-issue-why">{formatBytes(img.contentLengthBytes)} — linked from {img.linkedFrom.length} page{img.linkedFrom.length === 1 ? "" : "s"}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="sa-issues" id="url-seo">
        <h2 className="sa-h2">Technical SEO: URL Structure</h2>
        {urlIssues.length > 0 && (
          <div className="sa-url-seo-note">
            <p className="sa-url-seo-note-title">A note about the URLs below</p>
            <p className="sa-url-seo-note-text">
              Every URL in this section is listed because of its URL structure (length, readability, encoding, or
              parameters) — not because it is broken. If a URL listed here currently returns an error (404, 410, 5xx) or
              non-HTML content, it is intentionally included: the URL-structure fix applies whether the page works today
              or not, and that URL is additionally reported in the Broken Links / error sections of this report. URLs are
              shown decoded for readability; the working address is what the crawler checked.
            </p>
          </div>
        )}
        {urlIssues.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No URL structure issues found</p>
            <p className="sa-empty-text">URLs are clean in length, readability, encoding, and parameters across all {audit.crawl.pages.length} crawled pages. No URL-structure issues were found.</p>
          </div>
        ) : (
          <IssueGroupList
            groups={urlIssues}
            emptyTitle="No URL issues found"
            emptyText="URL structure looks clean across the whole site."
            priorityList={priorityList}
            estimatedImpact={estimatedImpact}
          />
        )}
      </section>

      {/* Indexability & Discoverability - always render. (A duplicate
          "Indexability" section that used to follow this one rendered the
          exact same groups a second time — removed.) Failed Indexability
          checks feed check-derived detail groups here first, so a failed
          check always has its full treatment (why it failed, impact,
          affected URLs, fix) — never just a count in the grid above. */}
      <section className="sa-issues" id="indexability-details">
        <h2 className="sa-h2">Indexability &amp; Discoverability</h2>
        <IssueGroupList
          groups={[...indexabilityDetailGroups, ...indexabilityIssues]}
          emptyTitle="Fully indexable and well-linked"
          emptyText="No noindex tags found, and every crawled page is reachable through internal links."
          priorityList={priorityList}
          estimatedImpact={estimatedImpact}
        />
      </section>

      {/* On-Page SEO findings */}
      {(() => {
        const onPageIssues = otherIssuesFiltered.filter((g) => {
          const p = priorityList.find((pl) => pl.key === g.flag);
          return p?.pillar === "onPage";
        });
        return (
          <section className="sa-issues" id="on-page-seo">
            <h2 className="sa-h2">On-Page SEO</h2>
            <p className="sa-priority-note">
              Title tags, meta descriptions, headings, word count, thin content, internal links, and image optimization —
              every finding below belongs to the On-Page SEO pillar.
            </p>
            {onPageIssues.length === 0 ? (
              <div className="sa-empty sa-empty-pass">
                <p className="sa-empty-title">All on-page checks passed</p>
                <p className="sa-empty-text">Title tags, meta descriptions, headings, word count, thin content, and internal links all look good across the {audit.crawl.pages.length} crawled pages. No on-page SEO issues were found.</p>
              </div>
            ) : (
              <IssueGroupList
                groups={onPageIssues}
                emptyTitle="No on-page issues found"
                emptyText="Titles, descriptions, headings, content, and images all look good."
                priorityList={priorityList}
                nonDescriptiveImageFindings={nonDescriptiveImageFindings}
                estimatedImpact={estimatedImpact}
              />
            )}
          </section>
        );
      })()}

      {/* Indexation & Crawl Health — canonicals, noindex, URL structure.
          Note: this section covers a SUBSET of the Technical SEO pillar.
          Other Technical SEO findings (broken links, performance, crawl errors)
          appear in their own dedicated sections below. */}
      {(() => {
        const technicalIssues = otherIssuesFiltered.filter((g) => {
          const p = priorityList.find((pl) => pl.key === g.flag);
          return p?.pillar === "technical";
        });
        return (
          <section className="sa-issues" id="technical-seo">
            <h2 className="sa-h2">Indexation & Crawl Health</h2>
            <p className="sa-priority-note">
              Canonicals, noindex directives, URL structure, and indexability — every finding below belongs to the Technical SEO pillar.
              Other Technical SEO findings (broken links, performance, crawl errors) appear in their own dedicated sections.
            </p>
            {technicalIssues.length === 0 ? (
              <div className="sa-empty sa-empty-pass">
                <p className="sa-empty-title">All indexation &amp; crawl health checks passed</p>
                <p className="sa-empty-text">Canonicals, noindex directives, URL structure, and indexability checks all look good across the {audit.crawl.pages.length} crawled pages. Note: other Technical SEO findings (broken links, performance, crawl errors) are covered in their own sections.</p>
              </div>
            ) : (
              <IssueGroupList
                groups={technicalIssues}
                emptyTitle="No indexation issues found"
                emptyText="Canonicals, indexation, and URL structure all look good."
                priorityList={priorityList}
                estimatedImpact={estimatedImpact}
              />
            )}
          </section>
        );
      })()}

      {/* Broken links - always render */}
      <section className="sa-issues" id="broken-links">
        <h2 className="sa-h2">Technical SEO: Broken Links</h2>
        {brokenLinks.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No broken links found</p>
            <p className="sa-empty-text">No issues found. This section is healthy.</p>
          </div>
        ) : (
          <>
            <p className="sa-priority-note">
              {brokenLinkScopeLabel(brokenLinks.length, brokenLinkSourcePages)} — grouped by why they failed. Multiple
              broken links on the same page each count separately, so this counts link instances, not affected pages.
              These are confirmed failures (not found, gone, or unreachable) — they won&rsquo;t resolve on their own.
            </p>
            <p className="sa-ai-review-note">{buildBrokenLinksSmartNote(brokenLinks.length)}</p>
            {groupBrokenLinksByCategory(brokenLinks).map((group) => (
              <div key={group.category} style={{ marginBottom: 20 }}>
                <p className="sa-issue-title">{group.label} ({group.links.length})</p>
                <div className="sa-instance-list">
                  {group.links.slice(0, 8).map((link, i) => (
                    <div key={i} className="sa-instance">
                      <p className="sa-instance-url">{link.url}</p>
                      <p className="sa-issue-why">
                        {describeLinkFailure(link)}
                        {" — "}linked from {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                </div>
                {group.links.length > 8 && (
                  <details className="sa-instance-expand">
                    <summary className="sa-instance-expand-label">
                      Show all {group.links.length} links
                    </summary>
                    <div className="sa-instance-list">
                      {group.links.slice(8).map((link, i) => (
                        <div key={i} className="sa-instance">
                          <p className="sa-instance-url">{link.url}</p>
                          <p className="sa-issue-why">
                            {describeLinkFailure(link)}
                            {" — "}linked from {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </>
        )}
      </section>

      {/* Links blocked from automated checking — a DIFFERENT bucket from
          genuinely broken links. A 403/401/429 means the server refused
          our automated checker (WAF, bot protection, rate limiter), which
          says nothing about whether the link works for a real visitor.
          Lower-severity, spot-check language; never styled as confirmed
          failures. */}
      {blockedLinks.length > 0 && (
        <section className="sa-issues">
          <h2 className="sa-h2">Links blocked from automated checking</h2>
          <p className="sa-priority-note">
            {blockedLinks.length} link{blockedLinks.length === 1 ? "" : "s"} returned a 403 Forbidden (or similar
            bot-blocking response) to our automated checker during this crawl. This usually means the server — often a
            WAF or bot-protection rule — is blocking automated requests, NOT that the link is broken. Spot-check a few
            of these in a browser before treating them as errors; most will load fine for a real visitor.
          </p>
          {groupBrokenLinksByCategory(blockedLinks).map((group) => (
            <div key={group.category} style={{ marginBottom: 20 }}>
              <p className="sa-issue-title">{group.label} ({group.links.length})</p>
              <div className="sa-instance-list">
                {group.links.slice(0, 8).map((link, i) => (
                  <div key={i} className="sa-instance">
                    <p className="sa-instance-url">{link.url}</p>
                    <p className="sa-issue-why">
                      {describeLinkFailure(link)}
                      {" — "}linked from {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>
              {group.links.length > 8 && (
                <details className="sa-instance-expand">
                  <summary className="sa-instance-expand-label">Show all {group.links.length} links</summary>
                  <div className="sa-instance-list">
                    {group.links.slice(8).map((link, i) => (
                      <div key={i} className="sa-instance">
                        <p className="sa-instance-url">{link.url}</p>
                        <p className="sa-issue-why">
                          {describeLinkFailure(link)}
                          {" — "}linked from {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </section>
      )}

      {/* NEW: Temporary Crawl Issues — split out from Broken Links so rate
          limits, timeouts, and transient connection errors don't inflate
          the broken-link count. These often clear up on a rerun. */}
      {temporaryLinks.length > 0 && (
        <section className="sa-issues">
          <h2 className="sa-h2">Temporary Crawl Issues</h2>
          <p className="sa-priority-note">
            {temporaryLinks.length} link{temporaryLinks.length === 1 ? "" : "s"} failed with a rate limit, timeout, or
            transient connection error during this crawl — kept separate from Broken Links because these often clear
            up on their own. Re-running the audit is the fastest way to confirm which of these, if any, are genuinely
            broken.
          </p>
          {groupBrokenLinksByCategory(temporaryLinks).map((group) => (
            <div key={group.category} style={{ marginBottom: 20 }}>
              <p className="sa-issue-title">{group.label} ({group.links.length})</p>
              <div className="sa-instance-list">
                {group.links.slice(0, 8).map((link, i) => (
                  <div key={i} className="sa-instance">
                    <p className="sa-instance-url">{link.url}</p>
                    <p className="sa-issue-why">
                      {describeLinkFailure(link)}
                      {" — "}linked from {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>
              {group.links.length > 8 && (
                <details className="sa-instance-expand">
                  <summary className="sa-instance-expand-label">
                    Show all {group.links.length} links
                  </summary>
                  <div className="sa-instance-list">
                    {group.links.slice(8).map((link, i) => (
                      <div key={i} className="sa-instance">
                        <p className="sa-instance-url">{link.url}</p>
                        <p className="sa-issue-why">
                          {describeLinkFailure(link)}
                          {" — "}linked from {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </section>
      )}


      {/* Domain Consistency - always render */}
      <section className="sa-issues" id="domain-consistency">
        <h2 className="sa-h2">Domain Consistency</h2>
        {(() => {
          const probes = audit.crawl.wwwConsistency?.variantProbes ?? [];
          const isChecked = audit.crawl.wwwConsistency?.checked ?? false;
          const isConsistent = audit.crawl.wwwConsistency?.consistent ?? false;
          const hasProbes = probes.length > 0;
          const showHealthy = isChecked && isConsistent;
          const showInconsistent = isChecked && !isConsistent;

          if (showHealthy) {
            return (
              <div className="sa-empty sa-empty-pass">
                <p className="sa-empty-title">\u2713 Domain is consistent</p>
                <p className="sa-empty-text">{audit.crawl.wwwConsistency.summary || "All tested URL variants resolve correctly to the preferred HTTPS URL."}</p>
                {probes.length > 0 && (
                  <div className="sa-infobox">
                    {probes.map((p, i) => {
                      const isCanonicalInput = p.status === "canonical";
                      const inputLabel = isCanonicalInput ? " (input URL)" : "";
                      const statusIcon = (
                        p.status === "canonical" || p.status === "direct" || p.status === "redirects_to_canonical"
                      ) ? "\u2713" : "\u2717";
                      const statusClass = (
                        p.status === "canonical" || p.status === "direct" || p.status === "redirects_to_canonical"
                      ) ? "sa-info-pass" : (p.status === "redirects_elsewhere" ? "sa-info-warn" : "sa-info-fail");
                      return (
                        <p key={i} className="sa-info-line">
                          <span className="sa-info-label">{p.requestedUrl}{inputLabel}</span>{" "}
                          <span className={statusClass}>{statusIcon} {p.explanation}</span>
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          if (showInconsistent) {
            return (
              <>
                <p className="sa-priority-note">{audit.crawl.wwwConsistency.issue}</p>
                <div className="sa-infobox">
                  {probes.map((p, i) => {
                    const isCanonicalInput = p.status === "canonical";
                    const inputLabel = isCanonicalInput ? " (input URL)" : "";
                    const statusIcon = (
                      p.status === "canonical" || p.status === "direct" || p.status === "redirects_to_canonical"
                    ) ? "\u2713" : (p.status === "redirects_elsewhere" ? "\u26A0" : "\u2717");
                    const statusClass = (
                      p.status === "canonical" || p.status === "direct" || p.status === "redirects_to_canonical"
                    ) ? "sa-info-pass" : (p.status === "redirects_elsewhere" ? "sa-info-warn" : "sa-info-fail");
                    return (
                      <p key={i} className="sa-info-line">
                        <span className="sa-info-label">{p.requestedUrl}{inputLabel}</span>{" "}
                        <span className={statusClass}>{statusIcon} {p.explanation}</span>
                        {p.redirectChain.length > 0 && (
                          <span className="sa-info-detail"> Redirect chain: {p.redirectChain.map((h) => h.statusCode).join(" \u2192 ")}</span>
                        )}
                      </p>
                    );
                  })}
                </div>
                <div className="sa-infobox">
                  <p className="sa-info-line"><span className="sa-info-label">Conclusion:</span> {audit.crawl.wwwConsistency.summary || audit.crawl.wwwConsistency.issue || "Domain consistency check completed."}</p>
                </div>
              </>
            );
          }

          return (
            <div className="sa-empty sa-empty-pass">
              <p className="sa-empty-title">Domain is consistent</p>
              <p className="sa-empty-text">Every reachable www/non-www and http/https variant redirects to one canonical domain. No issues found. This section is healthy.</p>
            </div>
          );
        })()}
      </section>

      {/* NEW: Response Code Breakdown section */}
      <section className="sa-issues">
        <h2 className="sa-h2">Response Code Breakdown</h2>
        <p className="sa-priority-note">
          The HTTP responses received for the {responseCodeBreakdown.totalChecked} page{responseCodeBreakdown.totalChecked === 1 ? "" : "s"} crawled during this audit.
        </p>
        {responseCodeBreakdown.groups.length === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No response codes recorded</p>
            <p className="sa-empty-text">No issues found. This section is healthy.</p>
          </div>
        ) : (
          responseCodeBreakdown.groups.map((group) => (
            <div key={group.key} className="sa-issue-group">
              <div className="sa-issue-group-head">
                <p className="sa-issue-title">{group.label}</p>
                <span className="sa-issue-count">{group.count}</span>
              </div>
              <div className="sa-instance-list">
                {group.codes.map((c) => (
                  <div key={c.code} className="sa-instance">
                    <p className="sa-instance-url">{describeStatusCode(c.code)} — {c.count} occurrence{c.count === 1 ? "" : "s"}</p>
                    {c.urls.slice(0, 3).map((u, i) => (
                      <p key={i} className="sa-issue-why">{u}</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        <p className="sa-ai-review-note" style={{ marginTop: 10 }}>
          This chart reflects the HTTP responses received for crawled pages only. Static assets and background resource requests are excluded.
          {responseCodeBreakdown.probeStatus.blockedCount > 0 &&
            ` Separately, ${responseCodeBreakdown.probeStatus.blockedCount} link destination${responseCodeBreakdown.probeStatus.blockedCount === 1 ? "" : "s"} returned ${responseCodeBreakdown.probeStatus.forbidden} forbidden (401/403) and ${responseCodeBreakdown.probeStatus.rateLimited} rate-limited (429) response${responseCodeBreakdown.probeStatus.blockedCount === 1 ? "" : "s"} to the automated link checker — reported in "Links blocked from automated checking" rather than counted here, because link checks are separate probe requests and a refusal there does not mean the page itself failed.`}
        </p>
      </section>

      {/* NEW: Redirect Chain section */}
      <section className="sa-issues" id="redirect-chain">
        <h2 className="sa-h2">Redirect Chain</h2>
        {!redirectChainSummary.hasChains ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No redirect chains found</p>
            <p className="sa-empty-text">{redirectChainSummary.healthyMessage}</p>
          </div>
        ) : (
          <>
            <p className="sa-priority-note">
              {redirectChainSummary.chains.length} redirect chain{redirectChainSummary.chains.length === 1 ? "" : "s"} found
              {redirectChainSummary.excessiveCount > 0 ? `, ${redirectChainSummary.excessiveCount} of which ${redirectChainSummary.excessiveCount === 1 ? "is" : "are"} excessive (4+ hops).` : "."}
            </p>
            <div className="sa-instance-list">
              {redirectChainSummary.chains.map((chain, i) => (
                <div key={i} className="sa-instance">
                  <p className="sa-instance-url">{chain.originalUrl} → {chain.finalUrl}</p>
                  <p className="sa-issue-why" style={chain.excessive ? { color: "var(--fail)" } : undefined}>
                    {chain.hopCount} hop{chain.hopCount === 1 ? "" : "s"}{chain.excessive ? " — excessive" : ""}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
        {redirectChainSummary.singleHops.length > 0 && (
          <p className="sa-priority-note">
            {redirectChainSummary.singleHops.length} single-hop redirect{redirectChainSummary.singleHops.length === 1 ? "" : "s"} in place
            {(() => {
              const examples = redirectChainSummary.singleHops
                .slice(0, 2)
                .map((r) => `${r.originalUrl} → ${r.finalUrl}`)
                .join(", ");
              return examples ? ` (e.g. ${examples})` : "";
            })()}
            {" — normal and not worth changing; no action needed."}
          </p>
        )}
      </section>

      {/* NEW: Links Blocked by Robots.txt section */}
      <section className="sa-issues" id="links-blocked-robots">
        <h2 className="sa-h2">Links Blocked by Robots.txt</h2>
        <p className="sa-priority-note">
          Links discovered on the site that were never checked because robots.txt disallows the path — kept separate from genuine broken links, since a block isn&rsquo;t evidence the link is dead.
        </p>
        {robotsBlockedLinksSummary.count === 0 ? (
          <div className="sa-empty sa-empty-pass">
            <p className="sa-empty-title">No links blocked</p>
            <p className="sa-empty-text">{robotsBlockedLinksSummary.healthyMessage}</p>
          </div>
        ) : (
          <div className="sa-instance-list">
            {robotsBlockedLinksSummary.links.map((link, i) => (
              <div key={i} className="sa-instance">
                <p className="sa-instance-url">{link.url}</p>
                <p className="sa-issue-why">linked from {link.linkedFrom.length} page{link.linkedFrom.length === 1 ? "" : "s"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* NEW: Complete SEO Check Coverage — a concise diagnostic index.
          The summary strip and the status index below both derive from the
          SAME seoCheckCoverage list, so "X Passed · Y Failed" always
          matches the checks. Each check is one row (name + status + count)
          grouped by the detailed section that carries its evidence — no
          URLs, explanations, or recommendations are duplicated here. */}
      <section className="sa-issues">
        <h2 className="sa-h2">Complete SEO Check Coverage</h2>
        <p className="sa-priority-note">Every check this audit runs, whether or not it found a problem.</p>

        <a href="#failed-seo-checks" className="sa-coverage-summary">
          <div className="sa-coverage-stat sa-coverage-stat-total">
            <span className="sa-coverage-num">{coverageSummary.total}</span>
            <span className="sa-coverage-label">Checks run</span>
          </div>
          <div className="sa-coverage-stat sa-coverage-stat-pass">
            <span className="sa-coverage-num">{coverageSummary.passed}</span>
            <span className="sa-coverage-label">Passed</span>
          </div>
          <div className="sa-coverage-stat sa-coverage-stat-fail">
            <span className="sa-coverage-num">{coverageSummary.failed}</span>
            <span className="sa-coverage-label">Failed</span>
          </div>
          {coverageSummary.needsImprovement > 0 && (
            <div className="sa-coverage-stat sa-coverage-stat-warn">
              <span className="sa-coverage-num">{coverageSummary.needsImprovement}</span>
              <span className="sa-coverage-label">Need improvement</span>
            </div>
          )}
          <span className="sa-coverage-cta">
            {failedCoverageChecks.length + warnCoverageChecks.length > 0
              ? "See what failed and where the details are ↓"
              : "Every check passed ✓"}
          </span>
        </a>

        {/* The status index — one compact row per check (name + status +
            count). No URLs, no explanations, no recommendations here: the
            detailed evidence lives in the section each group points to. */}
        <div id="failed-seo-checks" className="sa-coverage-index">
          {coverageGroups.map((group) => (
            <div key={group.name} className="sa-coverage-group">
              <h3 className="sa-h3">{group.name}</h3>
              <div className="sa-coverage-group-list">
                {group.checks.map((check) => (
                  <div key={check.key} className="sa-coverage-row">
                    <span className="sa-coverage-row-label">{check.label}</span>
                    {check.status === "fail" ? (
                      <span className="sa-coverage-badge-fail">✗ Failed</span>
                    ) : check.status === "warn" ? (
                      <span className="sa-coverage-badge-warn">Needs improvement</span>
                    ) : (
                      <span className="sa-coverage-badge-pass">✓ Passed</span>
                    )}
                    {check.affectedCount > 0 && (
                      <span className="sa-coverage-row-count">
                        {check.status === "warn"
                          ? `${check.affectedCount} ${countUnitFor(check.affectedCount, check.countUnit)} need${check.affectedCount === 1 ? "s" : ""} improvement`
                          : `${check.affectedCount} ${countUnitFor(check.affectedCount, check.countUnit)} affected`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="sa-coverage-see">
                For detailed findings, affected URLs, measurements, business impact, and recommended fixes, see the{" "}
                {group.anchor && group.hasAction ? <a href={`#${group.anchor}`}>{group.name}</a> : group.name}{" "}
                section.
              </p>
            </div>
          ))}
        </div>
      </section>

      {multiHopChainAnalyses.length > 0 && (
        <section className="sa-issues">
          <h2 className="sa-h2">Redirect Chains (Detailed)</h2>
          <p className="sa-priority-note">
            Chains of more than one redirect hop between a link and its final destination — each hop adds latency and burns the crawl budget search engines allocate to your site.
          </p>
          {multiHopChainAnalyses.map((chain, i) => (
            <div key={i} className={`sa-redirect-chain ${chain.likelyLoop ? "sa-redirect-chain-loop" : ""}`}>
              <div className="sa-redirect-chain-head">
                <span className="sa-redirect-chain-path">{chain.originalUrl} → {chain.finalUrl}</span>
                <span className={`sa-redirect-chain-badge ${chain.likelyLoop ? "sa-redirect-chain-badge-loop" : ""}`}>
                  {chain.likelyLoop ? "Likely loop" : `${chain.hopCount} hops`}
                </span>
              </div>
              {chain.chainType !== "unknown" && (
                <p className="sa-redirect-chain-type">{chainTypeLabel(chain.chainType)}</p>
              )}
              <p className="sa-issue-fix">{chain.recommendation}</p>
            </div>
          ))}
        </section>
      )}

      <section className="sa-issues" id="robots-sitemap">
        <h2 className="sa-h2">Robots.txt &amp; Sitemap</h2>
        <p className="sa-priority-note">Informational only — not factored into your score.</p>

        <div className="sa-rst-intro">
          Two small files at the root of your site that shape how search engines work with it. <strong>robots.txt</strong> tells crawlers what they may or may not fetch (it controls <strong>crawling</strong>, not indexing — it can&rsquo;t remove a page from results). The <strong>sitemap</strong> lists the pages you want search engines to know about (it helps with <strong>discovery</strong>, but doesn&rsquo;t guarantee indexing or rankings).
        </div>

        <div className="sa-rst-grid">
          {/* robots.txt status card */}
          <div className="sa-rst-card">
            <div className="sa-rst-head">
              <p className="sa-rst-title">robots.txt</p>
              {!robotsAudit ? (
                <span className="sa-rst-badge sa-rst-badge-info">Unchecked</span>
              ) : robotsAudit.status === "not_found" ? (
                <span className="sa-rst-badge sa-rst-badge-info">Not found</span>
              ) : robotsAudit.status === "fetch_error" ? (
                <span className="sa-rst-badge sa-rst-badge-info">Unverified</span>
              ) : robotsAudit.disallowedPaths.length === 0 ? (
                <span className="sa-rst-badge sa-rst-badge-pass">✓ Healthy</span>
              ) : (
                <span className="sa-rst-badge sa-rst-badge-warn">{robotsAudit.disallowedPaths.length} blocked</span>
              )}
            </div>
            <p className="sa-rst-desc">
              {robotsAudit && robotsAudit.status === "found" && robotsAudit.disallowedPaths.length > 0
                ? `Found — ${robotsAudit.disallowedPaths.length} path${robotsAudit.disallowedPaths.length === 1 ? "" : "s"} excluded from crawling. That is often intentional — confirm none of them are pages you actually want indexed.`
                : describeRobotsAudit(robotsAudit)}
            </p>

            {robotsAudit && (
              <div className="sa-rst-meta">
                {webSiteOrigin && (
                  <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">Location</span><span className="sa-rst-meta-value">{webSiteOrigin}/robots.txt</span></p>
                )}
                {robotsAudit.httpStatus !== undefined && (
                  <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">HTTP status</span><span className="sa-rst-meta-value">{robotsAudit.httpStatus}</span></p>
                )}
                {robotsAudit.status === "found" && robotsAudit.disallowedPaths.length > 0 && (
                  <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">Disallowed paths</span><span className="sa-rst-meta-value">{robotsAudit.disallowedPaths.length}</span></p>
                )}
              </div>
            )}

            {robotsAudit?.directives && robotsAudit.directives.length > 0 && (
              <div className="sa-rst-detected">
                <p className="sa-rst-block-title">Directives detected</p>
                {robotsAudit.directives.slice(0, 6).map((blk, i) => (
                  <div key={i} className="sa-rst-block">
                    {/* Only rules that BLOCK paths are shown — allowed paths
                        are normal/expected (most files allow everything by
                        default) and only add noise. A block that only
                        allows paths is skipped entirely. */}
                    {blk.disallows.length > 0 && (
                      <p className="sa-rst-block-label">User-agent: {blk.userAgent || "(no user-agent)"}</p>
                    )}
                    {blk.disallows.map((d, j) => (
                      <p key={`d${j}`} className="sa-rst-rule"><strong>Blocks: </strong>{d}</p>
                    ))}
                    {blk.disallows.length === 0 && blk.allows.length === 0 && (
                      <p className="sa-rst-rule">No allow or disallow rules under this agent.</p>
                    )}
                  </div>
                ))}
                {robotsAudit.directives.length > 6 && (
                  <p className="sa-rst-more">+ {robotsAudit.directives.length - 6} more rule blocks{webSiteOrigin ? ` — full file available at ${webSiteOrigin}/robots.txt` : ""}</p>
                )}
                {robotsAudit.sitemapDirective && (
                  <p className="sa-rst-rule"><strong>Sitemap: </strong>{robotsAudit.sitemapDirective}</p>
                )}
                <p className="sa-rst-note">Disallow rules tell crawlers which paths they may not fetch. Rules apply only to the crawler named in their User-agent line — the &ldquo;*&rdquo; block applies to all crawlers.</p>
              </div>
            )}

            {!robotsAudit?.directives && robotsAudit && robotsAudit.status === "found" && robotsAudit.disallowedPaths.length > 0 && (
              <ul className="sa-rst-list">
                {robotsAudit.disallowedPaths.map((p, i) => (
                  <li key={i} className="sa-robots-url">{p}</li>
                ))}
              </ul>
            )}

            {robotsAudit && robotsAudit.status === "not_found" && (
              <div className="sa-rst-impact">
                <p className="sa-rst-impact-title">What this means for your business</p>
                <p className="sa-rst-impact-text">For most sites this is fine — but with no file in place you can&rsquo;t guide crawlers toward what matters, or keep them away from low-value areas as the site grows.</p>
              </div>
            )}
            {robotsAudit && robotsAudit.status === "fetch_error" && (
              <div className="sa-rst-impact sa-rst-impact-info">
                <p className="sa-rst-impact-title">What this means for your business</p>
                <p className="sa-rst-impact-text">This audit can&rsquo;t confirm whether any important pages are being blocked until the file is reachable again.</p>
              </div>
            )}
            {robotsAudit && robotsAudit.status === "found" && robotsAudit.disallowedPaths.length > 0 && (
              <div className="sa-rst-impact">
                <p className="sa-rst-impact-title">What this means for your business</p>
                <p className="sa-rst-impact-text">{robotsAudit.disallowedPaths.length} path{robotsAudit.disallowedPaths.length === 1 ? " is" : "s are"} excluded from crawling, so search engines can&rsquo;t read their content — and a blocked URL can still be indexed (without its content) if it&rsquo;s linked to from elsewhere. If these are genuinely internal (admin, staging), the file is working as intended.</p>
              </div>
            )}
            {robotsAudit && robotsAudit.status === "found" && robotsAudit.disallowedPaths.length === 0 && (
              <div className="sa-rst-ok">
                <p className="sa-rst-ok-title">✓ What&rsquo;s working well</p>
                <p className="sa-rst-ok-text">No disallowed paths — crawlers can reach every part of the site{robotsAudit.sitemapDirective ? ", and the file points crawlers to your sitemap" : ""}. Keep it that way; if you later add areas you don&rsquo;t want crawled, add them here.</p>
              </div>
            )}

            {robotsAudit && robotsAudit.status !== "found" && (
              <div className="sa-rst-reco">
                <p className="sa-rst-reco-title">Recommendation</p>
                {robotsAudit.status === "not_found" && (
                  <p className="sa-rst-reco-text">Not required — without a file every path is crawlable. Adding one gives you explicit control over what crawlers access and a standard place to point them to your sitemap.</p>
                )}
                {robotsAudit.status === "fetch_error" && (
                  <p className="sa-rst-reco-text">Verify manually that the file loads and returns a 200 status, then re-run the audit.</p>
                )}
              </div>
            )}
            {robotsAudit && robotsAudit.status === "found" && robotsAudit.disallowedPaths.length > 0 && (
              <div className="sa-rst-reco">
                <p className="sa-rst-reco-title">Recommendation</p>
                <p className="sa-rst-reco-text">Confirm none of these paths are pages you actually want indexed — a common cause is a leftover staging-site rule left in place after launch.</p>
              </div>
            )}
          </div>

          {/* sitemap.xml status card */}
          <div className="sa-rst-card">
            <div className="sa-rst-head">
              <p className="sa-rst-title">sitemap.xml</p>
              {sitemapGuidance.show ? (
                sitemapAudit?.status === "fetch_error" ? (
                  <span className="sa-rst-badge sa-rst-badge-info">Unverified</span>
                ) : (
                  <span className="sa-rst-badge sa-rst-badge-warn">Attention</span>
                )
              ) : (
                <span className="sa-rst-badge sa-rst-badge-pass">✓ Healthy</span>
              )}
            </div>
            {sitemapGuidance.show ? (
              <>
                <p className="sa-rst-desc">{sitemapGuidance.affectedPagesNote}</p>
                <div className="sa-rst-meta">
                  {webSiteOrigin && (
                    <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">Location</span><span className="sa-rst-meta-value">{webSiteOrigin}/sitemap.xml</span></p>
                  )}
                  {sitemapAudit?.httpStatus !== undefined && (
                    <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">HTTP status</span><span className="sa-rst-meta-value">{sitemapAudit.httpStatus}</span></p>
                  )}
                </div>
                <div className={`sa-rst-impact ${sitemapAudit?.status === "fetch_error" ? "sa-rst-impact-info" : ""}`}>
                  <p className="sa-rst-impact-title">What this means for your business</p>
                  {sitemapAudit?.status === "fetch_error" ? (
                    <p className="sa-rst-impact-text">This audit can&rsquo;t confirm whether your site benefits from sitemap-based discovery until the file is reachable again.</p>
                  ) : sitemapAudit?.status === "invalid" ? (
                    <p className="sa-rst-impact-text">A sitemap file exists but search engines can&rsquo;t read it, which makes it effectively the same as having none — your pages rely entirely on link-based discovery.</p>
                  ) : (
                    <p className="sa-rst-impact-text">Search engines can still find your pages by following links, but discovery is slower and less complete — deep or lightly linked pages can take much longer to be indexed, or be missed entirely.</p>
                  )}
                </div>
                {sitemapAudit?.status !== "fetch_error" && (
                  <div className="sa-rst-reco">
                    <p className="sa-rst-reco-title">Recommended fix</p>
                    <p className="sa-rst-reco-text">{sitemapGuidance.howToFix}</p>
                    <p className="sa-rst-reco-text"><strong>Time: </strong>{sitemapGuidance.timeEstimate}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {sitemapAudit?.httpStatus !== undefined && sitemapAudit.httpStatus >= 400 ? (
                  <div className="sa-rst-banner sa-rst-banner-warn">
                    <p className="sa-rst-banner-title">⚠ Found — but primary sitemap returned HTTP {sitemapAudit.httpStatus}</p>
                    <p className="sa-rst-banner-text">The sitemap was found and parsed ({sitemapAudit.urlCount} URLs), but the primary location returned HTTP {sitemapAudit.httpStatus}. Search engines hitting the primary location may see the same error.</p>
                  </div>
                ) : (
                  <p className="sa-rst-desc">{describeSitemapAudit(sitemapAudit)}{sitemapAudit?.status === "found" ? " The file parses cleanly." : ""}</p>
                )}
                <div className="sa-rst-meta">
                  {webSiteOrigin && (
                    <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">Location</span><span className="sa-rst-meta-value">{webSiteOrigin}/sitemap.xml</span></p>
                  )}
                  {sitemapAudit?.httpStatus !== undefined && (
                    <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">HTTP status</span><span className="sa-rst-meta-value">{sitemapAudit.httpStatus}</span></p>
                  )}
                  <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">URLs listed</span><span className="sa-rst-meta-value">{sitemapAudit?.urlCount ?? "—"}</span></p>
                  {sitemapAudit?.urls && (
                    <p className="sa-rst-meta-row"><span className="sa-rst-meta-label">Homepage listed</span><span className="sa-rst-meta-value">{(() => { try { return sitemapAudit.urls!.some((u) => new URL(u).pathname === "/"); } catch { return false; } })() ? "Yes" : "No"}</span></p>
                  )}
                </div>
                {sitemapAudit?.urls && sitemapAudit.urls.length > 0 && (
                  <div className="sa-rst-detected">
                    <p className="sa-rst-block-title">Pages included in the sitemap</p>
                    <ul className="sa-rst-list">
                      {sitemapAudit.urls.slice(0, 8).map((u, i) => (
                        <li key={i} className="sa-robots-url">{u}</li>
                      ))}
                    </ul>
                    {sitemapAudit.urlCount > 8 && (
                      <p className="sa-rst-more">+ {sitemapAudit.urlCount - 8} more URL{sitemapAudit.urlCount - 8 === 1 ? "" : "s"} listed in the file</p>
                    )}
                  </div>
                )}
                <div className="sa-rst-ok">
                  <p className="sa-rst-ok-title">✓ What&rsquo;s working well</p>
                  <p className="sa-rst-ok-text">The sitemap is accessible, parses successfully, and currently lists {sitemapAudit.urlCount} URL{sitemapAudit.urlCount === 1 ? "" : "s"}. That gives search engines a clean list of the pages you&rsquo;ve chosen to surface. Verify that all important canonical, indexable pages are represented — a sitemap is a discovery aid, not a guarantee of indexing or ranking.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* AI Search Readiness (AEO/GEO) section — before the Priority Implementation Roadmap */}
      <section className="sa-issues" id="ai-search-readiness">
        <h2 className="sa-h2">AI Search Readiness (AEO/GEO)</h2>
        <p className="sa-priority-note">
          How discoverable and citable this site is to AI answer engines (ChatGPT, Claude, Perplexity, Gemini, and
          similar) — a complementary lens to the SEO checks above, not a replacement for them.
        </p>
        <div className="sa-aeo-score-block">
          <div className={`sa-score-block ${aeoCheckTotal > 0 ? aeoReadinessClass : ""}`} style={{ fontSize: 28, ...(aeoCheckTotal > 0 ? {} : { color: "#999999" }) }}>
            {aeoCheckTotal > 0 ? `${aeoReadinessScore}%` : "—"}
          </div>
          <div>
            <p className="sa-aeo-score-label">AI Readiness Score</p>
            {aeoCheckTotal > 0 && (
              <span className={`sa-verdict-pill sa-verdict-${aeoVerdict.tier}`}>{aeoVerdict.label} (AI scale)</span>
            )}
            <p className="sa-aeo-score-sub">
              This score measures your website&rsquo;s structural and semantic visibility across modern Generative Search
              Engines (such as ChatGPT Search, Google Gemini, Perplexity, and Apple Intelligence). Traditional SEO looks
              at keyword density; AI Search Readiness calculates how reliably an LLM can extract, trust, and cite your
              content to answer user queries. Technically, it is the share of AI-readiness checks passing ({aeoCheckSummary.passCount} of {aeoCheckTotal})
              across the six AI-readiness categories (Entity Clarity, Structured Data, Answer Formatting, Citation
              Readiness, Trust Signals, AI Content Structure). It is a pass/fail share, not a weighted index, scored on a
              stricter scale than the SEO score — a lower number here is not the same verdict as the same number above.
            </p>
          </div>
        </div>
        {groupAeoChecksByCategory(audit.aeo.checks.map((c) => withAeoMetaDefaults(c))).map((group, i) => (
          <div key={group.category} className="sa-aeo-category" style={i > 0 ? { marginTop: 8 } : undefined}>
            <h3 className="sa-issue-title sa-aeo-category-title">{group.category}</h3>
            <div className="sa-checks-grid">
              {[...group.checks].sort((a, b) => Number(a.passed) - Number(b.passed)).map((check) => (
                <div key={check.key} className="sa-check-card">
                  <div className="sa-check-head">
                    <span className="sa-check-label">{check.label}</span>
                    <span className={check.applicabilityStatus === "not_applicable" ? "sa-check-na" : check.passed ? "sa-check-pass" : "sa-check-fail"}>
                      {check.applicabilityStatus === "not_applicable" ? "Not applicable" : check.passed ? "✓ Optimized" : check.affectedCount > 0 ? check.affectedUrls.length > 0 ? `${check.affectedCount} ${countUnitFor(check.affectedCount, check.countUnit ?? "pages")} affected` : "Action needed" : "Not found"}
                    </span>
                  </div>
                  <p className="sa-check-status">{check.statusText}</p>
                  {!check.passed && check.applicabilityStatus === "not_applicable" && (
                    <>
                      {/* Not applicable — shown so the client knows the check was considered,
                          but deliberately NOT presented as an action item (no priority, fix,
                          or impact bar). */}
                      {check.applicability && (
                        <p className="sa-issue-why" style={{ marginTop: 4 }}>
                          <strong>Applicability:</strong> {check.applicability}
                        </p>
                      )}
                      <p className="sa-issue-why" style={{ marginTop: 4, color: "#888888" }}>
                        This is not a required fix for your website — it is shown only so you know the check was considered.
                      </p>
                    </>
                  )}
                  {!check.passed && check.applicabilityStatus !== "not_applicable" && (
                    <>
                      {/* Conditional schema checks always show their applicability note, so a
                          site-type-specific recommendation is never mistaken for a mandatory fix. */}
                      {check.applicability && (
                        <p className="sa-issue-why" style={{ marginTop: 4 }}>
                          <strong>Applicability:</strong> {check.applicability}
                        </p>
                      )}
                      <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 600, color: "#888888", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Priority</p>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3, color: WEB_AEO_PRIORITY[check.priority].fg, background: WEB_AEO_PRIORITY[check.priority].bg }}>
                            {WEB_AEO_PRIORITY[check.priority].label}
                          </span>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 600, color: "#888888", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Effort</p>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3, color: WEB_AEO_DIFF[check.difficulty].fg, background: WEB_AEO_DIFF[check.difficulty].bg }}>
                            {WEB_AEO_DIFF[check.difficulty].label}
                          </span>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 600, color: "#888888", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>Estimated time</p>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3, color: "#555555", background: "#EEEEEE" }}>{check.timeLabel}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#888888", textTransform: "uppercase", letterSpacing: 0.4, width: 62 }}>Priority</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#EEEEEE", overflow: "hidden" }}>
                          <div style={{ width: `${WEB_AEO_PRIORITY[check.priority].fill}%`, height: 6, borderRadius: 3, background: WEB_AEO_PRIORITY[check.priority].fg }} />
                        </div>
                      </div>
                      <p className="sa-issue-why" style={{ marginTop: 6 }}>
                        <strong>Business impact:</strong> {check.businessImpact}
                      </p>
                      <p className="sa-issue-why" style={{ marginTop: 2 }}>
                        <strong>AI search impact:</strong> {check.whyItMatters}
                      </p>
                      <p className="sa-issue-why" style={{ marginTop: 2 }}>
                        <strong>Recommended fix:</strong> {check.recommendedFix}
                      </p>
                      {/* Actionability fields (WHAT/WHY/WHERE/WHAT/HOW/VERIFY) */}
                      {check.implementationScope && (
                        <p className="sa-issue-why" style={{ marginTop: 4 }}>
                          <strong>Where to apply:</strong> {check.implementationScope}
                        </p>
                      )}
                      {check.whatToImplement && (
                        <p className="sa-issue-why" style={{ marginTop: 2 }}>
                          <strong>What to implement:</strong> {check.whatToImplement}
                        </p>
                      )}
                      {check.whereToImplement && (
                        <p className="sa-issue-why" style={{ marginTop: 2 }}>
                          <strong>Where to implement:</strong> {check.whereToImplement}
                        </p>
                      )}
                      {check.implementationGuidance && (
                        <p className="sa-issue-why" style={{ marginTop: 2 }}>
                          <strong>How to implement:</strong> {check.implementationGuidance}
                        </p>
                      )}
                      {check.verificationSteps && (
                        <p className="sa-issue-why" style={{ marginTop: 2 }}>
                          <strong>How to verify:</strong> {check.verificationSteps}
                        </p>
                      )}
                      {/* Parity rule: web and PDF render a snippet under the
                          SAME gate (site-specific, ready-to-paste code) so a
                          finding's implementation example can never appear on
                          one surface and vanish from the other. Generic
                          placeholder examples are hidden on both. */}
                      {check.codeSnippet && check.siteSpecificCode && (
                        <div className="sa-code-snippet">
                          <p className="sa-code-snippet-label">{check.codeSnippet.label}</p>
                          <pre className="sa-code-snippet-pre"><code>{check.codeSnippet.code}</code></pre>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#888888", textTransform: "uppercase", letterSpacing: 0.4, width: 130 }}>Expected SEO &amp; AI impact</span>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#EEEEEE", overflow: "hidden", marginRight: 8 }}>
                          <div style={{ width: `${WEB_AEO_IMPACT[check.expectedImpact].fill}%`, height: 8, borderRadius: 4, background: "#1D6FD8" }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#333333", minWidth: 56, textAlign: "right" }}>{WEB_AEO_IMPACT[check.expectedImpact].label}</span>
                      </div>
                      {check.affectedUrls.length > 0 && (
                        <div className="sa-instance-list" style={{ marginTop: 8 }}>
                          {check.affectedUrls.slice(0, 5).map((u, j) => (
                            <p key={j} className="sa-instance-url">{u}</p>
                          ))}
                        </div>
                      )}
                      {check.hasMoreAffectedUrls && (
                        <>
                          <details className="sa-instance-expand">
                            <summary className="sa-instance-expand-label">
                              Show all {check.affectedUrls.length} pages
                            </summary>
                            <div className="sa-instance-list">
                              {check.affectedUrls.slice(5).map((u, j) => (
                                <p key={j} className="sa-instance-url">{u}</p>
                              ))}
                            </div>
                          </details>
                          {csvAvailable && (
                            <p className="sa-ai-review-note">{buildMoreAffectedCopy(check.affectedUrls.length, 5, "page", true)}</p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

{fixRoadmapItemCount > 0 && (
        <section className="sa-fixroadmap" id="fix-roadmap">
          <h2 className="sa-h2">Fix Roadmap &mdash; What to Fix First</h2>
          <p className="sa-priority-note">
            Every item below is a real finding from this audit, ranked by impact, reach, and effort. Fix First items
            can materially affect crawling, indexing, access to important content, or core user experience; Fix Next
            items are important but less urgent; Optimize items are lower-impact improvements. Each item shows why it
            matters, the recommended action, and the affected pages &mdash; the CSV export always contains the
            complete URL list for every finding.
          </p>
          {FIX_TIER_ORDER.filter((t) => fixRoadmap[t].length > 0).map((tier) => (
            <div key={tier} className="sa-roadmap-tier">
              <div className="sa-roadmap-tier-head">
                <p className="sa-roadmap-tier-title">{FIX_TIER_META[tier].title}</p>
                <p className="sa-roadmap-tier-blurb">{FIX_TIER_META[tier].blurb}</p>
              </div>
              <div className="sa-roadmap-list">
                {fixRoadmap[tier].map((item) => (
                  <RoadmapItemCard key={item.key} item={item} csvAvailable={csvAvailable} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {tier !== "free" && actionPlan.length > 0 && (
        <section className="sa-actionplan">
          <h2 className="sa-h2">Priority Implementation Roadmap</h2>
          <p className="sa-priority-note">
            A suggested sequence based on impact and effort &mdash; not a guaranteed timeline. Adjust based on your team&rsquo;s bandwidth.
          </p>
          <p className="sa-plan-capacity-note">
            Note: Based on a single person working full-time. Adjust based on your team&rsquo;s capacity. Effort buckets estimate direct active editing time per element, excluding staging, testing, and deployment workflows.
          </p>
          <div className="sa-plan-weeks">
            {actionPlan.map((week) => (
              <div key={week.weekNumber} className="sa-plan-week">
                <div className="sa-plan-week-head">
                  <span className="sa-plan-week-num">{week.weekNumber}</span>
                  <div>
                    <p className="sa-plan-week-title">{week.title}</p>
                    <p className="sa-plan-week-focus">{week.focus}</p>
                  </div>
                </div>
                <ul className="sa-plan-issue-list">
                  {week.issues.map((issue) => (
                    <li key={issue.key} className="sa-plan-issue">
                      <span>{issue.label}{issue.templateLevel ? " (template-level fix)" : ""}</span>
                      <span className="sa-td-muted">
                        {issue.count} {countUnitFor(issue.count, issue.countUnit)} &middot; {issue.effortBucketLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <style>{reportStyles}</style>
    </main>
  );
}

// AEO recommendation-card metadata (mirrors the PDF's consulting badges) —
// priority / effort / time / expected-impact presentation for AI checks.
const WEB_AEO_PRIORITY: Record<string, { label: string; fg: string; bg: string; fill: number }> = {
  critical: { label: "Critical", fg: "#B42318", bg: "#FBE9E6", fill: 100 },
  high: { label: "High", fg: "#D9432E", bg: "#FBE9E6", fill: 80 },
  medium: { label: "Medium", fg: "#D98A1A", bg: "#FBF0DF", fill: 60 },
  low: { label: "Low", fg: "#1F9D55", bg: "#E7F6ED", fill: 40 },
  best_practice: { label: "Best Practice", fg: "#1D6FD8", bg: "#EAF1FC", fill: 25 },
};
const WEB_AEO_DIFF: Record<string, { label: string; fg: string; bg: string }> = {
  easy: { label: "Easy", fg: "#1F9D55", bg: "#E7F6ED" },
  medium: { label: "Medium", fg: "#D98A1A", bg: "#FBF0DF" },
  advanced: { label: "Advanced", fg: "#D9432E", bg: "#FBE9E6" },
  enterprise: { label: "Enterprise", fg: "#FFFFFF", bg: "#52565C" },
};
const WEB_AEO_IMPACT: Record<string, { label: string; fill: number }> = {
  very_high: { label: "Very High", fill: 100 },
  high: { label: "High", fill: 80 },
  medium: { label: "Medium", fill: 60 },
  low: { label: "Low", fill: 40 },
};

function describeRobotsAudit(info: { status: "found" | "not_found" | "fetch_error"; disallowedPaths: string[] } | undefined): string {
  if (!info) return "Not checked (audit run before this check was added — re-run the audit to see this).";
  if (info.status === "not_found") return "No robots.txt found.";
  if (info.status === "fetch_error") return "Couldn't check robots.txt (network error).";
  if (info.disallowedPaths.length === 0) return "Found, with no disallowed paths.";
  return `Found — ${info.disallowedPaths.length} disallowed path${info.disallowedPaths.length === 1 ? "" : "s"}: ${info.disallowedPaths.join(", ")}`;
}

function describeSitemapAudit(info: { status: "found" | "not_found" | "invalid" | "fetch_error"; urlCount: number } | undefined): string {
  if (!info) return "Not checked (audit run before this check was added — re-run the audit to see this).";
  if (info.status === "not_found") return "No sitemap.xml found.";
  if (info.status === "invalid") return "Found, but couldn't be parsed.";
  if (info.status === "fetch_error") return "Couldn't check sitemap.xml (network error).";
  return `Found — ${info.urlCount} URL${info.urlCount === 1 ? "" : "s"} listed.`;
}

function scoreClass(score: number): string {
  if (score >= 80) return "sa-score-pass";
  if (score >= 50) return "sa-score-warn";
  return "sa-score-fail";
}

function chainTypeLabel(type: string): string {
  switch (type) {
    case "single_301": return "Single permanent (301) redirect";
    case "single_302": return "Single temporary (302) redirect";
    case "chain_301": return "Chain of permanent (301) redirects";
    case "chain_302": return "Chain of temporary (302) redirects";
    case "mixed_chain": return "Mixed permanent/temporary redirect chain";
    default: return "Redirect chain";
  }
}

const reportStyles = `
  .sa-root {
    --paper: #F6F5F2;
    --paper-raised: #FFFFFF;
    --ink: #14171C;
    --ink-soft: #52565C;
    --line: #E0DFDA;
    --signal: #1D6FD8;
    --signal-soft: #EAF1FC;
    --pass: #1F9D55;
    --pass-soft: #E7F6ED;
    --warn: #D98A1A;
    --warn-soft: #FBF0DF;
    --fail: #D9432E;
    --fail-soft: #FBE9E6;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-body), system-ui, sans-serif;
    min-height: 100vh;
  }

  .sa-nav {
    max-width: 880px;
    margin: 0 auto;
    padding: 28px 24px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sa-logo {
    font-family: var(--font-display), sans-serif;
    font-weight: 700;
    font-size: 18px;
    letter-spacing: -0.01em;
  }
  .sa-link { color: var(--signal); text-decoration: none; font-size: 14px; font-weight: 600; }
  .sa-link:hover { text-decoration: underline; }

  .sa-notfound { max-width: 480px; margin: 120px auto; text-align: center; padding: 0 24px; }
  .sa-notfound-text { color: var(--ink-soft); margin-bottom: 16px; }

  .sa-report-head { max-width: 880px; margin: 0 auto; padding: 40px 24px 0; }
  .sa-eyebrow {
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--signal);
    margin: 0 0 10px;
  }
  .sa-h1-sm {
    font-family: var(--font-display), sans-serif;
    font-weight: 700;
    font-size: 26px;
    letter-spacing: -0.01em;
    margin: 0 0 28px;
    word-break: break-word;
  }

  .sa-priority-matrix { display: flex; gap: 12px; margin-bottom: 20px; }
  .sa-matrix-card { flex: 1; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
  .sa-matrix-label { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
  .sa-matrix-num { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 22px; margin: 0; }
  .sa-matrix-sub { font-size: 11px; color: var(--ink-soft); margin: 4px 0 0; }

  .sa-impact-badge { font-size: 12px; font-weight: 600; color: var(--signal); margin: 0 0 8px; }
  /* One-line "why this estimate differs" caveat, only when the effort gap
     vs. a similarly-scoped issue would otherwise look unexplained. */
  .sa-estimate-rationale {
    font-size: 12px;
    color: #8A6D1A;
    background: #FBF4DF;
    border-radius: 6px;
    padding: 8px 12px;
    margin: 0 0 10px;
    line-height: 1.45;
    max-width: 720px;
  }
  .sa-estimate-rationale-table { display: block; font-size: 10.5px; color: #8A6D1A; margin-top: 4px; line-height: 1.4; font-weight: 400; }

  .sa-template-banner {
    background: var(--signal-soft);
    border: 1px solid var(--signal);
    border-left-width: 3px;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 0 0 10px;
  }
  .sa-template-banner-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--signal);
    margin: 0 0 4px;
  }
  .sa-template-banner-text {
    font-size: 12px;
    color: var(--ink-soft);
    line-height: 1.5;
    margin: 0;
  }

  /* URL SEO section note — unmissable callout explaining that erroring
     URLs are intentionally listed (and also covered in Broken Links). */
  .sa-url-seo-note {
    background: var(--signal-soft);
    border: 1px solid var(--signal);
    border-left-width: 3px;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 0 0 16px;
  }
  .sa-url-seo-note-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--signal);
    margin: 0 0 4px;
  }
  .sa-url-seo-note-text {
    font-size: 12px;
    color: var(--ink-soft);
    line-height: 1.5;
    margin: 0;
  }
  .sa-url-seo-status {
    font-size: 11px;
    color: var(--signal);
    font-style: italic;
    margin: 0 0 6px;
  }

  .sa-pie-block { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
  .sa-pie-legend-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 6px; }
  .sa-pie-swatch { width: 10px; height: 10px; border-radius: 2px; }

  .sa-radar-block { display: flex; justify-content: center; margin-bottom: 20px; }

  .sa-summary {
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 24px;
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .sa-verdict-description { font-size: 12px; color: var(--ink-soft); margin-top: 6px; max-width: 320px; }
  .sa-exec-summary { font-size: 14px; line-height: 1.6; color: var(--ink); background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; margin-bottom: 20px; }
  .sa-scope-note { font-size: 12px; color: var(--ink-soft); font-style: italic; margin: -10px 0 20px; line-height: 1.5; }
  .sa-coverage-warning { background: #FBF0DF; border: 1px solid #F0D7AC; border-left: 3px solid #D98A1A; border-radius: 6px; padding: 10px 14px; margin: -6px 0 20px; font-size: 13px; color: #6b4a12; line-height: 1.5; }
  .sa-runtime-note { font-size: 12px; color: var(--ink-soft); margin: -6px 0 20px; line-height: 1.5; }
  .sa-category-bars { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
  .sa-category-row { display: flex; flex-direction: column; gap: 4px; }
  .sa-category-row-head { display: flex; justify-content: space-between; font-size: 13px; }
  .sa-category-label { font-weight: 600; }
  .sa-category-score { color: var(--ink-soft); font-family: var(--font-mono), monospace; }
  .sa-category-track { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .sa-category-fill { height: 100%; border-radius: 4px; }
  .sa-category-explanation { font-size: 11px; color: var(--ink-soft); margin: 4px 0 0; }
  .sa-category-good { background: var(--pass); }
  .sa-category-warn { background: var(--warn); }
  .sa-category-fail { background: var(--fail); }
  .sa-score-block {
    font-family: var(--font-mono), monospace;
    font-weight: 700;
    font-size: 40px;
    line-height: 1;
    padding: 10px 20px;
    border-radius: 10px;
    flex-shrink: 0;
  }
  .sa-score-max { font-size: 16px; font-weight: 500; opacity: 0.7; }
  .sa-score-pass { background: var(--pass-soft); color: var(--pass); }
  .sa-score-warn { background: var(--warn-soft); color: var(--warn); }
  .sa-score-fail { background: var(--fail-soft); color: var(--fail); }
  .sa-score-methodology { font-size: 11px; color: #999; margin-top: 6px; line-height: 1.4; }

  .sa-stat-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
  }
  .sa-stat-list li { display: flex; flex-direction: column; }
  .sa-stat-num {
    font-family: var(--font-mono), monospace;
    font-weight: 700;
    font-size: 20px;
  }
  .sa-stat-fail { color: var(--fail); }
  .sa-stat-warn { color: var(--warn); }
  .sa-stat-muted { color: var(--ink-soft); }
  .sa-stat-label {
    font-size: 12px;
    color: var(--ink-soft);
    margin-top: 2px;
  }

  .sa-btn {
    display: inline-block;
    padding: 11px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    margin-bottom: 8px;
  }
  .sa-btn-primary { background: var(--ink); color: #fff; }
  .sa-btn-primary:hover { background: var(--signal); }

  .sa-issues { max-width: 880px; margin: 0 auto; padding: 48px 24px 80px; }
  .sa-h2 {
    font-family: var(--font-display), sans-serif;
    font-weight: 700;
    font-size: 18px;
    margin: 0 0 20px;
  }

  .sa-empty {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 32px 24px;
    text-align: center;
  }
  .sa-empty-pass { background: var(--pass-soft); border-color: transparent; }
  .sa-empty-title { font-weight: 600; margin: 0 0 4px; color: var(--pass); }
  .sa-empty-text { color: var(--ink-soft); font-size: 14px; margin: 0; }

.sa-issue-group {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 14px;
  }
  .sa-issue-group-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
  }
  .sa-issue-count {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--signal);
    background: var(--signal-soft);
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sa-issue-fix { font-size: 13px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 14px; }
  .sa-team-questions { background: #F7F7F4; border: 1px solid var(--line); border-left: 3px solid #D98A1A; border-radius: 6px; padding: 10px 12px; margin: 0 0 14px; }
  .sa-team-questions-title { font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #8a6d1a; margin: 0 0 6px; }
  .sa-team-question { font-size: 13px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 4px; }
  .sa-team-question:last-child { margin-bottom: 0; }
  .sa-issue-impact { font-size: 13px; color: var(--signal); line-height: 1.5; margin: 0 0 8px; font-style: italic; }
  .sa-instance-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--line);
    padding-top: 12px;
  }
.sa-instance-url {
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    color: var(--signal);
    margin: 0 0 4px;
    word-break: break-all;
  }
  .sa-instance-expand { margin-top: 10px; }
  .sa-instance-expand-label {
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--signal);
    cursor: pointer;
  }
  .sa-instance-expand[open] .sa-instance-expand-label { margin-bottom: 10px; }
  /* Non-descriptive image filenames — the actual offending images listed
     under the finding (decoded filename + full src, incl. proxied CDN
     URLs), matching the PDF's Image SEO section. */
  .sa-nd-image-list { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
  .sa-repr-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--ink-soft);
    margin: 0 0 8px;
  }
  .sa-nd-image-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }
  .sa-nd-image-src {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    color: var(--signal);
    margin: 0;
    word-break: break-all;
  }
  .sa-nd-image-name {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 600;
    color: #D9432E;
    margin: 0;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sa-robots-note { font-size: 13px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 14px; }
  .sa-robots-url { font-family: var(--font-mono), monospace; font-size: 12px; color: var(--ink-soft); margin: 0 0 4px; word-break: break-all; }

  .sa-priority { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-quickwins { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-priority-note { font-size: 13px; color: var(--ink-soft); margin: 0 0 16px; }

  /* "If You Only Do 5 Things" — condensed stakeholder shortlist right after
     the dashboard; numbered rows with fix, page count, and time. */
  .sa-five-things { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-five-thing-row {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-left: 3px solid var(--signal);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 10px;
  }
  .sa-five-thing-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--signal);
    color: #fff;
    font-family: var(--font-mono), monospace;
    font-weight: 700;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sa-five-thing-body { flex: 1; min-width: 0; }
  .sa-five-thing-desc { font-weight: 600; font-size: 14px; margin: 0 0 2px; }
  .sa-five-thing-meta { font-size: 12.5px; color: var(--ink-soft); margin: 0; }
  .sa-five-things-note { font-size: 12.5px; color: var(--ink-soft); font-style: italic; margin: 4px 0 0; }
  .sa-priority-pill {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    display: inline-block;
  }
  .sa-priority-critical { background: var(--fail-soft); color: var(--fail); }
  .sa-priority-moderate { background: var(--warn-soft); color: var(--warn); }
  .sa-priority-minor { background: var(--pass-soft); color: var(--pass); }
  .sa-verdict-pill {
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 999px;
    display: inline-block;
  }
  .sa-verdict-pass { background: var(--pass-soft); color: var(--pass); }
  .sa-verdict-warn { background: var(--warn-soft); color: var(--warn); }
  .sa-verdict-fail { background: var(--fail-soft); color: var(--fail); }
  .sa-quickwin-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .sa-quickwin-item {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 14px;
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 14px;
  }
  .sa-quickwin-check { color: var(--pass); font-weight: 700; flex-shrink: 0; }

  /* AI/GenAI Quick Wins section */
  .sa-ai-quickwins { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-ai-quickwin-list { display: flex; flex-direction: column; gap: 12px; }
  .sa-ai-quickwin-card {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-left: 3px solid var(--signal);
    border-radius: 10px;
    padding: 16px 18px;
  }
  .sa-ai-quickwin-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
  .sa-ai-quickwin-title { font-size: 15px; font-weight: 700; margin: 0; color: var(--ink); }
  .sa-ai-quickwin-badges { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
  .sa-aeo-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .sa-ai-quickwin-count { font-size: 13px; color: var(--ink-soft); margin: 0 0 10px; }
  .sa-ai-quickwin-section { margin-top: 8px; }
  .sa-ai-quickwin-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--signal);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    display: block;
    margin-bottom: 4px;
  }
  .sa-ai-quickwin-text { font-size: 14px; color: var(--ink); margin: 0; line-height: 1.5; }
n  .sa-vitals { max-width: 880px; margin: 0 auto; padding: 8px 24px 32px; }
  .sa-vitals-error { font-size: 14px; color: var(--ink-soft); }
  .sa-vitals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .sa-vital-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
  .sa-vital-label { font-size: 12px; color: var(--ink-soft); margin: 0 0 6px; }
  .sa-vital-value { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 20px; margin: 0 0 8px; }
  .sa-vital-counts { font-size: 11px; color: var(--ink-soft); margin: 10px 0 0; line-height: 1.45; }
  .sa-vital-missing { font-size: 11px; color: #8a5a00; font-style: italic; margin: 6px 0 0; line-height: 1.45; }

  /* Website-wide CWV summary chips + score note */
  .sa-cwv-summary { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
  .sa-cwv-chip {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 14px;
    min-width: 130px;
  }
  .sa-cwv-chip-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ink-soft); margin: 0 0 2px; }
  .sa-cwv-chip-value { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 18px; margin: 0; }
  .sa-cwv-score-note { font-size: 12px; color: var(--ink-soft); margin: 0 0 16px; }
  .sa-cwv-insufficient {
    background: #fff7e6;
    border: 1px solid #e5c77c;
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }
  .sa-cwv-insufficient-title { font-weight: 700; font-size: 14px; color: #8a5a00; margin: 0 0 6px; }
  .sa-cwv-insufficient-text { font-size: 13px; color: #6b4b12; margin: 0; line-height: 1.5; }
  .sa-cwv-worst { margin-bottom: 20px; }
  .sa-subhead { font-weight: 700; font-size: 14px; margin: 0 0 10px; }
  .sa-cwv-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .sa-cwv-table th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--ink-soft);
    border-bottom: 1px solid var(--line);
    padding: 6px 8px;
  }
  .sa-cwv-table td { border-bottom: 1px solid var(--line-soft); padding: 6px 8px; vertical-align: top; }
  .sa-cwv-table-url { font-family: var(--font-mono), monospace; font-size: 11px; word-break: break-all; }
  .sa-more-note { font-size: 12px; color: var(--ink-soft); font-style: italic; margin: 8px 0 0; }

  .sa-vitals-scale { position: relative; height: 8px; border-radius: 4px; overflow: hidden; display: flex; margin: 8px 0 4px; }
  .sa-vitals-marker { position: absolute; top: -3px; width: 2px; height: 14px; background: var(--ink); transform: translateX(-1px); }
  .sa-vitals-scale-labels { display: flex; justify-content: space-between; font-size: 8px; color: var(--ink-soft); }

  .sa-vital-pill { font-family: var(--font-mono), monospace; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; display: inline-block; }
  .sa-vital-good { background: var(--pass-soft); color: var(--pass); }
  .sa-vital-needs-improvement { background: var(--warn-soft); color: var(--warn); }
  .sa-vital-poor { background: var(--fail-soft); color: var(--fail); }

  .sa-a11y { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; }
  .sa-a11y-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .sa-a11y-title { font-weight: 600; font-size: 14px; margin: 0; }
  .sa-a11y-score { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 14px; color: var(--signal); }

  .sa-issue-list { display: flex; flex-direction: column; gap: 12px; }
  .sa-issue {
    border-left: 2px solid var(--line);
    padding-left: 12px;
  }
  .sa-issue-title { font-weight: 600; font-size: 14px; margin: 0 0 4px; overflow-wrap: anywhere; flex: 1; }
  .sa-issue-why { font-size: 13px; color: var(--ink-soft); margin: 0 0 6px; line-height: 1.5; }
.sa-issue-suggestion {
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    background: var(--signal-soft);
    color: var(--ink);
    padding: 8px 10px;
    border-radius: 6px;
    margin: 0;
  }
    .sa-plan-capacity-note { font-size: 12px; color: var(--ink-soft); font-style: italic; margin: -4px 0 16px; }
  .sa-before-after { display: flex; flex-direction: column; gap: 6px; }
  .sa-ba-label { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  .sa-before {
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    background: var(--fail-soft);
    color: var(--ink-soft);
    padding: 8px 10px;
    border-radius: 6px;
    margin: 0;
    text-decoration: line-through;
  }
  .sa-before .sa-ba-label { color: var(--fail); text-decoration: none; }
  .sa-after {
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    background: var(--pass-soft);
    color: var(--ink);
    padding: 8px 10px;
    border-radius: 6px;
    margin: 0;
  }
.sa-after .sa-ba-label { color: var(--pass); }

  .sa-whatsworking { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-ww-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .sa-ww-item {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 14px;
    background: var(--pass-soft);
    border-radius: 8px;
    padding: 10px 14px;
  }
  .sa-ww-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pass); flex-shrink: 0; margin-top: 4px; }
  .sa-ww-fallback { font-size: 14px; color: var(--ink-soft); background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin: 0; }

  .sa-infobox { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
  .sa-info-line { font-size: 14px; margin: 0; }
  .sa-info-label { font-weight: 600; margin-right: 4px; }

  /* Robots.txt & Sitemap status cards */
  .sa-rst-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
  .sa-rst-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; }
  .sa-rst-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .sa-rst-title { font-weight: 600; font-size: 14px; margin: 0; }
  .sa-rst-desc { font-size: 13px; color: var(--ink-soft); line-height: 1.5; margin: 0; }
  .sa-rst-badge { font-family: var(--font-mono), monospace; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .sa-rst-badge-pass { color: var(--pass); background: var(--pass-soft); }
  .sa-rst-badge-warn { color: var(--warn); background: var(--warn-soft); }
  .sa-rst-badge-info { color: var(--ink-soft); background: var(--line); }
  .sa-rst-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .sa-rst-list .sa-robots-url { margin: 0; }

  /* Robots.txt & Sitemap — informational depth */
  .sa-rst-intro { background: var(--paper-raised); border: 1px solid var(--line); border-left: 3px solid var(--signal); border-radius: 10px; padding: 14px 18px; margin-bottom: 14px; font-size: 13px; color: var(--ink-soft); line-height: 1.55; }
  .sa-rst-meta { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
  .sa-rst-meta-row { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; margin: 0; }
  .sa-rst-meta-label { color: var(--ink-soft); flex-shrink: 0; }
  .sa-rst-meta-value { font-family: var(--font-mono), monospace; font-weight: 600; color: var(--ink); text-align: right; word-break: break-all; }
  .sa-rst-detected { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
  .sa-rst-block-title { font-weight: 600; font-size: 13px; margin: 0 0 8px; }
  .sa-rst-block { margin-bottom: 10px; }
  .sa-rst-block-label { font-weight: 700; font-size: 12.5px; margin: 0 0 3px; color: var(--ink); }
  .sa-rst-rule { font-family: var(--font-mono), monospace; font-size: 12px; color: var(--ink-soft); margin: 0 0 2px; word-break: break-all; }
  .sa-rst-note { font-size: 12px; color: var(--ink-soft); font-style: italic; margin: 8px 0 0; line-height: 1.5; }
  .sa-rst-more { font-size: 12px; color: var(--ink-soft); font-style: italic; margin: 6px 0 0; }
  .sa-rst-impact { margin-top: 12px; background: var(--warn-soft); border-left: 3px solid var(--warn); border-radius: 8px; padding: 12px 14px; }
  .sa-rst-impact-info { background: #F4F4F2; border-left-color: #999999; }
  .sa-rst-impact-title { font-weight: 700; font-size: 12.5px; color: var(--warn); margin: 0 0 4px; }
  .sa-rst-impact-info .sa-rst-impact-title { color: var(--ink-soft); }
  .sa-rst-impact-text { font-size: 12.5px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
  .sa-rst-ok { margin-top: 12px; background: var(--pass-soft); border-left: 3px solid var(--pass); border-radius: 8px; padding: 12px 14px; }
  .sa-rst-ok-title { font-weight: 700; font-size: 12.5px; color: var(--pass); margin: 0 0 4px; }
  .sa-rst-ok-text { font-size: 12.5px; color: var(--ink-soft); line-height: 1.55; margin: 0; }
  .sa-rst-reco { margin-top: 12px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .sa-rst-reco-title { font-weight: 700; font-size: 12.5px; margin: 0 0 4px; }
  .sa-rst-reco-text { font-size: 12.5px; color: var(--ink-soft); line-height: 1.55; margin: 0 0 6px; }
  .sa-rst-reco-text:last-child { margin-bottom: 0; }

  .sa-fixroadmap { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-roadmap-tier { margin-bottom: 18px; }
  .sa-roadmap-tier-head {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-left: 4px solid var(--signal);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 10px;
  }
  .sa-roadmap-tier-title {
    font-family: var(--font-display), sans-serif;
    font-weight: 700;
    font-size: 16px;
    margin: 0 0 4px;
  }
  .sa-roadmap-tier-blurb { font-size: 13px; color: var(--ink-soft); margin: 0; line-height: 1.45; }
  .sa-roadmap-list { display: flex; flex-direction: column; gap: 10px; }
  .sa-roadmap-item {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .sa-roadmap-item-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .sa-roadmap-item-title {
    font-family: var(--font-display), sans-serif;
    font-weight: 700;
    font-size: 14.5px;
    margin: 0;
  }
  .sa-roadmap-item-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .sa-roadmap-item-count {
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    background: var(--signal);
    border-radius: 999px;
    padding: 3px 10px;
    white-space: nowrap;
  }
  .sa-roadmap-item-effort {
    font-size: 11.5px;
    color: var(--ink-soft);
    background: #F1F1EE;
    border-radius: 999px;
    padding: 3px 10px;
    white-space: nowrap;
  }

  .sa-actionplan { max-width: 880px; margin: 0 auto; padding: 0 24px 80px; }
  .sa-plan-weeks { display: flex; flex-direction: column; gap: 14px; }
  .sa-plan-week {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 18px 20px;
  }
  .sa-plan-week-head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 12px;
  }
  .sa-plan-week-num {
    font-family: var(--font-mono), monospace;
    font-weight: 700;
    font-size: 16px;
    color: var(--signal);
    background: var(--signal-soft);
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .sa-plan-week-title {
    font-family: var(--font-display), sans-serif;
    font-weight: 700;
    font-size: 15px;
    margin: 0 0 3px;
  }
  .sa-plan-week-focus { font-size: 13px; color: var(--ink-soft); margin: 0; line-height: 1.4; }
  .sa-plan-issue-list {
    list-style: none;
    margin: 0;
    padding: 12px 0 0;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sa-plan-issue {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
  }
  .sa-exec-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .sa-exec-stat-card { display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 16px 10px; text-align: center; }
  .sa-exec-stat-icon { font-size: 22px; }
  .sa-exec-stat-num { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 20px; }
  .sa-exec-stat-sub { font-size: 10.5px; color: var(--ink-soft); line-height: 1.35; }
  .sa-exec-stat-label { font-size: 11px; color: var(--ink-soft); }

  .sa-issue-dist { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; margin-bottom: 20px; }
  .sa-issue-dist-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .sa-issue-dist-label { width: 160px; font-size: 13px; flex-shrink: 0; }
  .sa-issue-dist-track { flex: 1; height: 10px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .sa-issue-dist-fill { height: 100%; border-radius: 4px; background: var(--signal); }
  .sa-issue-dist-count { width: 28px; text-align: right; font-family: var(--font-mono), monospace; font-size: 12px; color: var(--ink-soft); }

  /* Compact horizontal bars for the priority table's Impact/Difficulty
     columns — replaces the block-character (■□) ratings so the web table
     uses the same real bars as the PDF's priority list. */
  .sa-mini-bar-track { display: inline-block; width: 64px; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; vertical-align: middle; margin-right: 8px; }
  .sa-mini-bar-fill { display: block; height: 100%; border-radius: 3px; }
  .sa-mini-bar-blue .sa-mini-bar-fill { background: var(--signal); }

  .sa-suggestion-expand { }
  .sa-after-summary { cursor: pointer; font-family: var(--font-mono), monospace; font-size: 12px; background: var(--pass-soft); color: var(--ink); padding: 8px 10px; border-radius: 6px; list-style: none; }
  .sa-after-summary::-webkit-details-marker { display: none; }
  .sa-after-full { margin-top: 6px; }
  .sa-ai-review-note { font-size: 11px; color: var(--ink-soft); font-style: italic; margin: 4px 0 0; }

  .sa-schema-grid { display: flex; flex-direction: column; gap: 10px; }
.sa-schema-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.sa-schema-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.sa-schema-chip { font-family: var(--font-mono), monospace; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.sa-schema-chip-pass { background: var(--pass-soft); color: var(--pass); }
.sa-schema-chip-warn { background: var(--warn-soft); color: var(--warn); }
.sa-schema-chip-fail { background: var(--fail-soft); color: var(--fail); }

  /* NEW: AEO category separation - each category reads as its own block
     instead of running together, without needing literal page breaks on
     the web (only the PDF has real pages). */
  .sa-aeo-category { padding-top: 20px; border-top: 1px solid var(--line); }
  .sa-aeo-category:first-child { padding-top: 0; border-top: none; }
  .sa-aeo-category-title { font-size: 16px; margin-bottom: 14px; color: var(--signal); }
  .sa-aeo-score-block {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 16px 20px;
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    margin-bottom: 24px;
  }
  .sa-aeo-score-label { font-weight: 700; font-size: 14px; margin: 0 0 2px; }
  .sa-aeo-score-sub { font-size: 12px; color: var(--ink-soft); margin: 0; max-width: 420px; }

  /* NEW: Indexability Checks styles */
  .sa-indexability-checks { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-checks-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sa-check-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
  .sa-check-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 4px; }
  /* flex: 1 lets a long check name wrap on its own column
     instead of colliding with the right-side status badge. */
  .sa-check-label { font-weight: 600; font-size: 13px; flex: 1; line-height: 1.35; }
  .sa-check-pass { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 12px; color: var(--pass); flex-shrink: 0; white-space: nowrap; }
  .sa-check-details-link {
    display: inline-block;
    margin-top: 10px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--signal);
    text-decoration: none;
  }
  .sa-check-details-link:hover { text-decoration: underline; }
  .sa-check-warn { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 12px; color: var(--warn); flex-shrink: 0; white-space: nowrap; }
  .sa-check-fail { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 12px; color: var(--fail); flex-shrink: 0; white-space: nowrap; }
  .sa-check-na { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 12px; color: #888888; flex-shrink: 0; white-space: nowrap; }
  .sa-check-status { font-size: 12px; color: var(--ink-soft); margin: 0; line-height: 1.4; }

  /* Complete SEO Check Coverage — clickable summary strip + compact
     status index. The strip is ONE link: clicking it jumps straight to
     the check-by-check status index (Result → Problem → Where the
     details live). Each check is one row (name + status + count); the
     detailed evidence stays in the section each group points to. */
  .sa-h3 { font-family: var(--font-display), sans-serif; font-weight: 700; font-size: 15px; margin: 0 0 10px; }
  .sa-coverage-summary {
    display: flex;
    align-items: stretch;
    gap: 10px;
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 16px;
    text-decoration: none;
    color: inherit;
    flex-wrap: wrap;
  }
  .sa-coverage-summary:hover { border-color: var(--signal); }
  .sa-coverage-stat {
    flex: 1;
    min-width: 96px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sa-coverage-stat-pass { background: var(--pass-soft); border-color: transparent; }
  .sa-coverage-stat-fail { background: var(--fail-soft); border-color: transparent; }
  .sa-coverage-stat-warn { background: var(--warn-soft); border-color: transparent; }
  .sa-coverage-num { font-family: var(--font-display), sans-serif; font-weight: 700; font-size: 22px; line-height: 1; }
  .sa-coverage-stat-fail .sa-coverage-num { color: var(--fail); }
  .sa-coverage-stat-pass .sa-coverage-num { color: var(--pass); }
  .sa-coverage-stat-warn .sa-coverage-num { color: var(--warn); }
  .sa-coverage-label {
    font-family: var(--font-mono), monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .sa-coverage-cta {
    align-self: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--signal);
    white-space: nowrap;
  }
  .sa-coverage-index { margin-bottom: 8px; }
  .sa-coverage-group { margin-bottom: 18px; }
  .sa-coverage-group .sa-h3 { margin-bottom: 8px; }
  .sa-coverage-group-list {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .sa-coverage-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--paper-raised);
  }
  .sa-coverage-row + .sa-coverage-row { border-top: 1px solid var(--line); }
  .sa-coverage-row-label { flex: 1; font-size: 13px; color: var(--ink); }
  .sa-coverage-badge-fail, .sa-coverage-badge-warn, .sa-coverage-badge-pass {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sa-coverage-badge-fail { color: var(--fail); background: var(--fail-soft); }
  .sa-coverage-badge-warn { color: var(--warn); background: var(--warn-soft); }
  .sa-coverage-badge-pass { color: var(--pass); background: var(--pass-soft); }
  .sa-coverage-row-count {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sa-coverage-see { margin: 8px 0 0; font-size: 12px; color: var(--ink-soft); line-height: 1.4; }
  .sa-coverage-see a { color: var(--signal); font-weight: 600; text-decoration: none; }
  .sa-coverage-see a:hover { text-decoration: underline; }

  /* Per-metric Core Web Vitals — why it matters / fix under each card. */
  .sa-vital-fix {
    margin-top: 10px;
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .sa-cwv-issues { margin-top: 20px; }
  .sa-cwv-issue-group {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 12px;
  }
  .sa-cwv-issue-title { font-weight: 700; font-size: 13px; margin: 0 0 8px; }
  .sa-cwv-table-value-fail { color: var(--fail); font-weight: 700; text-align: right; white-space: nowrap; }
  .sa-cwv-table-value-warn { color: var(--warn); font-weight: 700; text-align: right; white-space: nowrap; }



  /* NEW: Response Code Breakdown styles */
  .sa-response-codes { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; margin-bottom: 20px; }
  .sa-response-code-track { display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 12px; }
  .sa-response-code-segment { height: 100%; }
  .sa-response-code-legend { display: flex; flex-wrap: wrap; gap: 14px; }
  .sa-response-code-legend-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-soft); }
  .sa-response-code-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

  /* NEW: Redirect Chains styles */
  .sa-redirect-chain { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; }
  .sa-redirect-chain-loop { border-color: var(--fail); background: var(--fail-soft); }
  .sa-redirect-chain-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 4px; }
  .sa-redirect-chain-path { font-family: var(--font-mono), monospace; font-size: 12px; color: var(--signal); word-break: break-all; }
  .sa-redirect-chain-badge { font-family: var(--font-mono), monospace; font-size: 11px; font-weight: 700; color: var(--ink-soft); background: var(--line); padding: 2px 8px; border-radius: 999px; white-space: nowrap; flex-shrink: 0; }
  .sa-redirect-chain-badge-loop { color: var(--fail); background: var(--fail-soft); }
  .sa-redirect-chain-type { font-size: 12px; color: var(--ink-soft); margin: 0 0 6px; }

  /* NEW: Business Impact styles */
  .sa-business-impact { max-width: 880px; margin: 0 auto; padding: 0 24px 32px; }
  .sa-impact-card {
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-left: 3px solid var(--signal);
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 12px;
  }
  .sa-impact-card-label {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--signal);
    margin: 0 0 6px;
  }
  .sa-impact-card-text { font-size: 14px; line-height: 1.6; color: var(--ink); margin: 0; }
  .sa-impact-card-citation { font-size: 11px; color: var(--ink-soft); font-style: italic; margin: 6px 0 0; }

  /* NEW: Code Snippet styles */
  .sa-code-snippet { margin: 10px 0; }
  .sa-code-snippet-note {
    font-size: 11px;
    color: var(--ink-soft);
    font-style: italic;
    margin: 0 0 6px;
  }
  .sa-code-snippet-label {
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--signal);
    margin: 0 0 6px;
  }
  .sa-code-snippet-pre {
    background: #0F172A;
    color: #E2E8F0;
    border-radius: 8px;
    padding: 12px 14px;
    font-family: var(--font-mono), monospace;
    font-size: 12px;
    line-height: 1.5;
    overflow-x: auto;
    margin: 0;
    white-space: pre;
  }

@media (max-width: 600px) {
    .sa-summary { flex-direction: column; align-items: flex-start; gap: 20px; }
    .sa-vitals-grid { grid-template-columns: 1fr 1fr; }
    .sa-exec-stats-grid { grid-template-columns: 1fr 1fr; }
    .sa-priority-matrix { flex-direction: column; }
    .sa-pie-block { flex-direction: column; align-items: flex-start; }
    .sa-checks-grid { grid-template-columns: 1fr; }
    .sa-rst-grid { grid-template-columns: 1fr; }
  }
`;