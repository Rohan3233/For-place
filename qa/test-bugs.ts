/**
 * Regression tests for three audit-engine bugs.
 * Run with: npx tsx qa/test-bugs.ts
 */

import { computeCategoryScores, computeOverallScore } from "../lib/crawler/score";
import { buildTrafficRiskStatement } from "../lib/crawler/businessImpactEstimate";
import { urlHasEncodedCharacters, urlSeoFlagsForUrl } from "../lib/crawler/urlSeo";
import type { CrawlSiteResult, BrokenLinkResult, CoreWebVitalsAggregate, OversizedImageResult, CrawlPageSuccess, RunAuditResult } from "../lib/crawler/types";
import { mergeUrlSeoFindings } from "../lib/crawler/groupIssues";

let passed = 0;
let failed = 0;

function assertTrue(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS - ${label}`);
    passed++;
  } else {
    console.log(`FAIL - ${label}`);
    failed++;
  }
}

function assertApprox(label: string, actual: number, expected: number, tolerance = 1) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`PASS - ${label} (got ${actual}, expected ~${expected})`);
    passed++;
  } else {
    console.log(`FAIL - ${label} (got ${actual}, expected ~${expected})`);
    failed++;
  }
}

// ============================================================
// HELPERS
// ============================================================

function fakeCwv(score: number | null): CoreWebVitalsAggregate {
  const empty = { rated: 0, good: 0, needsImprovement: 0, poor: 0, median: null, rating: null as any };
  return {
    totalPages: 1, sampleSize: score === null ? 0 : 1, evaluatedPages: score === null ? 0 : 1,
    passingPages: score === null ? 0 : 1, failingPages: 0, passRate: score,
    lcp: empty, inp: empty, cls: empty, ttfb: empty,
    score, status: score === null ? "insufficient_data" : score >= 90 ? "pass" : "fail",
    pages: [], worstUrls: [], scopeNote: "test", fullCrawlCoverage: false,
  };
}

function fakePage(url: string, flags: string[] = []): CrawlPageSuccess {
  return {
    ok: true, url, requestedUrl: url, redirected: false, redirectHopCount: null,
    fetchedAt: new Date().toISOString(), statusCode: 200, contentType: "text/html",
    title: { content: "Test", length: 4 },
    metaDescription: { content: "Test description", length: 15 },
    h1: ["Test"], headings: { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [], canonical: { url, isSelfReferencing: true },
    internalLinks: [], wordCount: 400, flags, isOrphan: false,
    structuredData: { present: false, types: [], format: null },
    robotsMeta: {} as any, xRobotsTag: {} as any, aeoSignals: {} as any,
    redirectHopStatusCodes: [], htmlLang: "en",
  };
}

function fakeCrawl(pages: (CrawlPageSuccess | { ok: false; url: string; fetchedAt: string; error: any })[]): CrawlSiteResult {
  return {
    rootUrl: "https://example.com/", crawledAt: new Date().toISOString(), maxPages: pages.length, maxPagesReached: false, terminationReason: "crawl_complete",
    metrics: {
      discoveredCount: pages.length, queuedCount: pages.length, crawledCount: pages.length,
      succeededCount: pages.filter((p: any) => p.ok).length,
      failedCount: pages.filter((p: any) => !p.ok).length,
      blockedByRobotsCount: 0, excludedAssetCount: 0, internalLinksFoundCount: 0,
      externalLinksIgnoredCount: 0, dedupSkippedCount: 0, redirectsFollowedCount: 0,
      droppedOverMaxPagesCount: 0, sitemapUrlsCount: 0, sitemapIndexFilesExpanded: 0,
      httpStatusDistribution: {}, errors: [],
    },
    lowCoverage: { detected: false, reasons: [] }, pages: pages as any,
    pagesSkippedRobots: [], redirectChains: [], duplicateTitles: [],
    duplicateMetaDescriptions: [], orphanPages: [],
    wwwConsistency: { checked: true, consistent: true, canonicalHost: "https://example.com/", variantResults: [], variantProbes: [], summary: null, issue: null },
    robotsAudit: { status: "found" as const, disallowedPaths: [] },
    sitemapAudit: { status: "found" as const, urlCount: pages.length },
  };
}

// ============================================================
// BUG 1: Technical SEO Score — per-instance normalization
// ============================================================
console.log("\n=== BUG 1: Technical SEO Score Normalization ===\n");

// Test 1a: 7 passed technical checks with many URL-flagged pages
// The site passes: noindex, orphan pages, URL lowercase, hyphens, tracking params, CLS, TTFB
// But has URL flags (parameters, encoded chars) on ALL pages
{
  const pageCount = 347;
  const pages = Array.from({ length: pageCount }, (_, i) =>
    fakePage(`https://example.com/page-${i}?id=${i}`, [
      // URL flags that fire on ALL pages
      "url_has_parameters",
      "url_has_encoded_characters",  // Actually won't fire on this URL, but let's test
    ])
  );
  // All pages have query params; a few have encoded chars
  const encodedPages = Array.from({ length: 50 }, (_, i) =>
    fakePage(`https://example.com/product-${i}%20name`, [
      "url_has_parameters",
      "url_has_encoded_characters",
    ])
  );
  const allPages = [...pages, ...encodedPages];

  const categories = computeCategoryScores(fakeCrawl(allPages), [], [], fakeCwv(80));
  const technicalScore = Math.round(categories.technical);

  console.log(`  Technical score with ${allPages.length} pages (URL flags on all): ${technicalScore}/100`);

  // With normalization: url_has_parameters on 397/397 pages contributes
  //   397/397 × 0.05 = 0.05 (not capped at 2)
  // url_has_encoded_characters on 50/397 pages contributes
  //   50/397 × 0.05 = 0.006 (not capped)
  // Total URL flags penalty: ~0.056 (negligible)
  // vs. old behavior: 2 + 2 = 4 from URL flags alone
  assertTrue(
    "Technical score is not disproportionately penalized by URL flags on large sites",
    technicalScore > 70
  );
}

