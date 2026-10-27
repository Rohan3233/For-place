import type { PageExplanationResult, RunAuditResult, CrawlPageSuccess, CoreWebVitalsAggregate } from "./types";
import { buildIssueGroupSmartNote } from "./smartRecommendations";
import { getCodeSnippet, type CodeSnippet } from "./codeSnippets";
import { flagNearDuplicateCopy } from "./copyVarietyCheck";
import { getIssueTemplate } from "./templates";
import { urlSeoFlagsForUrl, urlHasEncodedCharacters } from "./urlSeo";
import { isBlockedFromAutomatedChecking } from "./brokenLinkClassification";
import { getRemediation, type RemediationEntry } from "./remediation";
import { coreWebVitalAffectedPages, type CoreWebVitalKey } from "./coreWebVitals";
import { COVERAGE_ISSUE_COPY } from "./coverageIssueCopy";
import { RATING_LABEL, type VitalRating } from "./webVitals";

/**
 * One issue type, with its shared explanation written once, and every
 * affected page listed underneath — each with its own AI-generated
 * suggestion where one exists. Fixes the "looks like copy-paste after
 * 2-3 pages" problem: explainCrawl() produces the identical whyItMatters
 * / recommendedFix text for every page with the same flag (by design —
 * see IssueTemplate), which reads fine once but becomes repetitive
 * verbatim text across a report with many affected pages. Grouping by
 * issue type shows that shared text exactly once, while still preserving
 * each page's unique suggestedText (the real personalized value), rather
 * than collapsing everything into one generic block and losing it.
 */
export interface GroupedIssue {
  flag: string;
  issueLabel: string;
  whyItMatters: string;
  businessImpact: string;
  recommendedFix: string;
  afterFixing?: string;
  instances: {
    url: string;
    suggestedText: string | null;
    aiGenerated: boolean;
    currentValue: string | null;
    /** Present only when the URL itself returned an error / non-HTML
     * response during the crawl — tells the reader the page isn't live
     * today (also covered in the broken-links/error sections) without
     * making the URL-quality finding look like an inaccuracy. */
    statusNote?: string;
    /** When present, a prominent image near the top of the main content
     * may function as a visual page heading — contextual signal only,
     * not a substitute for a real H1. */
    potentialVisualHeading?: {
      src: string;
      alt: string | null;
      confidence: number;
    } | null;
  }[];
  /** Internal dedup set backing `instances` — same URL never counted twice. */
  instancesByUrl: Set<string>;
  smartNote: string;
  codeSnippet: CodeSnippet | null;
  /** Centralized remediation data — what-it-means, how-to-fix, steps,
   * examples, verification, developer instructions, platform instructions.
   * Null when the flag has no entry in the remediation KB. */
  remediation: RemediationEntry | null;
}

/**
 * The "before" value for a Before/After comparison — only meaningful for
 * the handful of flags where the AI suggestion replaces a specific
 * existing field (title, meta description, H1). Everything else returns
 * null, and the UI simply omits the "current" line when there's nothing
 * to compare against.
 */
function getCurrentValueForFlag(flag: string, page: CrawlPageSuccess | undefined): string | null {
  if (!page) return null;
  switch (flag) {
    case "missing_title":
    case "title_length_out_of_range":
      return page.title.content;
    case "missing_meta_description":
    case "meta_description_length_out_of_range":
      return page.metaDescription.content;
    case "missing_h1":
      return page.h1[0] ?? null;
    default:
      return null;
  }
}

/**
 * Sorted with the most widespread issues first — a problem hitting 12
 * pages is more actionable to a client than one hitting a single page,
 * so it should surface first rather than wherever it happened to land
 * alphabetically or by crawl order.
 */
/**
 * Generates "what happens after fixing" text based on the issue flag.
 * This gives clients a clear expectation of the improvement.
 */
