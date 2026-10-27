/**
 * Sanity tests for the cache layer wired into runAudit.
 * Run with: npm run test:cache
 *
 * The key thing under test isn't "does the cache store data" — it's "does
 * a cache hit actually skip the crawl/PageSpeed work entirely," since
 * that's the whole point (protecting API cost/margin).
 */
import { runAudit } from "./runAudit";
import { InMemoryCacheProvider, domainCacheKey } from "./cache";

const HOMEPAGE_HTML = `
<html><head><title>Example</title>
<meta name="description" content="A description long enough to pass the length check for this test fixture here.">
</head><body><h1>Example</h1></body></html>
`;

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

export async function run() {
  const originalFetch = global.fetch;
  let fetchCallCount = 0;

  // @ts-expect-error - simplified mock signature for testing
  global.fetch = async (input: string, init?: RequestInit) => {
    fetchCallCount++;
    const url = input.toString();
    if (url.endsWith("/robots.txt") || url.endsWith("/sitemap.xml")) {
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" };
    }
    return {
      ok: true,
      status: 200,
      url,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null) },
      text: async () => HOMEPAGE_HTML,
    };
  };

  const cache = new InMemoryCacheProvider();
  const testUrl = "https://www.example.com/";

  // --- Test 1: first audit is a cache miss and does real fetch work ---
  const first = await runAudit(testUrl, {
    maxPages: 1,
    fetchPageSpeed: false, // keep the fixture simple — PageSpeed tested separately
    cacheProvider: cache,
  });
  const callsAfterFirst = fetchCallCount;
  assertTrue("first audit is not from cache", first.fromCache === false);
  assertTrue("first audit made real fetch calls", callsAfterFirst > 0);

  // --- Test 2: second audit of the SAME domain hits cache, makes zero new fetch calls ---
  const second = await runAudit(testUrl, {
    maxPages: 1,
    fetchPageSpeed: false,
    cacheProvider: cache,
  });
  assertTrue("second audit is served from cache", second.fromCache === true);
  assertTrue(
    "second audit made no additional fetch calls (this is the actual point of caching)",
    fetchCallCount === callsAfterFirst
  );
  assertTrue(
    "cached result has the same score as the original",
    second.score.overallScore === first.score.overallScore
  );

  // --- Test 3: www vs non-www resolves to the same cache entry ---
  const nonWww = await runAudit("https://example.com/", {
    maxPages: 1,
    fetchPageSpeed: false,
    cacheProvider: cache,
  });
  assertTrue("www and non-www share a cache entry", nonWww.fromCache === true);
  assertTrue(
    "no extra fetch calls for the www/non-www variant",
    fetchCallCount === callsAfterFirst
  );

  // --- Test 4: skipCache forces a real audit even with a fresh cache entry ---
  const forced = await runAudit(testUrl, {
    maxPages: 1,
    fetchPageSpeed: false,
    cacheProvider: cache,
    skipCache: true,
  });
  assertTrue("skipCache bypasses the cache", forced.fromCache === false);
  assertTrue("skipCache triggers new fetch calls", fetchCallCount > callsAfterFirst);

  // --- Test 5: domainCacheKey normalizes www ---
  assertTrue(
    "domainCacheKey strips www",
    domainCacheKey("https://www.example.com/") === domainCacheKey("https://example.com/")
  );

  // --- Test 6: a broken cache provider must not take down the audit ---
  // (this is the never-throw contract every other module in this codebase
  // follows — a cache outage should degrade to "no caching," not crash)
  const brokenCache = {
    get: async () => {
      throw new Error("simulated cache provider outage");
    },
    set: async () => {
      throw new Error("simulated cache provider outage");
    },
  };
  let brokenCacheThrew = false;
  let brokenCacheResult;
  try {
    brokenCacheResult = await runAudit(testUrl, {
      maxPages: 1,
      fetchPageSpeed: false,
      cacheProvider: brokenCache,
    });
  } catch {
    brokenCacheThrew = true;
  }
  assertTrue("broken cache provider does not throw out of runAudit", brokenCacheThrew === false);
  assertTrue(
    "audit still completes successfully despite broken cache",
    brokenCacheResult !== undefined && brokenCacheResult.fromCache === false
  );

  // --- Test 7: malformed rootUrl never throws out of runAudit either ---
  // (domainCacheKey() parses the URL internally — this proves the guard
  // around that call actually works, not just the crawlSite-level one)
  let threwOnInvalidUrl = false;
  let invalidUrlAuditResult;
  try {
    invalidUrlAuditResult = await runAudit("not a valid url at all", {
      maxPages: 5,
      fetchPageSpeed: false,
      cacheProvider: cache,
    });
  } catch {
    threwOnInvalidUrl = true;
  }
  assertTrue("malformed rootUrl does not throw out of runAudit", threwOnInvalidUrl === false);
  assertTrue(
    "malformed rootUrl still produces a result with the crawl error surfaced",
    invalidUrlAuditResult !== undefined &&
      invalidUrlAuditResult.crawl.pages.length === 1 &&
      !invalidUrlAuditResult.crawl.pages[0].ok
  );

  global.fetch = originalFetch;
  console.log("\nDone. If all lines above say PASS, caching is correctly preventing redundant work.");
}

if (require.main === module) {
  run();
}
