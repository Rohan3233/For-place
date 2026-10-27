/**
 * Sanity tests for crawlSite: maxPages cap, robots.txt blocking, dedup.
 * Run with: npm run test:site
 */
import { crawlSite } from "./crawlSite";

// A tiny fake 6-page site: homepage links to /a, /b, /c, /admin (blocked by
// robots.txt), and /d. /a and /b share an identical title on purpose to
// test duplicate detection.
const PAGES: Record<string, string> = {
  "https://example.com/": `
    <html><head><title>Example Home</title>
    <meta name="description" content="This is the homepage of example.com used purely for testing the crawler logic here."></head>
    <body>
      <h1>Home</h1>
      <a href="/a">A</a>
      <a href="/b">B</a>
      <a href="/c">C</a>
      <a href="/admin">Admin</a>
      <a href="/d">D</a>
      <a href="/logo.png">Logo</a>
      <a href="/style.css">Style</a>
    </body></html>`,
  "https://example.com/a": `
    <html><head><title>Shared Title</title>
    <meta name="description" content="Page A description text that is long enough to pass the length check for testing."></head>
    <body><h1>A</h1></body></html>`,
  "https://example.com/b": `
    <html><head><title>Shared Title</title>
    <meta name="description" content="Page B has a different description text that is also long enough to pass the check."></head>
    <body><h1>B</h1></body></html>`,
  "https://example.com/c": `
    <html><head><title>Page C</title>
    <meta name="description" content="Page C description text that is long enough to pass the length check for testing too."></head>
    <body><h1>C</h1></body></html>`,
  "https://example.com/d": `
    <html><head><title>Page D</title>
    <meta name="description" content="Page D description text that is long enough to pass the length check for testing here."></head>
    <body><h1>D</h1></body></html>`,
  "https://example.com/admin": `<html><head><title>Admin</title></head><body>secret</body></html>`,
};

const ROBOTS_TXT = `User-agent: *\nDisallow: /admin`;

function mockFetch(input: string, init?: RequestInit) {
  const url = input.toString();
  const method = init?.method ?? "GET";

  if (url.endsWith("/robots.txt")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      url,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "text/plain" : null) },
      text: async () => ROBOTS_TXT,
    } as unknown as Response);
  }
  if (url.endsWith("/sitemap.xml")) {
    return Promise.resolve({
      ok: false,
      status: 404,
      url,
      headers: { get: () => null },
      text: async () => "",
    } as unknown as Response);
  }

  const path = new URL(url).toString();
  const html = PAGES[path];

  if (method === "HEAD") {
    // No redirects in this fixture — every HEAD resolves directly, 0 hops.
    return Promise.resolve({
      ok: !!html,
      status: html ? 200 : 404,
      url,
      headers: { get: () => null },
    } as unknown as Response);
  }

  if (!html) {
    return Promise.resolve({
      ok: false,
      status: 404,
      statusText: "Not Found",
      url,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null) },
      text: async () => "",
    } as unknown as Response);
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    url,
    headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null) },
    text: async () => html,
  } as unknown as Response);
}

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

/** Response-shaped object for the mocked global.fetch. */
function mockResponse(status: number, body: string, contentType = "text/html") {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    url: "",
    headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => body,
  } as unknown as Response);
}

/**
 * JS-shell homepage: no <a href> in the raw HTML (nav is client-side), but
 * a sitemap lists pages that FAIL to fetch. This is the "1 page crawled,
 * 2 queued, 2 failed" scenario that must surface as low coverage rather
 * than a silent one-page success.
 */
const SHELL_PAGES: Record<string, string> = {
  "https://example.com/": `<html><head><title>Shell Home</title></head><body><div id="app"></div></body></html>`,
};
function makeShellSiteFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input.toString();
  const method = init?.method ?? "GET";
  if (url.endsWith("/robots.txt")) return mockResponse(404, "");
  if (url.endsWith("/sitemap.xml")) {
    return mockResponse(
      200,
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/shell-a</loc></url><url><loc>https://example.com/shell-b</loc></url></urlset>`,
      "application/xml"
    );
  }

  if (method === "HEAD") return mockResponse(200, "");
  const html = SHELL_PAGES[new URL(url).toString()];
  if (html) return mockResponse(200, html);
  // shell-a / shell-b exist in the sitemap but fail when fetched
  return mockResponse(500, "<html><body>error</body></html>");
}