function buildAfterFixingText(flag: string, count: number): string {
  const pageWord = count === 1 ? 'page' : 'pages';
  const afterFixingMap: Record<string, string> = {
    title_too_long: `After shortening titles to 50–60 characters, each affected page will have a clear, scannable title that fits in Google search results without truncation. This improves click-through rates because users can see the full topic before clicking.`,
    title_too_short: `After adding descriptive titles to each affected page, search engines will have a clearer signal of each page's primary topic. Users searching in Google will see meaningful titles that accurately represent the content, improving click-through rates.`,
    meta_description_too_long: `After rewriting meta descriptions to 120–160 characters, each affected page will display a complete, compelling summary in search results instead of being truncated. This gives users a clear reason to click and improves organic click-through rates.`,
    meta_description_too_short: `After adding descriptive meta descriptions, each affected page will present a clear, compelling summary in search results. Users will understand what the page offers before clicking, which improves organic click-through rates.`,
    duplicate_meta_descriptions: `After writing unique meta descriptions for each affected page, search engines can distinguish between pages and present the most relevant result for each query. This reduces internal competition and improves click-through rates for individual pages.`,
    duplicate_titles: `After giving each affected page a unique, descriptive title, search engines can properly differentiate between pages and rank the most relevant one for each query. This eliminates internal competition and improves organic visibility.`,
    multiple_h1: `After restructuring to a single H1 per page, each page will have one clearly defined primary topic followed by logical subsections. This makes the page hierarchy easier for both users and search engines to understand.`,
    missing_h1: `After adding a descriptive H1 to each affected page, search engines will have a clear primary heading signal for each page's topic. Users will also benefit from an immediately visible page title that confirms they're in the right place.`,
    no_h2_subheadings: `After adding H2 subheadings to break content into logical sections, each page will have a clear information hierarchy. This helps both users scan for relevant sections and search engines understand the page's structure and topical coverage.`,
    missing_alt_text: `After adding descriptive alt text to each affected image, search engines can understand what the images depict and potentially surface them in image search results. Screen readers will also be able to describe the images to visually impaired users.`,
    missing_lazy_loading: `After adding lazy loading to below-the-fold images, pages will load faster because the browser only loads images as they scroll into view. This improves page speed metrics and user experience, especially on image-heavy pages.`,
    missing_image_dimensions: `After adding explicit width and height attributes to images, the browser can reserve space before images load, preventing layout shifts that frustrate visitors and negatively impact Core Web Vitals scores.`,
    missing_responsive_images: `After adding srcset attributes, mobile devices will load appropriately sized images instead of desktop-sized ones. This reduces data usage and improves load times for mobile visitors.`,
    non_optimized_image_format: `After converting images to modern formats like WebP or AVIF, images will be 25–50% smaller while maintaining the same visual quality. This directly improves page load times and Core Web Vitals scores.`,
    poor_image_filenames: `After renaming images with descriptive, hyphenated filenames, search engines can better understand what each image depicts from the filename alone. This improves image search visibility and adds a minor SEO signal.`,
    missing_schema_markup: `After adding structured data markup, search engines can better understand your content and may display rich results (star ratings, FAQs, product info) in search listings, which significantly improves click-through rates.`,
    missing_canonical_tag: `After adding canonical tags to each affected page, search engines will know which version of similar or duplicate content to index and rank. This consolidates ranking signals onto the preferred URL.`,
    url_too_long: `After shortening URLs to under 75 characters, each affected page will have a clean, readable URL that's easier to share, remember, and display in search results. Shorter URLs also pass more link equity.`,
    missing_internal_links: `After adding relevant internal links, search engines can discover and crawl more of your site's content, and visitors can navigate between related pages more easily. This improves both indexation and user engagement.`,
    broken_links: `After fixing broken links, visitors will no longer encounter dead ends that lead them away from your site. This improves user experience and prevents wasted crawl budget on pages that no longer exist.`,
    oversized_images: `After compressing and resizing oversized images, pages will load significantly faster because the browser downloads smaller files. This directly improves page speed, user experience, and Core Web Vitals scores.`,
    missing_robots_directive: `After adding appropriate robots directives, search engines will know exactly which pages to crawl and index, preventing confusion about which content should appear in search results.`,
    missing_sitemap: `After creating and submitting an XML sitemap, search engines can discover and crawl all important pages on your site more efficiently, ensuring your content gets indexed faster.`,
    www_inconsistent: `After consolidating www and non-www versions with proper redirects, all ranking signals, backlinks, and authority will consolidate onto one canonical domain instead of being split between two versions.`,
    excessive_redirects: `After reducing redirect chains to a single hop, visitors will reach their destination faster and search engines will allocate more crawl budget to discovering real content instead of following redirect chains.`,
    duplicate_content: `After addressing duplicate content (through canonical tags, redirects, or unique content), search engines can focus ranking signals on the preferred version of each page instead of splitting authority across duplicates.`,
    thin_content: `After expanding thin pages with substantive, unique content, each page will provide genuine value to visitors and give search engines a stronger reason to rank it for relevant queries.`,
    missing_summary_tldr: `After adding a summary or TL;DR section, visitors can quickly understand the page's key points without reading the entire content. This improves engagement and reduces bounce rates.`,
    weakly_connected: `After adding internal links to and from these pages, search engines can discover them more easily and visitors can find them through related content. This improves both crawlability and user navigation.`,
    orphan_page: `After adding internal links to orphan pages, search engines can discover and index them, and visitors can find them through normal site navigation. This brings hidden content into your site's link structure.`,
    orphan_pages: `After adding internal links to orphan pages, search engines can discover and index them, and visitors can find them through normal site navigation. This brings hidden content into your site's link structure.`,
    javascript_rendered: `After ensuring key content is present in the initial HTML (server-side rendering or pre-rendering), AI crawlers and search engines that don't execute JavaScript will be able to read and index your content.`,
    missing_faq_schema: `After adding FAQPage structured data for genuine Q&A content, search engines can display rich FAQ snippets in search results, which significantly improves visibility and click-through rates for question-based queries.`,
    missing_organization_schema: `After adding Organization structured data, search engines can better understand your brand entity and may display enhanced brand information in search results, improving brand recognition and trust signals.`,
    missing_howto_schema: `After adding HowTo structured data for step-by-step content, search engines can display rich HowTo snippets in search results, which improves visibility for instructional and how-to queries.`,
  };
  return afterFixingMap[flag] || `After fixing this issue on the affected ${pageWord}, the page will provide a better experience for visitors and send clearer signals to search engines.`;
}

