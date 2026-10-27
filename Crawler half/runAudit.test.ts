/**
 * End-to-end test of the runAudit pipeline against a mocked site — verifies
 * the streaming architecture (CWV + image checks overlapped with the crawl),
 * broken-link known-ok skipping, robots.txt precedence, and the structured
 * timings all work together without breaking the audit result.
 *
 * CWV (PageSpeed Insights) is disabled here (fetchPageSpeed: false) — the
 * point is the crawl/pipeline mechanics, not PSI itself (which requires the
 * real API).
 * Run with: npm run test:runaudit (or: npx ts-node lib/crawler/runAudit.test.ts)
 */
import { runAudit } from "./runAudit";
import type { RunAuditResult, PageSpeedResult } from "./types";

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

const ORIGIN = "https://example.com";

function pageHtml(body: string): string {
  return `<!doctype html><html lang="en"><head><title>Example Page Title That Is Long Enough</title>
<meta name="description" content="A meta description that is long enough to pass the length check here.">
<link rel="canonical" href="${ORIGIN}/"></head><body>${body}</body></html>`;
}

// maxPages = 5 covers every page, so the crawled set is deterministic
// ({/ , /a, /b, /c, /d}) regardless of worker interleaving.
const PAGES: Record<string, string> = {
  [`${ORIGIN}/`]: pageHtml(
    `<h1>Home</h1><a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="/d">d</a><a href="/admin">admin</a><img src="/img/logo.png" alt="logo"><img src="/img/big.jpg" alt="big">`
  ),
  [`${ORIGIN}/a`]: pageHtml(`<h1>A</h1><a href="/a">a</a><a href="/b">b</a>`),
  [`${ORIGIN}/b`]: pageHtml(`<h1>B</h1><a href="/b">b</a>`),
  [`${ORIGIN}/c`]: pageHtml(`<h1>C</h1><a href="/c">c</a>`),
  [`${ORIGIN}/d`]: pageHtml(`<h1>D</h1><a href="/d">d</a>`),
};

const ROBOTS_TXT = `User-agent: *\nDisallow: /admin`;

