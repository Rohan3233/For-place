/**
 * Tests for the Fix Roadmap (fixRoadmap.ts): deterministic tier assignment,
 * evidence reuse (counts/URLs/copy all come from the existing audit data),
 * the URL display threshold, the blocked-links fallback, and honest empty
 * states. Run with: npm run test:fixroadmap
 */
import { buildFixRoadmap, fixTierFor, countFixRoadmapItems } from "./fixRoadmap";
import type { PriorityIssue } from "./priorityIssues";
import type { CoverageCheck } from "./seoCheckCoverage";
import type { GroupedIssue } from "./groupIssues";
import type { RunAuditResult, BrokenLinkResult } from "./types";

function issue(overrides: Partial<PriorityIssue>): PriorityIssue {
  return {
    key: "missing_meta_description",
    label: "Missing meta descriptions",
    pillar: "onPage",
    severity: "moderate",
    effort: "quick",
    count: 3,
    estimatedTimeLabel: "~3 min each",
    effortBucketLabel: "Trivial (< 30 Mins)",
    templateLevel: false,
    impactStars: 3,
    difficultyStars: 2,
    priorityScore: 5.2,
    priorityTier: "low",
    impactLabel: "🟡 Medium Impact",
    difficultyLabel: "Easy",
    batchFixPossible: true,
    countUnit: "pages",
    ...overrides,
  };
}

function check(overrides: Partial<CoverageCheck>): CoverageCheck {
  return {
    key: "missing_meta_description",
    label: "Meta description present",
    category: "Metadata",
    passed: false,
    status: "fail",
    affectedCount: 3,
    countUnit: "pages",
    statusText: "3 pages affected",
    affectedUrls: ["https://example.com/pricing", "https://example.com/about"],
    hasMoreAffectedUrls: false,
    whyItMatters: "Without a meta description, search engines generate a snippet automatically.",
    businessImpact: "Likely reduces click-through rate.",
    recommendedFix: "Write a unique meta description for each page.",
    sectionRef: { name: "AI Search Readiness (AEO/GEO)" },
    ...overrides,
  };
}

function grouped(flag: string, urls: string[]): GroupedIssue {
  return {
    flag,
    issueLabel: "Grouped issue",
    whyItMatters: "Grouped why it matters.",
    businessImpact: "Grouped business impact.",
    recommendedFix: "Grouped recommended fix.",
    instances: urls.map((url) => ({ url, suggestedText: null, aiGenerated: false, currentValue: null })),
    instancesByUrl: new Set(urls),
    smartNote: "",
    codeSnippet: null,
    remediation: null,
  };
}