export function groupExplanationsByIssue(audit: RunAuditResult, explanations: PageExplanationResult[]): GroupedIssue[] {
  const map = new Map<string, GroupedIssue>();

  const crawlPageByUrl = new Map<string, CrawlPageSuccess>(
    audit.crawl.pages.filter((p): p is CrawlPageSuccess => p.ok).map((p) => [p.url, p])
  );

  for (const page of explanations) {
    for (const issue of page.issues) {
      let group = map.get(issue.flag);
      if (!group) {
        group = {
          flag: issue.flag,
          issueLabel: issue.issueLabel,
          whyItMatters: issue.whyItMatters,
          businessImpact: issue.businessImpact,
          recommendedFix: issue.recommendedFix,
          instances: [],
          instancesByUrl: new Set<string>(),
          smartNote: "",
          codeSnippet: getCodeSnippet(
            issue.flag,
            crawlPageByUrl.get(page.url),
            issue.suggestedText
          ),
          remediation: getRemediation(issue.flag),
        };
        map.set(issue.flag, group);
      }
      // Dedupe by URL: "N pages affected" must mean N DISTINCT pages.
      // The crawler already avoids duplicate final URLs, but explanations
      // can arrive from a stored audit row (an older crawl, a re-run, or a
      // DB import) where the same URL legitimately appears twice. Counting
      // it twice would inflate the header count, the sample, the "+N more"
      // remainder, the priority list, and the CSV all at once — and the
      // visible sample + remainder would no longer reconcile with the
      // stated total. First occurrence wins (keeps the earliest AI
      // suggestion, matching render order).
      if (group.instancesByUrl.has(page.url)) continue;
      group.instancesByUrl.add(page.url);
      const crawlPage = crawlPageByUrl.get(page.url);
      group.instances.push({
        url: page.url,
        suggestedText: issue.suggestedText,
        aiGenerated: issue.aiGenerated,
        currentValue: getCurrentValueForFlag(issue.flag, crawlPage),
        potentialVisualHeading: issue.flag === "missing_h1" ? (crawlPage?.ok ? crawlPage.potentialVisualHeading ?? null : null) : undefined,
      });
    }
  }
  let grouped = Array.from(map.values())
    .map((group) => ({ ...group, smartNote: buildIssueGroupSmartNote(group) }))
    .sort((a, b) => b.instances.length - a.instances.length);

  // INVARIANT: every affected URL must actually satisfy the check condition
  // for its flag. This prevents stale audit data, URL normalization bugs,
  // or cross-page contamination from putting unrelated URLs into a group.
  // For URL SEO flags, verify the URL against the actual detection logic.
  for (const group of grouped) {
    if (!URL_SEO_FLAGS.has(group.flag)) continue;
    group.instances = group.instances.filter((inst) => {
      let url: URL;
      try {
        url = new URL(inst.url);
      } catch {
        return false; // unparseable URL can't satisfy any condition
      }
      // The canonical check: re-run urlSeoFlagsForUrl and confirm the
      // flag is present. This is the same function crawlPage.ts uses, so
      // the invariant is enforced by the authoritative detection logic.
      return urlSeoFlagsForUrl(url).includes(group.flag);
    });
    // Rebuild the dedupe set after filtering
    group.instancesByUrl = new Set(group.instances.map((i) => i.url));
  }
  // Remove empty groups created by the invariant check
  grouped = grouped.filter((g) => g.instances.length > 0);

  // INVARIANT: every issue type with affected instances must carry non-empty
  // explanation, business impact, and recommended fix. If any field is missing,
  // the PDF and CSV will ship incomplete guidance to the client — a data
  // completeness bug, not a copy bug. Fail loudly at generation time.
  for (const group of grouped) {
    if (group.instances.length === 0) continue;
    const missing: string[] = [];
    if (!group.whyItMatters) missing.push("whyItMatters");
    if (!group.businessImpact) missing.push("businessImpact");
    if (!group.recommendedFix) missing.push("recommendedFix");
    if (missing.length > 0) {
      throw new Error(
        `Issue "${group.flag}" has ${group.instances.length} affected instance(s) but is missing: ${missing.join(", ")}. ` +
        `Every issue type with count > 0 must have explanation, business impact, and recommended fix populated. ` +
        `Check the IssueTemplate in templates.ts or the AI explanation output for this flag.`
      );
    }
  }

  // Post-generation diversity check (shared by PDF + web since both consume
  // groupedIssues): flags near-identical impact/fix sentences across the
  // issue types present in this report, so boilerplate copy never ships
  // silently. Dev-side warning only — never client-facing text.
  flagNearDuplicateCopy(grouped);

  // Populate afterFixing for each group based on the issue flag
  for (const group of grouped) {
    group.afterFixing = buildAfterFixingText(group.flag, group.instances.length);
  }

  return grouped;
}


