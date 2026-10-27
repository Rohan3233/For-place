/**
 * Tests for checkBrokenLinks' duplicate-request elimination: links whose
 * health the crawl already proved must be reported ok WITHOUT a network
 * request, and links the crawl never visited must still be checked.
 * Run with: npm run test:brokenlinks (or: npx ts-node lib/crawler/brokenLinks.test.ts)
 */
import { checkBrokenLinks } from "./brokenLinks";
import type { CrawlPageResult, CrawlPageSuccess } from "./types";

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

/** Minimal CrawlPageSuccess fixture — only fields checkBrokenLinks reads. */
function okPage(
  url: string,
  internalLinks: string[],
  extra: Partial<Pick<CrawlPageSuccess, "redirected" | "requestedUrl" | "redirectHopUrls">> = {}
): CrawlPageResult {
  return {
    ok: true,
    url,
    requestedUrl: extra.requestedUrl ?? url,
    redirected: extra.redirected ?? false,
    internalLinks,
    // Type-only fields — not read by checkBrokenLinks, filled with dummies.
    fetchedAt: new Date().toISOString(),
    statusCode: 200,
    contentType: "text/html",
    title: { content: "T", length: 1 },
    metaDescription: { content: "D", length: 1 },
    h1: ["H1"],
    headings: { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    canonical: { url: null, isSelfReferencing: null },
    wordCount: 400,
    flags: [],
    structuredData: { present: false, types: [], format: null },
    robotsMeta: { noindex: false, nofollow: false },
    xRobotsTag: { raw: null, noindex: false },
    isOrphan: false,
    htmlLang: "en",
    aeoSignals: {} as CrawlPageSuccess["aeoSignals"],
    redirectHopCount: extra.redirected ? 1 : 0,
    redirectHopStatusCodes: extra.redirected ? [301] : [],
    ...(extra.redirectHopUrls ? { redirectHopUrls: extra.redirectHopUrls } : {}),
  } as unknown as CrawlPageResult;
}

/** Minimal failed-page fixture — the crawl already fetched it and got a definitive status. */
function failedPage(url: string, statusCode: number): CrawlPageResult {
  return {
    ok: false,
    url,
    fetchedAt: new Date().toISOString(),
    error: { type: "http_error", statusCode, message: `Received non-200 response: ${statusCode}` },
  };
}

export async function run() {
  const originalFetch = global.fetch;
  let fetchCount = 0;

  // Every real network check resolves 200 — we assert on how many requests
  // happened, not their outcome.
  // @ts-expect-error - simplified mock signature for testing
  global.fetch = async (input: string, init?: RequestInit) => {
    fetchCount++;
    return {
      ok: true,
      status: 200,
      url: input.toString(),
      headers: { get: () => null },
    } as unknown as Response;
  };

  const pages = [
    okPage("https://example.com/", ["https://example.com/", "https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/admin"]),
    okPage("https://example.com/a", ["https://example.com/a", "https://example.com/b", "https://example.com/d"], { redirected: true, requestedUrl: "https://example.com/old-a" }),
    okPage("https://example.com/b", ["https://example.com/b"]),
  ];

  const { results, skippedAsCrawled } = await checkBrokenLinks(pages, {
    userAgent: "test-bot",
    robotsDisallowedPaths: ["/admin"],
  });

  const byUrl = new Map(results.map((r) => [r.url, r]));

  // --- Test 1: every unique link still has a result entry --------------
  assertTrue("all 6 unique links reported", results.length === 6);
  assertTrue(
    "all expected URLs present",
    ["https://example.com/", "https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/d", "https://example.com/admin"].every((u) => byUrl.has(u))
  );

  // --- Test 2: crawl-proven links are ok with zero requests ------------
  assertTrue(
    "homepage link skipped (crawled ok)",
    byUrl.get("https://example.com/")!.ok === true && byUrl.get("https://example.com/")!.statusCode === 200
  );
  assertTrue(
    "link to crawled page /a skipped",
    byUrl.get("https://example.com/a")!.ok === true
  );
  assertTrue(
    "link to crawled page /b skipped",
    byUrl.get("https://example.com/b")!.ok === true
  );
  // /, /a, /b are all proven ok by the crawl — the redirect origin /old-a is
  // also proven (it redirected to the good /a), but no link points to it, so
  // it can't be skipped itself.
  assertTrue("skipped count = 3 crawled pages", skippedAsCrawled === 3);
  assertTrue("only unverified links made requests (2)", fetchCount === 2);

  // --- Test 3: unverified links still get a real check -----------------
  assertTrue(
    "unverified /c still checked",
    byUrl.get("https://example.com/c")!.ok === true && byUrl.get("https://example.com/c")!.statusCode === 200
  );
  assertTrue(
    "unverified /d still checked",
    byUrl.get("https://example.com/d")!.ok === true
  );

  // --- Test 4: robots precedence preserved ------------------------------
  const admin = byUrl.get("https://example.com/admin")!;
  assertTrue(
    "robots-disallowed link reports blocked_by_robots (no request)",
    admin.ok === false && admin.failureCategory === "blocked_by_robots" && admin.statusCode === null
  );

  // --- Test 5: equivalent spellings dedup to ONE check (normalized key) --
  {
    const fetchLog: string[] = [];
    // @ts-ignore - simplified mock signature for testing
    global.fetch = async (input: string) => {
      fetchLog.push(input.toString());
      return {
        ok: true,
        status: 200,
        url: input.toString(),
        headers: { get: () => null },
      } as unknown as Response;
    };

    const dupPages = [
      okPage("https://example.com/", [
        "https://example.com/c",
        "https://example.com/c/",
        "https://EXAMPLE.com/c",
        "https://example.com/c#frag",
      ]),
    ];
    const { results } = await checkBrokenLinks(dupPages, { userAgent: "test-bot" });
    assertTrue(
      "equivalent spellings merge into one result",
      results.length === 1 && results[0].url === "https://example.com/c"
    );
    assertTrue("only one network request for the merged link", fetchLog.length === 1);
  }

  // --- Test 6: host circuit breaker stops retrying a proven-slow host ----
  {
    const slowFetch = global.fetch;
    // @ts-ignore - simplified mock signature for testing
    global.fetch = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };

    const slowPages = [
      okPage("https://slow.example/", [
        "https://slow.example/1",
        "https://slow.example/2",
        "https://slow.example/3",
        "https://slow.example/4",
      ]),
    ];
    const { results, retries } = await checkBrokenLinks(slowPages, {
      userAgent: "test-bot",
      timeoutMs: 50,
      concurrency: 1,
    });
    assertTrue(
      "all links reported as timeout (never classified as broken)",
      results.length === 4 && results.every((r) => r.failureCategory === "timeout" && r.ok === false)
    );
    // First 3 links retried once each (2 attempts); the 4th hits the
    // circuit breaker and gets a single attempt — so 3 retries total, not 4.
    assertTrue("only pre-breaker links were retried (3, not 4)", retries === 3);
    global.fetch = slowFetch;
  }

  // --- Test 7: links the crawl already PROVED broken (definitive 4xx) are
  // --- reused with zero requests — same category/status/message as a live check.
  {
    const fetchLog: string[] = [];
    // @ts-ignore - simplified mock signature for testing
    global.fetch = async (input: string) => {
      fetchLog.push(input.toString());
      return {
        ok: true,
        status: 200,
        url: input.toString(),
        headers: { get: () => null },
      } as unknown as Response;
    };

    const pagesWithFailures: CrawlPageResult[] = [
      okPage("https://example.com/", [
        "https://example.com/gone",
        "https://example.com/blocked",
        "https://example.com/live",
        "https://example.com/slow",
      ]),
      failedPage("https://example.com/gone", 404),
      failedPage("https://example.com/blocked", 403),
      failedPage("https://example.com/slow", 503), // 5xx — NOT reused (could clear)
    ];
    const { results, reusedAsBroken } = await checkBrokenLinks(pagesWithFailures, {
      userAgent: "test-bot",
    });
    const byUrl = new Map(results.map((r) => [r.url, r]));
    const gone = byUrl.get("https://example.com/gone")!;
    assertTrue(
      "crawl-proven 404 reused as not_found with no request",
      gone.ok === false && gone.failureCategory === "not_found" && gone.statusCode === 404
    );
    const blocked = byUrl.get("https://example.com/blocked")!;
    assertTrue(
      "crawl-proven 403 reused as forbidden with the crawler-blocked message",
      blocked.ok === false &&
        blocked.failureCategory === "forbidden" &&
        blocked.statusCode === 403 &&
        (blocked.errorMessage ?? "").includes("Crawler blocked")
    );
    assertTrue(
      "5xx crawl failure is NOT reused (still live-checked, since it could clear)",
      byUrl.get("https://example.com/slow")!.ok === true
    );
    assertTrue(
      "reusedAsBroken counter = 2 (404 + 403), only the 5xx and live link made requests",
      reusedAsBroken === 2 && fetchLog.length === 2
    );
  }

  // --- Test 8: redirect hop URLs recorded by the crawl are known-ok — a
  // --- link pointing at a redirect target resolves fine, so no request.
  {
    const fetchLog: string[] = [];
    // @ts-ignore - simplified mock signature for testing
    global.fetch = async (input: string) => {
      fetchLog.push(input.toString());
      return {
        ok: true,
        status: 200,
        url: input.toString(),
        headers: { get: () => null },
      } as unknown as Response;
    };

    const hopPages = [
      okPage("https://example.com/", ["https://example.com/mid-redir", "https://example.com/final"], {
        redirected: true,
        requestedUrl: "https://example.com/old-redir",
        redirectHopUrls: ["https://example.com/mid-redir", "https://example.com/final"],
      }),
      okPage("https://example.com/final", ["https://example.com/needs-check"]),
    ];
    const { results, skippedAsCrawled } = await checkBrokenLinks(hopPages, {
      userAgent: "test-bot",
    });
    const byUrl = new Map(results.map((r) => [r.url, r]));
    assertTrue(
      "link to a redirect hop URL (mid-redir) is crawl-proven ok with no request",
      byUrl.get("https://example.com/mid-redir")!.ok === true && !fetchLog.includes("https://example.com/mid-redir")
    );
    assertTrue(
      "link to the chain's final URL is crawl-proven ok with no request",
      byUrl.get("https://example.com/final")!.ok === true && !fetchLog.includes("https://example.com/final")
    );
    assertTrue(
      "an unrelated unverified link still gets a real request",
      byUrl.get("https://example.com/needs-check")!.ok === true && fetchLog.includes("https://example.com/needs-check")
    );
    assertTrue(
      "skippedAsCrawled includes the hop + final reuses (2 skipped of 3 links)",
      skippedAsCrawled === 2
    );
  }

  global.fetch = originalFetch;
  console.log("\nDone. If all lines above say PASS, known-ok + crawl-failure reuse works.");
}

if (require.main === module) {
  run();
}
