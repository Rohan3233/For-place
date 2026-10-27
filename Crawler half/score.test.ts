/**
 * Sanity tests for computeOverallScore.
 * Run with: npm run test:score
 */
import { computeOverallScore } from "./score";
import type { CrawlSiteResult, BrokenLinkResult, CoreWebVitalsAggregate, CrawlPageSuccess } from "./types";
import type { VitalRating } from "./webVitals";

/** Minimal website-wide CWV aggregate for score tests: the only field the
 * score math reads is `score` (performance category + penalty), so the
 * per-vital detail is left empty. score === null simulates insufficient
 * data (must never be penalized). */
function fakeCwv(score: number | null): CoreWebVitalsAggregate {
  const empty = { rated: 0, good: 0, needsImprovement: 0, poor: 0, median: null, rating: null as VitalRating | null };
  return {
    totalPages: 1,
    sampleSize: score === null ? 0 : 1,
    evaluatedPages: score === null ? 0 : 1,
    passingPages: score === null ? 0 : 1,
    failingPages: 0,
    passRate: score,
    lcp: empty,
    inp: empty,
    cls: empty,
    ttfb: empty,
    score,
    status: score === null ? "insufficient_data" : score >= 90 ? "pass" : "fail",
    pages: [],
    worstUrls: [],
    scopeNote: "test fixture",
    fullCrawlCoverage: false,
  };
}