/**
 * Which flags belong in the dedicated Image SEO / URL SEO sections instead
 * of the generic "Issues by Type" section. Kept here (not in the report
 * files) since both the PDF and web report need the identical split.
 */
export const IMAGE_SEO_FLAGS = new Set([
  "missing_alt_text",
  "duplicate_alt_text",
  "missing_image_dimensions",
  "non_optimized_image_format",
  "missing_lazy_loading",
  "missing_responsive_images",
  "poor_image_filenames",
]);

export const URL_SEO_FLAGS = new Set([
  "url_too_long",
  "url_has_uppercase",
  "url_has_underscores",
  "url_has_parameters",
  "url_poor_readability",
  "url_has_encoded_characters",
  "url_has_tracking_parameters",
  "url_uses_image_proxy",
  "url_too_deep",
  "url_has_file_extension",
]);

/**
 * Indexability checks — pulled into their own bucket (item #9) so both
 * report surfaces can render them immediately after the Robots.txt &
 * Sitemap section instead of mixed anonymously into "Issues by Type".
 * The reasoning: robots.txt, sitemap.xml, meta-robots noindex, and the
 * X-Robots-Tag header are all answering the same underlying question —
 * "can search engines actually index this page at all?" — so they read
 * far more coherently grouped together than scattered.
 */
