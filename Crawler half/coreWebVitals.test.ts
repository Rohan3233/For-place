/**
 * Tests for the website-wide Core Web Vitals pipeline (coreWebVitals.ts):
 * deterministic sampling, page-level aggregation, pass/fail classification,
 * insufficient-data handling, and the legacy-audit fallback.
 *
 * Run with: npm run test:cwv
 */
import {
  selectCwvSamplePages,
  selectCwvSampleWithDetails,
  aggregateCoreWebVitals,
  resolveCoreWebVitals,
  classifyPageCwv,
  coreWebVitalPageRows,
  coreWebVitalNotAvailable,
  normalizePageSpeedKey,
} from "./coreWebVitals";
import type {
  CrawlSiteResult,
  CrawlPageSuccess,
  PageCwvMeasurement,
  RunAuditResult,
} from "./types";

function fakePage(url: string, internalLinks: string[] = []): CrawlPageSuccess {
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
    title: { content: "T", length: 1 },
    metaDescription: { content: "D", length: 1 },
    h1: ["H1"],
    headings: { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    canonical: { url, isSelfReferencing: true },
    internalLinks,
    wordCount: 100,
    flags: [],
    isOrphan: false,
    structuredData: { present: false, types: [], format: null },
    robotsMeta: { noindex: false, nofollow: false },
    xRobotsTag: { raw: null, noindex: false },
    htmlLang: "en",
    aeoSignals: {} as never,
  };
}

function fakeCrawl(pages: CrawlPageSuccess[], rootUrl = "https://example.com/"): CrawlSiteResult {
  return {
    rootUrl,
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
    wwwConsistency: { checked: true, consistent: true, canonicalHost: rootUrl, variantResults: [], variantProbes: [], summary: null, issue: null },
    robotsAudit: { status: "not_found", disallowedPaths: [] },
    sitemapAudit: { status: "not_found", urlCount: 0 },
  };
}

interface MeasurementOpts {
  ok?: boolean;
  error?: string;
  lcp?: number | null;
  inp?: number | null;
  cls?: number | null;
  ttfb?: number | null;
}

function m(url: string, opts: MeasurementOpts = {}): PageCwvMeasurement {
  const ok = opts.ok ?? true;
  return {
    url,
    ok,
    error: ok ? undefined : opts.error,
    metrics: ok
      ? {
          performanceScore: null,
          lcpMs: opts.lcp ?? null,
          clsScore: opts.cls ?? null,
          inpMs: opts.inp ?? null,
          ttfbMs: opts.ttfb ?? null,
          isMobileFriendly: null,
          accessibilityScore: null,
          accessibilityIssues: [],
        }
      : undefined,
  };
}

const PASS = { lcp: 1500, inp: 100, cls: 0.01 }; // all good
const POOR = { lcp: 5000, inp: 300, cls: 0.3 }; // all poor

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

