/**
 * Regression tests for the descriptive-image-filename check:
 *
 *  - Proxied/CDN image URLs (Next.js /_next/image and friends) must be
 *    decoded so the REAL filename is what the descriptiveness check sees —
 *    previously /_next/image?url=...&w=3840&q=75 yielded "image" and a
 *    non-descriptive filename like careers_carousel_4.webp was never
 *    flagged.
 *  - Filenames from a real audit's oversized-image list are handled
 *    without false flags (genai_home_earth.png, bottom_lifeat-leapfrog_3.webp).
 *
 * Run with: npm run test:imagefilename
 */
import {
  extractImageFilename,
  classifyImageFilename,
  isNonDescriptiveImageFilename,
  buildNonDescriptiveImageFindings,
} from "./imageFilename";
import type { RunAuditResult, CrawlSiteResult, CrawlPageSuccess, ImageFinding } from "./types";

function assertTrue(label: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

export function run(): void {
  // --- The exact Next.js image-proxy URL from the real audit ---
  const proxied =
    "https://www.lftechnology.com/_next/image?url=%2Fimages%2Fcareers-carousel%2Fcareers_carousel_4.webp&w=3840&q=75";
  const extracted = extractImageFilename(proxied, "https://www.lftechnology.com/");
  assertTrue(
    "proxied URL decodes to the real filename (careers_carousel_4.webp, not 'image')",
    extracted === "careers_carousel_4.webp"
  );
  assertTrue(
    "word_word_N filename is classified non-descriptive and gets flagged",
    isNonDescriptiveImageFilename(extracted) === true
  );

  // --- Filenames from the same audit's oversized-images list ---
  assertTrue(
    "genai_home_earth.png is extracted as-is and stays descriptive (not a false positive)",
    extractImageFilename("https://www.lftechnology.com/images/genai_home_earth.png", "https://www.lftechnology.com/") ===
      "genai_home_earth.png" && isNonDescriptiveImageFilename("genai_home_earth.png") === false
  );
  assertTrue(
    "bottom_lifeat-leapfrog_3.webp (3 words + index) stays descriptive (not a false positive)",
    extractImageFilename("https://www.lftechnology.com/images/bottom_lifeat-leapfrog_3.webp", "https://www.lftechnology.com/") ===
      "bottom_lifeat-leapfrog_3.webp" && isNonDescriptiveImageFilename("bottom_lifeat-leapfrog_3.webp") === false
  );

  // --- Direct (non-proxied) URLs ---
  assertTrue(
    "direct image URL keeps its last path segment",
    extractImageFilename("https://example.com/assets/hero-banner.webp", "https://example.com/") === "hero-banner.webp"
  );
  assertTrue(
    "relative src resolves against the page URL",
    extractImageFilename("/images/team-photo.jpg", "https://example.com/about") === "team-photo.jpg"
  );

  // --- Generic camera/CMS defaults are flagged ---
  for (const f of ["IMG_1234.webp", "DSC_0001.jpg", "image1.png", "photo_2.jpg", "default.png"]) {
    assertTrue(`generic filename "${f}" is flagged`, isNonDescriptiveImageFilename(f) === true);
  }
  assertTrue("purely numeric filename is flagged", isNonDescriptiveImageFilename("1682345678.webp") === true);
  assertTrue("hash-like filename is flagged", isNonDescriptiveImageFilename("a1b2c3d4e5f60708.webp") === true);

  // --- Descriptive filenames are NOT flagged ---
  for (const f of ["emergency-plumber-chicago.jpg", "roof-repair-cost-guide.png", "careers-carousel-hero.webp"]) {
    assertTrue(`descriptive filename "${f}" is not flagged`, isNonDescriptiveImageFilename(f) === false);
  }

  // --- Other proxy formats ---
  assertTrue(
    "generic ?url= proxy is decoded (willnorris/imageproxy style)",
    extractImageFilename("https://example.com/imageproxy?url=https%3A%2F%2Fcdn.example.com%2Fimg%2Fwinter_sale_2.png", "https://example.com/") ===
      "winter_sale_2.png"
  );
  assertTrue(
    "Cloudflare /cdn-cgi/image keeps the real filename from the path",
    extractImageFilename("https://example.com/cdn-cgi/image/width=800/https://cdn.example.com/img/about-team.jpg", "https://example.com/") ===
      "about-team.jpg"
  );

  // --- buildNonDescriptiveImageFindings: collects the actual offending
  // images (decoded filename + full src + pages), deduped by src ---
  {
    const proxiedSrc =
      "/_next/image?url=%2Fimages%2Fcareers-carousel%2Fcareers_carousel_4.webp&w=3840&q=75";
    const image = (src: string, quality: ImageFinding["filenameQuality"]): ImageFinding => ({
      src,
      alt: "alt",
      hasLazyLoading: true,
      hasSrcset: false,
      hasDimensions: true,
      filenameQuality: quality,
      sizeBytes: null,
    });
    const page = (url: string, images: ImageFinding[]): CrawlPageSuccess =>
      ({
        ok: true,
        url,
        requestedUrl: url,
        redirected: false,
        redirectHopCount: null,
        fetchedAt: new Date().toISOString(),
        statusCode: 200,
        contentType: "text/html",
        title: { content: "T", length: 1 },
        metaDescription: { content: "M", length: 1 },
        h1: ["H"],
        headings: { h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 },
        images,
        canonical: { url, isSelfReferencing: true },
        internalLinks: [],
        wordCount: 200,
        flags: [],
        isOrphan: false,
        structuredData: { present: false, types: [], format: null },
        robotsMeta: {} as any,
        xRobotsTag: {} as any,
        aeoSignals: {} as any,
        redirectHopStatusCodes: [],
        htmlLang: null,
      }) as CrawlPageSuccess;
    const crawl: CrawlSiteResult = {
      rootUrl: "https://example.com/",
      crawledAt: new Date().toISOString(),
      maxPages: 2,
      maxPagesReached: false,
      terminationReason: "crawl_complete",
      metrics: {
        discoveredCount: 2,
        queuedCount: 2,
        crawledCount: 2,
        succeededCount: 2,
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
      pages: [
        page("https://example.com/careers", [image(proxiedSrc, "generic")]),
        page("https://example.com/about", [
          image(proxiedSrc, "generic"), // same image on a second page — dedup
          image("/images/team-photo.jpg", "good"), // descriptive — excluded
        ]),
      ],
      pagesSkippedRobots: [],
      redirectChains: [],
      duplicateTitles: [],
      duplicateMetaDescriptions: [],
      robotsAudit: { status: "found", disallowedPaths: [] },
      sitemapAudit: { status: "found", urlCount: 2 },
      orphanPages: [],
      wwwConsistency: { checked: false, consistent: true, canonicalHost: null, variantResults: [], variantProbes: [], summary: null, issue: null },
    };
    const audit = { crawl, brokenLinks: [], oversizedImages: [], pageSpeed: { ok: false } } as unknown as RunAuditResult;
    const findings = buildNonDescriptiveImageFindings(audit);
    assertTrue(
      "findings dedupe the same proxied image across pages and resolve it to an absolute src",
      findings.length === 1 &&
        findings[0].src === "https://example.com/_next/image?url=%2Fimages%2Fcareers-carousel%2Fcareers_carousel_4.webp&w=3840&q=75"
    );
    assertTrue(
      "finding carries the decoded real filename",
      findings[0].filename === "careers_carousel_4.webp"
    );
    assertTrue(
      "finding lists both pages the image appears on",
      findings[0].pages.length === 2 &&
        findings[0].pages.includes("https://example.com/careers") &&
        findings[0].pages.includes("https://example.com/about")
    );
    assertTrue(
      "descriptive images are not collected as findings",
      !findings.some((f) => f.filename === "team-photo.jpg")
    );
  }

  console.log("\nDone. If all lines above say PASS, the descriptive-image-filename check is fixed.");
}

if (require.main === module) {
  run();
}