export const ROBOTS_SEO_FLAGS = new Set(["noindex_meta_tag", "noindex_x_robots_tag"]);

/**
 * Splits an already-built groupedIssues list into four buckets so each
 * report surface can render Image SEO / URL SEO / Indexability /
 * everything-else as separate sections, without recomputing anything.
 */
export function splitGroupedIssuesByCategory(groupedIssues: GroupedIssue[]): {
  imageIssues: GroupedIssue[];
  urlIssues: GroupedIssue[];
  robotsIssues: GroupedIssue[];
  otherIssues: GroupedIssue[];
} {
  const imageIssues: GroupedIssue[] = [];
  const urlIssues: GroupedIssue[] = [];
  const robotsIssues: GroupedIssue[] = [];
  const otherIssues: GroupedIssue[] = [];
  for (const group of groupedIssues) {
    if (IMAGE_SEO_FLAGS.has(group.flag)) imageIssues.push(group);
    else if (URL_SEO_FLAGS.has(group.flag)) urlIssues.push(group);
    else if (ROBOTS_SEO_FLAGS.has(group.flag)) robotsIssues.push(group);
    else otherIssues.push(group);
  }
  return { imageIssues, urlIssues, robotsIssues, otherIssues };
}

/**
 * Extends the URL SEO findings with URLs that the crawler could NOT parse
 * as pages — specifically HTTP errors (404/410/5xx) and non-HTML responses
 * (image-proxy/CDN endpoints like /_next/image?url=...). Those URLs are
 * real URL-structure problems too (too long, encoded, image-proxy
 * endpoints, ...) and previously vanished from the URL SEO section because
 * flags are only collected on successfully parsed HTML pages.
 *
 * Each merged instance carries a `statusNote` explaining the URL isn't
 * live (so the reader doesn't misread a non-working URL in the long-URL
 * section as an inaccuracy — the note + the section header make it
 * explicit that erroring URLs are intentionally listed here AND covered in
 * the broken-links/error sections).
 */