function fakePage(overrides: Partial<CrawlPageSuccess>): CrawlPageSuccess {
  return {
    ok: true,
    url: "https://example.com/",
    requestedUrl: "https://example.com/",
    redirected: false,
    redirectHopCount: null,
    fetchedAt: new Date().toISOString(),
    statusCode: 200,
    contentType: "text/html",
    title: { content: "Example", length: 7 },
    metaDescription: { content: "A description long enough to pass the check for testing purposes here.", length: 74 },
    h1: ["Example"],
    headings: { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    canonical: { url: "https://example.com/", isSelfReferencing: true },
    internalLinks: [],
    wordCount: 100,
    flags: [],
    isOrphan: false,
    structuredData: { present: false, types: [], format: null },
    // tests don't need real robots meta / x-robots-tag info; satisfy the type
    robotsMeta: {} as any,
    xRobotsTag: {} as any,
    // satisfy AeoPageSignals requirement in CrawlPageSuccess
    aeoSignals: {} as any,
    redirectHopStatusCodes: [],
    htmlLang: null,
    ...overrides,
  };
}

function fakeCrawl(pages: CrawlPageSuccess[]): CrawlSiteResult {
  return {
    rootUrl: "https://example.com/",
    crawledAt: new Date().toISOString(),
    maxPages: pages.length,
    maxPagesReached: false,
    terminationReason: "crawl_complete",
    metrics: {
      discoveredCount: pages.length,
      queuedCount: pages.length,
      crawledCount: pages.length,
      succeededCount: pages.filter((p) => p.ok).length,
      failedCount: pages.filter((p) => !p.ok).length,
      blockedByRobotsCount: 0,
      excludedAssetCount: 0,
      internalLinksFoundCount: 0,
      externalLinksIgnoredCount: 0,
      dedupSkippedCount: 0,
      redirectsFollowedCount: 0,
      droppedOverMaxPagesCount: 0,
      sitemapUrlsCount: 0,
      sitemapIndexFilesExpanded: 0,
      httpStatusDistribution: {},
      errors: [],
    },
    lowCoverage: { detected: false, reasons: [] },
    pages,
    pagesSkippedRobots: [],
    redirectChains: [],
    duplicateTitles: [],
    duplicateMetaDescriptions: [],
    orphanPages: [],
    wwwConsistency: { checked: true, consistent: true, canonicalHost: "https://example.com/", variantResults: [], variantProbes: [], summary: null, issue: null },
    robotsAudit: { status: "not_found", disallowedPaths: [] },
    sitemapAudit: { status: "not_found", urlCount: 0 },
  };
}

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

export function run() {
  const noCwv = fakeCwv(null);

  // --- Test 1: a clean, issue-free page scores 100 ---
  const clean = fakeCrawl([fakePage({})]);
  const cleanScore = computeOverallScore(clean, [], [], noCwv);
  assertTrue("clean page with no issues scores 100", cleanScore.overallScore === 100);

  // --- Test 2: a critical issue (missing_h1) costs more than a minor one (missing_alt_text) ---
  const withCritical = fakeCrawl([fakePage({ flags: ["missing_h1"] })]);
  const withMinor = fakeCrawl([fakePage({ flags: ["missing_alt_text"] })]);
  const criticalScore = computeOverallScore(withCritical, [], [], noCwv);
  const minorScore = computeOverallScore(withMinor, [], [], noCwv);
  assertTrue(
    "critical issue penalized more heavily than minor issue",
    criticalScore.overallScore < minorScore.overallScore
  );
  assertTrue("critical breakdown counted correctly", criticalScore.breakdown.criticalIssuesCount === 1);
  assertTrue("minor breakdown counted correctly", minorScore.breakdown.minorIssuesCount === 1);

  // --- Test 3: broken links reduce score ---
  const brokenLinks: BrokenLinkResult[] = [
    { url: "https://example.com/dead", statusCode: 404, ok: false, errorMessage: null, failureCategory: "not_found", linkedFrom: ["https://example.com/"] },
  ];
  const withBroken = computeOverallScore(clean, brokenLinks, [], noCwv);
  assertTrue("broken link lowers score", withBroken.overallScore < 100);
  assertTrue("broken link counted in breakdown", withBroken.breakdown.brokenLinksCount === 1);

  // --- Test 4: a crawl error page (e.g. 500) is treated as critical ---
  const withErrorPage = fakeCrawl([fakePage({})]);
  withErrorPage.pages.push({
    ok: false,
    url: "https://example.com/broken-page",
    fetchedAt: new Date().toISOString(),
    error: { type: "http_error", message: "500", statusCode: 500 },
  });
  const errorScore = computeOverallScore(withErrorPage, [], [], noCwv);
  assertTrue("failed-to-crawl page counted as critical", errorScore.breakdown.criticalIssuesCount === 1);

  // --- Test 5: repeated issues of a couple flag types shouldn't crater
  // every category — this is the exact bug that was reported. ---
  const manyIssues = fakeCrawl(
    Array.from({ length: 20 }, () => fakePage({ flags: ["missing_h1", "missing_title"] }))
  );
  const manyIssuesScore = computeOverallScore(manyIssues, [], [], noCwv);
  assertTrue(
    "repeated metadata/content issues lower the score but don't crater it to 0",
    manyIssuesScore.overallScore > 50 && manyIssuesScore.overallScore < 100
  );

  // --- Test 5b: a site where every page is noindexed is capped low
  // regardless of how the rest of the categories look — deterministic,
  // via the majority-noindex override rather than raw arithmetic. ---
  const noindexedCrawl = fakeCrawl(
    Array.from({ length: 20 }, () => fakePage({ flags: ["noindex_meta_tag"] }))
  );
  const noindexedScore = computeOverallScore(noindexedCrawl, [], [], noCwv);
  assertTrue("a fully noindexed site is capped to a low score", noindexedScore.overallScore <= 25);

  // --- Test 6: good website-wide Core Web Vitals don't hurt; bad
  // performance lowers the score. The score is now the WEBSITE-WIDE CWV
  // aggregate (share of evaluated pages passing), not a homepage value. ---
  const goodCwv = fakeCwv(95);
  const badCwv = fakeCwv(20);
  const goodScore = computeOverallScore(clean, [], [], goodCwv);
  const badScore = computeOverallScore(clean, [], [], badCwv);
  assertTrue("bad website-wide CWV lowers overall score more than good CWV", badScore.overallScore < goodScore.overallScore);
  assertTrue("insufficient CWV data is never penalized (score stays 100 category-wise)", cleanScore.overallScore === 100);
  assertTrue("good CWV applies a small performance penalty (95 -> 1pt)", goodScore.breakdown.performancePenalty === 1);
  assertTrue("bad CWV applies a large performance penalty (20 -> 16pt)", badScore.breakdown.performancePenalty === 16);
  assertTrue("insufficient CWV applies zero performance penalty", cleanScore.breakdown.performancePenalty === 0);

  console.log("\nDone. If all lines above say PASS, score.ts logic is working.");
}

if (require.main === module) {
  run();
}