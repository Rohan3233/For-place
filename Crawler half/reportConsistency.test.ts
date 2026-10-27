/**
 * Regression tests for the data-accuracy fixes:
 *
 *  Bug 1 — orphan pages vs. "not reachable" are distinct metrics.
 *  Bug 2 — author byline / author profile link / author schema are
 *          counted separately (shared checkAuthorPresence helper).
 *  Bug 3 — schema applicability affects priority ranking (Product schema
 *          is never a high-priority fix for a non-ecommerce site).
 *  Bug 4 — Organization schema is reported with sitewide/entity scope.
 *  Bug 5 — no numeric "after fixes" score guarantee; qualitative bands only.
 *  + CSV/PDF consistency and roadmap data-drivenness.
 *
 * Run with: npm run test:consistency
 */
import { buildInternalLinkGraph } from "./internalLinkGraph";
import { buildIndexabilityChecks } from "./indexabilityChecks";
import { checkAuthorPresence } from "./aeoSignals";
import { detectSchemaApplicability } from "./schemaApplicability";
import { buildAeoAuditResult, buildAiVisibilityOpportunities } from "./aeoReport";
import { buildImprovementPotential } from "./scoreProjection";
import { buildActionPlan } from "./actionPlan";
import { buildPriorityList, buildQuickWins, buildTopQuickActions, estimateBatchAwareTime, makeIssue, type PriorityIssue } from "./priorityIssues";
import { buildSeoCheckCoverage } from "./seoCheckCoverage";
import { buildResponseCodeBreakdown } from "./responseCodeBreakdown";
import { buildExecutiveSummaryText } from "./executiveSummary";
import { getScoreVerdict, getAiReadinessVerdict } from "./scoreVerdict";
import { groupExplanationsByIssue, type GroupedIssue } from "./groupIssues";
import { generateAuditCsv } from "./generateAuditCsv";
import {
  buildAiReadinessDimensions,
  deriveAiReadinessSummary,
  aeoSummary,
  type AeoCheck,
  type CitationReadinessCheck,
} from "./aeoTypes";
import { sampleRemainderText } from "./affectedUrlCopy";
import { genuineBrokenLinks, blockedFromAutomatedChecking, brokenLinkScopeLabel, countBrokenLinkSourcePages, splitBrokenLinks } from "./brokenLinkClassification";
import { buildWhatsWorking } from "./whatsWorking";
import { priorityTierForScore } from "./priorityIssues";
import type { RunAuditResult, CrawlSiteResult, CrawlPageSuccess, PageExplanationResult } from "./types";

function assertTrue(label: string, condition: boolean): void {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

function fullSignals() {
  return {
    ogTags: { present: true, missing: [] },
    twitterCardTags: { present: true, missing: [] },
    questionHeadingCount: 0,
    questionHeadingsWithDirectAnswer: 0,
    questionHeadings: [],
    hasOrderedList: false,
    hasUnorderedList: false,
    hasTable: false,
    headingHierarchyValid: true,
    authorName: null,
    lastUpdatedDate: null,
    hasContactInfo: false,
    linksToAboutPage: false,
    numericDataDensityPct: 0,
    faqSchemaPresent: false,
    tldrPresent: false,
    sameAsLinks: [],
    externalAuthorityLinkCount: 0,
    hasAuthorProfilePage: false,
    linksToPrivacyPage: false,
    linksToTermsPage: false,
    linksToEditorialPolicyPage: false,
    linksToSourcesPage: false,
    hasReferencesSection: false,
    reviewSchemaPresent: false,
    renderMode: "server_rendered",
    contentFingerprint: "",
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
    robotsMeta: {} as any,
    xRobotsTag: {} as any,
    aeoSignals: fullSignals() as any,
    redirectHopStatusCodes: [],
    htmlLang: null,
    ...overrides,
  };
}

function fakeCrawl(pages: CrawlPageSuccess[], overrides: Partial<CrawlSiteResult> = {}): CrawlSiteResult {
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
    robotsAudit: {
      status: "found",
      disallowedPaths: [],
    },
    sitemapAudit: {
      status: "found",
      urlCount: pages.length,
    },
    orphanPages: [],
    wwwConsistency: { checked: false, consistent: true, canonicalHost: null, variantResults: [], variantProbes: [], summary: null, issue: null },
    ...overrides,
  };
}

function fakeAudit(crawl: CrawlSiteResult, overrides: Partial<RunAuditResult> = {}): RunAuditResult {
  return {
    crawl,
    brokenLinks: [],
    oversizedImages: [],
    pageSpeed: { ok: false, url: "", error: "not tested" },
    score: { overallScore: 74, breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: 0, oversizedImagesCount: 0, performancePenalty: 0 } },
    fromCache: false,
    crawlDurationMs: 1000,
    auditDate: new Date().toISOString(),
    aeo: { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [] },
    ...overrides,
  };
}

const home = "https://example.com/";
const about = "https://example.com/about";
const sitemapPage = "https://example.com/sitemap-discovered";
const unlinked = "https://example.com/unlinked";

