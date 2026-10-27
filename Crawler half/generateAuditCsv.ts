import { groupExplanationsByIssue, mergeUrlSeoFindings } from "./groupIssues";
import { buildPriorityList, estimateBatchAwareTime, type IssuePillar } from "./priorityIssues";
import { suggestSchemaType, suggestSchemaTypeWithReason, buildSchemaRecommendation } from "./schemaSuggestions";
import { splitBrokenLinks, genuineBrokenLinks, blockedFromAutomatedChecking, isCloudflareEmailObfuscation } from "./brokenLinkClassification";
import { buildInternalLinkGraph } from "./internalLinkGraph";
import { buildIndexabilityChecks } from "./indexabilityChecks";
import { buildRedirectChainSummary } from "./redirectChainSummary";
import { buildAiVisibilityOpportunities } from "./aeoReport";
import { getRemediation } from "./remediation";
import {
  resolveCoreWebVitals,
  coreWebVitalPageValues,
  coreWebVitalPageRows,
  type CoreWebVitalKey,
} from "./coreWebVitals";
import { RATING_LABEL, type VitalRating } from "./webVitals";
import type { RunAuditResult, PageExplanationResult, CrawlPageSuccess } from "./types";

/** Maps a PriorityIssue.pillar value to its display label for CSV export. */
function pillarToLabel(pillar: IssuePillar | undefined): string {
  if (pillar === "onPage") return "On-Page SEO";
  if (pillar === "technical") return "Technical SEO";
  if (pillar === "aiSearchReadiness") return "AI Search Readiness";
  return "Technical SEO";
}

const CWV_METRIC_LABEL: Record<CoreWebVitalKey, string> = {
  lcp: "Largest Contentful Paint (LCP)",
  inp: "Interaction to Next Paint (INP)",
  cls: "Cumulative Layout Shift (CLS)",
  ttfb: "Time to First Byte (TTFB)",
};

const CWV_METRIC_FIX: Record<CoreWebVitalKey, string> = {
  lcp: "Optimize the largest content element — compress hero images, serve modern formats (WebP/AVIF), preload key assets, and remove render-blocking CSS/JavaScript.",
  inp: "Reduce main-thread work — break up long JavaScript tasks, defer or remove non-critical third-party scripts, and keep event handlers light.",
  cls: "Reserve space for images and embeds (width/height attributes or aspect-ratio CSS), avoid injecting content above existing content, and animate with transform/opacity.",
  ttfb: "Improve server response time — enable caching and a CDN, optimize database queries, and enable HTTP/2 or HTTP/3.",
};

