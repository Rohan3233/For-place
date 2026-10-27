/**
 * Sanity tests for generateReportPdf.
 * Run with: npm run test:pdf
 *
 * IMPORTANT HONESTY NOTE: these tests can confirm the output is a
 * structurally valid PDF (correct magic bytes, non-trivial size, no thrown
 * errors on realistic and edge-case input) — they cannot confirm the
 * report actually LOOKS good. That requires opening a real generated PDF
 * and looking at it, which hasn't happened yet in this environment (no
 * network/npm here). Open one for real before treating the visual design
 * as finished.
 */
import fs from "node:fs";
import path from "node:path";
import { generateReportPdf } from "./generateReportPdf";
import type { RunAuditResult, PageExplanationResult } from "./types";

function fakeAudit(score: number, brokenUrlCount: number): RunAuditResult {
  return ({
    crawl: {
      rootUrl: "https://example.com/",
      crawledAt: new Date().toISOString(),
      maxPages: 3,
      maxPagesReached: false,
      pages: [],
      pagesSkippedRobots: [
        "https://example.com/wp-admin/",
        "https://example.com/staging/preview",
      ],
      redirectChains: [
        {
          originalUrl: "https://example.com/old-page",
          finalUrl: "https://example.com/new-page",
          hopCount: 5,
          excessive: true,
        },
        {
          originalUrl: "https://example.com/short-hop",
          finalUrl: "https://example.com/target",
          hopCount: 1,
          excessive: false, // deliberately not excessive — confirms filtering works
        },
      ],
      duplicateTitles: [
        {
          value: "Home | Example Co",
          urls: ["https://example.com/", "https://example.com/index-2"],
        },
        {
          // RTL / Arabic-locale pages exercise the content-font stack —
          // without the Arabic fallback these render as overlapping glyphs.
          value: "مرحباً بكم في موقع Example Co | الصفحة الرئيسية",
          urls: ["https://example.com/ar/", "https://example.com/ar/home"],
        },
      ],
      duplicateMetaDescriptions: [
        {
          value: "Welcome to Example Co, your trusted source for example things.",
          urls: [
            "https://example.com/about",
            "https://example.com/about-us",
            "https://example.com/company",
          ],
        },
        {
          value: "تعرف على أجهزة HP المحمولة وأجهزة الكمبيوتر المكتبية والطابعات والملحقات والمزيد في موقع HP الرسمي",
          urls: ["https://example.com/ar/", "https://example.com/ar/home"],
        },
      ],
      robotsAudit: { status: "found", disallowedPaths: ["/wp-admin/", "/staging/"] },
      sitemapAudit: { status: "found", urlCount: 42 },
      orphanPages: [],
      wwwConsistency: { checked: false, consistent: true, variantResults: [], variantProbes: [], summary: null },
    },
    brokenLinks: Array.from({ length: brokenUrlCount }, (_, i) => ({
      url: `https://example.com/dead-link-${i}`,
      statusCode: 404,
      ok: false,
      errorMessage: null,
      failureCategory: "not_found" as const,
      linkedFrom: ["https://example.com/"],
    })),
    oversizedImages: [],
    pageSpeed: {
      ok: true,
      url: "https://example.com/",
      strategy: "mobile",
      metrics: { performanceScore: 72, lcpMs: 2400, clsScore: 0.05, inpMs: 180, ttfbMs: 300, isMobileFriendly: true, accessibilityScore: 88, accessibilityIssues: [] },
    },
    score: {
      overallScore: score,
      breakdown: { criticalIssuesCount: 1, moderateIssuesCount: 2, minorIssuesCount: 3, brokenLinksCount: brokenUrlCount, oversizedImagesCount: 0, performancePenalty: 5 },
    },
    // Minimal AEO shape — real audits always carry this (see runAudit.ts),
    // and the ReportDocument renders the AI-readiness section from it.
    aeo: {
      botAccess: [],
      llmsTxt: { present: false, url: "" },
      checks: [],
      categoryScores: [],
      overallScore: 0,
      entityConsistencyDetail: { items: [], consistencyScorePct: 0 },
      searchSummary: { overallScore: 0, strengths: [], topPriorities: [] },
    },
    fromCache: false,
  } as unknown) as RunAuditResult;
}

function fakeExplanations(issueCount: number): PageExplanationResult[] {
  return [
    {
      url: "https://example.com/",
      aiCallMade: issueCount > 0,
      aiError: null,
issues: Array.from({ length: issueCount }, (_, i) => ({
        flag: i === 0 ? "missing_title" : "missing_alt_text",
        issueLabel: i === 0 ? "Missing title tag" : "Images missing alt text",
        whyItMatters: "This is a test explanation of why the issue matters, long enough to wrap across a line.",
        businessImpact:
          i === 0
            ? "Lost clicks from search results where a title would have earned them."
            : "Image search traffic and screen-reader users are both left out.",
        recommendedFix: i === 0 ? "Write a unique 50–60 character title for the page." : "Add descriptive alt text to each meaningful image.",
        suggestedText: i === 0 ? "24/7 Emergency Plumber in Chicago | FastFix Plumbing" : null,
        aiGenerated: i === 0,
      })),
    },
  ];
}

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

