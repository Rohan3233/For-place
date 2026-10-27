/**
 * Sanity test for compareAudits, using almost exactly the example numbers
 * from the business doc's "Re-audit" section (58 -> 82, +24).
 * Run with: npm run test:compare
 */
import { compareAudits } from "./compareAudits";
import type { RunAuditResult, CrawlPageSuccess, CrawlSiteResult } from "./types";

function fakePage(flags: string[], url = "https://example.com/"): CrawlPageSuccess {
  return {
    ok: true,
    url,
    requestedUrl: url,
    redirected: false,
    redirectHopCount: 0,
    fetchedAt: new Date().toISOString(),
    statusCode: 200,
    contentType: "text/html",
    title: { content: "Example", length: 7 },
    metaDescription: { content: "A description long enough to pass the length check for this test.", length: 68 },
    h1: flags.includes("missing_h1") ? [] : ["Example"],
    headings: { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    canonical: { url, isSelfReferencing: true },
    internalLinks: [],
    flags,
    wordCount: 100,
    structuredData: { present: false, types: [], format: null },
    robotsMeta: { noindex: false, nofollow: false },
    xRobotsTag: { noindex: false, raw: null },
    isOrphan: false,
    redirectHopStatusCodes: [],
    htmlLang: null,
    // aeoSignals added to satisfy CrawlPageSuccess type in tests
    aeoSignals: {} as any,
  };
}
function fakeAuditResult(score: number, flags: string[], brokenUrls: string[], crawledAt: string): RunAuditResult {
  return {
    crawl: ({
      rootUrl: "https://example.com/",
      crawledAt,
      maxPages: 1,
      maxPagesReached: false,
      pages: [fakePage(flags)],
      pagesSkippedRobots: [],
      redirectChains: [],
      duplicateTitles: [],
      duplicateMetaDescriptions: [],
      robotsAudit: { status: "not_found", disallowedPaths: [] },
      sitemapAudit: { status: "not_found", urlCount: 0 },
    } as unknown as CrawlSiteResult),
    brokenLinks: brokenUrls.map((url) => ({
      url,
      statusCode: 404,
      ok: false,
      errorMessage: null,
      failureCategory: "not_found" as const,
      linkedFrom: ["https://example.com/"],
    })),
    oversizedImages: [],
    pageSpeed: { ok: false, url: "https://example.com/", error: "not tested here" },
    // aeo is required on RunAuditResult in current types
    aeo: {} as any,
    score: { overallScore: score, breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: brokenUrls.length, oversizedImagesCount: 0, performancePenalty: 0 } },
    crawlDurationMs: 0,
    auditDate: crawledAt,
    fromCache: false,
  };
}

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

export function run() {
  // Matches the business doc's own example:
  // Previous Score: 58, Current Score: 82, fixed: missing_h1, duplicate
  // titles (represented here as a flag), large images (missing_alt_text).
  const previous = fakeAuditResult(
    58,
    ["missing_h1", "duplicate_title", "missing_alt_text"],
    ["https://example.com/old-page", "https://example.com/broken-image-link"],
    "2026-06-01T00:00:00.000Z"
  );
  const current = fakeAuditResult(
    82,
    ["meta_description_length_out_of_range"], // a new, unrelated issue introduced since
    ["https://example.com/broken-image-link"], // one of the two broken links got fixed
    "2026-07-01T00:00:00.000Z"
  );

  const comparison = compareAudits(previous, current);

  assertTrue("previousScore matches", comparison.previousScore === 58);
  assertTrue("currentScore matches", comparison.currentScore === 82);
  assertTrue("scoreDelta is +24, matching the business doc's own example", comparison.scoreDelta === 24);
  assertTrue(
    "all three previously-present issues are listed as fixed",
    comparison.problemsFixed.includes("missing_h1") &&
      comparison.problemsFixed.includes("duplicate_title") &&
      comparison.problemsFixed.includes("missing_alt_text")
  );
  assertTrue(
    "the new issue is listed separately, not conflated with fixed ones",
    comparison.newProblems.includes("meta_description_length_out_of_range") &&
      comparison.newProblems.length === 1
  );
  assertTrue("one broken link fixed, correctly counted", comparison.brokenLinksFixed === 1);
  assertTrue("no new broken links in this scenario", comparison.brokenLinksNew === 0);

  console.log("\nDone. If all lines above say PASS, re-audit comparison logic matches the business doc's spec.");
}

if (require.main === module) {
  run();
}