function audit(overrides: Partial<RunAuditResult> = {}): RunAuditResult {
  return {
    crawl: {
      rootUrl: "https://example.com/",
      crawledAt: new Date().toISOString(),
      maxPages: 1,
      maxPagesReached: false,
      terminationReason: "crawl_complete",
      metrics: {
        discoveredCount: 0,
        queuedCount: 0,
        crawledCount: 0,
        succeededCount: 0,
        failedCount: 0,
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
      pages: [],
      pagesSkippedRobots: [],
      redirectChains: [],
      duplicateTitles: [],
      duplicateMetaDescriptions: [],
      orphanPages: [],
      wwwConsistency: { checked: true, consistent: true, canonicalHost: "https://example.com/", variantResults: [], variantProbes: [], summary: null, issue: null },
      robotsAudit: { status: "not_found", disallowedPaths: [] },
      sitemapAudit: { status: "not_found", urlCount: 0 },
    },
    brokenLinks: [],
    oversizedImages: [],
    pageSpeed: { ok: false, url: "https://example.com/", error: "not tested" },
    score: { overallScore: 50, breakdown: { criticalIssuesCount: 0, moderateIssuesCount: 0, minorIssuesCount: 0, brokenLinksCount: 0, oversizedImagesCount: 0, performancePenalty: 0 } },
    fromCache: false,
    crawlDurationMs: 1000,
    auditDate: new Date().toISOString(),
    aeo: { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [] },
    ...overrides,
  };
}

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

export function run() {
  // ======================================================================
  // Tier assignment — deterministic, documented, selective
  // ======================================================================
  {
    const critical = issue({ key: "missing_title", severity: "critical" });
    const noindexMinor = issue({ key: "noindex_meta_tag", severity: "minor" }); // even if severity said minor
    const webvital = issue({ key: "webvital_lcp_poor", severity: "moderate", priorityTier: "low" });
    const broken = issue({ key: "broken_links", severity: "moderate", countUnit: "links" });
    const moderate = issue({ key: "missing_meta_description", severity: "moderate" });
    const highTier = issue({ key: "duplicate_titles", severity: "critical", priorityTier: "high" });
    const altText = issue({ key: "missing_alt_text", severity: "minor", priorityTier: "low" });
    const urlCase = issue({ key: "url_has_uppercase", severity: "minor", priorityTier: "low" });

    assertTrue("tier: critical severity => Fix First", fixTierFor(critical) === "fixFirst");
    assertTrue("tier: noindex (crawl/index-blocking) => Fix First regardless of severity label", fixTierFor(noindexMinor) === "fixFirst");
    assertTrue("tier: Core Web Vital => Fix First", fixTierFor(webvital) === "fixFirst");
    assertTrue("tier: broken links => Fix First", fixTierFor(broken) === "fixFirst");
    assertTrue("tier: moderate severity => Fix Next", fixTierFor(moderate) === "fixNext");
    assertTrue("tier: high priority tier => Fix Next", fixTierFor(highTier) === "fixNext");
    assertTrue("tier: minor cosmetic => Optimize (selective, not count-driven)", fixTierFor(altText) === "optimize");
    assertTrue("tier: URL hygiene => Optimize", fixTierFor(urlCase) === "optimize");
    // Determinism — same input, same tier, every time.
    assertTrue("tier: deterministic", fixTierFor(critical) === fixTierFor(critical));
  }

  // ======================================================================
  // Evidence reuse — counts/URLs/copy come from the existing data
  // ======================================================================
  {
    const priority = issue({
      key: "missing_meta_description",
      severity: "moderate",
      count: 3,
      countUnit: "pages",
      effortBucketLabel: "Trivial (< 30 Mins)",
    });
    const coverage = check({
      key: "missing_meta_description",
      affectedUrls: ["https://example.com/pricing", "https://example.com/about"],
      whyItMatters: "Coverage why.",
      recommendedFix: "Coverage fix.",
    });
    const roadmap = buildFixRoadmap([priority], [coverage], [], audit());

    assertTrue("roadmap: item lands in Fix Next", roadmap.fixNext.length === 1 && roadmap.fixFirst.length === 0 && roadmap.optimize.length === 0);
    const item = roadmap.fixNext[0];
    assertTrue("roadmap: count comes from the priority list", item.count === 3 && item.countUnit === "pages");
    assertTrue("roadmap: effort comes from the priority list", item.effortBucketLabel === "Trivial (< 30 Mins)");
    assertTrue("roadmap: URLs come from the coverage evidence", item.affectedUrls.length === 2 && item.affectedUrls[0] === "https://example.com/pricing");
    assertTrue("roadmap: why reused from existing copy", item.whyItMatters === "Coverage why.");
    assertTrue("roadmap: recommendation reused from existing copy", item.recommendation === "Coverage fix.");
    assertTrue("roadmap: small URL set is not flagged as truncated", item.hasMoreAffectedUrls === false);

    // Same inputs always produce the same roadmap (determinism).
    const again = buildFixRoadmap([priority], [coverage], [], audit());
    assertTrue("roadmap: deterministic", JSON.stringify(roadmap) === JSON.stringify(again));
  }

  // ======================================================================
  // URL display threshold — one centralized rule (COVERAGE_URLS_INLINE_LIMIT)
  // ======================================================================
  {
    const manyUrls = Array.from({ length: 13 }, (_, i) => `https://example.com/p${i}`);
    const coverage = check({ key: "missing_alt_text", affectedUrls: manyUrls, hasMoreAffectedUrls: true });
    const priority = issue({ key: "missing_alt_text", severity: "minor", count: 13 });
    const roadmap = buildFixRoadmap([priority], [coverage], [], audit());
    assertTrue("threshold: 13 URLs => hasMoreAffectedUrls true", roadmap.optimize[0].hasMoreAffectedUrls === true);

    const twelveUrls = Array.from({ length: 12 }, (_, i) => `https://example.com/q${i}`);
    const coverage12 = check({ key: "missing_alt_text", affectedUrls: twelveUrls, hasMoreAffectedUrls: false });
    const roadmap12 = buildFixRoadmap([issue({ key: "missing_alt_text", severity: "minor", count: 12 })], [coverage12], [], audit());
    assertTrue("threshold: 12 URLs => inline (not flagged as truncated)", roadmap12.optimize[0].hasMoreAffectedUrls === false);
  }

  // ======================================================================
  // Coverage missing -> grouped-issue fallback (same instances as the
  // rest of the report), and the blocked-links fallback + URLs
  // ======================================================================
  {
    const priority = issue({ key: "orphan_page", severity: "moderate", count: 2 });
    const group = grouped("orphan_page", ["https://example.com/legacy", "https://example.com/old"]);
    const roadmap = buildFixRoadmap([priority], [], [group], audit());
    assertTrue("fallback: grouped-issue URLs used when no coverage check", roadmap.fixFirst[0].affectedUrls.length === 2 && roadmap.fixFirst[0].affectedUrls[1] === "https://example.com/old");
    assertTrue("fallback: grouped-issue copy reused", roadmap.fixFirst[0].whyItMatters === "Grouped why it matters.");

    // links_blocked_from_checking — real URLs from the audit's broken-links
    // set + centralized fallback copy (never invented).
    const blocked: BrokenLinkResult = {
      url: "https://example.com/admin/report",
      statusCode: 403,
      ok: false,
      errorMessage: "Forbidden",
      failureCategory: null,
      linkedFrom: ["https://example.com/"],
    };
    const roadmapBlocked = buildFixRoadmap(
      [issue({ key: "links_blocked_from_checking", severity: "minor", count: 1, countUnit: "links" })],
      [],
      [],
      audit({ brokenLinks: [blocked] })
    );
    assertTrue("blocked: URL comes from the audit data", roadmapBlocked.optimize[0].affectedUrls.length === 1 && roadmapBlocked.optimize[0].affectedUrls[0] === "https://example.com/admin/report");
    assertTrue("blocked: fallback copy is centralized and specific", roadmapBlocked.optimize[0].whyItMatters.includes("automated checker") && roadmapBlocked.optimize[0].recommendation.includes("Spot-check"));
  }

  // ======================================================================
  // No invented data — site-level checks keep an honest empty URL list;
  // an empty priority list yields an empty roadmap (no fabricated issues)
  // ======================================================================
  {
    const priority = issue({ key: "www_inconsistent", severity: "critical", count: 1 });
    const coverage = check({ key: "www_inconsistent", affectedUrls: [], whyItMatters: "www / non-www split signals.", recommendedFix: "Consolidate onto one domain." });
    const roadmap = buildFixRoadmap([priority], [coverage], [], audit());
    assertTrue("no-invent: site-level check has no invented URLs", roadmap.fixFirst[0].affectedUrls.length === 0 && roadmap.fixFirst[0].hasMoreAffectedUrls === false);

    const empty = buildFixRoadmap([], [], [], audit());
    assertTrue("no-invent: empty priority list => empty roadmap", countFixRoadmapItems(empty) === 0 && empty.fixFirst.length === 0 && empty.fixNext.length === 0 && empty.optimize.length === 0);
  }

  // ======================================================================
  // Ordering — items keep the priority list's deterministic order per tier
  // ======================================================================
  {
    const low = issue({ key: "missing_alt_text", severity: "minor", count: 500, priorityTier: "low" });
    const high = issue({ key: "noindex_meta_tag", severity: "critical", count: 2, priorityTier: "high" });
    const roadmap = buildFixRoadmap([low, high], [], [], audit());
    // Both in different tiers; the critical indexability issue (2 pages)
    // must sit above the 500-page cosmetic one — selectivity is tier-based.
    assertTrue("order: critical indexability on 2 pages outranks 500 cosmetic pages", roadmap.fixFirst.length === 1 && roadmap.optimize.length === 1 && roadmap.fixFirst[0].key === "noindex_meta_tag" && roadmap.optimize[0].key === "missing_alt_text");
  }

  console.log("\nDone. If all lines above say PASS, the Fix Roadmap is data-consistent and deterministic.");
}

if (require.main === module) {
  run();
}