export function run() {
  // ======================================================================
  // Scenario 1 — valid CWV data across many pages
  // ======================================================================
  {
    const measurements = [
      m("https://example.com/", PASS),
      m("https://example.com/a", PASS),
      m("https://example.com/b", PASS),
      m("https://example.com/c", PASS),
      m("https://example.com/d", PASS),
      m("https://example.com/e", PASS),
      m("https://example.com/f", POOR),
      m("https://example.com/g", POOR),
    ];
    const agg = aggregateCoreWebVitals(measurements, 150);
    assertTrue("S1: evaluatedPages counts only pages with official vitals", agg.evaluatedPages === 8);
    assertTrue("S1: passingPages = 6 (all vitals good)", agg.passingPages === 6);
    assertTrue("S1: failingPages = 2", agg.failingPages === 2);
    assertTrue("S1: passing + failing === evaluatedPages", agg.passingPages + agg.failingPages === agg.evaluatedPages);
    assertTrue("S1: passRate = 75%", agg.passRate === 75);
    assertTrue("S1: score = pass rate (75)", agg.score === 75);
    assertTrue("S1: status is fail below 90%", agg.status === "fail");
    assertTrue("S1: lcp median = 1500ms (not dragged by outliers)", agg.lcp.median === 1500);
    assertTrue("S1: lcp rating from median is good", agg.lcp.rating === "good");
    assertTrue("S1: worstUrls lists the poor pages with their poor vitals", agg.worstUrls.length === 4 && agg.worstUrls.filter((w) => w.vital === "Largest Contentful Paint").length === 2 && agg.worstUrls.some((w) => w.url === "https://example.com/f"));
    assertTrue("S1: totalPages from crawl count", agg.totalPages === 150);
    assertTrue("S1: scope note mentions evaluated/total", agg.scopeNote.includes("8 of 150"));
    // Determinism — same input always produces the same output.
    const again = aggregateCoreWebVitals(measurements, 150);
    assertTrue("S1: aggregation is deterministic", JSON.stringify(agg) === JSON.stringify(again));
  }

  // ======================================================================
  // Scenario 2 — homepage good, several internal pages poor
  // (the OLD homepage-only approach would have reported "good")
  // ======================================================================
  {
    const measurements = [
      m("https://example.com/", PASS), // homepage fine
      m("https://example.com/a", POOR),
      m("https://example.com/b", POOR),
      m("https://example.com/c", POOR),
      m("https://example.com/d", POOR),
    ];
    const agg = aggregateCoreWebVitals(measurements, 5);
    assertTrue("S2: overall score is 20, NOT the homepage's good rating", agg.score === 20);
    assertTrue("S2: 4 of 5 pages fail", agg.failingPages === 4);
  }

  // ======================================================================
  // Scenario 3 — homepage poor, most internal pages good
  // (the OLD homepage-only approach would have wrongly dragged the score)
  // ======================================================================
  {
    const measurements = [
      m("https://example.com/", POOR), // homepage bad
      ...Array.from({ length: 9 }, (_, i) => m(`https://example.com/p${i}`, PASS)),
    ];
    const agg = aggregateCoreWebVitals(measurements, 10);
    assertTrue("S3: overall score is 90 (homepage alone does not dominate)", agg.score === 90);
    assertTrue("S3: status is pass at >=90%", agg.status === "pass");
    assertTrue("S3: worstUrls still surfaces the poor homepage", agg.worstUrls.length === 2 && agg.worstUrls[0].url === "https://example.com/");
  }

  // ======================================================================
  // Scenario 4 — only some pages have usable CWV data
  // ======================================================================
  {
    const measurements = [
      m("https://example.com/", { ...PASS, ttfb: 600 }),
      m("https://example.com/a", { ...PASS, ttfb: 700 }),
      m("https://example.com/ttfb-only", { ttfb: 3200 }), // no official vitals — measured but not CWV-evaluable
      m("https://example.com/ttfb-only-2", { ttfb: 500 }),
      m("https://example.com/failed", { ok: false, error: "timeout" }),
    ];
    const agg = aggregateCoreWebVitals(measurements, 150);
    assertTrue("S4: evaluatedPages counts only pages with official vitals", agg.evaluatedPages === 2);
    assertTrue("S4: sampleSize includes every attempted page", agg.sampleSize === 5);
    assertTrue("S4: ttfb aggregates ALL pages with ttfb data, incl. non-CWV-evaluable pages", agg.ttfb.rated === 4);
    assertTrue("S4: ttfb median across all four data points", agg.ttfb.median === 650);
    assertTrue("S4: score = 100 for the 2 fully-evaluated pages", agg.score === 100);
  }

  // ======================================================================
  // Scenario 5 — no page has usable CWV data -> insufficient, never a fake score
  // ======================================================================
  {
    const measurements = [
      m("https://example.com/", { ok: false, error: "timeout" }),
      m("https://example.com/a", { ok: false, error: "API quota" }),
    ];
    const agg = aggregateCoreWebVitals(measurements, 150);
    assertTrue("S5: evaluatedPages is 0", agg.evaluatedPages === 0);
    assertTrue("S5: score is null, not 0 or 100", agg.score === null);
    assertTrue("S5: passRate is null", agg.passRate === null);
    assertTrue("S5: status is insufficient_data", agg.status === "insufficient_data");
    assertTrue("S5: worstUrls is empty", agg.worstUrls.length === 0);
  }

  // ======================================================================
  // Scenario 6 — single page
  // ======================================================================
  {
    const agg = aggregateCoreWebVitals([m("https://example.com/", PASS)], 1);
    assertTrue("S6: single passing page scores 100", agg.score === 100 && agg.evaluatedPages === 1 && agg.status === "pass");
    const poorSingle = aggregateCoreWebVitals([m("https://example.com/", POOR)], 1);
    assertTrue("S6: single failing page scores 0", poorSingle.score === 0 && poorSingle.failingPages === 1);
  }

  // ======================================================================
  // Scenario 7 — large number of pages (83/100 passing)
  // ======================================================================
  {
    const measurements = [
      ...Array.from({ length: 83 }, (_, i) => m(`https://example.com/p${i}`, PASS)),
      ...Array.from({ length: 17 }, (_, i) => m(`https://example.com/q${i}`, POOR)),
    ];
    const agg = aggregateCoreWebVitals(measurements, 400);
    assertTrue("S7: large crawl scores 83", agg.score === 83 && agg.evaluatedPages === 100);
  }

  // ======================================================================
  // Pass classification — a "needs improvement" vital fails the page (only
  // all-good passes), matching Google's definition of a passing page.
  // ======================================================================
  {
    const ni = aggregateCoreWebVitals([m("https://example.com/", { lcp: 3000, inp: 100, cls: 0.01 })], 1); // LCP needs-improvement
    assertTrue("needs-improvement vital => page fails CWV", ni.failingPages === 1 && ni.passingPages === 0 && ni.score === 0);
    const mixed = aggregateCoreWebVitals([m("https://example.com/", { lcp: 1500, inp: 350, cls: 0.01 })], 1); // INP needs-improvement
    assertTrue("any non-good official vital => page fails", mixed.failingPages === 1);
    const ttfbPoorOnly = aggregateCoreWebVitals([m("https://example.com/", { lcp: 1500, inp: 100, cls: 0.01, ttfb: 4000 })], 1);
    assertTrue("TTFB is NOT part of the official pass/fail (page still passes)", ttfbPoorOnly.passingPages === 1 && ttfbPoorOnly.score === 100);
    assertTrue("TTFB median still surfaced for display", ttfbPoorOnly.ttfb.median === 4000);
  }

  // ======================================================================
  // Sampling — deterministic, homepage first, then most-linked pages
  // ======================================================================
  {
    const home = "https://example.com/";
    // p1 linked from 3 pages, p2 from 2, p3 from 1, p4 from 1 (URL tiebreak)
    const pages = [
      fakePage(home, ["https://example.com/p1", "https://example.com/p2", "https://example.com/p3"]),
      fakePage("https://example.com/p1", ["https://example.com/p1b"]),
      fakePage("https://example.com/p1b", []),
      fakePage("https://example.com/p2", []),
      fakePage("https://example.com/p3", []),
      fakePage("https://example.com/p4", []),
      fakePage("https://example.com/p5", []),
    ];
    const crawl = fakeCrawl(pages);
    const sample = selectCwvSamplePages(crawl, 4);
    assertTrue("sampling: homepage always first", sample[0] === home);
    assertTrue("sampling: limit respected", sample.length === 4);
    assertTrue("sampling: most-linked pages selected", sample.slice(1).includes("https://example.com/p1") && sample.slice(1).includes("https://example.com/p2"));
    const sampleAgain = selectCwvSamplePages(crawl, 4);
    assertTrue("sampling: deterministic across calls", JSON.stringify(sample) === JSON.stringify(sampleAgain));
    // p3 and p4 both have 1 inbound — tie broken lexicographically
    const p3 = sample.indexOf("https://example.com/p3");
    const p4 = sample.indexOf("https://example.com/p4");
    assertTrue("sampling: equal-inbound ties break by URL order", p3 === -1 || p4 === -1 || p3 < p4);
  }

  // ======================================================================
  // Representative sampling — page-type coverage (homepage first, one per
  // type, then round-robin), plus the template breakdown the report uses.
  // ======================================================================
  {
    const home = "https://example.com/";
    const pages = [
      fakePage(home, []),
      fakePage("https://example.com/products/widget-a", []), // product detail
      fakePage("https://example.com/products/widget-b", []), // second product
      fakePage("https://example.com/products/", []), // listing -> category
      fakePage("https://example.com/blog/hello-world", []), // blog
      fakePage("https://example.com/about", []), // about
      fakePage("https://example.com/contact", []), // contact
    ];
    const crawl = fakeCrawl(pages);
    const sample = selectCwvSamplePages(crawl, 6);
    assertTrue("repsampling: homepage always first", sample[0] === home);
    assertTrue("repsampling: limit respected", sample.length === 6);
    // Round 1 guarantees one representative from every detected type.
    for (const u of [
      "https://example.com/products/widget-a", // product
      "https://example.com/products/", // category
      "https://example.com/blog/hello-world", // blog
      "https://example.com/about", // about
      "https://example.com/contact", // contact
    ]) {
      assertTrue(`repsampling: ${u} represented in the sample`, sample.includes(u));
    }
    const details = selectCwvSampleWithDetails(crawl, 6);
    assertTrue(
      "repsampling: breakdown covers the 6 types present",
      details.templateBreakdown.length === 6
    );
    const labels = details.templateBreakdown.map((t) => t.label).join(",");
    assertTrue("repsampling: breakdown names the types", labels.includes("Product") && labels.includes("Category") && labels.includes("Blog"));
    const productEntry = details.templateBreakdown.find((t) => t.label === "Product");
    assertTrue("repsampling: product bucket counts 1 (second product swapped in only with more budget)", productEntry !== undefined && productEntry.pages === 1);
    assertTrue(
      "repsampling: deterministic across calls",
      JSON.stringify(sample) === JSON.stringify(selectCwvSamplePages(crawl, 6))
    );
    // With more budget, the round-robin pulls the second product in.
    const bigger = selectCwvSamplePages(crawl, 7);
    assertTrue(
      "repsampling: extra budget reaches the second product",
      bigger.includes("https://example.com/products/widget-b")
    );
    // A limit of 1 still returns just the homepage.
    assertTrue("repsampling: limit 1 is homepage only", selectCwvSamplePages(crawl, 1).length === 1);
  }

  // ======================================================================
  // normalizePageSpeedKey — deterministic dedup key (no double requests)
  // ======================================================================
  {
    assertTrue(
      "key: trailing slash variants dedup",
      normalizePageSpeedKey("https://example.com/products/") ===
        normalizePageSpeedKey("https://example.com/products")
    );
    assertTrue(
      "key: http vs https dedup",
      normalizePageSpeedKey("http://example.com/a") === normalizePageSpeedKey("https://example.com/a")
    );
    assertTrue(
      "key: fragments ignored",
      normalizePageSpeedKey("https://example.com/a#section") === normalizePageSpeedKey("https://example.com/a")
    );
    assertTrue(
      "key: host case normalized",
      normalizePageSpeedKey("https://EXAMPLE.com/a") === normalizePageSpeedKey("https://example.com/a")
    );
    assertTrue(
      "key: query strings NOT merged (genuinely different URLs)",
      normalizePageSpeedKey("https://example.com/a?v=1") !== normalizePageSpeedKey("https://example.com/a?v=2")
    );
    assertTrue(
      "key: different paths stay different",
      normalizePageSpeedKey("https://example.com/a") !== normalizePageSpeedKey("https://example.com/b")
    );
    assertTrue("key: unparseable URL falls back to itself", normalizePageSpeedKey("not a url") === "not a url");
  }

  // ======================================================================
  // Scope note with representative-sample template info
  // ======================================================================
  {
    const agg = aggregateCoreWebVitals([m("https://example.com/", PASS)], 150, undefined, {
      templatesRepresented: 6,
      templateBreakdown: [
        { type: "homepage", label: "Homepage", pages: 1 },
        { type: "product", label: "Product", pages: 12 },
        { type: "category", label: "Category", pages: 8 },
        { type: "blog", label: "Blog", pages: 4 },
        { type: "about", label: "About", pages: 1 },
        { type: "contact", label: "Contact", pages: 1 },
      ],
    });
    assertTrue(
      "note: says representative sample across page types",
      agg.scopeNote.includes("representative") && agg.scopeNote.includes("6 page types") && agg.scopeNote.includes("Product 12")
    );
    assertTrue("note: aggregate records the template count", agg.templatesRepresented === 6);
    assertTrue("note: aggregate records the breakdown", agg.templateBreakdown!.length === 6);
    const noInfo = aggregateCoreWebVitals([m("https://example.com/", PASS)], 150);
    assertTrue("note: without template info the generic phrase is used", noInfo.scopeNote.includes("major page types/templates"));
    assertTrue("note: without template info the field stays undefined", noInfo.templatesRepresented === undefined);
  }

  // ======================================================================
  // resolveCoreWebVitals — legacy audits (no cwv field) fall back honestly
  // ======================================================================
  {
    const withHomepage: RunAuditResult = {
      crawl: fakeCrawl([fakePage("https://example.com/")]),
      brokenLinks: [],
      oversizedImages: [],
      pageSpeed: { ok: true, url: "https://example.com/", strategy: "mobile", metrics: { performanceScore: 80, lcpMs: 2000, clsScore: 0.02, inpMs: 120, ttfbMs: 300, isMobileFriendly: true, accessibilityScore: null, accessibilityIssues: [] } },
      score: { overallScore: 80, breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: 0, oversizedImagesCount: 0, performancePenalty: 0 } },
      fromCache: true,
      aeo: { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [], categoryScores: [], overallScore: 0, entityConsistencyDetail: { items: [], consistencyScorePct: 0 }, searchSummary: { overallScore: 0, strengths: [], topPriorities: [] } },
    } as unknown as RunAuditResult;
    const legacy = resolveCoreWebVitals(withHomepage);
    assertTrue("fallback: legacy homepage measurement yields a 1-page aggregate", legacy.evaluatedPages === 1 && legacy.score === 100);
    assertTrue("fallback: scope note admits it is a single-page prior measurement", legacy.scopeNote.includes("prior audit run"));

    const withoutAny: RunAuditResult = {
      ...withHomepage,
      pageSpeed: { ok: false, url: "https://example.com/", error: "not tested" },
    } as RunAuditResult;
    const none = resolveCoreWebVitals(withoutAny);
    assertTrue("fallback: no data at all => insufficient_data, null score", none.evaluatedPages === 0 && none.score === null && none.status === "insufficient_data");

    // A fresh audit with an explicit cwv field passes through untouched.
    const fresh = aggregateCoreWebVitals([m("https://example.com/", PASS)], 1);
    assertTrue("fresh audits use their own aggregate", resolveCoreWebVitals({ ...withoutAny, cwv: fresh } as RunAuditResult) === fresh);
  }

  // ======================================================================
  // Page-level classification + per-page dataset — ONE source of truth
  // (the CSV's per-page sheet uses the exact same classification).
  // ======================================================================
  {
    const measurements = [
      m("https://example.com/", PASS),
      m("https://example.com/bad", POOR),
      m("https://example.com/partial", { lcp: 1500, inp: null, cls: 0.02 }), // missing INP — still evaluated
      m("https://example.com/ttfb-only", { ttfb: 3200 }), // no official vital
      m("https://example.com/failed", { ok: false, error: "timeout" }),
    ];
    const agg = aggregateCoreWebVitals(measurements, 10);
    assertTrue("classify: all-good page passes", classifyPageCwv(measurements[0].metrics) === "pass");
    assertTrue("classify: any non-good official vital fails", classifyPageCwv(measurements[1].metrics) === "fail");
    assertTrue("classify: missing INP with good LCP/CLS still passes (measurable vitals good)", classifyPageCwv(measurements[2].metrics) === "pass");
    assertTrue("classify: no official vital => not_available, never pass", classifyPageCwv(measurements[3].metrics) === "not_available");
    assertTrue("classify: PSI failure => not_available", classifyPageCwv(measurements[4].metrics) === "not_available");
    // The aggregate's passing count must match the shared classifier.
    assertTrue("classify: aggregate passing count agrees with classifyPageCwv", agg.passingPages === 2 && agg.evaluatedPages === 3);

    const rows = coreWebVitalPageRows(agg);
    assertTrue("rows: one row per sampled page", rows.length === 5);
    const byUrl = Object.fromEntries(rows.map((r) => [r.url, r]));
    assertTrue("rows: passing page overall = pass", byUrl["https://example.com/"].overall === "pass");
    assertTrue("rows: failing page overall = fail", byUrl["https://example.com/bad"].overall === "fail");
    assertTrue("rows: ttfb-only page overall = not_available (never pass)", byUrl["https://example.com/ttfb-only"].overall === "not_available");
    assertTrue("rows: failed page carries its error", byUrl["https://example.com/failed"].error === "timeout");
    assertTrue("rows: values retained per page", byUrl["https://example.com/"].lcp!.value === "1.5s" && byUrl["https://example.com/bad"].lcp!.rating === "poor");
    assertTrue("rows: missing vital is null, not a fabricated value", byUrl["https://example.com/partial"].inp === null);

    // sampleSize 5; rated per vital: lcp=3 (home/bad/partial), inp=2, cls=3.
    assertTrue("notAvailable: pages without LCP data surfaced", coreWebVitalNotAvailable(agg, "lcp") === 2);
    assertTrue("notAvailable: pages without INP data surfaced", coreWebVitalNotAvailable(agg, "inp") === 3);
    assertTrue("notAvailable: never negative", coreWebVitalNotAvailable(agg, "cls") === 2);
  }

  // ======================================================================
  // Full-crawl coverage flag + scope note (default: every crawled page)
  // ======================================================================
  {
    const measurements = [m("https://example.com/", PASS), m("https://example.com/a", POOR)];
    const full = aggregateCoreWebVitals(measurements, 2, undefined, { fullCrawlCoverage: true });
    assertTrue("coverage: flag recorded on the aggregate", full.fullCrawlCoverage === true);
    assertTrue("coverage: full-crawl note says every crawled page evaluated", full.scopeNote.includes("every crawled page was evaluated") && full.scopeNote.includes("no sampling cap"));
    assertTrue("coverage: full-crawl note still states the exact counts", full.scopeNote.includes("2 of 2"));
    const sampled = aggregateCoreWebVitals(measurements, 2);
    assertTrue("coverage: default aggregate is NOT full coverage", sampled.fullCrawlCoverage === false);
    assertTrue("coverage: sampled note still names the deterministic sample", sampled.scopeNote.includes("deterministic sample"));
  }

  console.log("\nDone. If all lines above say PASS, the website-wide Core Web Vitals pipeline is working.");
}

if (require.main === module) {
  run();
}