/**
 * Sitemap INDEX site: /sitemap.xml is an index pointing at /sub-sitemap.xml
 * which lists the real pages. The index children must be expanded into page
 * URLs — never crawled as XML files.
 */
function makeIndexSiteFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input.toString();
  const method = init?.method ?? "GET";
  if (url.endsWith("/robots.txt")) return mockResponse(404, "");
  if (url.endsWith("/sitemap.xml")) {
    return mockResponse(
      200,
      `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/sub-sitemap.xml</loc></sitemap></sitemapindex>`,
      "application/xml"
    );
  }
  if (url.endsWith("/sub-sitemap.xml")) {
    return mockResponse(
      200,
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/sitemap-discovered-page-1</loc></url><url><loc>https://example.com/sitemap-discovered-page-2</loc></url></urlset>`,
      "application/xml"
    );
  }
  if (method === "HEAD") return mockResponse(200, "");
  const html =
    url.includes("/sitemap-discovered-page")
      ? `<html><head><title>Discovered ${url.slice(-1)}</title></head><body><h1>${url}</h1></body></html>`
      : `<html><head><title>Home</title></head><body><h1>Home</h1></body></html>`;
  return mockResponse(200, html);
}

/**
 * www-variant site: the homepage links ONLY to the www variant of itself
 * (absolute URLs) — those must count as internal and be crawled.
 */
function makeWwwVariantFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input.toString();
  const method = init?.method ?? "GET";
  if (url.endsWith("/robots.txt")) return mockResponse(404, "");
  if (url.endsWith("/sitemap.xml")) return mockResponse(404, "");
  if (method === "HEAD") return mockResponse(200, "");
  if (url === "https://example.com/") {
    return mockResponse(
      200,
      `<html><head><title>Home</title></head><body><a href="https://www.example.com/www-page">Www page</a></body></html>`
    );
  }
  if (url === "https://www.example.com/www-page") {
    return mockResponse(200, `<html><head><title>Www page</title></head><body><h1>Www page</h1></body></html>`);
  }
  return mockResponse(404, "");
}

/**
 * Robots.txt that disallows everything — the crawl must surface this as
 * blocked-by-robots + low coverage instead of a silent empty success.
 */
function makeBlockingRobotsFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input.toString();
  const method = init?.method ?? "GET";
  if (url.endsWith("/robots.txt")) {
    return mockResponse(200, `User-agent: *\nDisallow: /`, "text/plain");
  }
  if (url.endsWith("/sitemap.xml")) return mockResponse(404, "");
  if (method === "HEAD") return mockResponse(200, "");
  return mockResponse(200, `<html><head><title>Blocked</title></head><body>x</body></html>`);
}

/**
 * Site served on a NON-DEFAULT port (staging/preview/intranet). Regression
 * test for the rootHost port bug: the client-host check compared a
 * portless hostname against a host string that still carried the port, so
 * every page on a ported origin was dropped as "not the client's site" and
 * the crawl silently returned zero pages.
 */
const PORTED_PAGES: Record<string, string> = {
  "http://127.0.0.1:8080/": `<html><head><title>Ported Home</title></head><body><h1>Home</h1><a href="/about">About</a></body></html>`,
  "http://127.0.0.1:8080/about": `<html><head><title>Ported About</title></head><body><h1>About</h1></body></html>`,
};
function makePortedSiteFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input.toString();
  const method = init?.method ?? "GET";
  if (url.endsWith("/robots.txt")) return mockResponse(404, "");
  if (url.endsWith("/sitemap.xml")) return mockResponse(404, "");
  if (method === "HEAD") return mockResponse(200, "");
  const html = PORTED_PAGES[url];
  if (html) return mockResponse(200, html);
  return mockResponse(404, "");
}

/** Genuinely one-page site: no links, no sitemap — must NOT be flagged. */
function makeOnePageSiteFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input.toString();
  const method = init?.method ?? "GET";
  if (url.endsWith("/robots.txt")) return mockResponse(404, "");
  if (url.endsWith("/sitemap.xml")) return mockResponse(404, "");
  if (method === "HEAD") return mockResponse(200, "");
  return mockResponse(200, `<html><head><title>One Page</title></head><body><h1>One page</h1></body></html>`);
}

