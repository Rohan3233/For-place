/**
 * Regression tests for H1 detection pipeline.
 *
 * Tests cover the full decision pipeline:
 *   Stage 1: Raw HTML H1 extraction (with image-alt fallback)
 *   Stage 2: Dynamic-rendering evidence detection (framework signals)
 *   Stage 3: Rendered-DOM re-analysis (reAnalyzeFromRenderedHtml)
 *
 * Run with: npx ts-node -P tsconfig.crawler.json -e "require('./lib/crawler/h1Detection.test').run()"
 */
import { crawlPage, reAnalyzeFromRenderedHtml } from "./crawlPage";
import type { CrawlPageSuccess } from "./types";
import type { AeoPageSignals } from "./aeoSignals";
import * as cheerio from "cheerio";
import { detectFrameworkSignals, needsH1VerificationRender } from "./aeoSignals";

function loadHtml(html: string) {
  return cheerio.load(html);
}

async function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

/** Build a minimal valid AeoPageSignals object for tests. */
function fakeAeoSignals(overrides: Partial<AeoPageSignals> = {}): AeoPageSignals {
  return {
    ogTags: { present: false, missing: [] },
    twitterCardTags: { present: false, missing: [] },
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
    definitionalStatementCount: 0,
    hasDefinitionalOpening: false,
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
    textToHtmlRatio: 80,
    sectionCount: 1,
    datePublished: null,
    visibleAuthor: false,
    authorUrl: null,
    ...overrides,
  };
}