// Test 1b: Small site (10 pages) with URL flags should still get penalized
{
  const pages = Array.from({ length: 10 }, (_, i) =>
    fakePage(`https://example.com/page-${i}?id=${i}`, [
      "url_has_parameters",
    ])
  );

  const categories = computeCategoryScores(fakeCrawl(pages), [], [], fakeCwv(90));
  const technicalScore = Math.round(categories.technical);

  console.log(`  Technical score with 10 pages (url_has_parameters on all): ${technicalScore}/100`);

  // 10/10 × 0.05 = 0.05 penalty — still small but proportionally the same as large site
  // The key test: score should be reasonable (not near zero)
  assertTrue(
    "Small site with URL flags has reasonable technical score",
    technicalScore > 80
  );
}

// Test 1c: High number of oversized images cannot collapse technical score
{
  const pages = Array.from({ length: 50 }, (_, i) =>
    fakePage(`https://example.com/page-${i}`)
  );
  const oversizedImages: OversizedImageResult[] = Array.from({ length: 1000 }, (_, i) => ({
    src: `https://example.com/img-${i}.jpg`,
    contentLengthBytes: 10_000_000,
    isOversized: true,
    linkedFrom: [`https://example.com/page-${i % 50}`],
    ok: true,
    errorMessage: null,
  }));

  const categories = computeCategoryScores(fakeCrawl(pages), [], oversizedImages, fakeCwv(90));
  const technicalScore = Math.round(categories.technical);

  console.log(`  Technical score with 1000 oversized images: ${technicalScore}/100`);
  assertTrue(
    "1000 oversized images cannot collapse technical score below 50",
    technicalScore >= 50
  );
}