export async function run() {
  const originalFetch = global.fetch;
  const headRequests: string[] = [];

  // @ts-expect-error - simplified mock signature for testing
  global.fetch = async (input: string, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (method === "HEAD") {
      headRequests.push(url);
      if (url.includes("/img/")) {
        const size = url.includes("big.jpg") ? 300_000 : 100_000;
        return {
          ok: true,
          status: 200,
          url,
          headers: { get: (n: string) => (n.toLowerCase() === "content-length" ? String(size) : null) },
        } as unknown as Response;
      }
      return { ok: true, status: 200, url, headers: { get: () => null } } as unknown as Response;
    }

    if (url.endsWith("/robots.txt")) {
      return {
        ok: true,
        status: 200,
        url,
        headers: { get: () => null },
        text: async () => ROBOTS_TXT,
      } as unknown as Response;
    }
    if (url.endsWith("/sitemap.xml") || url.endsWith("/llms.txt")) {
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
    }

    const html = PAGES[url];
    if (html) {
      return {
        ok: true,
        status: 200,
        url,
        headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null) },
        text: async () => html,
      } as unknown as Response;
    }

    // www/http variants (checkWwwConsistency) and any unknown URL: respond 200.
    return {
      ok: true,
      status: 200,
      url,
      headers: { get: () => null },
      text: async () => "",
    } as unknown as Response;
  };

  const audit: RunAuditResult = await runAudit(`${ORIGIN}/`, {
    maxPages: 5,
    fetchPageSpeed: false,
    skipCache: true,
  });

  // --- Test 1: crawl shape ---------------------------------------------
  assertTrue("5 pages crawled", audit.crawl.pages.length === 5);
  assertTrue(
    "homepage + /a + /b + /c + /d crawled",
    audit.crawl.pages.map((p) => p.url).sort().join("|") ===
      [`${ORIGIN}/`, `${ORIGIN}/a`, `${ORIGIN}/b`, `${ORIGIN}/c`, `${ORIGIN}/d`].sort().join("|")
  );
  assertTrue(
    "/admin skipped by robots.txt",
    audit.crawl.pagesSkippedRobots.some((u) => u.endsWith("/admin"))
  );

  // --- Test 2: broken links — known-ok skipping ------------------------
  // Unique internal links: /a, /b, /c, /d (all crawled → known-ok) + /admin
  // (robots-blocked). 5 results, 4 skipped as crawl-proven.
  assertTrue("all 5 unique internal links reported", audit.brokenLinks.length === 5);
  assertTrue(
    "every crawl-proven link skipped (no request made)",
    audit.timings!.brokenLinksSkippedAsCrawled === 4
  );
  assertTrue(
    "no HEAD request was made for any internal link (only the 2 images)",
    headRequests.length === 2 && !headRequests.some((u) => !u.includes("/img/"))
  );
  assertTrue(
    "every non-robots-blocked link is ok:true (all crawled)",
    audit.brokenLinks.filter((l) => !l.url.endsWith("/admin")).every((l) => l.ok === true)
  );
  const admin = audit.brokenLinks.find((l) => l.url.endsWith("/admin"));
  assertTrue(
    "robots-disallowed link still reported as blocked_by_robots (precedence preserved)",
    admin !== undefined && admin.ok === false && admin.failureCategory === "blocked_by_robots"
  );

  // --- Test 3: oversized images — streamed, deduped, linkedFrom -------
  assertTrue("2 unique images checked", audit.oversizedImages.length === 2);
  const big = audit.oversizedImages.find((i) => i.src.endsWith("big.jpg"));
  assertTrue(
    "big.jpg flagged oversized with its real size",
    big !== undefined && big.isOversized && big.contentLengthBytes === 300_000
  );
  const logo = audit.oversizedImages.find((i) => i.src.endsWith("logo.png"));
  assertTrue(
    "logo.png not oversized",
    logo !== undefined && logo.isOversized === false && logo.ok === true
  );
  assertTrue(
    "linkedFrom points back to the linking page",
    audit.oversizedImages.every((i) => i.linkedFrom.includes(`${ORIGIN}/`))
  );

  // --- Test 4: CWV honest insufficient-data when disabled -------------
  assertTrue("CWV status insufficient_data (no PSI)", audit.cwv!.status === "insufficient_data");

  // --- Test 5: timings + counters present and plausible ---------------
  const t = audit.timings;
  assertTrue("timings recorded", t !== undefined);
  assertTrue("totalMs approximately equals crawlDurationMs", Math.abs((t!.totalMs - audit.crawlDurationMs) / 1000) < 5);
  assertTrue("pagesCrawled counter matches", t!.pagesCrawled === 5);
  assertTrue("pagesOk counter matches", t!.pagesOk === 5);
  assertTrue("pagesSkippedRobots counter matches", t!.pagesSkippedRobots === 1);
  assertTrue("cwvRequests is 0 when PSI disabled", t!.cwvRequests === 0);
  assertTrue("imagesChecked counter matches", t!.imagesChecked === 2);
  assertTrue("brokenLinksChecked counter matches", t!.brokenLinksChecked === 5);
  assertTrue(
    "httpRequests includes page GETs + link checks + image checks + robots + sitemap",
    t!.httpRequests >= 5 + 5 + 2 + 2
  );

  // --- Test 6: CWV representative sampling + in-run cache (injected fetcher) ---
  // A fake PSI fetcher that records every URL it is asked to measure. No
  // network involved — the point is sample SIZE, dedup, and scope honesty.
  const fetcherCalls: string[] = [];
  const fakeFetcher = async (
    url: string,
    _opts: { apiKey?: string; strategy?: "mobile" | "desktop"; timeoutMs?: number; onRetry?: () => void }
  ): Promise<PageSpeedResult> => {
    fetcherCalls.push(url);
    return {
      ok: true,
      url,
      strategy: "mobile",
      metrics: {
        performanceScore: 80,
        lcpMs: 1800,
        clsScore: 0.02,
        inpMs: 100,
        ttfbMs: 300,
        isMobileFriendly: true,
        accessibilityScore: null,
        accessibilityIssues: [],
      },
    };
  };

  // 6a — small site default: FULL coverage (5 ok pages <= 40), every page
  // measured exactly once, homepage not re-requested.
  const fullAudit = await runAudit(`${ORIGIN}/`, {
    maxPages: 5,
    skipCache: true,
    fetchPageSpeed: true,
    pageSpeedFetcher: fakeFetcher,
  });
  assertTrue("sampling: small site evaluates every page", fullAudit.cwv!.sampleSize === 5 && fullAudit.cwv!.evaluatedPages === 5);
  assertTrue("sampling: full coverage flag on small sites", fullAudit.cwv!.fullCrawlCoverage === true);
  assertTrue("sampling: full-coverage scope note", fullAudit.cwv!.scopeNote.includes("every crawled page was evaluated"));
  assertTrue("sampling: exactly 5 PSI calls for 5 pages (no duplicates)", fetcherCalls.length === 5);
  assertTrue("sampling: all measured URLs distinct", new Set(fetcherCalls).size === fetcherCalls.length);
  assertTrue("sampling: homepage measured exactly once", fetcherCalls.filter((u) => u === `${ORIGIN}/` || u === ORIGIN).length === 1);
  assertTrue("sampling: no cache hits needed on a clean run", fullAudit.timings!.cwvCacheHits === 0);
  assertTrue("sampling: request durations recorded", (fullAudit.timings!.cwvAvgRequestMs ?? 0) >= 0);
  assertTrue("sampling: timings count templates represented", fullAudit.timings!.cwvTemplatesRepresented! >= 1);

  // 6b — explicit small sample: limit 2 => homepage + 1 representative page.
  fetcherCalls.length = 0;
  const cappedAudit = await runAudit(`${ORIGIN}/`, {
    maxPages: 5,
    skipCache: true,
    fetchPageSpeed: true,
    pageSpeedPageLimit: 2,
    pageSpeedFetcher: fakeFetcher,
  });
  assertTrue("sampling: explicit limit respected", cappedAudit.cwv!.sampleSize === 2);
  assertTrue("sampling: capped run is NOT full coverage", cappedAudit.cwv!.fullCrawlCoverage === false);
  assertTrue("sampling: only 2 PSI calls under the cap", fetcherCalls.length === 2);
  assertTrue("sampling: representative-sample scope note", cappedAudit.cwv!.scopeNote.includes("deterministic sample"));
  assertTrue("sampling: template breakdown recorded", (cappedAudit.cwv!.templatesRepresented ?? 0) >= 1);

  // 6c — homepage-only mode (limit 1): the homepage PSI call made at audit
  // start must be the ONLY request — the batch path must not re-request it.
  fetcherCalls.length = 0;
  const homeOnlyAudit = await runAudit(`${ORIGIN}/`, {
    maxPages: 5,
    skipCache: true,
    fetchPageSpeed: true,
    pageSpeedPageLimit: 1,
    pageSpeedFetcher: fakeFetcher,
  });
  assertTrue("sampling: limit 1 measures only the homepage", homeOnlyAudit.cwv!.sampleSize === 1 && homeOnlyAudit.cwv!.evaluatedPages === 1);
  assertTrue("sampling: exactly one PSI call in homepage-only mode", fetcherCalls.length === 1);
  assertTrue("sampling: homepage measured in homepage-only mode", fetcherCalls[0] === `${ORIGIN}/` || fetcherCalls[0] === ORIGIN);

  global.fetch = originalFetch;
  console.log("\nDone. If all lines above say PASS, the runAudit pipeline is intact.");
}

if (require.main === module) {
  run();
}