export async function run() {
  const originalFetch = global.fetch;
  // @ts-expect-error - simplified mock signature for testing
  global.fetch = mockFetch;

  // --- Test 1: maxPages cap is respected even though 6 pages exist ---
  const capped = await crawlSite("https://example.com/", { maxPages: 3 });
  assertTrue("crawled exactly maxPages pages (cap enforced)", capped.pages.length === 3);
  assertTrue("maxPagesReached flag is true", capped.maxPagesReached === true);

  // --- Test 2: robots.txt blocks /admin, with enough budget to reach it ---
  const full = await crawlSite("https://example.com/", { maxPages: 10 });
  assertTrue(
    "admin page skipped due to robots.txt",
    full.pagesSkippedRobots.some((u) => u.includes("/admin"))
  );
  assertTrue(
    "admin page never appears in crawled pages",
    !full.pages.some((p) => p.url.includes("/admin"))
  );

  // --- Test 3: duplicate title detection across pages A and B ---
  assertTrue(
    "duplicate title (A and B) detected",
    full.duplicateTitles.some(
      (d) => d.value === "shared title" && d.urls.length === 2
    )
  );
  assertTrue(
    "no false duplicate on unique descriptions",
    full.duplicateMetaDescriptions.length === 0
  );

  // --- Test 4: no duplicate pages crawled (dedup working) ---
  const urls = full.pages.map((p) => p.url);
  assertTrue("no duplicate URLs in crawled results", new Set(urls).size === urls.length);

  // --- Test 5: malformed rootUrl never throws, degrades to a clean error result ---
  let threwOnInvalidUrl = false;
  let invalidUrlResult;
  try {
    invalidUrlResult = await crawlSite("not a valid url at all", { maxPages: 5 });
  } catch {
    threwOnInvalidUrl = true;
  }
  assertTrue("malformed rootUrl does not throw out of crawlSite", threwOnInvalidUrl === false);
  assertTrue(
    "malformed rootUrl produces a single invalid_url error page instead",
    invalidUrlResult !== undefined &&
      invalidUrlResult.pages.length === 1 &&
      !invalidUrlResult.pages[0].ok &&
      invalidUrlResult.pages[0].error.type === "invalid_url"
  );

  // --- Test 6: onPage fires exactly once per pushed page (streaming hook) ---
  const seen: string[] = [];
  const streamed = await crawlSite("https://example.com/", {
    maxPages: 10,
    onPage: (page) => {
      seen.push(page.url);
    },
  });
  assertTrue(
    "onPage fired once for every page that entered results",
    seen.length === streamed.pages.length
  );
  assertTrue(
    "onPage saw the same URLs that were crawled",
    seen.slice().sort().join("|") === streamed.pages.map((p) => p.url).sort().join("|")
  );

  // --- Test 7: terminationReason records WHY the crawl stopped ---
  assertTrue(
    "terminationReason is max_pages_reached when the cap was hit",
    capped.terminationReason === "max_pages_reached"
  );
  assertTrue(
    "terminationReason is crawl_complete when the queue drained",
    full.terminationReason === "crawl_complete"
  );
  assertTrue(
    "metrics.succeededCount matches ok pages",
    full.metrics.succeededCount === full.pages.filter((p) => p.ok).length
  );
  assertTrue(
    "metrics.queuedCount > 0 (discovery happened)",
    full.metrics.queuedCount > 1
  );
  assertTrue(
    "metrics.blockedByRobotsCount counts the /admin skip",
    full.metrics.blockedByRobotsCount === 1
  );

  // --- Test 8: asset URLs are never requested as pages ---
  const assetSite = await crawlSite("https://example.com/", {
    maxPages: 10,
  });
  assertTrue(
    "no asset URL appears in crawled pages",
    !assetSite.pages.some((p) => /\.(png|jpg|css)$/.test(p.url))
  );

  // --- Test 9: low-coverage sanity check fires when discovery found pages
  // --- but nothing could be crawled (JS-shell homepage, no sitemap).
  global.fetch = makeShellSiteFetch;
  const shellCrawl = await crawlSite("https://example.com/", { maxPages: 10 });
  const shellOk = shellCrawl.pages.filter((p) => p.ok).length;
  const shellFailed = shellCrawl.pages.filter((p) => !p.ok).length;
  assertTrue(
    "JS-shell homepage crawls 1 page and the sitemap pages fail (1 ok + 2 failed)",
    shellOk === 1 && shellFailed === 2
  );
  assertTrue(
    "low-coverage is DETECTED when the shell hid the rest of the site",
    shellCrawl.lowCoverage.detected === true
  );
  assertTrue(
    "low-coverage reason cites the sitemap as missing evidence source",
    shellCrawl.lowCoverage.reasons.some((r) => /sitemap/i.test(r))
  );

  // --- Test 10: sitemap INDEX files are expanded, never crawled as pages ---
  global.fetch = makeIndexSiteFetch;
  const indexSite = await crawlSite("https://example.com/", { maxPages: 10 });
  assertTrue(
    "sitemap index sub-sitemap XML is never crawled as a page",
    !indexSite.pages.some((p) => /sitemap.*\.xml/.test(p.url))
  );
  assertTrue(
    "pages discovered through the expanded sitemap index ARE crawled",
    indexSite.pages.some((p) => p.url.includes("/sitemap-discovered-page"))
  );
  assertTrue(
    "metrics.sitemapIndexFilesExpanded counts the index",
    indexSite.metrics.sitemapIndexFilesExpanded >= 1
  );
  assertTrue(
    "metrics.sitemapUrlsCount includes sitemap-seeded URLs",
    indexSite.metrics.sitemapUrlsCount >= 1
  );

  // --- Test 11: www/non-www variants of the same site are internal links ---
  global.fetch = makeWwwVariantFetch;
  const wwwSite = await crawlSite("https://example.com/", { maxPages: 10 });
  assertTrue(
    "link to the www variant of the same site is treated as internal and crawled",
    wwwSite.pages.some((p) => p.url === "https://www.example.com/www-page")
  );
  assertTrue(
    "metrics.externalLinksIgnoredCount does NOT count the www variant",
    wwwSite.metrics.externalLinksIgnoredCount === 0
  );

  // --- Test 12: robots blocking everything surfaces as low coverage with a
  // --- blocked reason (not a silent one-page success).
  global.fetch = makeBlockingRobotsFetch;
  const blocked = await crawlSite("https://example.com/", { maxPages: 10 });
  assertTrue(
    "robots-blocked URLs are counted in pagesSkippedRobots",
    blocked.pagesSkippedRobots.length > 0
  );
  assertTrue(
    "low-coverage reason cites robots-blocked URLs when everything was skipped",
    blocked.lowCoverage.detected === true &&
      blocked.lowCoverage.reasons.some((r) => /robots\.txt/i.test(r))
  );

  // --- Test 12b: a site on a NON-DEFAULT port crawls normally (the old
  // --- rootHost-with-port bug silently dropped every page).
  global.fetch = makePortedSiteFetch;
  const ported = await crawlSite("http://127.0.0.1:8080/", { maxPages: 10 });
  assertTrue(
    "ported-origin site crawls both pages (homepage + /about)",
    ported.pages.length === 2 && ported.pages.every((p) => p.ok)
  );
  assertTrue(
    "ported-origin internal links are discovered",
    ported.pages.some((p) => p.url === "http://127.0.0.1:8080/about")
  );

  // --- Test 13: a genuinely one-page site is NOT flagged as low coverage ---
  global.fetch = makeOnePageSiteFetch;
  const onePage = await crawlSite("https://example.com/", { maxPages: 10 });
  assertTrue(
    "genuine one-page site crawls exactly 1 page",
    onePage.pages.length === 1 && onePage.pages[0].ok
  );
  assertTrue(
    "genuine one-page site is NOT flagged as low coverage",
    onePage.lowCoverage.detected === false
  );
  assertTrue(
    "genuine one-page site records crawl_complete",
    onePage.terminationReason === "crawl_complete"
  );

  global.fetch = originalFetch;
  console.log("\nDone. If all lines above say PASS, Stage 2 core logic is working.");
}

if (require.main === module) {
  run();
}