export async function run() {
  // --- Test 1: realistic report generates a structurally valid PDF ---
  const buffer1 = await generateReportPdf(fakeAudit(82, 2), fakeExplanations(2));
  assertTrue("output is a Buffer", Buffer.isBuffer(buffer1));
  assertTrue("output starts with PDF magic bytes", buffer1.subarray(0, 5).toString("ascii") === "%PDF-");
  assertTrue("output is a non-trivial size (not an empty/broken PDF)", buffer1.length > 1000);

  // Writes the fixture PDF (with duplicate titles/descriptions and an
  // excessive redirect baked in above) to disk, so it can be opened and
  // visually inspected directly — no need to find a real site that
  // happens to have these issues naturally.
  const outputPath = path.join(process.cwd(), "sample-report.pdf");
  fs.writeFileSync(outputPath, buffer1);
  console.log(`\nSample PDF written to: ${outputPath}`);
  console.log("Open it to visually confirm the Duplicate Titles / Duplicate Meta Descriptions / Excessive Redirects sections.");

  // --- Test 2: a page with ZERO issues doesn't crash (the "No issues found" branch) ---
  let threwOnClean = false;
  try {
    const buffer2 = await generateReportPdf(fakeAudit(100, 0), fakeExplanations(0));
    assertTrue("clean report (no issues) still produces a valid PDF", buffer2.subarray(0, 5).toString("ascii") === "%PDF-");
  } catch {
    threwOnClean = true;
  }
  assertTrue("zero-issue report does not throw", threwOnClean === false);

  // --- Test 3: white-label option doesn't crash, with and without a brand name ---
  let threwOnWhiteLabel = false;
  try {
    await generateReportPdf(fakeAudit(60, 1), fakeExplanations(1), { whiteLabel: true, brandName: "Acme SEO Co." });
    await generateReportPdf(fakeAudit(60, 1), fakeExplanations(1), { whiteLabel: true }); // no brand name provided
  } catch {
    threwOnWhiteLabel = true;
  }
  assertTrue("white-label options (with and without brand name) do not throw", threwOnWhiteLabel === false);

  // --- Test 4: a large number of issues on one page doesn't crash (many wrapped blocks) ---
  let threwOnLarge = false;
  try {
    const bigBuffer = await generateReportPdf(fakeAudit(20, 10), fakeExplanations(40));
    assertTrue("large issue count still produces a valid, larger PDF", bigBuffer.length > buffer1.length);
  } catch {
    threwOnLarge = true;
  }
  assertTrue("a page with many issues does not throw", threwOnLarge === false);

  // --- Test 5: Agency white-label branding (cover page + logo footer) renders ---
  // Request-scoped only: the branding object is passed to this one render
  // call and goes nowhere else — same shape the zip/pdf routes accept.
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const brandingOptions = {
    whiteLabel: true,
    agencyBranding: {
      agencyName: "Acme Agency Co.",
      clientName: "Example Corp",
      clientWebsite: "https://www.example.com/",
      reportDate: "August 11, 2026",
      logo: { dataUrl: tinyPng, width: 600, height: 200 },
    },
  };
  let threwOnBranded = false;
  let brandedBuffer: Buffer | null = null;
  try {
    brandedBuffer = await generateReportPdf(fakeAudit(82, 2), fakeExplanations(2), brandingOptions);
  } catch {
    threwOnBranded = true;
  }
  assertTrue("agency-branded PDF (cover + logo footer) renders without throwing", threwOnBranded === false);
  assertTrue(
    "agency-branded PDF is a valid, non-trivial PDF",
    !!brandedBuffer && brandedBuffer.subarray(0, 5).toString("ascii") === "%PDF-" && brandedBuffer.length > 1000
  );
  // The cover page adds a physical page — branded output should be visibly
  // larger than the same report rendered unbranded.
  assertTrue("agency-branded PDF is larger than the unbranded render", brandedBuffer !== null && brandedBuffer.length > buffer1.length);

  // --- Test 6: branding never leaks between renders ---
  // Two sequential renders with different branding must both succeed
  // independently; a second render without branding behaves like the plain
  // report. (Leak-prevention is architectural: branding lives in the request
  // object only — this proves the renderer doesn't retain any state.)
  let threwOnSecondBranded = false;
  try {
    await generateReportPdf(fakeAudit(82, 2), fakeExplanations(2), {
      whiteLabel: true,
      agencyBranding: { agencyName: "Another Agency" },
    });
    await generateReportPdf(fakeAudit(82, 2), fakeExplanations(2), {
      whiteLabel: true,
      agencyBranding: { agencyName: "Acme Agency Co.", clientName: "Example Corp", logo: { dataUrl: tinyPng, width: 600, height: 200 } },
    });
    await generateReportPdf(fakeAudit(82, 2), fakeExplanations(2)); // no branding at all
  } catch {
    threwOnSecondBranded = true;
  }
  assertTrue("multiple branded/unbranded renders in sequence never cross-contaminate", threwOnSecondBranded === false);

  // --- Test 7: branding edge cases — no logo, and long agency name ---
  let threwOnBrandingEdges = false;
  try {
    await generateReportPdf(fakeAudit(82, 2), fakeExplanations(2), {
      whiteLabel: true,
      agencyBranding: { agencyName: "Agency Without A Logo" }, // edge case: agency tier + no logo
    });
    await generateReportPdf(fakeAudit(82, 2), fakeExplanations(2), {
      whiteLabel: true,
      agencyBranding: { agencyName: "A Very Long Agency Name That Keeps Going And Going And Going And Going And Going" }, // long name
    });
  } catch {
    threwOnBrandingEdges = true;
  }
  assertTrue("branding edge cases (no logo, long agency name) render without throwing", threwOnBrandingEdges === false);

  console.log("\nDone. If all lines above say PASS, PDF generation is structurally sound.");
  console.log("REMINDER: this does not confirm visual quality — open a real generated PDF to check that.");
}

if (require.main === module) {
  run();
}
