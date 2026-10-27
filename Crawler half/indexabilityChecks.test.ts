/**
 * Tests for the Indexability checks detail reporting:
 *
 *  - Every FAILED Indexability check produces a detailed issue group built
 *    from the check's REAL affected URLs (never AI-layer data, never fake).
 *  - Passed checks produce no detail group (they stay concise in the grid).
 *  - The detail group carries the shared template content (why it matters,
 *    business impact, recommended fix) and code snippet where one exists.
 *  - The CSV export for the affected flags contains EXACTLY the check's
 *    affected-URL set — same count, same URLs.
 *
 * Run with: npm run test:indexability (or: npx ts-node lib/crawler/indexabilityChecks.test.ts)
 */
import { buildIndexabilityChecks, buildIndexabilityDetailGroups, INDEXABILITY_CHECK_FLAGS } from "./indexabilityChecks";
import { generateAuditCsv } from "./generateAuditCsv";
import type { RunAuditResult, CrawlPageSuccess } from "./types";

function assertTrue(label: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

function fakePage(url: string, overrides: Partial<CrawlPageSuccess> = {}): CrawlPageSuccess {
  return {
    ok: true,
    url,
    requestedUrl: url,
    redirected: false,
    redirectHopCount: null,
    redirectHopStatusCodes: [],
    fetchedAt: new Date().toISOString(),
    statusCode: 200,
    contentType: "text/html",
    title: { content: "Test", length: 4 },
    metaDescription: { content: "Test description", length: 15 },
    h1: ["Test"],
    headings: { h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    canonical: { url, isSelfReferencing: true },
    internalLinks: [],
    wordCount: 400,
    flags: [],
    isOrphan: false,
    structuredData: { present: false, types: [], format: null },
    robotsMeta: {} as any,
    xRobotsTag: {} as any,
    aeoSignals: {} as any,
    htmlLang: "en",
    ...overrides,
  };
}

function fakeAudit(pages: CrawlPageSuccess[]): RunAuditResult {
  return {
    crawl: {
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
      robotsAudit: { status: "found", disallowedPaths: [] },
      sitemapAudit: { status: "found", urlCount: pages.length },
      orphanPages: [],
      wwwConsistency: { checked: false, consistent: true, canonicalHost: null, variantResults: [], variantProbes: [], summary: null, issue: null },
    },
    brokenLinks: [],
    oversizedImages: [],
    pageSpeed: { ok: false, url: "", error: "not tested" },
    score: {
      overallScore: 100,
      breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: 0, oversizedImagesCount: 0, performancePenalty: 0 },
    },
    fromCache: false,
    crawlDurationMs: 1000,
    auditDate: new Date().toISOString(),
    aeo: { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [] },
  };
}

export function run(): void {
  // Site: home <-> about (mutually linked, clean); /noindex carries a
  // noindex meta tag (home links to it, so it is not an orphan); /staging
  // is linked to by nobody (orphan) and links only to home.
  const home = fakePage("https://example.com/", {
    internalLinks: ["https://example.com/about", "https://example.com/noindex"],
  });
  const about = fakePage("https://example.com/about", {
    internalLinks: ["https://example.com/"],
  });
  const noindex = fakePage("https://example.com/noindex", {
    internalLinks: ["https://example.com/"],
    flags: ["noindex_meta_tag"],
    robotsMeta: { noindex: true, nofollow: false } as any,
  });
  const staging = fakePage("https://example.com/staging", {
    internalLinks: ["https://example.com/"],
  });

  const audit = fakeAudit([home, about, noindex, staging]);

  // --- Checks themselves ---------------------------------------------
  const checks = buildIndexabilityChecks(audit);
  const noindexCheck = checks.find((c) => c.key === "noindex_meta_tag")!;
  const orphanCheck = checks.find((c) => c.key === "orphan_page")!;
  const xRobotsCheck = checks.find((c) => c.key === "noindex_x_robots_tag")!;
  assertTrue("noindex check FAILS with 1 affected page", !noindexCheck.passed && noindexCheck.affectedCount === 1);
  assertTrue("noindex check lists the exact URL", noindexCheck.affectedUrls[0] === "https://example.com/noindex");
  assertTrue("orphan check FAILS with 1 affected page", !orphanCheck.passed && orphanCheck.affectedCount === 1);
  assertTrue("orphan check lists the exact URL", orphanCheck.affectedUrls[0] === "https://example.com/staging");
  assertTrue("x-robots check PASSES (no header noindex)", xRobotsCheck.passed);

  // --- Detail groups -------------------------------------------------
  const groups = buildIndexabilityDetailGroups(audit);
  assertTrue("one detail group per FAILED check (2 failed -> 2 groups)", groups.length === 2);
  assertTrue("passed x-robots check generates NO group", !groups.some((g) => g.flag === "noindex_x_robots_tag"));

  const noindexGroup = groups.find((g) => g.flag === "noindex_meta_tag")!;
  assertTrue("noindex group has 1 instance", noindexGroup.instances.length === 1);
  assertTrue(
    "noindex group instance is the check's real URL",
    noindexGroup.instances[0].url === "https://example.com/noindex"
  );
  assertTrue("noindex group carries whyItMatters from the shared template", noindexGroup.whyItMatters.includes("noindex"));
  assertTrue("noindex group carries business impact", noindexGroup.businessImpact.length > 20);
  assertTrue("noindex group carries a recommended fix", noindexGroup.recommendedFix.includes("noindex"));
  assertTrue("noindex group has an implementation code snippet", noindexGroup.codeSnippet !== null);

  const orphanGroup = groups.find((g) => g.flag === "orphan_page")!;
  assertTrue("orphan group instance is the check's real URL", orphanGroup.instances[0].url === "https://example.com/staging");
  assertTrue("orphan group carries a recommended fix", orphanGroup.recommendedFix.includes("internal link"));

  // --- INDEXABILITY_CHECK_FLAGS drives the report filtering ----------
  assertTrue(
    "INDEXABILITY_CHECK_FLAGS covers exactly the three grid checks",
    INDEXABILITY_CHECK_FLAGS.size === 3 &&
      INDEXABILITY_CHECK_FLAGS.has("noindex_meta_tag") &&
      INDEXABILITY_CHECK_FLAGS.has("noindex_x_robots_tag") &&
      INDEXABILITY_CHECK_FLAGS.has("orphan_page")
  );

  // --- CSV consistency -----------------------------------------------
  const noindexCsv = generateAuditCsv(audit, [], "noindex_meta_tag");
  const noindexRows = noindexCsv.csvBody.split("\r\n").filter(Boolean).length - 1; // minus header
  assertTrue("CSV noindex rows == check.affectedCount", noindexRows === noindexCheck.affectedCount);
  assertTrue("CSV noindex contains the affected URL", noindexCsv.csvBody.includes("https://example.com/noindex"));

  const orphanCsv = generateAuditCsv(audit, [], "orphan_pages");
  const orphanRows = orphanCsv.csvBody.split("\r\n").filter(Boolean).length - 1;
  assertTrue("CSV orphan rows == check.affectedCount", orphanRows === orphanCheck.affectedCount);
  assertTrue("CSV orphan contains the affected URL", orphanCsv.csvBody.includes("https://example.com/staging"));
}

// ts-node entrypoint parity with the other test suites.
if (typeof require !== "undefined" && require.main === module) {
  run();
}