// Test 1d: 7 passed technical checks materially contribute to final score
{
  // Site with 7 passing checks (no flags) but some URL flags on a subset of pages
  const cleanPages = Array.from({ length: 300 }, (_, i) =>
    fakePage(`https://example.com/page-${i}`)
  );
  const flaggedPages = Array.from({ length: 47 }, (_, i) =>
    fakePage(`https://example.com/page-${i}?color=red`, ["url_has_parameters"])
  );

  const categories = computeCategoryScores(fakeCrawl([...cleanPages, ...flaggedPages]), [], [], fakeCwv(85));
  const technicalScore = Math.round(categories.technical);

  console.log(`  Technical score with 347 pages, 47 with url_has_parameters: ${technicalScore}/100`);

  // With normalization: 47/347 × 0.05 = 0.00677 — negligible
  assertTrue(
    "Technical score reflects passing checks, not URL-flag count",
    technicalScore > 85
  );
}

// Test 1e: Score is deterministic for identical data
{
  const pages = [fakePage("https://example.com/", ["url_has_uppercase"])];
  const s1 = computeCategoryScores(fakeCrawl(pages), [], [], fakeCwv(null));
  const s2 = computeCategoryScores(fakeCrawl(pages), [], [], fakeCwv(null));
  assertApprox("Score is deterministic (run 1)", Math.round(s1.technical), Math.round(s2.technical), 0);
}

// Test 1f: Seven passed technical checks produce a much higher score than 2/100
{
  // Simulate the user's scenario: 347 pages, 7 major checks pass, some URL flags
  const pages = Array.from({ length: 347 }, (_, i) => {
    const flags: string[] = [];
    // Some pages have query params (most common URL flag)
    if (i % 3 === 0) flags.push("url_has_parameters");
    // A few have encoded characters
    if (i % 20 === 0) flags.push("url_has_encoded_characters");
    // All other technical checks PASS (no flags for them)
    return fakePage(`https://example.com/page-${i}${i % 3 === 0 ? '?id=' + i : ''}`, flags);
  });

  const categories = computeCategoryScores(fakeCrawl(pages), [], [], fakeCwv(85));
  const technicalScore = Math.round(categories.technical);

  console.log(`  Technical score (user's scenario, 347 pages): ${technicalScore}/100`);

  // With 7 passing major checks, the score should be substantially above 2/100
  assertTrue(
    "User's scenario: 7 passing checks → technical score >> 2/100",
    technicalScore > 50
  );
}

// ============================================================
// BUG 2: LCP Business Impact Wording
// ============================================================
console.log("\n=== BUG 2: LCP Business Impact Wording ===\n");

// Test 2a: Business impact text must not say "This page's" when referring to homepage-only LCP
{
  const lcpMs = 6200; // 6.2s
  const statement = buildTrafficRiskStatement(lcpMs);

  assertTrue("Statement is generated for 6.2s LCP", statement !== null);
  if (statement) {
    console.log(`  Statement: "${statement.substring(0, 150)}..."`);

    // Must NOT say "This page's" or "The tested page's" when it represents homepage-only data
    assertTrue(
      "Does not say 'This page's' (implies single page, but only homepage was tested)",
      !statement.includes("This page's")
    );
    assertTrue(
      "Does not say 'The tested page's' (ambiguous about which page)",
      !statement.includes("tested page's")
    );
    // Must identify the source as homepage
    assertTrue(
      "Identifies the measurement source (mentions homepage)",
      statement.toLowerCase().includes("homepage")
    );

    // Must identify the metric correctly
    assertTrue(
      "Identifies the metric (mentions LCP or Contentful Paint)",
      statement.toLowerCase().includes("contentful paint")
    );

    // Must mention the research source
    assertTrue(
      "Cites the research source",
      statement.includes("SOASTA") || statement.includes("Google")
    );
  }
}