function csvEscape(value: string): string {
  if (value === "") return "";
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
function toCsv(rows: string[][]): string {
  // UTF-8 BOM ensures Excel opens the file as UTF-8 instead of Windows-1252,
  // preventing mojibake for arrows (→), em-dashes (—), and other non-ASCII characters.
  const BOM = "\uFEFF";
  return BOM + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
function fmtBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

/** Format platform-specific guidance into a single string for CSV export. */
function formatPlatformGuidance(pi: { wordpress?: string; shopify?: string; rawHtml?: string; wix?: string; squarespace?: string; webflow?: string }): string {
  const parts: string[] = [];
  if (pi.wordpress) parts.push(`WordPress: ${pi.wordpress}`);
  if (pi.shopify) parts.push(`Shopify: ${pi.shopify}`);
  if (pi.rawHtml) parts.push(`HTML/Developer: ${pi.rawHtml}`);
  if (pi.wix) parts.push(`Wix: ${pi.wix}`);
  if (pi.squarespace) parts.push(`Squarespace: ${pi.squarespace}`);
  if (pi.webflow) parts.push(`Webflow: ${pi.webflow}`);
  return parts.join(" | ");
}

/** Derive confidence from severity: hard evidence = High, heuristic = Medium/Low. */
function heuristicConfidence(severity: string | undefined): string {
  if (!severity) return "Medium";
  const s = severity.toLowerCase();
  if (s === "critical" || s === "high") return "High";
  if (s === "moderate" || s === "medium") return "Medium";
  return "Low";
}

export function generateAuditCsv(
  audit: RunAuditResult,
  explanations: PageExplanationResult[],
  flag?: string | null
): { csvBody: string; filenameSuffix: string } {
  const groupedIssues = mergeUrlSeoFindings(audit, groupExplanationsByIssue(audit, explanations));
  const priorityList = buildPriorityList(audit, groupedIssues);
  const priorityByKey = new Map(priorityList.map((p) => [p.key, p]));
  const pageByUrl = new Map<string, CrawlPageSuccess>(
    audit.crawl.pages.filter((p): p is CrawlPageSuccess => p.ok).map((p) => [p.url, p])
  );

  // Render-time re-derivation of broken_links_aeo from raw audit data,
  // so stale cached audits never surface cdn-cgi/l/ false positives.
  // Must run before the aeoCheck lookup below so the per-flag export
  // for broken_links_aeo also reflects the corrected data.
  if (audit.aeo?.checks) {
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

  let rows: string[][];
  let filenameSuffix: string;
  const group = groupedIssues.find((g) => g.flag === flag);
  // AEO check keys (render_mode, schema_organization, thin_content_aeo, …)
  // are not grouped issues — export exactly that check's affected URLs so
  // the CSV always matches what the report claims.
  const aeoCheck = flag ? audit.aeo.checks.find((c) => c.key === flag) : undefined;

  if (flag && group) {
    filenameSuffix = flag;
    const priority = priorityByKey.get(flag);
    const rem = getRemediation(flag);
    if (flag === "missing_h1") {
      rows = [["Pillar", "URL", "Page Title", "Existing H1", "Expected Value", "Recommendation", "Severity", "Priority", "Confidence", "Template-Level Fix", "What It Means", "How To Fix", "Verification", "Estimated Effort", "Difficulty", "Platform Guidance"]];
      for (const inst of group.instances) {
        const page = pageByUrl.get(inst.url);
        const platformGuidance = rem?.platformInstructions ? formatPlatformGuidance(rem.platformInstructions) : "";
        rows.push([pillarToLabel(priority?.pillar), inst.url, page?.title.content ?? "", inst.currentValue ?? "", "A descriptive H1 tag matching the page topic", group.recommendedFix, priority?.severity ?? "", priority ? String(priority.priorityScore) : "", heuristicConfidence(priority?.severity), priority?.templateLevel ? "Yes" : "No", rem?.whatItMeans ?? "", rem?.howToFix ?? "", rem?.verificationMethod ?? "", rem?.estimatedEffort ?? "", rem?.technicalDifficulty ?? "", platformGuidance]);
      }
    } else if (flag === "missing_meta_description" || flag === "meta_description_length_out_of_range") {
      rows = [["Pillar", "URL", "Current Meta Description", "Detected Value", "Expected Value", "Recommendation", "Severity", "Priority", "Confidence", "Template-Level Fix", "What It Means", "How To Fix", "Verification", "Estimated Effort", "Difficulty", "Platform Guidance"]];
      for (const inst of group.instances) {
        const platformGuidance = rem?.platformInstructions ? formatPlatformGuidance(rem.platformInstructions) : "";
        const charCount = inst.currentValue ? String(inst.currentValue.length) : "";
        rows.push([pillarToLabel(priority?.pillar), inst.url, inst.currentValue ?? "", `${charCount} chars`, "120–160 characters", inst.suggestedText ? `Suggested: ${inst.suggestedText}` : group.recommendedFix, priority?.severity ?? "", priority ? String(priority.priorityScore) : "", heuristicConfidence(priority?.severity), priority?.templateLevel ? "Yes" : "No", rem?.whatItMeans ?? "", rem?.howToFix ?? "", rem?.verificationMethod ?? "", rem?.estimatedEffort ?? "", rem?.technicalDifficulty ?? "", platformGuidance]);
      }
    } else {
      rows = [["Pillar", "URL", "Current Value", "Detected Value", "Suggested / Recommended Fix", "AI Generated", "Severity", "Priority", "Confidence", "Template-Level Fix", "What It Means", "How To Fix", "Verification", "Estimated Effort", "Difficulty", "Platform Guidance"]];
      for (const inst of group.instances) {
        const platformGuidance = rem?.platformInstructions ? formatPlatformGuidance(rem.platformInstructions) : "";
        rows.push([pillarToLabel(priority?.pillar), inst.url, inst.currentValue ?? "", inst.currentValue ?? "", inst.suggestedText ?? group.recommendedFix, inst.aiGenerated ? "Yes" : "No", priority?.severity ?? "", priority ? String(priority.priorityScore) : "", heuristicConfidence(priority?.severity), priority?.templateLevel ? "Yes" : "No", rem?.whatItMeans ?? "", rem?.howToFix ?? "", rem?.verificationMethod ?? "", rem?.estimatedEffort ?? "", rem?.technicalDifficulty ?? "", platformGuidance]);
      }
    }
  } else if (flag === "broken_links") {
    // Only genuinely broken links — rate limits, timeouts, and other
    // transient failures live in the separate temporary_links export so
    // the CSV always matches what the PDF's Broken Links page shows.
    filenameSuffix = "broken-links";
    const priority = priorityByKey.get("broken_links");
    const { broken } = splitBrokenLinks(audit.brokenLinks.filter((b) => !b.ok && b.failureCategory !== "blocked_by_robots" && !isCloudflareEmailObfuscation(b.url)));
    rows = [["Pillar", "Source Page", "Broken URL", "HTTP Status Code", "Error", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const link of broken) {
      for (const source of link.linkedFrom.length > 0 ? link.linkedFrom : [""]) {
        rows.push(["Technical SEO", source, link.url, link.statusCode !== null ? String(link.statusCode) : "", link.errorMessage ?? "", link.statusCode !== null ? `HTTP ${link.statusCode}` : link.errorMessage ?? "", "Fix or remove this link — update it to the correct URL or delete it if the destination no longer exists.", priority?.severity ?? "critical", "High"]);
      }
    }
  } else if (flag === "temporary_links") {
    // Rate limits, timeouts, and transient network/TLS failures — kept
    // separate from genuinely broken links (they often clear up on a rerun).
    filenameSuffix = "temporary-links";
    const { temporary } = splitBrokenLinks(audit.brokenLinks.filter((b) => !b.ok && b.failureCategory !== "blocked_by_robots" && !isCloudflareEmailObfuscation(b.url)));
    rows = [["Pillar", "Source Page", "URL", "HTTP Status Code", "Error", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const link of temporary) {
      for (const source of link.linkedFrom.length > 0 ? link.linkedFrom : [""]) {
        rows.push(["Technical SEO", source, link.url, link.statusCode !== null ? String(link.statusCode) : "", link.errorMessage ?? "", link.statusCode !== null ? `HTTP ${link.statusCode}` : link.errorMessage ?? "", "Re-run the audit to confirm whether this is still failing — transient errors often clear up on a second crawl.", "moderate", "Medium"]);
      }
    }
  
  } else if (flag === "orphan_pages") {
    // Same dataset the Indexability grid and its detail pages use — the
    // check is built from the shared buildInternalLinkGraph helper, so the
    // CSV rows can never diverge from the PDF's affected count.
    filenameSuffix = "orphan-pages";
    const check = buildIndexabilityChecks(audit).find((c) => c.key === "orphan_page");
    rows = [["Pillar", "URL", "Status", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const url of check?.affectedUrls ?? []) {
      rows.push(["On-Page SEO", url, "No internal links point to this page", "0 inbound links", "Add one contextual internal link from a related page or hub page.", "medium", "High"]);
    }
  } else if (flag === "noindex_meta_tag" || flag === "noindex_x_robots_tag") {
    // Same affected-URL dataset as the Indexability grid and detail pages
    // (buildIndexabilityChecks) — the complete list, never truncated.
    filenameSuffix = flag;
    const check = buildIndexabilityChecks(audit).find((c) => c.key === flag);
    const status =
      flag === "noindex_meta_tag"
        ? "Blocked from indexing by a noindex meta tag"
        : "Blocked from indexing by an X-Robots-Tag header";
    rows = [["Pillar", "URL", "Status", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const url of check?.affectedUrls ?? []) {
      rows.push(["Technical SEO", url, status, status, "Remove the noindex directive if this page should appear in search results.", "critical", "High"]);
    }
  } else if (flag === "weakly_connected") {
    filenameSuffix = "weakly-connected";
    const { weaklyConnected } = buildInternalLinkGraph(audit);
    rows = [["Pillar", "URL", "Inbound Links", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const w of weaklyConnected) {
      rows.push(["On-Page SEO", w.url, "1", "1 inbound link", "Add one more contextual internal link so the page isn't reachable by a single path only.", "low", "High"]);
    }
  } else if (flag === "unreachable_pages") {
    // Same set the PDF's link-depth panel uses ("Not reached within crawl
    // depth") — BFS from the home page via the shared graph helper, so the
    // CSV rows always match the PDF's "full list in the CSV export" claim.
    filenameSuffix = "unreachable-pages";
    const { notReachedWithinDepth } = buildInternalLinkGraph(audit);
    rows = [["Pillar", "URL", "Status", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const url of notReachedWithinDepth) {
      rows.push(["Technical SEO", url, "Not reached within crawl depth from the home page", "Beyond crawl depth", "Add an internal link from a page near the home page (or a hub page) so this page has a path from the home page.", "low", "Medium"]);
    }
  } else if (flag === "redirect_chains") {
    // Match the PDF's "Chain paths" block exactly: only chains with 2+
    // hops are listed there, so the CSV must contain the same set for the
    // "+ N more chains" count to equal the CSV row count.
    filenameSuffix = "redirect-chains";
    const summary = buildRedirectChainSummary(audit.crawl);
    rows = [["Pillar", "Original URL", "Final URL", "Hops", "Detected Value", "Status", "Severity", "Confidence"]];
    for (const chain of summary.chains.filter((c) => c.hopCount >= 2)) {
      rows.push(["Technical SEO", chain.originalUrl, chain.finalUrl, String(chain.hopCount), `${chain.hopCount} hops → ${chain.finalUrl}`, chain.excessive ? "Excessive (4+ hops)" : "Acceptable", chain.excessive ? "moderate" : "low", "High"]);
    }
  } else if (flag && flag.startsWith("opportunity_")) {
    const oppKey = flag.slice("opportunity_".length);
    const opp = buildAiVisibilityOpportunities(audit).find((o) => o.key === oppKey);
    filenameSuffix = `opportunity-${oppKey}`;
    rows = [["Pillar", "URL", "Opportunity", "Detected Value", "Why it matters", "Severity", "Confidence"]];
    if (opp) {
      for (const url of opp.pages) {
        rows.push(["AI Search Readiness", url, opp.title, opp.evidence, opp.benefit, "action", "Medium"]);
      }
    }
  } else if (flag === "oversized_images") {
    filenameSuffix = "oversized-images";
    const priority = priorityByKey.get("oversized_images");
    rows = [["Pillar", "Page URL", "Image URL", "Current File Size", "Recommended Maximum Size", "Detected Value", "Recommendation", "Severity", "Confidence", "Platform Guidance"]];
    const rem = getRemediation(flag);
    for (const img of audit.oversizedImages.filter((i) => i.isOversized)) {
      const pi = rem?.platformInstructions ? formatPlatformGuidance(rem.platformInstructions) : "";
      for (const page of img.linkedFrom.length > 0 ? img.linkedFrom : [""]) {
        rows.push(["Technical SEO", page, img.src, fmtBytes(img.contentLengthBytes), "200 KB", fmtBytes(img.contentLengthBytes), "Compress this image or convert it to a modern format like WebP or AVIF.", priority?.severity ?? "moderate", "High", pi]);
      }
    }
  } else if (flag === "missing_alt_text") {
    filenameSuffix = "missing-alt-text";
    rows = [["Pillar", "Page URL", "Image URL", "Current Alt Attribute", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const page of audit.crawl.pages) {
      if (!page.ok) continue;
      for (const img of page.images) {
        if (!img.alt || img.alt.trim() === "") rows.push(["On-Page SEO", page.url, img.src, "", "Empty/missing", "Add descriptive alt text conveying what this image shows.", "moderate", "High"]);
      }
    }
  } else if (flag === "duplicate_titles" || flag === "duplicate_meta_descriptions") {
    filenameSuffix = flag;
    const isTitle = flag === "duplicate_titles";
    const groups = isTitle ? audit.crawl.duplicateTitles : audit.crawl.duplicateMetaDescriptions;
    const dupPriority = priorityByKey.get(flag);
    rows = [["Pillar", "URL", isTitle ? "Duplicate Title" : "Duplicate Meta Description", "Current Value", "Recommended Action", "Duplicate Group", "Severity", "Confidence"]];
    for (const g of groups) {
      for (const url of g.urls) rows.push(["On-Page SEO", url, g.value, g.value, isTitle ? "Write a unique, specific title (50-60 chars) for this page." : "Write a unique 120-160 character description for this page.", `grp_${g.value.substring(0, 40).replace(/[^a-zA-Z0-9]/g, "_")}`, dupPriority?.severity ?? "critical", "High"]);
    }
  } else if (flag === "blocked_by_robots") {
    filenameSuffix = "blocked-by-robots";
    rows = [["Pillar", "URL", "Status", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const url of audit.crawl.pagesSkippedRobots) {
      rows.push(["Technical SEO", url, "Blocked by robots.txt — discovered but not crawled", "Blocked by robots.txt", "Confirm this is intentional (e.g. admin/staging content). If not, update robots.txt to allow crawling of this path.", "low", "High"]);
    }
  } else if (flag === "missing_schema_markup" || flag === "has_structured_data") {
    filenameSuffix = flag;
    const wantMissing = flag === "missing_schema_markup";
    // Match the PDF's pagesWithSchema / pagesMissingSchema predicates
    // exactly (types.length based) so the CSV row count can never diverge
    // from the PDF's "+ N more pages" claim.
    rows = [["Pillar", "URL", "Status", "Detected Value", "Schema Type(s)", "Severity", "Estimated Fix Time", "Structured Data Reason", "Confidence", "Platform Guidance", "Recommended Schema Type"]];
    const rem = getRemediation(flag);
    const schemaPriority = priorityByKey.get(flag);
    const schemaEstimate = schemaPriority ? estimateBatchAwareTime(schemaPriority).label : "~20 min each";
    for (const page of audit.crawl.pages) {
      if (!page.ok) continue;
      const hasSchema = page.structuredData.types.length > 0;
      if (wantMissing === hasSchema) continue;
      const pi = rem?.platformInstructions ? formatPlatformGuidance(rem.platformInstructions) : "";
      if (hasSchema) {
        rows.push(["AI Search Readiness", page.url, "Present", page.structuredData.types.join("; "), page.structuredData.types.join("; "), "pass", "", "", "", "High", pi]);
      } else {
        const recommendation = buildSchemaRecommendation(page);
        const suggestion = suggestSchemaTypeWithReason(page);
        rows.push(["AI Search Readiness", page.url, "Missing", "No structured data", "", schemaPriority?.severity ?? "critical", schemaEstimate, suggestion.reason, suggestion.confidence === "high" ? "High" : suggestion.confidence === "medium" ? "Medium" : "Low", pi, recommendation]);
      }
    }
  } else if (flag === "robots_blocked_links") {
    // Links that point into paths disallowed by robots.txt — never checked
    // during the crawl, kept separate from genuinely broken links. Same
    // canonical set the coverage row and the Robots.txt page show.
    filenameSuffix = "robots-blocked-links";
    rows = [["Pillar", "URL", "Linked From (page count)", "Detected Value", "Recommendation", "Severity", "Confidence"]];
    for (const link of audit.brokenLinks.filter((b) => b.failureCategory === "blocked_by_robots")) {
      rows.push(["Technical SEO", link.url, String(link.linkedFrom?.length ?? 0), `${link.linkedFrom?.length ?? 0} linking pages`, "Confirm the path is intentionally excluded (admin, staging). If it should be reachable, allow it in robots.txt.", "medium", "High"]);
    }
  } else if (flag === "excessive_redirects") {
    // Only EXCESSIVE chains (4+ hops) — the exact set the coverage row
    // counts, so the CSV always matches the report's affected count.
    filenameSuffix = "excessive-redirects";
    rows = [["Pillar", "Original URL", "Final URL", "Hops", "Detected Value", "Status", "Severity", "Confidence"]];
    for (const chain of audit.crawl.redirectChains.filter((r) => r.excessive)) {
      rows.push(["Technical SEO", chain.originalUrl, chain.finalUrl, String(chain.hopCount), `${chain.hopCount} hops → ${chain.finalUrl}`, "Excessive (4+ hops)", "moderate", "High"]);
    }
  } else if (flag === "webvital_overview") {
    // Website-wide Core Web Vitals — the COMPLETE per-page dataset: every
    // sampled page, every vital's value + rating, and the overall page
    // status using the SAME classification (classifyPageCwv) the site
    // aggregate and report summaries use. The PDF/web summaries are always
    // a subset of this file; nothing is truncated or lost.
    filenameSuffix = "webvital-overview";
    rows = [
      [
        "Pillar",
        "URL",
        "Overall CWV Status",
        "LCP",
        "LCP Status",
        "INP",
        "INP Status",
        "CLS",
        "CLS Status",
        "TTFB",
        "TTFB Status",
        "Note",
      ],
    ];
    const cwv = resolveCoreWebVitals(audit);
    for (const p of coreWebVitalPageRows(cwv)) {
      const statusLabel = p.overall === "pass" ? "Pass" : p.overall === "fail" ? "Fail" : "Not evaluated";
      const cell = (c: { value: string; rating: VitalRating | null } | null): [string, string] =>
        c === null ? ["", ""] : [c.value, c.rating ? RATING_LABEL[c.rating] : ""];
      const [lcpV, lcpR] = cell(p.lcp);
      const [inpV, inpR] = cell(p.inp);
      const [clsV, clsR] = cell(p.cls);
      const [ttfbV, ttfbR] = cell(p.ttfb);
      const note =
        p.error ??
        (p.overall === "not_available" ? "No usable Core Web Vital data for this page — not counted as passing or failing" : "");
      rows.push([p.url, statusLabel, lcpV, lcpR, inpV, inpR, clsV, clsR, ttfbV, ttfbR, note]);
    }
  } else if (flag === "webvital_lcp_poor" || flag === "webvital_inp_poor" || flag === "webvital_cls_poor" || flag === "webvital_ttfb_poor") {
    // Website-wide Core Web Vitals — the COMPLETE per-page dataset for one
    // metric (every evaluated page with a measured value, good or not),
    // so the affected pages the report shows inline are always a subset
    // of this file and no URL is ever truncated or lost.
    filenameSuffix = flag;
    const vital = flag.slice("webvital_".length) as CoreWebVitalKey;
    const cwv = resolveCoreWebVitals(audit);
    const vitalLabel = CWV_METRIC_LABEL[vital];
    rows = [["Pillar", "URL", "Metric", "Value", "Rating", "Recommendation"]];
    for (const p of coreWebVitalPageValues(cwv, vital)) {
      rows.push(["Technical SEO", p.url, vitalLabel, p.value, RATING_LABEL[p.rating], CWV_METRIC_FIX[vital]]);
    }
  } else if (aeoCheck) {
    filenameSuffix = `aeo-${flag}`;
    rows = [["Pillar", "URL", "Issue", "Recommendation"]];
    for (const url of aeoCheck.affectedUrls) {
      rows.push(["AI Search Readiness", url, aeoCheck.label, aeoCheck.recommendedFix]);
    }
  } else {
    // The catch-all export. This is the ONLY CSV bundled in the Agency ZIP
    // (white-labeled PDFs strip per-check CSV links), so EVERY affected-URL
    // list the report claims is available in "the CSV export" must appear
    // here — AEO/AI checks included, or the claim would point at a file
    // that doesn't contain the URLs.
    filenameSuffix = "all-issues";
    rows = [["URL", "Pillar", "Issue Type", "Severity", "Current Value", "Recommended Action", "Duplicate Group", "Evidence", "Status", "Estimated Effort", "Difficulty", "Platform Guidance", "Recommended Schema Type"]];
    for (const g of groupedIssues) {
      const priority = priorityByKey.get(g.flag);
      const pillarLabel = pillarToLabel(priority?.pillar);
      const rem = getRemediation(g.flag);
      const platformGuidance = rem?.platformInstructions ? formatPlatformGuidance(rem.platformInstructions) : "";
      for (const inst of g.instances) rows.push([inst.url, pillarLabel, g.issueLabel, priority?.severity ?? "", inst.currentValue ?? "", inst.suggestedText ?? group?.recommendedFix ?? "", "", inst.suggestedText ? `Suggested: ${inst.suggestedText}` : "", "Open", rem?.estimatedEffort ?? "", rem?.technicalDifficulty ?? "", platformGuidance, ""]);
    }
    // Broken-link rows are genuine failures ONLY (the same canonical set
    // the PDF's Broken Links page shows) — transient and blocked links are
    // pushed separately below, so this sheet can never drift from the PDF
    // (the old bug where "all issues" showed 3,013 while Broken Links
    // showed 3,012 came from counting every failed link here).
    for (const link of genuineBrokenLinks(audit.brokenLinks)) {
      rows.push([link.url, "Technical SEO", "Broken Link", "critical", link.url, "Fix or remove this link — update to the correct URL or delete if destination no longer exists", "", link.errorMessage ?? (link.statusCode !== null ? `Status ${link.statusCode}` : ""), "Open", "", "", "", ""]);
    }
    // Links the server refused our checker (403/401/429) — own category,
    // low severity, never counted as broken.
    for (const link of blockedFromAutomatedChecking(audit.brokenLinks)) {
      rows.push([link.url, "Technical SEO", "Blocked Link", "low", link.url, "Spot-check in a browser — usually bot protection or rate limiting, not a broken link", "", link.errorMessage ?? (link.statusCode !== null ? `Status ${link.statusCode}` : ""), "Open", "", "", "", ""]);
    }
    for (const img of audit.oversizedImages.filter((i) => i.isOversized)) rows.push([img.src, "Technical SEO", "Oversized Image", "moderate", fmtBytes(img.contentLengthBytes), "Compress or convert to WebP/AVIF; target under 200 KB", "", `Current: ${fmtBytes(img.contentLengthBytes)}`, "Open", "", "", "", ""]);
    for (const g of audit.crawl.duplicateTitles) for (const url of g.urls) rows.push([url, "On-Page SEO", "Duplicate Title", "critical", g.value, `Write a unique title (50-60 chars) for this page; shared value: "${g.value}"`, `Group: "${g.value}" (${g.urls.length} pages)`, "Duplicate title dilutes ranking signals", "Open", "", "", "", ""]);
    for (const g of audit.crawl.duplicateMetaDescriptions) for (const url of g.urls) rows.push([url, "On-Page SEO", "Duplicate Meta Description", "critical", g.value, `Write a unique description (120-160 chars); shared value: "${g.value}"`, `Group: "${g.value}" (${g.urls.length} pages)`, "Duplicate description reduces click-through rate", "Open", "", "", "", ""]);
    for (const page of audit.crawl.pages) {
      if (page.ok && (!page.structuredData?.present || page.structuredData.types.length === 0)) {
        const s = suggestSchemaTypeWithReason(page);
        const schemaPriority = priorityByKey.get("missing_schema_markup");
        const recommendation = buildSchemaRecommendation(page);
        rows.push([page.url, "AI Search Readiness", "Missing Structured Data", schemaPriority?.severity ?? "critical", "", `Add valid JSON-LD structured data describing this page's content.`, "", "Missing schema limits AI citation potential", "Open", schemaPriority ? estimateBatchAwareTime(schemaPriority).label : "~20 min each", "", "", recommendation]);
      }
    }
    // AEO / AI Search checks that carry an affected-URL list (og_tags,
    // twitter_card_tags, render_mode, schema checks, etc.) — same full
    // lists the per-check CSV export uses, so the "+ N more — full list
    // available in the CSV export." claims always hold in this file too.
    const aeoChecks = (audit.aeo?.checks ?? []).filter((c) => c.affectedUrls.length > 0);
    for (const check of aeoChecks) {
      for (const url of check.affectedUrls) {
        rows.push([url, "AI Search Readiness", "AI Search (AEO/GEO)", check.passed ? "pass" : "action", "", check.recommendedFix || check.statusText, "", check.statusText, check.passed ? "Fixed" : "Open", "", "", "", ""]);
      }
    }
    // AI visibility opportunities — every eligible URL behind each
    // "+ N more pages — full list available in the CSV export." note.
    for (const opp of buildAiVisibilityOpportunities(audit)) {
      for (const url of opp.pages) {
        rows.push([url, "AI Search Readiness", "AI Opportunity", "action", "", opp.action, "", opp.evidence, "Open", "", "", "", ""]);
      }
    }
    // Temporary crawl issues (rate limits / timeouts) — kept separate from
    // genuinely broken links so the CSV matches the PDF's section split.
    const { temporary } = splitBrokenLinks(audit.brokenLinks.filter((b) => !b.ok && b.failureCategory !== "blocked_by_robots" && !isCloudflareEmailObfuscation(b.url)));
    for (const link of temporary) {
      rows.push([link.url, "Technical SEO", "Temporary Link", "moderate", link.url, "Re-run the audit — transient errors often clear on a second crawl", "", link.errorMessage ?? (link.statusCode !== null ? `Status ${link.statusCode}` : ""), "Open", "", "", "", ""]);
    }
    // Internal linking — orphan, weakly connected, and not-reached pages
    // (same sets the PDF's Internal Linking Analysis and the per-flag
    // exports use).
    const { orphanPages, weaklyConnected, notReachedWithinDepth } = buildInternalLinkGraph(audit);
    for (const url of orphanPages) rows.push([url, "On-Page SEO", "Internal Linking", "medium", "", "Add one contextual internal link from a related page or hub page", "", "No internal links point to this page", "Open", "", "", "", ""]);
    for (const w of weaklyConnected) rows.push([w.url, "On-Page SEO", "Internal Linking", "low", "", "Add one more contextual internal link so the page is not reachable by a single path only", "", "Only 1 inbound internal link", "Open", "", "", "", ""]);
    for (const url of notReachedWithinDepth) rows.push([url, "Technical SEO", "Internal Linking", "low", "", "Add an internal link from a page near the home page (or a hub page)", "", "Not reached within crawl depth from the home page", "Open", "", "", "", ""]);
    // Redirect chains (multi-hop only — matches the PDF's "Chain paths"
    // list and its "+ N more chains" count).
    const chainSummary = buildRedirectChainSummary(audit.crawl);
    for (const chain of chainSummary.chains.filter((c) => c.hopCount >= 2)) {
      rows.push([chain.originalUrl, "Technical SEO", "Redirect Chain", chain.excessive ? "medium" : "low", `${chain.hopCount} hops to ${chain.finalUrl}`, "Reduce redirect chain to 1 hop via server redirect", "", `${chain.hopCount} redirect hops`, "Open", "", "", "", ""]);
    }
    // Pages blocked by robots.txt — discovered but not crawled.
    for (const url of audit.crawl.pagesSkippedRobots) {
      rows.push([url, "Technical SEO", "Indexability", "low", "Blocked by robots.txt", "Confirm this is intentional (admin/staging content). If not, update robots.txt to allow crawling.", "", "Blocked by robots.txt", "Open", "", "", "", ""]);
    }
    // Links pointing into disallowed robots.txt paths — the robots_blocked_links
    // coverage row's full dataset (never truncated).
    for (const link of audit.brokenLinks.filter((b) => b.failureCategory === "blocked_by_robots")) {
      rows.push([link.url, "Technical SEO", "Indexability", "medium", `${link.linkedFrom?.length ?? 0} linking page${(link.linkedFrom?.length ?? 0) === 1 ? "" : "s"} - path blocked by robots.txt`, "Confirm this path is intentionally excluded. If it should be reachable, allow it in robots.txt.", "", `${link.linkedFrom?.length ?? 0} linking page(s)`, "Open", "", "", "", ""]);
    }
    // Excessive redirect chains — the coverage row's affected set.
    for (const chain of audit.crawl.redirectChains.filter((r) => r.excessive)) {
      rows.push([chain.originalUrl, "Technical SEO", "Excessive Redirects", "medium", `${chain.hopCount} hops to ${chain.finalUrl}`, "Reduce to 1 hop via server redirect", "", `${chain.hopCount} redirect hops (excessive)`, "Open", "", "", "", ""]);
    }
    // Core Web Vitals — every evaluated page with a non-good vital value
    // (the affected dataset the PDF's CWV issues pages reference; the full
    // per-metric list with good pages is in each webvital_* flag export).
    const cwv = resolveCoreWebVitals(audit);
    for (const vital of ["lcp", "inp", "cls", "ttfb"] as CoreWebVitalKey[]) {
      for (const p of coreWebVitalPageValues(cwv, vital)) {
        if (p.rating === "good") continue;
        rows.push([p.url, "Technical SEO", "Core Web Vitals", "action", p.value, CWV_METRIC_FIX[vital], "", `${CWV_METRIC_LABEL[vital]}: ${p.value} (${RATING_LABEL[p.rating]})`, "Open", "", "", "", ""]);
      }
    }
  }

  return { csvBody: toCsv(rows), filenameSuffix };
}