export function mergeUrlSeoFindings(audit: RunAuditResult, groupedIssues: GroupedIssue[]): GroupedIssue[] {
  const byFlag = new Map(groupedIssues.map((g) => [g.flag, g]));
  const created: GroupedIssue[] = [];

  for (const page of audit.crawl.pages) {
    if (page.ok) continue;
    // Only URLs whose failure tells us something concrete about the URL
    // itself — a real HTTP status or non-HTML content. Transient network
    // blips and timeouts say nothing about the URL, so they're excluded.
    if (page.error.type !== "http_error" && page.error.type !== "non_html_content_type") continue;
    // 401/403/429 mean the server REFUSED the automated checker (WAF, bot
    // protection, rate limiter) — they say nothing about the URL's
    // structure or whether it works for real visitors, so they must never
    // be merged in as structural findings. Same convention as
    // genuineBrokenLinks: a firewall block is not a URL problem.
    if (
      page.error.type === "http_error" &&
      isBlockedFromAutomatedChecking({
        statusCode: page.error.statusCode ?? null,
        errorMessage: page.error.message ?? null,
      })
    ) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(page.url);
    } catch {
      continue;
    }
    for (const flag of urlSeoFlagsForUrl(url)) {
      if (!URL_SEO_FLAGS.has(flag)) continue;
      let group = byFlag.get(flag);
      if (!group) {
        const template = getIssueTemplate(flag);
        if (!template) continue;
        group = {
          flag,
          issueLabel: template.issueLabel,
          whyItMatters: template.whyItMatters,
          businessImpact: template.businessImpact,
          recommendedFix: template.recommendedFix,
          instances: [],
          instancesByUrl: new Set<string>(),
          smartNote: "",
          codeSnippet: null,
          remediation: getRemediation(flag),
        };
        byFlag.set(flag, group);
        created.push(group);
      }
      if (group.instancesByUrl.has(page.url)) continue;
      group.instancesByUrl.add(page.url);
      group.instances.push({
        url: page.url,
        suggestedText: null,
        aiGenerated: false,
        currentValue: null,
        statusNote:
          page.error.type === "http_error"
            ? `Returns HTTP ${page.error.statusCode ?? "error"} — this URL is listed here for its structure; its HTTP status is covered by the report's status-code and broken-link sections.`
            : "Returns non-HTML content (an image or asset endpoint, not a page)",
      });
    }
  }

  if (created.length === 0) return groupedIssues;
  // Newly created groups start with an empty smartNote; populate it the
  // same way groupExplanationsByIssue does so merged groups render
  // identically (an empty-string smartNote also trips react-pdf's
  // "string child outside <Text>" warning for every such group).
  const merged = [...groupedIssues, ...created.map((g) => ({ ...g, smartNote: buildIssueGroupSmartNote(g), remediation: g.remediation ?? getRemediation(g.flag) }))];
  merged.sort((a, b) => b.instances.length - a.instances.length);
  return merged;
}

/**
 * Core Web Vitals metrics that carry their own issue-group entries — one
 * GroupedIssue per vital when the website-wide rating is not "good".
 * The content (whyItMatters, businessImpact, recommendedFix, etc.) is
 * deterministic static copy keyed by metric name: CWV metrics are fixed,
 * well-known definitions that don't vary per-site or per-page, so AI
 * explanations add no value here.
 *
 * Each entry's `instances` contains the affected pages with their
 * measured value stored in `currentValue` — the same field the normal
 * issue rendering uses for the "before" value in a before/after comparison.
 * The rating (good/needs-improvement/poor) is not part of the GroupedIssue
 * instance shape; renderers that need it (the CWV-specific sections) read
 * it from the CWV aggregate directly.
 */
const CWV_VITAL_CONFIG: { key: CoreWebVitalKey; flag: string; label: string }[] = [
  { key: "lcp", flag: "webvital_lcp_poor", label: "Slow Largest Contentful Paint (LCP)" },
  { key: "inp", flag: "webvital_inp_poor", label: "Slow Interaction to Next Paint (INP)" },
  { key: "cls", flag: "webvital_cls_poor", label: "High Cumulative Layout Shift (CLS)" },
  { key: "ttfb", flag: "webvital_ttfb_poor", label: "Slow Time to First Byte (TTFB)" },
];

/**
 * Builds GroupedIssue entries for Core Web Vitals metrics that are not in
 * the good range, using deterministic static content (no AI). Each entry
 * follows the exact same GroupedIssue structure that every other issue type
 * uses, so the PDF and web UI can render CWV explanations through the
 * same pipeline as title tag / meta description / image issues.
 *
 * Only metrics with at least one affected page (poor OR needs-improvement)
 * produce a GroupedIssue. Metrics where every evaluated page is "good"
 * are silent — no empty stub.
 */