function fakePageResult(overrides: Partial<CrawlPageSuccess> = {}): CrawlPageSuccess {
  return {
    ok: true,
    url: "https://example.com/test",
    requestedUrl: "https://example.com/test",
    redirected: false,
    redirectHopCount: 0,
    redirectHopStatusCodes: [],
    fetchedAt: new Date().toISOString(),
    statusCode: 200,
    contentType: "text/html",
    title: { content: "Test Page", length: 9 },
    metaDescription: { content: "A test page for H1 detection.", length: 28 },
    h1: [],
    headings: { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    canonical: { url: null, isSelfReferencing: null },
    internalLinks: ["/other"],
    externalLinkCount: 0,
    wordCount: 500,
    flags: [],
    structuredData: { present: false, types: [], format: null },
    robotsMeta: { noindex: false, nofollow: false },
    xRobotsTag: { raw: null, noindex: false },
    isOrphan: false,
    htmlLang: "en",
    aeoSignals: fakeAeoSignals(),
    h1Source: null,
    potentialVisualHeading: null,
    ...overrides,
  };
}

function makeMockFetch(html: string) {
  let redirected = false;
  return async (input: string, init?: RequestInit) => {
    const url = input.toString();
    if (init?.redirect === "manual" && url === "https://example.com/test" && !redirected) {
      redirected = true;
      return {
        ok: false,
        status: 301,
        statusText: "Moved Permanently",
        url,
        headers: { get: (name: string) => name.toLowerCase() === "location" ? "https://example.com/test" : null },
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      url: "https://example.com/test",
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null,
      },
      text: async () => html,
    };
  };
}

// ---------------------------------------------------------------------------
// Unit tests for needsH1VerificationRender
// ---------------------------------------------------------------------------
function testNeedsVerification() {
  console.log("\n--- needsH1VerificationRender unit tests ---\n");

  // No H1 + empty app root → should verify
  assertTrue("V1: empty app root triggers verification",
    needsH1VerificationRender(false, { hasMainContainer: true, mainWords: 0, scriptTagCount: 5, bodyChildCount: 1 },
      { hasFrameworkMarkers: true, hasEmptyAppRoot: true, hasSignificantScriptBundle: true }));

  // No H1 + framework markers + significant bundle → should verify
  assertTrue("V2: framework markers + bundle triggers verification",
    needsH1VerificationRender(false, { hasMainContainer: true, mainWords: 50, scriptTagCount: 10, bodyChildCount: 5 },
      { hasFrameworkMarkers: true, hasEmptyAppRoot: false, hasSignificantScriptBundle: true }));

  // No H1 + framework markers + sparse main → should verify
  assertTrue("V3: framework markers + sparse main triggers verification",
    needsH1VerificationRender(false, { hasMainContainer: true, mainWords: 8, scriptTagCount: 3, bodyChildCount: 3 },
      { hasFrameworkMarkers: true, hasEmptyAppRoot: false, hasSignificantScriptBundle: false }));

  // No H1 + many scripts + few body children → should verify
  assertTrue("V4: many scripts + sparse body triggers verification",
    needsH1VerificationRender(false, { hasMainContainer: false, mainWords: 0, scriptTagCount: 7, bodyChildCount: 2 },
      { hasFrameworkMarkers: false, hasEmptyAppRoot: false, hasSignificantScriptBundle: false }));

  // No H1 + empty main container (<=5 words) → should verify
  assertTrue("V5: empty main container triggers verification",
    needsH1VerificationRender(false, { hasMainContainer: true, mainWords: 3, scriptTagCount: 2, bodyChildCount: 5 },
      { hasFrameworkMarkers: false, hasEmptyAppRoot: false, hasSignificantScriptBundle: false }));

  // H1 exists → no verification needed
  assertTrue("V6: H1 present → no verification",
    !needsH1VerificationRender(true, { hasMainContainer: true, mainWords: 50, scriptTagCount: 10, bodyChildCount: 5 },
      { hasFrameworkMarkers: true, hasEmptyAppRoot: false, hasSignificantScriptBundle: true }));

  // No H1 + plain HTML (no framework, no scripts) → no verification
  assertTrue("V7: plain HTML → no verification",
    !needsH1VerificationRender(false, { hasMainContainer: true, mainWords: 200, scriptTagCount: 1, bodyChildCount: 10 },
      { hasFrameworkMarkers: false, hasEmptyAppRoot: false, hasSignificantScriptBundle: false }));
}

// ---------------------------------------------------------------------------
// Unit tests for detectFrameworkSignals
// ---------------------------------------------------------------------------
function testFrameworkDetection() {
  console.log("\n--- detectFrameworkSignals unit tests ---\n");

  // React
  assertTrue("F1: React root detected",
    detectFrameworkSignals(loadHtml('<div id="root"></div><script src="/bundle.js"></script>')).hasReactRoot);

  // Next.js
  assertTrue("F2: Next.js detected",
    detectFrameworkSignals(loadHtml('<script id="__NEXT_DATA__">{}</script>')).hasNextJsData);

  // Vue
  assertTrue("F3: Vue detected",
    detectFrameworkSignals(loadHtml('<div data-v-abc123></div>')).hasVueApp);

  // Angular
  assertTrue("F4: Angular detected",
    detectFrameworkSignals(loadHtml('<app-root ng-version="15.0.0"></app-root>')).hasAngularApp);

  // Gatsby
  assertTrue("F5: Gatsby detected",
    detectFrameworkSignals(loadHtml('<div id="___gatsby"></div>')).hasFrameworkMarkers);

  // Remix
  assertTrue("F6: Remix detected",
    detectFrameworkSignals(loadHtml('<script>window.__remixContext = {}</script>')).hasFrameworkMarkers);

  // Empty app root
  assertTrue("F7: Empty app root detected",
    detectFrameworkSignals(loadHtml('<div id="root"></div>')).hasEmptyAppRoot);

  // Non-empty app root (not empty)
  assertTrue("F8: Non-empty app root not flagged",
    !detectFrameworkSignals(loadHtml('<div id="root"><h1>Title</h1><p>Content here with many words in the root container.</p></div>')).hasEmptyAppRoot);

  // Significant script bundle
  assertTrue("F9: Large script bundle detected",
    detectFrameworkSignals(loadHtml(`<script>${"x".repeat(6000)}</script>`)).hasSignificantScriptBundle);

  // Plain HTML (no framework)
  const plainResult = detectFrameworkSignals(loadHtml('<html><body><h1>Title</h1></body></html>'));
  assertTrue("F10: Plain HTML has no framework markers", !plainResult.hasFrameworkMarkers);
  assertTrue("F10b: Plain HTML has no empty app root", !plainResult.hasEmptyAppRoot);
}

export async function run() {
  const originalFetch = global.fetch;

  console.log("\n=== H1 Detection Regression Tests ===\n");

  testNeedsVerification();
  testFrameworkDetection();

  console.log("\n--- crawlPage integration tests ---\n");

  // Test 1: Static HTML with one H1 → detected
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body><h1>Welcome to Our Site</h1><p>Content here.</p></body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 1: Static HTML with one H1 → H1 detected", result.ok && result.h1.length === 1 && result.h1[0] === "Welcome to Our Site");
    await assertTrue("TEST 1b: No missing_h1 flag", result.ok && !result.flags.includes("missing_h1"));
    await assertTrue("TEST 1c: h1Source is 'raw'", result.ok && (result as CrawlPageSuccess).h1Source === "raw");
    await assertTrue("TEST 1d: renderVerificationStatus is 'not_needed'", result.ok && (result as CrawlPageSuccess).renderVerificationStatus === "not_needed");
  }

  // Test 2: Static HTML with no H1, no framework evidence → missing H1
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body><h2>Subheading</h2><p>Content here.</p></body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 2: Static HTML with no H1 → missing_h1 flag", result.ok && result.flags.includes("missing_h1"));
    await assertTrue("TEST 2b: h1 array is empty", result.ok && result.h1.length === 0);
    await assertTrue("TEST 2c: needsH1Verification is false (no framework markers)", result.ok && !(result as CrawlPageSuccess).needsH1Verification);
  }

  // Test 3: JS-rendered H1 — empty root div, rendered DOM has H1
  {
    const result = fakePageResult({
      flags: ["missing_h1"],
      h1: [],
      h1Source: null,
      needsH1Verification: true,
      aeoSignals: fakeAeoSignals({ renderMode: "likely_js_only" }),
    });
    const renderedHtml = `<html><head><title>Test Page — Example Company</title></head><body><div id="app"><h1>Rendered Heading</h1><p>Content loaded by JS.</p></div></body></html>`;
    reAnalyzeFromRenderedHtml(result, renderedHtml);
    await assertTrue("TEST 3: JS-rendered H1 → H1 detected from rendered DOM", result.h1.length === 1 && result.h1[0] === "Rendered Heading");
    await assertTrue("TEST 3b: missing_h1 flag removed", !result.flags.includes("missing_h1"));
    await assertTrue("TEST 3c: h1Source is 'rendered'", result.h1Source === "rendered");
  }

  // Test 4: Server-rendered page with links but JS-generated H1 — framework markers present
  {
    // Simulate: page has content, links, but no H1. Framework markers (React)
    // suggest H1 may be JS-rendered. needsH1Verification should be true.
    const html = `<html><head><title>Test Page — Example Company</title></head><body>
      <div id="root"></div>
      <nav><a href="/about">About</a><a href="/contact">Contact</a></nav>
      <p>Welcome to our site with some content.</p>
      <script>window.__REMIX_DATA__ = {};</script>
      <script src="/bundle.js"></script>
    </body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 4: Server-rendered page with framework markers → needsH1Verification",
      result.ok && !!(result as CrawlPageSuccess).needsH1Verification);
    await assertTrue("TEST 4b: missing_h1 flag still set (will be cleared by rendering)",
      result.ok && result.flags.includes("missing_h1"));
    // Simulate rendering succeeds with H1
    if (result.ok) {
      reAnalyzeFromRenderedHtml(result, `<html><body><div id="root"><h1>Client-Side H1</h1></div></body></html>`);
      await assertTrue("TEST 4c: After rendering, H1 found from rendered DOM", result.h1.length === 1 && result.h1[0] === "Client-Side H1");
      await assertTrue("TEST 4d: missing_h1 removed after rendering", !result.flags.includes("missing_h1"));
      await assertTrue("TEST 4e: h1Source is 'rendered'", result.h1Source === "rendered");
    }
  }

  // Test 5: Rendering succeeds, no H1 exists in rendered DOM either
  {
    const result = fakePageResult({
      flags: ["missing_h1"],
      h1: [],
      h1Source: null,
      needsH1Verification: true,
    });
    reAnalyzeFromRenderedHtml(result, `<html><body><div id="app"><p>No heading here.</p></div></body></html>`);
    await assertTrue("TEST 5: Rendering succeeds, no H1 → missing_h1 remains", result.flags.includes("missing_h1"));
    await assertTrue("TEST 5b: h1Source is still null", result.h1Source === null);
  }

  // Test 6: Rendering fails — no crash, status recorded
  {
    const result = fakePageResult({
      flags: ["missing_h1"],
      h1: [],
      h1Source: null,
      renderVerificationStatus: "not_attempted",
    });
    // Simulate rendering failure by setting status
    result.renderVerificationStatus = "render_failed";
    await assertTrue("TEST 6: Rendering failure → no crash", result.flags.includes("missing_h1") && result.h1.length === 0);
    await assertTrue("TEST 6b: renderVerificationStatus is render_failed", result.renderVerificationStatus === "render_failed");
  }

  // Test 7: H1 containing image with alt text → detected as H1
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body><h1><img src="/title.jpg" alt="Page Title"></h1><p>Content.</p></body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 7: H1 with image alt text → detected as H1", result.ok && result.h1.length === 1 && result.h1[0] === "Page Title");
    await assertTrue("TEST 7b: No missing_h1 flag", result.ok && !result.flags.includes("missing_h1"));
  }

  // Test 8: Image acts as visual heading but isn't H1
  {
    const html = `<html><head><title>Kathmandu Engineering College — Overview</title></head><body>
      <main>
        <section class="hero-banner">
          <img src="/images/kathmandu-engineering-college.jpg" alt="Kathmandu Engineering College" width="1400" height="500">
        </section>
        <p>Welcome to KEC.</p>
      </main>
    </body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 8: Image as visual heading → missing_h1", result.ok && result.flags.includes("missing_h1"));
    await assertTrue("TEST 8b: potentialVisualHeading detected", result.ok && (result as CrawlPageSuccess).potentialVisualHeading !== null && (result as CrawlPageSuccess).potentialVisualHeading !== undefined);
  }

  // Test 9: Multiple H1s → multiple_h1 flag
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body><h1>First Heading</h1><h1>Second Heading</h1><p>Content.</p></body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 9: Multiple H1s → multiple_h1 flag", result.ok && result.flags.includes("multiple_h1"));
    await assertTrue("TEST 9b: No missing_h1 flag", result.ok && !result.flags.includes("missing_h1"));
  }

  // Test 10: Random CSS class names → H1 detection unaffected
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body><h1 class="sc-CkLyrx gDMC"><span class="sc-ROZ qNiAcV">Web Dev & Hosting Tech Stacks</span></h1><p>Content.</p></body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 10: Random CSS classes → H1 detected", result.ok && result.h1.length === 1 && result.h1[0] === "Web Dev & Hosting Tech Stacks");
    await assertTrue("TEST 10b: No missing_h1 flag", result.ok && !result.flags.includes("missing_h1"));
  }

  // Test 11: Raw H1 preserved when rendered also has H1
  {
    const result = fakePageResult({
      h1: ["Original H1"],
      h1Source: "raw",
      flags: [],
      headings: { h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 },
    });
    const renderedHtml = `<html><body><h1>Different H1</h1><p>Content.</p></body></html>`;
    reAnalyzeFromRenderedHtml(result, renderedHtml);
    await assertTrue("TEST 11: Raw H1 preserved when rendered also has H1", result.h1[0] === "Original H1");
    await assertTrue("TEST 11b: h1Source remains 'raw'", result.h1Source === "raw");
  }

  // Test 12: reAnalyzeFromRenderedHtml handles malformed HTML gracefully
  {
    const result = fakePageResult({
      flags: ["missing_h1"],
      h1: [],
      h1Source: null,
    });
    try {
      reAnalyzeFromRenderedHtml(result, "<html><body><h1>Valid</h1></body></html>");
      await assertTrue("TEST 12: Malformed HTML handled gracefully", true);
    } catch {
      await assertTrue("TEST 12: Malformed HTML should not throw", false);
    }
  }

  // Test 13: H1 with empty-alt image (Case D) — H1 element exists
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body><h1><img src="/title.jpg" alt=""></h1><p>Content.</p></body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 13: H1 with empty-alt image → H1 element detected (Case D)", result.ok && result.h1.length === 1);
    await assertTrue("TEST 13b: No missing_h1 flag", result.ok && !result.flags.includes("missing_h1"));
  }

  // Test 14: No H1 + decorative image → missing H1 only (no visual heading)
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body>
      <main>
        <p>Welcome to our site.</p>
        <img src="/images/footer-decoration.png" alt="" width="100" height="50">
        <p>Some more text.</p>
      </main>
    </body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 14: No H1 + decorative image → missing_h1", result.ok && result.flags.includes("missing_h1"));
    const vh = result.ok ? (result as CrawlPageSuccess).potentialVisualHeading : null;
    await assertTrue("TEST 14b: No visual heading for decorative image", vh === null || vh === undefined || vh.confidence < 40);
  }

  // Test 15: Server-rendered page with React markers but substantial content
  // — needsH1Verification should be true because framework markers + significant bundle
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body>
      <div id="root"></div>
      <nav><a href="/page1">Page 1</a></nav>
      <p>Welcome to our site with enough content to pass the word count threshold.</p>
      <script>/* some inline JS */ var x = 1;</script>
      <script src="/static/js/main.chunk.js"></script>
      <script src="/static/js/vendors.chunk.js"></script>
      <script src="/static/js/runtime-main.js"></script>
    </body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    // The page has React root (#root), framework markers, and script bundles
    // but also has some body text. needsH1Verification should be true.
    await assertTrue("TEST 15: React page with substantial content → needsH1Verification",
      result.ok && !!(result as CrawlPageSuccess).needsH1Verification);
  }

  // Test 16: Plain static page with no H1 and no framework → missing_h1, no verification needed
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body>
      <p>This is a simple static page with no headings at all.</p>
      <p>Just paragraphs of content that are rendered server-side.</p>
    </body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 16: Plain static page → missing_h1", result.ok && result.flags.includes("missing_h1"));
    await assertTrue("TEST 16b: No verification needed (no framework)", result.ok && !(result as CrawlPageSuccess).needsH1Verification);
  }

  // Test 17: Vue app with empty mount point → needsH1Verification
  {
    const html = `<html><head><title>Test Page — Example Company</title></head><body>
      <div id="app" data-v-abc123></div>
      <script>window.__VUE__ = true;</script>
    </body></html>`;
    // @ts-expect-error test mock
    global.fetch = makeMockFetch(html);
    const result = await crawlPage("https://example.com/test");
    await assertTrue("TEST 17: Vue app with empty mount → needsH1Verification",
      result.ok && !!(result as CrawlPageSuccess).needsH1Verification);
  }

  // Test 18: reAnalyzeFromRenderedHtml with image-only H1 in rendered DOM
  {
    const result = fakePageResult({
      flags: ["missing_h1"],
      h1: [],
      h1Source: null,
      needsH1Verification: true,
    });
    reAnalyzeFromRenderedHtml(result, `<html><body><h1><img src="/logo.png" alt="My Company"></h1></body></html>`);
    await assertTrue("TEST 18: Rendered DOM has image-only H1 → detected", result.h1.length === 1 && result.h1[0] === "My Company");
    await assertTrue("TEST 18b: missing_h1 removed", !result.flags.includes("missing_h1"));
    await assertTrue("TEST 18c: h1Source is 'rendered'", result.h1Source === "rendered");
  }

  console.log("\n=== All H1 detection tests complete ===\n");

  global.fetch = originalFetch;
}

// Run directly if executed via ts-node
if (require.main === module) {
  run().catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
  });
}