// Test 2b: Correct LCP value is used
{
  const statement = buildTrafficRiskStatement(6200);
  assertTrue("LCP of 6.2s produces a bounce-risk statement", statement !== null);
  if (statement) {
    assertTrue("LCP value of 6.2 is in the statement", statement.includes("6.2s"));
  }
}

// Test 2c: Small LCP produces no statement (below threshold)
{
  const statement = buildTrafficRiskStatement(1500);
  assertTrue("LCP of 1.5s produces no bounce-risk statement (below 20% threshold)", statement === null);
}

// Test 2d: Null LCP produces no statement
{
  const statement = buildTrafficRiskStatement(null);
  assertTrue("null LCP produces no statement", statement === null);
}

// ============================================================
// BUG 3: Percent-Encoded URL Detection
// ============================================================
console.log("\n=== BUG 3: Percent-Encoded URL Detection ===\n");

// Test 3a: URLs with actual percent-encoding are detected
{
  assertTrue(
    "urlHasEncodedCharacters detects %20",
    urlHasEncodedCharacters(new URL("https://example.com/my%20page"))
  );
  assertTrue(
    "urlHasEncodedCharacters detects %3A",
    urlHasEncodedCharacters(new URL("https://example.com/page%3Atest"))
  );
  assertTrue(
    "urlHasEncodedCharacters detects %C3%A9 (UTF-8 encoded é)",
    urlHasEncodedCharacters(new URL("https://example.com/café"))
  );
  assertTrue(
    "urlHasEncodedCharacters detects %2F in path",
    urlHasEncodedCharacters(new URL("https://example.com/path%2Fto%2Ffile"))
  );
}

// Test 3b: URLs WITHOUT percent-encoding are NOT detected
{
  assertTrue(
    "urlHasEncodedCharacters does NOT flag plain URL",
    !urlHasEncodedCharacters(new URL("https://ikea.com"))
  );
  assertTrue(
    "urlHasEncodedCharacters does NOT flag URL with query params",
    !urlHasEncodedCharacters(new URL("https://example.com/page?id=123"))
  );
  assertTrue(
    "urlHasEncodedCharacters does NOT flag URL with path",
    !urlHasEncodedCharacters(new URL("https://example.com/products/chairs"))
  );
  assertTrue(
    "urlHasEncodedCharacters does NOT flag URL with slash",
    !urlHasEncodedCharacters(new URL("https://example.com/"))
  );
  assertTrue(
    "urlHasEncodedCharacters does NOT flag URL with colon in query",
    !urlHasEncodedCharacters(new URL("https://example.com/page?key=value:other"))
  );
  assertTrue(
    "urlHasEncodedCharacters does NOT flag URL with equals in query",
    !urlHasEncodedCharacters(new URL("https://example.com/page?key=value&other=123"))
  );
}

// Test 3c: Mixed case - URL with both encoded chars AND query params
{
  const url = new URL("https://example.com/page%20test?id=123");
  assertTrue(
    "URL with %20 AND query params is flagged for encoded characters",
    urlHasEncodedCharacters(url)
  );
}

// Test 3d: urlSeoFlagsForUrl produces correct flag set
{
  const encoded = urlSeoFlagsForUrl(new URL("https://example.com/page%20test"));
  assertTrue("Encoded URL gets url_has_encoded_characters flag", encoded.includes("url_has_encoded_characters"));

  const plain = urlSeoFlagsForUrl(new URL("https://ikea.com"));
  assertTrue("Plain URL gets no URL flags", plain.length === 0);

  const withQuery = urlSeoFlagsForUrl(new URL("https://example.com/page?id=123"));
  assertTrue("URL with query gets url_has_parameters but NOT url_has_encoded_characters",
    withQuery.includes("url_has_parameters") && !withQuery.includes("url_has_encoded_characters"));
}