export function run(): void {
  // ======================================================================
  // TEST 1 — a page with no incoming internal links is classified as orphan
  // ======================================================================
  {
    const homePage = fakePage({ url: home, internalLinks: [about] });
    const aboutPage = fakePage({ url: about, internalLinks: [] });
    const unlinkedPage = fakePage({ url: unlinked, internalLinks: [] });
    const audit = fakeAudit(fakeCrawl([homePage, aboutPage, unlinkedPage]));
    const graph = buildInternalLinkGraph(audit);
    assertTrue("TEST 1: zero-inbound page is in orphanPages", graph.orphanPages.includes(unlinked));
    assertTrue("TEST 1: page with an inbound link is not orphan", !graph.orphanPages.includes(about));
  }

  // ======================================================================
  // TEST 2 — sitemap-discovered page with inbound links but no path from
  // home is NOT an orphan; it IS "not reached within crawl depth"
  // ======================================================================
  {
    const homePage = fakePage({ url: home, internalLinks: [about] });
    const aboutPage = fakePage({ url: about, internalLinks: [] });
    // sitemap-discovered cluster: pages A and B link each other, but
    // nothing from home links into the cluster — both have inbound links
    // (so neither is an orphan) yet neither is reachable from home.
    const clusterA = fakePage({ url: sitemapPage, internalLinks: [unlinked] });
    const clusterB = fakePage({ url: unlinked, internalLinks: [sitemapPage] });
    const crawl = fakeCrawl([homePage, aboutPage, clusterA, clusterB]);
    const audit = fakeAudit(crawl);
    const graph = buildInternalLinkGraph(audit);
    assertTrue("TEST 2: inbound-linked sitemap page is NOT an orphan", !graph.orphanPages.includes(sitemapPage));
    assertTrue("TEST 2: inbound-linked sitemap page is not reached within crawl depth", graph.notReachedWithinDepth.includes(sitemapPage));
    assertTrue("TEST 2: reachable page is not in notReachedWithinDepth", !graph.notReachedWithinDepth.includes(about));
    // A truly unlinked page is an orphan AND not reachable — distinct sets
    // that only overlap when the page genuinely has zero inbound links.
    const graph2 = buildInternalLinkGraph(fakeAudit(fakeCrawl([homePage, aboutPage, fakePage({ url: "https://example.com/isolated", internalLinks: [] })])));
    assertTrue("TEST 2: zero-inbound isolated page IS an orphan", graph2.orphanPages.includes("https://example.com/isolated"));
  }

  // ======================================================================
  // TEST 3 — author byline / author profile link / author schema are
  // counted independently by the shared helper
  // ======================================================================
  {
    const bylineOnly = fakePage({
      url: "https://example.com/blog/post-1",
      aeoSignals: { authorName: "Jane Doe", hasAuthorProfilePage: false } as any,
    });
    const profileOnly = fakePage({
      url: "https://example.com/blog/post-2",
      aeoSignals: { authorName: null, hasAuthorProfilePage: true } as any,
    });
    const schemaOnly = fakePage({
      url: "https://example.com/blog/post-3",
      aeoSignals: { authorName: null, hasAuthorProfilePage: false } as any,
      structuredData: { present: true, types: ["Article", "Person"], format: "json-ld" },
    });
    const none = fakePage({
      url: "https://example.com/blog/post-4",
      aeoSignals: { authorName: null, hasAuthorProfilePage: false } as any,
    });

    const b = checkAuthorPresence(bylineOnly as any);
    assertTrue("TEST 3: byline detected from meta author signal", b.byline === "Jane Doe");
    assertTrue("TEST 3: byline page has no profile link", b.profileLink === false);
    assertTrue("TEST 3: byline page has no Person schema", b.schema === false);

    const p = checkAuthorPresence(profileOnly as any);
    assertTrue("TEST 3: profile-link page has no byline", p.byline === null);
    assertTrue("TEST 3: profile link detected", p.profileLink === true);

    const s = checkAuthorPresence(schemaOnly as any);
    assertTrue("TEST 3: Person schema detected", s.schema === true);
    assertTrue("TEST 3: schema page has no byline", s.byline === null);

    const n = checkAuthorPresence(none as any);
    assertTrue("TEST 3: no signals at all", n.byline === null && n.profileLink === false && n.schema === false);
  }

  // ======================================================================
  // TEST 4 — Product schema is NOT recommended (not applicable) for a
  // non-ecommerce site, and IS applicable for an ecommerce site
  // ======================================================================
  {
    const nonEcomPages = [
      fakePage({ url: home, internalLinks: [] }),
      fakePage({ url: "https://example.com/services/consulting", internalLinks: [] }),
      fakePage({ url: "https://example.com/contact", internalLinks: [] }),
      fakePage({ url: "https://example.com/about", internalLinks: [] }),
    ];
    const nonEcom = detectSchemaApplicability(fakeAudit(fakeCrawl(nonEcomPages)));
    assertTrue("TEST 4: Product schema not applicable for non-ecommerce site", nonEcom.schema_product.status === "not_applicable");

    const ecomPages = [
      fakePage({ url: home, internalLinks: [] }),
      fakePage({ url: "https://example.com/products/widget", internalLinks: [] }),
      fakePage({ url: "https://example.com/products/gadget", internalLinks: [] }),
      fakePage({ url: "https://example.com/cart", internalLinks: [] }),
    ];
    const ecom = detectSchemaApplicability(fakeAudit(fakeCrawl(ecomPages)));
    assertTrue("TEST 4: Product schema applicable for ecommerce site", ecom.schema_product.status === "applicable");
  }

  // ======================================================================
  // TEST 5 — LocalBusiness schema not applicable without location context
  // ======================================================================
  {
    const noLocalPages = [
      fakePage({ url: home, internalLinks: [] }),
      fakePage({ url: "https://example.com/services/consulting", internalLinks: [] }),
      fakePage({ url: "https://example.com/blog", internalLinks: [] }),
      fakePage({ url: "https://example.com/contact", internalLinks: [] }),
    ];
    const noLocal = detectSchemaApplicability(fakeAudit(fakeCrawl(noLocalPages)));
    assertTrue("TEST 5: LocalBusiness not applicable without location pages", noLocal.schema_localbusiness.status === "not_applicable");

    const localPages = [
      fakePage({ url: home, internalLinks: [] }),
      fakePage({ url: "https://example.com/locations/chicago", internalLinks: [] }),
      fakePage({ url: "https://example.com/locations/denver", internalLinks: [] }),
    ];
    const local = detectSchemaApplicability(fakeAudit(fakeCrawl(localPages)));
    assertTrue("TEST 5: LocalBusiness applicable with /locations/ pages", local.schema_localbusiness.status === "applicable");
  }

  // ======================================================================
  // TEST 6 — Organization schema is reported sitewide/entity-level, not as
  // a per-page affected count
  // ======================================================================
  {
    const pages = [
      fakePage({ url: home, internalLinks: [] }),
      fakePage({ url: "https://example.com/services/a", internalLinks: [] }),
      fakePage({ url: "https://example.com/services/b", internalLinks: [] }),
      fakePage({ url: "https://example.com/services/c", internalLinks: [] }),
    ];
    const audit = fakeAudit(fakeCrawl(pages));
    const aeo = buildAeoAuditResult(audit, [], { present: false, url: "" }, []);
    const org = aeo.checks.find((c) => c.key === "schema_organization");
    assertTrue("TEST 6: Organization check exists", !!org);
    assertTrue("TEST 6: Organization check carries sitewide scope (affectedCount 0)", org!.affectedCount === 0);
    assertTrue(
      "TEST 6: Organization status explains entity/sitewide implementation",
      /sitewide|entity/i.test(org!.statusText)
    );
  }

  // ======================================================================
  // TEST 7 — no numeric "after fixes" score guarantee; qualitative bands
  // only, with hedge language
  // ======================================================================
  {
    const list: PriorityIssue[] = [
      {
        key: "missing_title",
        label: "Missing title tag",
        pillar: "onPage",
        severity: "critical",
        effort: "quick",
        count: 40,
        estimatedTimeLabel: "~3 min each",
        effortBucketLabel: "Trivial (< 30 Mins)",
        templateLevel: true,
        impactStars: 5,
        difficultyStars: 1,
        priorityScore: 9,
        priorityTier: "high",
        impactLabel: "High Impact",
        difficultyLabel: "Very Easy",
        batchFixPossible: true,
        countUnit: "pages",
      },
      {
        key: "thin_content",
        label: "Thin content",
        pillar: "onPage",
        severity: "moderate",
        effort: "standard",
        count: 12,
        estimatedTimeLabel: "~45 min each",
        effortBucketLabel: "Moderate (1–3 Hours)",
        templateLevel: false,
        impactStars: 4,
        difficultyStars: 5,
        priorityScore: 7,
        priorityTier: "medium",
        impactLabel: "Medium Impact",
        difficultyLabel: "Very Hard",
        batchFixPossible: false,
        countUnit: "pages",
      },
    ];
    const potential = buildImprovementPotential(74, list);
    assertTrue("TEST 7: quick wins band is qualitative (no digits after fixes)", /^[A-Z]/.test(potential.quickWins) && !/^\d+\s*$/.test(potential.quickWins));
    assertTrue("TEST 7: full-implementation band is qualitative", /^[A-Z]/.test(potential.fullImplementation));
    assertTrue("TEST 7: current score preserved", potential.current === 74);
    assertTrue("TEST 7: bands never contain a projected numeric score", !/\d+[\u2013-]\d+/.test(`${potential.quickWins} ${potential.fullImplementation}`));
  }

  // ======================================================================
  // TEST 8 — PDF/CSV affected-page counts match for AEO checks
  // ======================================================================
  {
    const pages = [
      fakePage({ url: home, internalLinks: [] }),
      fakePage({ url: "https://example.com/page-1", internalLinks: [] }),
      fakePage({ url: "https://example.com/page-2", internalLinks: [] }),
      fakePage({ url: "https://example.com/page-3", internalLinks: [] }),
      fakePage({ url: "https://example.com/page-4", internalLinks: [] }),
      fakePage({ url: "https://example.com/page-5", internalLinks: [] }),
      fakePage({ url: "https://example.com/page-6", internalLinks: [] }),
      fakePage({ url: "https://example.com/page-7", internalLinks: [] }),
    ];
    const audit = fakeAudit(
      fakeCrawl(pages),
      {
        aeo: {
          botAccess: [],
          llmsTxt: { present: false, url: "" },
          checks: [
            {
              key: "render_mode",
              label: "Primary content available in raw HTML",
              category: "AI Crawlability",
              passed: false,
              affectedCount: 7,
              affectedUrls: pages.slice(1).map((p) => p.url),
              statusText: "7 pages render content client-side.",
              whyItMatters: "x",
              recommendedFix: "y",
              codeSnippet: null,
              hasMoreAffectedUrls: true,
              priority: "high",
              difficulty: "advanced",
              timeLabel: "2-4 hours",
              expectedImpact: "medium",
              businessImpact: "z",
            },
          ],
        },
      }
    );
    const { csvBody, filenameSuffix } = generateAuditCsv(audit, [], "render_mode");
    const dataRows = csvBody.split("\r\n").slice(1).filter(Boolean);
    assertTrue("TEST 8: CSV rows equal the check's affected URL count", dataRows.length === 7);
    assertTrue("TEST 8: CSV filename suffix matches flag", filenameSuffix === "aeo-render_mode");
  }

  // ======================================================================
  // TEST 9 — roadmap tasks come only from applicable audit findings, and
  // phase copy never references issues that don't exist in the data
  // ======================================================================
  {
    const list: PriorityIssue[] = [
      {
        key: "missing_title",
        label: "Missing title tag",
        pillar: "onPage",
        severity: "critical",
        effort: "quick",
        count: 40,
        estimatedTimeLabel: "~3 min each",
        effortBucketLabel: "Trivial (< 30 Mins)",
        templateLevel: true,
        impactStars: 5,
        difficultyStars: 1,
        priorityScore: 9,
        priorityTier: "high",
        impactLabel: "High Impact",
        difficultyLabel: "Very Easy",
        batchFixPossible: true,
        countUnit: "pages",
      },
      {
        key: "thin_content",
        label: "Thin content",
        pillar: "onPage",
        severity: "moderate",
        effort: "standard",
        count: 12,
        estimatedTimeLabel: "~45 min each",
        effortBucketLabel: "Moderate (1–3 Hours)",
        templateLevel: false,
        impactStars: 4,
        difficultyStars: 5,
        priorityScore: 7,
        priorityTier: "medium",
        impactLabel: "Medium Impact",
        difficultyLabel: "Very Hard",
        batchFixPossible: false,
        countUnit: "pages",
      },
    ];
    const plan = buildActionPlan(list);
    const allKeys = new Set(plan.flatMap((w) => w.issues.map((i) => i.key)));
    assertTrue("TEST 9: roadmap only contains issues from the priority list", allKeys.size === 2 && allKeys.has("missing_title") && allKeys.has("thin_content"));
    const phase3 = plan.find((w) => w.weekNumber === 3);
    assertTrue("TEST 9: no orphan-page claim in phase copy (0 orphans in data)", phase3 === undefined || !/orphan/i.test(phase3.outcome));
  }

  // ======================================================================
  // TEST 10 — no section can independently compute conflicting values:
  // indexability orphan count === internal-link-graph orphan count
  // ======================================================================
  {
    const homePage = fakePage({ url: home, internalLinks: [about] });
    const aboutPage = fakePage({ url: about, internalLinks: [] });
    const orphan1 = fakePage({ url: "https://example.com/o1", internalLinks: [] });
    const orphan2 = fakePage({ url: "https://example.com/o2", internalLinks: [] });
    const audit = fakeAudit(fakeCrawl([homePage, aboutPage, orphan1, orphan2]));
    const graph = buildInternalLinkGraph(audit);
    const indexability = buildIndexabilityChecks(audit);
    const orphanCheck = indexability.find((c) => c.key === "orphan_page")!;
    assertTrue("TEST 10: indexability orphan count === graph orphan count", orphanCheck.affectedCount === graph.orphanPages.length);
    assertTrue("TEST 10: affected URLs match the graph set", orphanCheck.affectedUrls.sort().join(",") === [...graph.orphanPages].sort().join(","));
  }

  // ======================================================================
  // TEST 11 — priority list built from grouped issues flows into roadmap
  // without inventing items (data-driven end to end)
  // ======================================================================
  {
    const homePage = fakePage({ url: home, internalLinks: [], flags: ["missing_title"] });
    const page2 = fakePage({ url: "https://example.com/page-2", internalLinks: [], flags: ["missing_title", "missing_h1"] });
    const audit = fakeAudit(fakeCrawl([homePage, page2]));
    const explanations: PageExplanationResult[] = [
      {
        url: home,
        aiCallMade: false,
        aiError: null,
        issues: [
          { flag: "missing_title", issueLabel: "Missing title tag", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
        ],
      },
      {
        url: "https://example.com/page-2",
        aiCallMade: false,
        aiError: null,
        issues: [
          { flag: "missing_title", issueLabel: "Missing title tag", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
          { flag: "missing_h1", issueLabel: "Missing H1", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
        ],
      },
    ];
    const grouped = groupExplanationsByIssue(audit, explanations);
    const priorityList = buildPriorityList(audit, grouped);
    const plan = buildActionPlan(priorityList);
    const planKeys = new Set(plan.flatMap((w) => w.issues.map((i) => i.key)));
    assertTrue("TEST 11: roadmap contains only real findings (missing_title, missing_h1)", planKeys.has("missing_title") && planKeys.has("missing_h1") && planKeys.size === 2);
  }

  // ======================================================================
  // TEST 12 — AI Readiness verdict is a SEPARATE, explicit scale from the
  // SEO score rubric, so the two can never both say "Good" silently
  // ======================================================================
  {
    const seoGood = getScoreVerdict(69); // "Good" on the SEO scale
    const aiTypical = getAiReadinessVerdict(45); // "Typical" on the AI scale (40–59)
    assertTrue("TEST 12: SEO 69 is Good", seoGood.label === "Good");
    assertTrue("TEST 12: AI 45 is Typical on the AI scale (80/60/40/20 thresholds)", aiTypical.label === "Typical");
    assertTrue(
      "TEST 12: AI-scale description explicitly distinguishes it from the SEO scale",
      /stricter|AI-readiness scale/.test(aiTypical.description)
    );
    // The two rubrics genuinely differ: a 45 that is "Typical" on the AI scale
    // is "Poor" on the SEO scale (45 < 50) — proving the scales are not
    // shared, which is exactly why the AI label always carries its qualifier.
    assertTrue("TEST 12: AI 45 (Typical) ≠ SEO 45 (Poor) rubric", getScoreVerdict(45).label === "Poor");
    assertTrue("TEST 12: AI 90 is Excellent", getAiReadinessVerdict(90).label === "Excellent");
    assertTrue("TEST 12: AI 10 is Poor", getAiReadinessVerdict(10).label === "Poor");
  }

  // ======================================================================
  // TEST 13 — estimateRationale only appears on issues whose effort gap vs.
  // a similarly-scoped issue would otherwise look unexplained
  // ======================================================================
  {
    const homePage = fakePage({ url: home, internalLinks: [], flags: ["missing_h1", "missing_h2", "thin_content"] });
    const page2 = fakePage({ url: "https://example.com/page-2", internalLinks: [], flags: ["missing_h1", "missing_h2", "thin_content"] });
    const audit = fakeAudit(fakeCrawl([homePage, page2]));
    const explanations: PageExplanationResult[] = [homePage, page2].map((p) => ({
      url: p.url,
      aiCallMade: false,
      aiError: null,
      issues: [
        { flag: "missing_h1", issueLabel: "Missing H1", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
        { flag: "missing_h2", issueLabel: "No H2 subheadings", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
        { flag: "thin_content", issueLabel: "Thin content", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
      ],
    }));
    const grouped = groupExplanationsByIssue(audit, explanations);
    const priorityList = buildPriorityList(audit, grouped);
    const byKey = new Map(priorityList.map((i) => [i.key, i]));
    assertTrue("TEST 13: missing_h1 (AI-suggested copy) has NO estimateRationale", byKey.get("missing_h1")!.estimateRationale === undefined);
    assertTrue("TEST 13: missing_h2 explains the manual-content effort gap", typeof byKey.get("missing_h2")!.estimateRationale === "string" && byKey.get("missing_h2")!.estimateRationale!.includes("no auto-suggestion"));
    assertTrue("TEST 13: thin_content carries a rationale too", typeof byKey.get("thin_content")!.estimateRationale === "string");
  }

  // ======================================================================
  // TEST 14 — buildTopQuickActions: top-5 by impact × reach ÷ effort,
  // with one-line description + page count + estimated time
  // ======================================================================
  {
    const homePage = fakePage({ url: home, internalLinks: [], flags: ["missing_h1"] });
    const page2 = fakePage({ url: "https://example.com/page-2", internalLinks: [], flags: ["missing_h1", "missing_h2"] });
    const audit = fakeAudit(fakeCrawl([homePage, page2]));
    const explanations: PageExplanationResult[] = [homePage, page2].map((p) => ({
      url: p.url,
      aiCallMade: false,
      aiError: null,
      issues: [
        { flag: "missing_h1", issueLabel: "Missing H1", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
        { flag: "missing_h2", issueLabel: "No H2 subheadings", whyItMatters: "a", businessImpact: "b", recommendedFix: "c", suggestedText: null, aiGenerated: false },
      ],
    }));
    const grouped = groupExplanationsByIssue(audit, explanations);
    const priorityList = buildPriorityList(audit, grouped);
    const actions = buildTopQuickActions(priorityList);
    assertTrue("TEST 14: returns at most 5 actions", actions.length <= 5 && actions.length > 0);
    assertTrue("TEST 14: every action has a description, page count, and time", actions.every((a) => a.description.length > 0 && a.pageCount > 0 && a.estimatedTime.length > 0));
    // missing_h1 (126-style reach, 3 min, 4 stars) must outrank missing_h2
    // (same reach, 15 min) — impact × reach ÷ effort ordering.
    const keys = actions.map((a) => a.key);
    assertTrue("TEST 14: high-leverage quick fix ranks above slower content work", keys.indexOf("missing_h1") < keys.indexOf("missing_h2"));
    const h1 = actions.find((a) => a.key === "missing_h1")!;
    const h1Priority = priorityList.find((i) => i.key === "missing_h1")!;
    assertTrue(
      "TEST 14: estimated time matches the shared batch-aware estimate",
      h1.estimatedTime === estimateBatchAwareTime(h1Priority).label
    );
  }

  // ======================================================================
  // TEST 15 — top-level AI Readiness score is DERIVED from the six category
  // dimensions (never a separately-counted unique-check total), so the
  // headline and the breakdown can never drift apart
  // ======================================================================
  {
    const meta = { priority: "medium" as const, difficulty: "medium" as const, timeLabel: "1h", expectedImpact: "medium" as const, businessImpact: "b" };
    const check = (key: string, passed: boolean, extra: Partial<AeoCheck> = {}): AeoCheck => ({
      key,
      label: key,
      category: "AI Structured Data",
      passed,
      affectedCount: 0,
      affectedUrls: [],
      statusText: "",
      whyItMatters: "w",
      recommendedFix: "",
      codeSnippet: null,
      hasMoreAffectedUrls: false,
      priority: meta.priority,
      difficulty: meta.difficulty,
      timeLabel: meta.timeLabel,
      expectedImpact: meta.expectedImpact,
      businessImpact: meta.businessImpact,
      ...extra,
    });
    // A realistic mix where one check feeds several dimensions and a
    // "not applicable" schema check is excluded from the unique-check
    // count but still measured inside the Structured Data dimension.
    const checks: AeoCheck[] = [
      check("entity_consistency", true),
      check("schema_organization", true),
      check("schema_person", false),
      check("schema_product", false, { applicabilityStatus: "not_applicable" }),
      check("author_name", true),
      check("question_headings", true),
      check("thin_content_aeo", false),
      check("external_authority_links", true),
    ];
    const citationChecks: CitationReadinessCheck[] = [
      { key: "c1", label: "c1", finding: "", passed: true, measured: true, statusText: "", recommendation: "" },
      { key: "c2", label: "c2", finding: "", passed: true, measured: true, statusText: "", recommendation: "" },
      { key: "c3", label: "c3", finding: "", passed: false, measured: true, statusText: "", recommendation: "" },
    ];
    const dimensions = buildAiReadinessDimensions(checks, citationChecks);
    const derived = deriveAiReadinessSummary(dimensions);
    // Sum of the six dimensions (overlapping checks counted per dimension):
    // entity_clarity 2/3, structured_data 1/3, answer_formatting 1/1,
    // citation_readiness 2/3, trust_signals 3/3, content_structure 1/2.
    const dimPass = dimensions.reduce((s, d) => s + d.passCount, 0);
    const dimTotal = dimensions.reduce((s, d) => s + d.totalCount, 0);
    assertTrue("TEST 15: derived passCount == sum of dimension passCounts", derived.passCount === dimPass && dimPass === 10);
    assertTrue("TEST 15: derived totalCount == sum of dimension totalCounts", derived.totalCount === dimTotal && dimTotal === 15);
    // The unique-check summary (what the old code used) gives 5/7 here —
    // different from the derived 10/15. Locking the derivation to the
    // dimensions is exactly the 40-vs-45 drift fix.
    const unique = aeoSummary(checks);
    assertTrue("TEST 15: derived total differs from unique-check total (40-vs-45 drift locked)", derived.totalCount !== unique.passCount + unique.failCount);
    assertTrue("TEST 15: aeoSummary still excludes not_applicable checks", unique.passCount + unique.failCount === 7);
  }

  // ======================================================================
  // TEST 16 — grouped-issue instances are deduped by URL, so "N pages
  // affected" always means N DISTINCT pages (a stored explanation set that
  // lists the same URL twice can never inflate counts)
  // ======================================================================
  {
    const dupUrl = "https://example.com/blog/dup-post";
    const otherUrl = "https://example.com/blog/other-post";
    const h1Issue = {
      flag: "missing_h1",
      issueLabel: "Missing H1",
      whyItMatters: "a",
      businessImpact: "b",
      recommendedFix: "c",
      suggestedText: null,
      aiGenerated: false,
    };
    const explanations: PageExplanationResult[] = [
      // Same URL appears twice in the stored explanations (an old crawl
      // row or a re-run) — must count once.
      { url: dupUrl, aiCallMade: false, aiError: null, issues: [h1Issue] },
      { url: dupUrl, aiCallMade: false, aiError: null, issues: [h1Issue] },
      { url: otherUrl, aiCallMade: false, aiError: null, issues: [h1Issue] },
    ];
    const audit = fakeAudit(fakeCrawl([
      fakePage({ url: dupUrl, flags: ["missing_h1"] }),
      fakePage({ url: otherUrl, flags: ["missing_h1"] }),
    ]));
    const grouped = groupExplanationsByIssue(audit, explanations);
    const h1 = grouped.find((g) => g.flag === "missing_h1")!;
    assertTrue("TEST 16: duplicate URL counts once in instances", h1.instances.length === 2);
    assertTrue("TEST 16: instances hold only distinct URLs", new Set(h1.instances.map((i) => i.url)).size === h1.instances.length);
    const priority = buildPriorityList(audit, grouped).find((p) => p.key === "missing_h1")!;
    assertTrue("TEST 16: priority page count matches deduped instances", priority.count === 2);
  }

  // ======================================================================
  // TEST 17 — the "+N more" remainder always reconciles with the stated
  // total: shown + remaining === total affected pages, using the exact
  // shared helper the PDF renders
  // ======================================================================
  {
    // 126 distinct pages missing H1, plus one duplicate URL in the stored
    // explanations — after dedup the group must report exactly 126 pages
    // and the sample arithmetic must reconcile.
    const h1Issue = {
      flag: "missing_h1",
      issueLabel: "Missing H1",
      whyItMatters: "a",
      businessImpact: "b",
      recommendedFix: "c",
      suggestedText: null,
      aiGenerated: false,
    };
    const explanations: PageExplanationResult[] = [];
    const pages: CrawlPageSuccess[] = [];
    for (let i = 0; i < 126; i++) {
      const url = `https://example.com/blog/post-${i}`;
      pages.push(fakePage({ url, flags: ["missing_h1"] }));
      explanations.push({ url, aiCallMade: false, aiError: null, issues: [h1Issue] });
      if (i === 0) explanations.push({ url, aiCallMade: false, aiError: null, issues: [h1Issue] }); // dup
    }
    const audit = fakeAudit(fakeCrawl(pages));
    const grouped = groupExplanationsByIssue(audit, explanations);
    const h1 = grouped.find((g) => g.flag === "missing_h1")!;
    const total = h1.instances.length;
    const shown = 5; // the PDF representative-URL sample cap
    const remainderText = sampleRemainderText(total, shown, "page")!;
    const remainder = Number(remainderText.match(/(\d+) more pages affected/)![1]);
    assertTrue("TEST 17: duplicate URL did not inflate the total (126 distinct pages)", total === 126);
    assertTrue("TEST 17: shown + remaining === total affected pages", shown + remainder === total);
    assertTrue("TEST 17: remainder copy states the full arithmetic", remainderText === "showing 5 of 126; 121 more pages affected");
    // All groups in a report must satisfy the identity, not just missing_h1.
    let allConsistent = true;
    for (const g of grouped) {
      const s = Math.min(5, g.instances.length);
      const r = sampleRemainderText(g.instances.length, s, "page");
      const rem = r ? Number(r.match(/(\d+) more pages affected/)![1]) : 0;
      if (s + rem !== g.instances.length) allConsistent = false;
    }
    assertTrue("TEST 17: shown + remaining === total for every group in the report", allConsistent);
  }

  // ======================================================================
  // TEST 18 — broken_links is standard effort (not batchable, not quick
  // win), so 3,013 broken links → "Extensive (Multi-Day)" bucket, not
  // "Trivial (< 30 Mins)"
  // ======================================================================
  {
    const broken = makeIssue("broken_links", "Broken links", "critical", "standard", 3013);
    assertTrue("TEST 18: countUnit is 'links'", broken.countUnit === "links");
    const estimate = estimateBatchAwareTime(broken);
    assertTrue("TEST 18: 3,013 broken links is capped at 3+ days", estimate.label === "~3+ days total");
    assertTrue("TEST 18: 3,013 broken links is NOT batch-recommended", estimate.batchRecommended === false);
    assertTrue("TEST 18: bucket is 'Extensive (Multi-Day)'", broken.effortBucketLabel === "Extensive (Multi-Day)");
  }

  // ======================================================================
  // TEST 19 — missing_h1 at 84 pages (non-template-level) is NOT
  // batch-discounted; 84 × 3 min = 252 min → "Advanced (4+ Hours)" bucket
  // ======================================================================
  {
    const h1 = makeIssue("missing_h1", "Missing H1", "critical", "quick", 84);
    h1.templateLevel = false;
    const estimate = estimateBatchAwareTime(h1);
    assertTrue("TEST 19: 84 H1s at 3 min each = 252 min (4.2 hours)", estimate.label.includes("4.5") || estimate.label.includes("4.2") || estimate.label.includes("4 hour"));
    assertTrue("TEST 19: bucket is 'Advanced (4+ Hours)'", h1.effortBucketLabel === "Advanced (4+ Hours)");
    assertTrue("TEST 19: countUnit is 'pages'", h1.countUnit === "pages");
  }

  // ======================================================================
  // TEST 20 — missing_h1 at 90% of pages (template-level) IS batchable
  // ======================================================================
  {
    const h1 = makeIssue("missing_h1", "Missing H1", "critical", "quick", 270);
    h1.templateLevel = true;
    const estimate = estimateBatchAwareTime(h1);
    // Batch: 3 × 3 + 267 × 3 × 0.08 = 9 + 64.08 = 73 min ≈ 1.2 hours
    assertTrue("TEST 20: template-level H1 is batchable (< 2 hours)", estimate.label.includes("1.5") || estimate.label.includes("1.2") || estimate.label.includes("1 hour"));
    // batchRecommended = days >= 0.5. 73 min = 0.05 days < 0.5 → recommend=false;
    // the important signal is that the batch discount changed the total FROM
    // 810 min (full rate) TO ~73 min (batched), so the estimate label mentions
    // hours, not 810 minutes.
    assertTrue("TEST 20: template-level H1 is discounted (not full-rate 810 min)", estimate.label.includes("hour"));
  }

  // ======================================================================
  // TEST 21 — countUnit is set correctly per issue type
  // ======================================================================
  {
    const images = makeIssue("oversized_images", "Oversized images", "moderate", "standard", 10);
    assertTrue("TEST 21: oversized_images countUnit is 'images'", images.countUnit === "images");
    const dups = makeIssue("duplicate_titles", "Duplicate titles", "moderate", "standard", 10);
    assertTrue("TEST 21: duplicate_titles countUnit is 'URLs'", dups.countUnit === "URLs");
    const h1 = makeIssue("missing_h1", "Missing H1", "critical", "quick", 10);
    assertTrue("TEST 21: per-page flag countUnit is 'pages'", h1.countUnit === "pages");
  }

  // ======================================================================
  // TEST 22 — AiVisibilityOpportunity.applicability is populated for
  // conditional AI-visibility findings
  // ======================================================================
  {
    const pagesWithSteps = [
      fakePage({ url: "https://example.com/how-to-fix", internalLinks: [], flags: [], aeoSignals: { ...fullSignals(), questionHeadingCount: 3 } as any, headings: { h2: 3, h3: 0, h4: 0, h5: 0, h6: 0 }, wordCount: 500, title: { content: "How to Fix X", length: 10 }, structuredData: { present: false, types: [], format: null } }),
    ];
    const audit = fakeAudit(fakeCrawl(pagesWithSteps));
    const opps = buildAiVisibilityOpportunities(audit);
    const step = opps.find((o) => o.key === "step_by_step");
    assertTrue("TEST 22: step_by_step has applicability", step?.applicability !== undefined);
    assertTrue("TEST 22: step_by_step applicability mentions who can ignore", step!.applicability!.includes("ignore"));
  }

  // ======================================================================
  // TEST 23 — genuineBrokenLinks is THE canonical broken-link count: it
  // excludes transient failures (timeout/rate-limit) and robots-blocked
  // links, and keeps genuine 404/DNS failures — so the priority list, the
  // score, the AEO checks, and the Broken Links section all show the same
  // number (this was the 3,013-vs-3,012 bug).
  // ======================================================================
  {
    const links = [
      { url: "https://example.com/dead", statusCode: 404, ok: false, errorMessage: null, failureCategory: "not_found", linkedFrom: ["https://example.com/", "https://example.com/about"] },
      { url: "https://example.com/gone", statusCode: null, ok: false, errorMessage: "Could not resolve the domain (DNS lookup failed).", failureCategory: "dns_error", linkedFrom: ["https://example.com/about"] },
      { url: "https://example.com/slow", statusCode: 408, ok: false, errorMessage: null, failureCategory: "client_error", linkedFrom: ["https://example.com/"] },
      { url: "https://example.com/throttled", statusCode: 429, ok: false, errorMessage: null, failureCategory: "rate_limited", linkedFrom: ["https://example.com/"] },
      { url: "https://example.com/blocked", statusCode: null, ok: false, errorMessage: "Path is disallowed by robots.txt — not checked.", failureCategory: "blocked_by_robots", linkedFrom: ["https://example.com/"] },
    ] as any;
    const genuine = genuineBrokenLinks(links);
    assertTrue("TEST 23: transient (408/429) and robots-blocked links are excluded", genuine.length === 2);
    assertTrue("TEST 23: 404 and DNS failures are kept", genuine.some((l) => l.failureCategory === "not_found") && genuine.some((l) => l.failureCategory === "dns_error"));
    // Distinct source pages across the genuine set: home + about.
    assertTrue("TEST 23: affected-pages count is distinct source pages, not instances", countBrokenLinkSourcePages(links) === 2);
    assertTrue("TEST 23: scope label pairs instances and pages", brokenLinkScopeLabel(2, 2) === "2 broken link instances across 2 pages");
    assertTrue("TEST 23: scope label is singular-safe", brokenLinkScopeLabel(1, 1) === "1 broken link instance across 1 page");
  }

  // ======================================================================
  // TEST 24 — brokenLinkScopeLabel formats the real-world phrasing so a
  // report can say "3,012 broken link instances across 284 pages"
  // ======================================================================
  {
    assertTrue(
      "TEST 24: thousands format with comma and pages",
      brokenLinkScopeLabel(3012, 284) === "3,012 broken link instances across 284 pages"
    );
    assertTrue("TEST 24: zero-instance fallback", brokenLinkScopeLabel(0, 0) === "No broken links found");
    assertTrue("TEST 24: no-pages fallback stays instance-only", brokenLinkScopeLabel(5, 0) === "5 broken link instances");
  }

  // ======================================================================
  // TEST 25 — priority TIER is a separate concept from severity, derived
  // from the numeric priority score (impact × reach ÷ effort)
  // ======================================================================
  {
    assertTrue("TEST 25: high tier at high score", priorityTierForScore(9) === "high");
    assertTrue("TEST 25: medium tier at mid score", priorityTierForScore(6) === "medium");
    assertTrue("TEST 25: low tier at low score", priorityTierForScore(4) === "low");
    const wideModerate = makeIssue("thin_content", "Thin content", "moderate", "standard", 200);
    const singleCritical = makeIssue("webvital_lcp_poor", "Slow LCP", "critical", "standard", 1, 90);
    assertTrue("TEST 25: wide moderate issue is Medium priority", wideModerate.priorityTier === "medium");
    assertTrue("TEST 25: single-page critical issue is Low priority", singleCritical.priorityTier === "low");
    assertTrue("TEST 25: priority derives from score, not severity", singleCritical.severity === "critical" && singleCritical.priorityTier !== "high");
  }

  // ======================================================================
  // TEST 26 — buildPriorityList sorts by PRIORITY (score) before severity:
  // a 200-page moderate issue ranks ABOVE a single-page critical LCP issue,
  // so the dashboard's "Highest Priority Actions" can never again lead
  // with a 1-page critical item over a wide quick fix.
  // ======================================================================
  {
    const audit = fakeAudit(
      fakeCrawl([fakePage({ url: home })]),
      {
        pageSpeed: {
          ok: true,
          url: home,
          error: null,
          metrics: {
            lcpMs: 6000,
            inpMs: 60,
            clsScore: 0.01,
            ttfbMs: 200,
            performanceScore: 46,
            accessibilityScore: null,
            accessibilityIssues: [],
          } as any,
        } as any,
      }
    );
    const thinInstances = Array.from({ length: 200 }, (_, i) => ({
      url: `https://example.com/p${i}`,
      suggestedText: null,
      aiGenerated: false,
      currentValue: null,
    }));
    const grouped: GroupedIssue[] = [
      {
        flag: "thin_content",
        issueLabel: "Thin content",
        whyItMatters: "x",
        businessImpact: "y",
        recommendedFix: "z",
        instances: thinInstances,
        instancesByUrl: new Set(),
        smartNote: "",
        codeSnippet: null,
        remediation: null,
      },
    ];
    const list = buildPriorityList(audit, grouped);
    assertTrue("TEST 26: list has both issues", list.some((i) => i.key === "thin_content") && list.some((i) => i.key === "webvital_lcp_poor"));
    assertTrue("TEST 26: priority-first sort puts wide moderate above single-page critical", list[0].key === "thin_content");
    const critical = list.find((i) => i.key === "webvital_lcp_poor")!;
    assertTrue("TEST 26: LCP stays critical-severity (severity badge unchanged)", critical.severity === "critical");
    assertTrue("TEST 26: LCP is Low priority tier (ranked below the wide fix)", critical.priorityTier === "low");
  }

  // ======================================================================
  // TEST 27 — www/non-www host mismatch must not collapse the depth chart.
  // rootUrl is the bare domain but the site 301s to www, so every crawled
  // page.url is www.* and in-HTML links may use either spelling. The graph
  // must seed BFS from the real homepage and resolve links across the host
  // variants — otherwise depthDistribution renders all zeros and every
  // page shows "not reached" while orphans stay at 0 (the exact
  // contradiction seen on live audits).
  // ======================================================================
  {
    const wwwHome = fakePage({ url: "https://www.example.com/", internalLinks: ["https://www.example.com/about", "https://example.com/services"] });
    const wwwAbout = fakePage({ url: "https://www.example.com/about", internalLinks: ["https://www.example.com/team"] });
    const wwwServices = fakePage({ url: "https://www.example.com/services", internalLinks: ["https://www.example.com/about"] });
    const wwwTeam = fakePage({ url: "https://www.example.com/team", internalLinks: [] });
    const audit = fakeAudit(
      fakeCrawl([wwwHome, wwwAbout, wwwServices, wwwTeam], { rootUrl: "https://example.com/" })
    );
    const graph = buildInternalLinkGraph(audit);
    assertTrue("TEST 27: homepage matched at depth 0 despite host mismatch", graph.depthDistribution[0] === 1);
    assertTrue("TEST 27: depth 1 pages reachable via www links", graph.depthDistribution[1] >= 1);
    assertTrue("TEST 27: non-www in-HTML link resolves to www page (inbound counted)", (graph.inboundCount.get("https://www.example.com/services") ?? 0) >= 1);
    assertTrue("TEST 27: services is not an orphan (its inbound link resolves)", !graph.orphanPages.includes("https://www.example.com/services"));
    assertTrue("TEST 27: homepage is never an orphan", !graph.orphanPages.includes("https://www.example.com/"));
    assertTrue("TEST 27: team page reached via depth 2", graph.depthDistribution[2] === 1);
    assertTrue("TEST 27: nothing mislabeled not-reached on a fully linked site", graph.notReachedWithinDepth.length === 0);
    assertTrue("TEST 27: maxLinkDepth is real (not -1)", graph.maxLinkDepth === 2);
  }

  // ======================================================================
  // TEST 28 — http/https scheme mismatch is handled the same way: a page
  // crawled as https with an in-HTML link written as http still resolves.
  // ======================================================================
  {
    const homePage = fakePage({ url: "https://example.com/", internalLinks: ["http://example.com/about"] });
    const aboutPage = fakePage({ url: "https://example.com/about", internalLinks: [] });
    const audit = fakeAudit(fakeCrawl([homePage, aboutPage]));
    const graph = buildInternalLinkGraph(audit);
    assertTrue("TEST 28: http link resolves to https page", (graph.inboundCount.get("https://example.com/about") ?? 0) === 1);
    assertTrue("TEST 28: about is not an orphan", !graph.orphanPages.includes("https://example.com/about"));
    assertTrue("TEST 28: about reachable at depth 1", graph.depthDistribution[1] === 1 && graph.notReachedWithinDepth.length === 0);
  }

  // ======================================================================
  // TEST 29 — "What's Working" praise must be reachability-aware. A site
  // with 0 orphan pages but pages not reached from the home page is NOT
  // "every page is well-connected" — claiming so contradicts the Internal
  // Linking Analysis page. The praise derives from the same graph helper
  // that page uses, so the two can never disagree.
  // ======================================================================
  {
    const homePage = fakePage({ url: home, internalLinks: [about] });
    const aboutPage = fakePage({ url: about, internalLinks: [] });
    // Self-linked sitemap-discovered cluster: both pages have inbound
    // links (zero orphans) but neither is reachable from the home page.
    const clusterA = fakePage({ url: sitemapPage, internalLinks: [unlinked] });
    const clusterB = fakePage({ url: unlinked, internalLinks: [sitemapPage] });
    const crawl = fakeCrawl([homePage, aboutPage, clusterA, clusterB]);
    const audit = fakeAudit(crawl);
    const graph = buildInternalLinkGraph(audit);
    assertTrue("TEST 29: zero orphans in fixture", graph.orphanPages.length === 0);
    assertTrue("TEST 29: two pages not reached from home in fixture", graph.notReachedWithinDepth.length === 2);
    const items = buildWhatsWorking(audit);
    const linking = items.find((i) => i.key === "clean_internal_linking" || i.key === "no_orphan_pages");
    assertTrue("TEST 29: reachability-aware praise present", !!linking);
    assertTrue("TEST 29: praise never claims 'well-connected' with unreached pages", !!linking && !linking.label.includes("well-connected"));
    assertTrue("TEST 29: praise states the honest orphan fact", !!linking && linking.label.includes("No orphan pages"));
    assertTrue("TEST 29: praise names the not-reached figure", !!linking && linking.label.includes("2 pages"));
    // A fully-reachable site keeps the strong praise — and it now states
    // reachability explicitly rather than a vague "well-connected".
    const cleanAudit = fakeAudit(
      fakeCrawl([fakePage({ url: home, internalLinks: [about] }), fakePage({ url: about, internalLinks: [] })])
    );
    const cleanItems = buildWhatsWorking(cleanAudit);
    const cleanLinking = cleanItems.find((i) => i.key === "clean_internal_linking");
    assertTrue("TEST 29: fully-reachable site keeps clean-internal-linking praise", !!cleanLinking);
    assertTrue("TEST 29: strong praise states reachability from home", !!cleanLinking && cleanLinking.label.includes("reachable from the home page"));
    // A site with real orphans gets NO internal-linking praise at all —
    // the praise is gated on the same orphan count the Internal Linking
    // Analysis page displays, so they can never contradict each other.
    const orphanAudit = fakeAudit(
      fakeCrawl([
        fakePage({ url: home, internalLinks: [about] }),
        fakePage({ url: about, internalLinks: [] }),
        fakePage({ url: unlinked, internalLinks: [], flags: ["orphan_page"] }),
      ])
    );
    const orphanItems = buildWhatsWorking(orphanAudit);
    const orphanLinking = orphanItems.find((i) => i.key === "clean_internal_linking" || i.key === "no_orphan_pages");
    assertTrue("TEST 29: site with orphans gets no internal-linking praise", !orphanLinking);
  }

  // ======================================================================
  // TEST 30 — broken-link counts agree across every surface. The priority
  // list, the dedicated Broken Links section's split, and the canonical
  // helper must all produce the same number — the class of bug where one
  // section says 3,013 and another says 3,012 (transient/robots-blocked
  // links leaking into some counts) is locked out by construction.
  // ======================================================================
  {
    const mk = (url: string, failureCategory: string | null, statusCode: number | null, errorMessage: string | null) => ({
      url,
      ok: false,
      failureCategory,
      statusCode,
      errorMessage,
      linkedFrom: [home],
    });
    const links = [
      mk("https://x.test/dead", "not_found", 404, null),
      mk("https://x.test/gone", "not_found", 410, null),
      mk("https://x.test/timeout", "timeout", null, "Request timed out after retries — the server is not responding."),
      mk("https://x.test/blocked", "blocked_by_robots", null, "Path is disallowed by robots.txt — not checked."),
      mk("https://x.test/rate", "rate_limited", 429, "Rate limited by server — the server is throttling automated requests."),
    ];
    const audit = fakeAudit(fakeCrawl([fakePage({ url: home, internalLinks: [] })]), { brokenLinks: links as any });
    const genuine = genuineBrokenLinks(audit.brokenLinks);
    assertTrue("TEST 30: canonical count excludes transient + robots-blocked", genuine.length === 2);
    const allFailed = audit.brokenLinks.filter((b) => !b.ok && b.failureCategory !== "blocked_by_robots");
    const { broken } = splitBrokenLinks(allFailed);
    assertTrue("TEST 30: dedicated-section split equals canonical count", broken.length === genuine.length);
    const list = buildPriorityList(audit, []);
    const brokenIssue = list.find((i) => i.key === "broken_links");
    assertTrue("TEST 30: priority list uses the canonical count", brokenIssue?.count === genuine.length);
    assertTrue("TEST 30: priority list reports instance unit", brokenIssue?.countUnit === "links");
  }

  // ======================================================================
  // TEST 31 — 403/401/429 "crawler refused" responses are NOT broken links.
  // The split: genuine broken (404/410/5xx/DNS) stays critical; blocked
  // (403/401/429) gets its own lower-severity bucket; timeouts stay
  // temporary; robots-blocked links stay out of both.
  // ======================================================================
  {
    const mk = (url: string, failureCategory: string | null, statusCode: number | null, errorMessage: string | null) => ({
      url,
      ok: false,
      failureCategory,
      statusCode,
      errorMessage,
      linkedFrom: [home],
    });
    const links = [
      mk("https://x.test/404", "not_found", 404, null),
      mk("https://x.test/410", "not_found", 410, null),
      mk("https://x.test/500", "server_error", 500, null),
      mk("https://x.test/503", "server_error", 503, null),
      mk("https://x.test/dns", "dns_error", null, "Could not resolve the domain (DNS lookup failed)."),
      mk("https://x.test/timeout", "timeout", null, "Request timed out after retries — the server is not responding."),
      mk("https://x.test/403", "forbidden", 403, "Crawler blocked — the server refused automated requests."),
      mk("https://x.test/401", "forbidden", 401, "Unauthorized."),
      mk("https://x.test/429", "rate_limited", 429, "Rate limited by server — the server is throttling automated requests."),
      mk("https://x.test/robots", "blocked_by_robots", null, "Path is disallowed by robots.txt — not checked."),
    ];
    const { broken, temporary, blocked } = splitBrokenLinks(links);
    // splitBrokenLinks is given every link verbatim (including
    // robots-blocked, which only the genuine/blocked canonical helpers
    // pre-filter) — so bucket membership is what matters here.
    assertTrue("TEST 31: 404 stays in broken", broken.some((l) => l.url.endsWith("/404")));
    assertTrue("TEST 31: 410 stays in broken", broken.some((l) => l.url.endsWith("/410")));
    assertTrue("TEST 31: 5xx server error stays in broken", broken.some((l) => l.url.endsWith("/500")));
    assertTrue("TEST 31: DNS failure stays broken", broken.some((l) => l.url.endsWith("/dns")));
    assertTrue("TEST 31: timeout stays temporary", temporary.some((l) => l.url.endsWith("/timeout")));
    assertTrue("TEST 31: 503 stays temporary (transient server blip)", temporary.some((l) => l.url.endsWith("/503")) && !broken.some((l) => l.url.endsWith("/503")));
    assertTrue("TEST 31: 403 is NOT broken, NOT temporary — it is blocked", blocked.some((l) => l.url.endsWith("/403")) && !broken.some((l) => l.url.endsWith("/403")) && !temporary.some((l) => l.url.endsWith("/403")));
    assertTrue("TEST 31: 401 is blocked", blocked.some((l) => l.url.endsWith("/401")));
    assertTrue("TEST 31: 429 is blocked (rate limit = server refusing us)", blocked.some((l) => l.url.endsWith("/429")) && !temporary.some((l) => l.url.endsWith("/429")));
    assertTrue("TEST 31: robots-blocked link is in neither genuine nor blocked bucket", !genuineBrokenLinks(links).some((l) => l.url.endsWith("/robots")) && !blockedFromAutomatedChecking(links).some((l) => l.url.endsWith("/robots")));
    const audit = fakeAudit(fakeCrawl([fakePage({ url: home, internalLinks: [] })]), { brokenLinks: links as any });
    assertTrue("TEST 31: genuineBrokenLinks excludes 403/429/robots (4 left)", genuineBrokenLinks(audit.brokenLinks).length === 4);
    assertTrue("TEST 31: blockedFromAutomatedChecking is exactly the refused set", blockedFromAutomatedChecking(audit.brokenLinks).length === 3);
  }

  // ======================================================================
  // TEST 32 — the blocked-links finding flows through the priority list,
  // dashboard counts, and CSV consistently: minor severity (never counted
  // as critical), its own "links" unit, a FIXED spot-check estimate (not
  // count × per-link minutes), and its own CSV rows — while the all-issues
  // sheet's "Broken Link" rows exactly match the genuine count (the
  // 3,012-vs-3,013 class of drift, now impossible).
  // ======================================================================
  {
    const mk = (url: string, failureCategory: string | null, statusCode: number | null, errorMessage: string | null = null) => ({
      url,
      ok: false,
      failureCategory,
      statusCode,
      errorMessage,
      linkedFrom: [home, about],
    });
    const links = [
      mk("https://x.test/dead", "not_found", 404),
      mk("https://x.test/gone", "not_found", 410),
      mk("https://x.test/blocked403", "forbidden", 403),
      mk("https://x.test/limited429", "rate_limited", 429),
      mk("https://x.test/timeout", "timeout", null, "Request timed out after retries — the server is not responding."),
    ];
    const audit = fakeAudit(fakeCrawl([fakePage({ url: home, internalLinks: [] }), fakePage({ url: about, internalLinks: [] })]), { brokenLinks: links as any });
    const list = buildPriorityList(audit, []);
    const brokenIssue = list.find((i) => i.key === "broken_links");
    const blockedIssue = list.find((i) => i.key === "links_blocked_from_checking");
    assertTrue("TEST 32: broken_links count is genuine only (2)", brokenIssue?.count === 2);
    assertTrue("TEST 32: blocked issue exists with count 2", blockedIssue?.count === 2);
    assertTrue("TEST 32: blocked issue is minor severity, never critical", blockedIssue?.severity === "minor");
    assertTrue("TEST 32: blocked issue reports links unit", blockedIssue?.countUnit === "links");
    assertTrue("TEST 32: blocked issue is quick-effort (verification task)", blockedIssue?.effort === "quick");
    assertTrue("TEST 32: blocked issue has a FIXED total estimate, not count × minutes", blockedIssue?.estimatedTimeLabel === "~45 min total");
    const criticalCount = list.filter((i) => i.severity === "critical").length;
    const criticalBlocked = list.filter((i) => i.key === "links_blocked_from_checking" && i.severity === "critical").length;
    assertTrue("TEST 32: blocked issue never enters Critical Issue Types count", criticalBlocked === 0 && criticalCount === 1);
    // CSV: all-issues sheet — Broken Link rows == genuine count, Blocked
    // Link rows == blocked count.
    const { csvBody } = generateAuditCsv(audit, [], null);
    const lines = csvBody.split("\n");
    const brokenRows = lines.filter((l) => l.includes("Broken Link")).length;
    const blockedRows = lines.filter((l) => l.includes("Blocked Link")).length;
    const tempRows = lines.filter((l) => l.includes("Temporary Link")).length;
    assertTrue("TEST 32: CSV Broken Link rows equal genuine count", brokenRows === 2);
    assertTrue("TEST 32: CSV Blocked Link rows equal blocked count", blockedRows === 2);
    assertTrue("TEST 32: CSV Temporary Link rows stay separate", tempRows === 1);
    // Per-flag export for the blocked bucket exists and contains exactly
    // the blocked links.
    const blockedExport = generateAuditCsv(audit, [], "links_blocked_from_checking");
    const blockedExportRows = blockedExport.csvBody.split("\n").filter((l) => l.length > 0 && !l.startsWith("Pillar") && !l.startsWith("Source Page"));
    assertTrue("TEST 32: per-flag blocked export has one row per (link, source) pair", blockedExportRows.length === 4);
    // Action plan: the blocked finding is bucketed into Phase 2 (verification
    // pass), never Phase 1 with critical broken links.
    const plan = buildActionPlan(list);
    const phase2 = plan.find((w) => w.weekNumber === 2);
    assertTrue("TEST 32: blocked finding is in Phase 2 of the roadmap", !!phase2 && phase2.issues.some((i) => i.key === "links_blocked_from_checking"));
    const phase1 = plan.find((w) => w.weekNumber === 1);
    assertTrue("TEST 32: broken_links stays in Phase 1", !!phase1 && phase1.issues.some((i) => i.key === "broken_links"));
  }

  // ======================================================================
  // TEST 33 — Quick Wins can never contain content/structural work. Thin
  // content and orphan pages are not tag-level edits: they need real
  // content or internal-linking decisions, so they must be "standard"
  // effort and must never appear under "Quick Wins (no content rewrite or
  // dev work required)" — otherwise page 11 contradicts the difficulty
  // shown on their own detail pages (e.g. thin content: Complex 5/5,
  // 3+ days).
  // ======================================================================
  {
    const mkGroup = (flag: string, issueLabel: string): GroupedIssue => ({
      flag,
      issueLabel,
      whyItMatters: "a",
      businessImpact: "b",
      recommendedFix: "c",
      instances: [{ url: `https://example.com/${flag}`, suggestedText: null, aiGenerated: false, currentValue: null }],
      instancesByUrl: new Set([`https://example.com/${flag}`]),
      smartNote: "",
      codeSnippet: null,
      remediation: null,
    });
    const audit = fakeAudit(fakeCrawl([fakePage({ url: home, internalLinks: [] })]));
    const list = buildPriorityList(audit, [mkGroup("thin_content", "Thin content"), mkGroup("orphan_page", "Orphan pages")]);
    const quick = buildQuickWins(list);
    assertTrue("TEST 33: thin_content never appears in Quick Wins", !quick.some((i) => i.key === "thin_content"));
    assertTrue("TEST 33: orphan_page never appears in Quick Wins", !quick.some((i) => i.key === "orphan_page"));
    assertTrue("TEST 33: thin_content is standard effort", list.find((i) => i.key === "thin_content")?.effort === "standard");
    assertTrue("TEST 33: orphan_page is standard effort (structural linking work)", list.find((i) => i.key === "orphan_page")?.effort === "standard");
  }

  // ======================================================================
  // TEST 34 — Core Web Vitals coverage rows are three-state: only "Good"
  // shows Healthy; "Needs improvement" (e.g. LCP at 3.8s) gets the amber
  // warn status so the coverage page can never contradict the Performance
  // section's rating of the same metric; "Poor" stays a red fail.
  // ======================================================================
  {
    const withPageSpeed = (lcpMs: number) =>
      fakeAudit(fakeCrawl([fakePage({ url: home, internalLinks: [] })]), {
        pageSpeed: {
          ok: true,
          url: home,
          strategy: "mobile",
          metrics: { lcpMs, clsScore: 0.05, inpMs: 150, ttfbMs: 400 },
        } as any,
      });
    const coverage = (audit: RunAuditResult) => buildSeoCheckCoverage(audit, []);
    const good = coverage(withPageSpeed(2000)).find((c) => c.key === "webvital_lcp_poor")!;
    assertTrue("TEST 34: LCP 2.0s is pass/Healthy", good.passed === true && good.status === "pass");
    const warn = coverage(withPageSpeed(3800)).find((c) => c.key === "webvital_lcp_poor")!;
    assertTrue("TEST 34: LCP 3.8s is warn, NOT Healthy", warn.passed === false && warn.status === "warn");
    assertTrue("TEST 34: warn status text names the rating", warn.statusText.includes("Needs improvement"));
    const poor = coverage(withPageSpeed(4500)).find((c) => c.key === "webvital_lcp_poor")!;
    assertTrue("TEST 34: LCP 4.5s is fail", poor.passed === false && poor.status === "fail");
  }

  // ======================================================================
  // TEST 35 — the AI Readiness score is presented as a percentage (the
  // share of checks passing), never a mysterious "56/100" index: 25 of 45
  // checks passing is 56%, and the summary must say so explicitly with the
  // underlying check counts.
  // ======================================================================
  {
    const text = buildExecutiveSummaryText({
      pagesCrawled: 150,
      issueTypeCount: 12,
      affectedChecks: 900,
      criticalTypeCount: 3,
      quickWinsCount: 5,
      topIssueLabels: ["missing h1 tags"],
      aiReadinessScore: 56,
      aiReadinessChecks: { passCount: 25, totalCount: 45 },
    });
    assertTrue("TEST 35: AI Readiness sentence states a percentage", text.includes("56%"));
    assertTrue("TEST 35: AI Readiness sentence cites check counts", text.includes("25 of the 45"));
    assertTrue("TEST 35: summary never says /100 for AI Readiness", !text.includes("assessed at 56/100"));
    const withoutChecks = buildExecutiveSummaryText({
      pagesCrawled: 1,
      issueTypeCount: 0,
      affectedChecks: 0,
      criticalTypeCount: 0,
      quickWinsCount: 0,
      topIssueLabels: [],
      aiReadinessScore: 40,
    });
    assertTrue("TEST 35: checks-less call still renders a percentage", withoutChecks.includes("40%"));
  }

  // ======================================================================
  // TEST 36 — Response Code Breakdown reconciles with the blocked-links
  // section: crawled-page statuses are counted per page (1 page returned
  // 429), while link-check probe refusals (5 destinations with 429) are
  // surfaced separately in probeStatus so the two numbers can never look
  // like a data mismatch again.
  // ======================================================================
  {
    const failedPage = {
      ok: false,
      url: "https://example.com/rate-limited",
      fetchedAt: new Date().toISOString(),
      error: { type: "http_error" as const, message: "429", statusCode: 429 },
    };
    const mkBlocked = (url: string) => ({
      url,
      ok: false,
      failureCategory: "rate_limited",
      statusCode: 429,
      errorMessage: "Rate limited by server",
      linkedFrom: [home],
    });
    const audit = fakeAudit(
      fakeCrawl([fakePage({ url: home, internalLinks: [] }), failedPage as any]),
      {
        brokenLinks: [
          mkBlocked("https://example.com/a"),
          mkBlocked("https://example.com/b"),
          mkBlocked("https://example.com/c"),
          mkBlocked("https://example.com/d"),
          mkBlocked("https://example.com/e"),
        ] as any,
      }
    );
    const breakdown = buildResponseCodeBreakdown(audit);
    const fourX = breakdown.groups.find((g) => g.key === "4xx");
    const rateCode = fourX?.codes.find((c) => c.code === 429);
    assertTrue("TEST 36: page-level 429 count is 1 (crawled page only)", rateCode?.count === 1);
    assertTrue("TEST 36: probe summary counts all 5 refused destinations", breakdown.probeStatus.blockedCount === 5);
    assertTrue("TEST 36: probe rateLimited count is 5", breakdown.probeStatus.rateLimited === 5);
    assertTrue("TEST 36: page counts and probe counts never merge", breakdown.probeStatus.blockedCount !== (rateCode?.count ?? 0));
  }
}