export function buildCwvGroupedIssues(cwv: CoreWebVitalsAggregate): GroupedIssue[] {
  if (cwv.evaluatedPages === 0) return [];
  const groups: GroupedIssue[] = [];
  for (const cfg of CWV_VITAL_CONFIG) {
    const affected = coreWebVitalAffectedPages(cwv, cfg.key);
    if (affected.length === 0) continue;
    // The content key in COVERAGE_ISSUE_COPY uses the same flag as the
    // priority list (webvital_lcp_poor, etc.).
    const copy = COVERAGE_ISSUE_COPY[cfg.flag];
    if (!copy) continue;
    const instances = affected.map((p) => ({
      url: p.url,
      suggestedText: null,
      aiGenerated: false,
      currentValue: p.value,
    }));
    const instancesByUrl = new Set(instances.map((i) => i.url));
    const group: GroupedIssue = {
      flag: cfg.flag,
      issueLabel: cfg.label,
      whyItMatters: copy.whyItMatters,
      businessImpact: copy.businessImpact,
      recommendedFix: copy.recommendedFix,
      afterFixing: copy.afterFixing,
      instances,
      instancesByUrl,
      smartNote: "",
      codeSnippet: copy.codeSnippet ? { language: "html" as const, label: copy.codeSnippet.label, code: copy.codeSnippet.code } : null,
      remediation: getRemediation(cfg.flag),
    };
    group.smartNote = buildIssueGroupSmartNote(group);
    groups.push(group);
  }
  groups.sort((a, b) => b.instances.length - a.instances.length);
  return groups;
}

// ---------------------------------------------------------------------------
// Consolidated CWV report blocks — one self-contained block per failing vital
// ---------------------------------------------------------------------------

/**
 * One failing CWV metric rendered as a single block in the PDF.
 * Built once in lib/crawler/ and consumed by both the PDF and web UI.
 */
export interface CwvReportBlock {
  key: CoreWebVitalKey;
  label: string;
  affectedCount: number;
  whatItIs: string;
  whyItMatters: string;
  businessImpact: string;
  recommendedFix: string;
  afterFixing: string | null;
  implementationSteps: string[];
  codeSnippet: CodeSnippet | null;
  rating: VitalRating | null;
  impactLabel: string;
}

/**
 * Builds one self-contained report block per failing CWV metric, with
 * content matching the normal issue template: what it is, why it matters,
 * business impact, recommended fix, after fixing, and implementation steps.
 * The caller renders each block as a single unbreakable unit in the PDF.
 *
 * Only metrics with at least one affected page produce a block. The
 * content is deterministic static copy — no AI, no per-site variation.
 */
export function buildCwvReportBlocks(
  cwv: CoreWebVitalsAggregate,
  cwvGroupedIssues: GroupedIssue[],
  priorityList: { key: string; impactLabel: string }[]
): CwvReportBlock[] {
  if (cwv.evaluatedPages === 0) return [];
  const blocks: CwvReportBlock[] = [];
  for (const cfg of CWV_VITAL_CONFIG) {
    const affected = coreWebVitalAffectedPages(cwv, cfg.key);
    if (affected.length === 0) continue;
    const cwvGroup = cwvGroupedIssues.find((g) => g.flag === cfg.flag);
    const copy = COVERAGE_ISSUE_COPY[cfg.flag];
    const priority = priorityList.find((p) => p.key === cfg.flag);
    const agg = cwv[cfg.key];
    // Split implementation guidance into numbered steps
    const implText = copy?.implementationGuidance ?? "";
    const steps = implText
      .split(/\d+\.\s/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    blocks.push({
      key: cfg.key,
      label: cfg.label,
      affectedCount: affected.length,
      whatItIs: copy?.whatItIs ?? "",
      whyItMatters: cwvGroup?.whyItMatters ?? copy?.whyItMatters ?? "",
      businessImpact: cwvGroup?.businessImpact ?? copy?.businessImpact ?? "",
      recommendedFix: cwvGroup?.recommendedFix ?? copy?.recommendedFix ?? "",
      afterFixing: cwvGroup?.afterFixing ?? copy?.afterFixing ?? null,
      implementationSteps: steps,
      codeSnippet: cwvGroup?.codeSnippet ?? null,
      rating: agg.rating,
      impactLabel: priority?.impactLabel ?? "",
    });
  }
  blocks.sort((a, b) => b.affectedCount - a.affectedCount);
  return blocks;
}