// Test 3e: Representative URLs must satisfy the condition (invariant)
// Simulate groupExplanationsByIssue with URL SEO issues
{
  const pages = [
    fakePage("https://ikea.com"),
    fakePage("https://example.com/page%20test"),
    fakePage("https://example.com/page?id=123"),
  ];
  const crawl = fakeCrawl(pages);
  const audit: RunAuditResult = {
    crawl,
    brokenLinks: [],
    oversizedImages: [],
    pageSpeed: { ok: false, url: "", error: "" },
    score: { overallScore: 100, breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: 0, oversizedImagesCount: 0, performancePenalty: 0 } },
    fromCache: false,
    crawlDurationMs: 0,
    auditDate: new Date().toISOString(),
    aeo: { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [] } as any,
  };
  const merged = mergeUrlSeoFindings(audit, []);

  const encodedGroup = merged.find(g => g.flag === "url_has_encoded_characters");
  if (encodedGroup) {
    console.log(`  url_has_encoded_characters instances: ${encodedGroup.instances.map(i => i.url).join(", ")}`);
    for (const instance of encodedGroup.instances) {
      const url = new URL(instance.url);
      assertTrue(
        `Instance URL ${instance.url} actually has percent-encoding`,
        urlHasEncodedCharacters(url)
      );
    }
  }

  const paramGroup = merged.find(g => g.flag === "url_has_parameters");
  if (paramGroup) {
    for (const instance of paramGroup.instances) {
      const url = new URL(instance.url);
      assertTrue(
        `Instance URL ${instance.url} actually has query parameters`,
        url.search.length > 0
      );
    }
  }
}

// Test 3f: ikea.com must NEVER appear in url_has_encoded_characters
{
  const pages = [fakePage("https://ikea.com")];
  const crawl2 = fakeCrawl(pages);
  const audit2: RunAuditResult = {
    crawl: crawl2,
    brokenLinks: [],
    oversizedImages: [],
    pageSpeed: { ok: false, url: "", error: "" },
    score: { overallScore: 100, breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: 0, oversizedImagesCount: 0, performancePenalty: 0 } },
    fromCache: false,
    crawlDurationMs: 0,
    auditDate: new Date().toISOString(),
    aeo: { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [] } as any,
  };
  const merged = mergeUrlSeoFindings(audit2, []);

  const encodedGroup = merged.find(g => g.flag === "url_has_encoded_characters");
  if (encodedGroup) {
    assertTrue(
      "https://ikea.com is NOT in url_has_encoded_characters group",
      !encodedGroup.instances.some(i => i.url === "https://ikea.com")
    );
  } else {
    assertTrue("No url_has_encoded_characters group exists (correct for plain URLs)", true);
  }
}

// Test 3g: A URL with %20 IS correctly classified when it's an error page
// (mergeUrlSeoFindings only processes error/non-HTML pages)
{
  const errorPage = {
    ok: false as const,
    url: "https://example.com/my%20product",
    fetchedAt: new Date().toISOString(),
    error: { type: "http_error" as const, message: "404", statusCode: 404 },
  };
  const crawl3 = fakeCrawl([fakePage("https://example.com/"), errorPage]);
  const audit3: RunAuditResult = {
    crawl: crawl3,
    brokenLinks: [],
    oversizedImages: [],
    pageSpeed: { ok: false, url: "", error: "" },
    score: { overallScore: 100, breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: 0, oversizedImagesCount: 0, performancePenalty: 0 } },
    fromCache: false,
    crawlDurationMs: 0,
    auditDate: new Date().toISOString(),
    aeo: { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [] } as any,
  };
  const merged = mergeUrlSeoFindings(audit3, []);

  const encodedGroup = merged.find(g => g.flag === "url_has_encoded_characters");
  assertTrue(
    "Error URL with %20 IS in url_has_encoded_characters group",
    !!encodedGroup?.instances.some(i => i.url === "https://example.com/my%20product")
  );
}

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}`);

if (failed > 0) process.exit(1);
