import { crawlPage } from "./crawlPage";
import { fetchRobotsOnce, isPathAllowed } from "./robots";
import { fetchSitemapOnce } from "./sitemap";
import { checkWwwConsistency } from "./wwwCheck";
import { CONCURRENCY, clampConcurrency } from "./concurrency";
// aeoSignals types used indirectly via CrawlPageSuccess.aeoSignals.renderMode
import { launchBrowser, renderPageWithBrowser, type BrowserInstance } from "./renderPage";
import type {
  CrawlSiteOptions,
  CrawlSiteResult,
  CrawlPageResult,
  CrawlPageSuccess,
  RedirectChainInfo,
  DuplicateGroup,
} from "./types";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; SEOAuditBot/0.1; +https://example.com/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const EXCESSIVE_REDIRECT_THRESHOLD = 3;

/**
 * Non-HTML asset extensions skipped at queue time — requesting these as
 * "pages" can only fail with non_html_content_type and wastes the page
 * budget and crawl time. Only applies when the PATH ends with the extension
 * and there is no query string (a URL like /download?id=42&fmt=pdf is a
 * real page; /logo.png is an asset).
 */
const ASSET_EXTENSION_RE =
  /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|woff2?|ttf|eot|otf|mp4|webm|mp3|wav|zip|gz|tar|pdf|docx?|xlsx?|pptx?)$/i;

function isAssetUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.search) return false; // query string — treat as a page
    return ASSET_EXTENSION_RE.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Identity / authentication / session flow paths — OAuth & SSO endpoints
 * (idp, sso, oauth, saml), login/sign-in/logout pages, and checkout. These
 * are dynamically generated application routes, not content pages: they
 * carry session hashes and security query parameters by design, so crawling
 * them only produces meaningless findings (uppercase tokens, "too deep"
 * paths, empty H2) and wastes crawl budget. Matched on whole path segments
 * (segment START, case-insensitive) so a content article like
 * /blog/how-to-login-to-email is NOT dropped — only paths whose segment
 * actually begins with one of these markers.
 */
const AUTH_PATH_SEGMENT_PREFIXES = [
  "auth",
  "idp",
  "login",
  "signin",
  "sign-in",
  "sign_in",
  "logout",
  "sso",
  "oauth",
  "saml",
  "authorize",
  "callback",
  "checkout",
  "cart",
  "wp-admin",
  "wp-login",
  "api",
];

function isExcludedAuthPath(rawUrl: string): boolean {
  try {
    const segments = new URL(rawUrl).pathname.split("/").filter(Boolean);
    return segments.some((seg) => {
      const lower = seg.toLowerCase();
      return AUTH_PATH_SEGMENT_PREFIXES.some((prefix) => lower.startsWith(prefix));
    });
  } catch {
    return false;
  }
}

function emptyMetrics(): import("./types").CrawlMetrics {
  return {
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
  };
}

/**
 * Normalizes a URL for the purposes of the visited/queued dedup set only.
 * Does not mutate URLs used for actual fetching or reporting.
 */
function normalizeForDedup(rawUrl: string, ignoreQueryParams: boolean): string | null {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    if (ignoreQueryParams) u.search = "";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString().toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Crawls a whole site starting from rootUrl, up to options.maxPages.
 * Reuses crawlPage() (Stage 1) for the actual per-page extraction — this
 * function is purely about discovery, sequencing, and cross-page analysis.
 */
export async function crawlSite(
  rootUrl: string,
  options: CrawlSiteOptions
): Promise<CrawlSiteResult> {
  const {
    maxPages,
    timeoutMs = 10_000,
    userAgent = DEFAULT_USER_AGENT,
    respectRobotsTxt = true,
    useSitemap = true,
    ignoreQueryParams = true,
  } = options;
  const concurrency = clampConcurrency(options.concurrency, CONCURRENCY.crawl);

  // Guard against a malformed rootUrl up front. crawlPage() already handles
  // this gracefully for individual pages (invalid_url error, never throws);
  // crawlSite needs the same guard for its own top-level input, otherwise a
  // bad URL here throws straight out of the function before anything else
  // runs — breaking the never-throws contract every other module honors.
  let rootOrigin: string;
  try {
    rootOrigin = new URL(rootUrl).origin;
  } catch {
    return {
      rootUrl,
      crawledAt: new Date().toISOString(),
      maxPages,
      maxPagesReached: false,
      terminationReason: "crawl_complete",
      metrics: emptyMetrics(),
      lowCoverage: { detected: true, reasons: [`"${rootUrl}" is not a valid URL — nothing could be crawled.`] },
      pages: [
        {
          ok: false,
          url: rootUrl,
          fetchedAt: new Date().toISOString(),
          error: { type: "invalid_url", message: `"${rootUrl}" is not a valid URL.` },
        },
      ],
      pagesSkippedRobots: [],
      crawlRetries: 0,
      redirectChains: [],
      duplicateTitles: [],
      duplicateMetaDescriptions: [],
      robotsAudit: { status: "fetch_error", disallowedPaths: [] },
      sitemapAudit: { status: "fetch_error", urlCount: 0 },
      orphanPages: [],
      wwwConsistency: { checked: false, consistent: true, canonicalHost: null, variantResults: [], variantProbes: [], summary: null, issue: null },
      robotsTxtRaw: null,
    };
  }

  // Effective site host for internal-link matching: the www-stripped
  // hostname of the configured root, passed to every page fetch so links to
  // the www/non-www variant of the same site are treated as internal (see
  // crawlPage.ts's crawlHost handling).
  const crawlHost = new URL(rootOrigin).hostname.replace(/^www\./i, "");

  // --- Live progress reporting (hoisted before the pre-crawl fetches) ---
  // The robots.txt / sitemap / www-variant fetches below can take many
  // seconds on a slow site — if the first progress event only fired after
  // them, the progress page would sit at "Preparing crawl" for that whole
  // window. Emit the initial crawl event immediately (real counters: 0
  // pages so far, honest discovered count, the root URL as the current
  // URL) so the card shows "Crawling website" from the very first poll.
  const pages: CrawlPageResult[] = [];
  // Queue with a head index instead of shift(): shift() is O(n) per pop, so
  // a large sitemap seed (tens of thousands of URLs) would make dequeueing
  // quadratic. Workers read queue[queueHead++] and the array is compacted
  // when the consumed prefix grows large.
  let queue: string[] = [];
  let queueHead = 0;
  const pagesSkippedRobots: string[] = [];
  const pagesSkippedAssets: string[] = [];
  let crawlRetries = 0;
  let imagesAnalyzed = 0;
  let internalLinksAnalyzed = 0;
  const metrics = emptyMetrics();
  let currentUrl: string | undefined = rootUrl;
  const CRAWL_PROGRESS_INTERVAL_MS = 500;
  const crawlStartedAt = Date.now();
  let lastProgressEmit = 0;
  let firstEmitLogged = false;
  function emitProgress(force: boolean): void {
    if (!options.onProgress) return;
    const now = Date.now();
    if (!force && now - lastProgressEmit < CRAWL_PROGRESS_INTERVAL_MS) return;
    lastProgressEmit = now;
    const crawled = pages.length;
    const failed = pages.filter((p) => !p.ok).length;
    const elapsedSec = Math.max(1, (now - crawlStartedAt) / 1000);
    try {
      if (process.env.PROGRESS_DEBUG === "1" && !firstEmitLogged) {
        // Temporary trace: proves the crawler itself emitted a payload
        // (run with PROGRESS_DEBUG=1; see auditJob.ts writeProgress /
        // getJobProgress for the rest of the path).
        firstEmitLogged = true;
        console.log(
          `[progress] crawler emitted first payload: discovered=${crawled + (queue.length - queueHead) + pagesSkippedRobots.length} crawled=${crawled} queued=${queue.length - queueHead} currentUrl=${currentUrl ?? "-"}`
        );
      }
      options.onProgress({
        stage: "crawl",
        elapsedMs: now - crawlStartedAt,
        discovered: crawled + (queue.length - queueHead) + pagesSkippedRobots.length,
        crawled,
        queued: queue.length - queueHead,
        failed,
        retries: crawlRetries,
        rate: Math.round((crawled / elapsedSec) * 10) / 10,
        currentUrl,
        imagesAnalyzed,
        internalLinksAnalyzed,
      });
    } catch {
      // a throwing observer must never take down the crawl
    }
  }
  emitProgress(true);

  // Fetch robots.txt, the www-variant checks, and the STANDARD sitemap
  // location (/sitemap.xml) all in parallel. The sitemap used to wait for
  // robots.txt because robots may declare a `Sitemap:` directive — but that
  // directive is only a FALLBACK when /sitemap.xml yields nothing usable
  // (see fetchSitemapOnce), so the standard fetch has no real dependency on
  // robots. Starting it concurrently removes one full serialized round trip
  // from every audit's pre-crawl phase. If robots.txt later declares a
  // Sitemap: URL and the standard location was empty, the declared URL is
  // fetched after robots resolves (same fallback semantics as before).
  //
  // NOTE: robots/sitemap are fetched even when respectRobotsTxt/useSitemap
  // are false — the audit info is purely for the report's "Robots.txt &
  // Sitemap" section and stays honest about what's on the site regardless
  // of how the crawl itself was configured.
  const [robotsFetch, wwwConsistency, sitemapStandard] = await Promise.all([
    fetchRobotsOnce(rootOrigin, userAgent),
    checkWwwConsistency(rootUrl, userAgent),
    fetchSitemapOnce(rootOrigin, userAgent, undefined, null),
  ]);
  // Robots' `Sitemap:` directive fallback — only when the standard location
  // actually resolved (2xx) but contained no usable pages (mirrors the
  // pre-parallelization condition exactly: `standard.found` && empty). The
  // standard URL is re-fetched here only in that rare case; the common
  // paths pay for /sitemap.xml exactly once.
  const sitemapDirective = robotsFetch.audit.sitemapDirective ?? null;
  const standardFound =
    sitemapStandard.audit.httpStatus !== undefined &&
    sitemapStandard.audit.httpStatus >= 200 &&
    sitemapStandard.audit.httpStatus < 300;
  let sitemapFetch = sitemapStandard;
  if (
    sitemapDirective &&
    standardFound &&
    sitemapStandard.urls.length === 0 &&
    (sitemapStandard.audit.indexFilesExpanded ?? 0) === 0
  ) {
    sitemapFetch = await fetchSitemapOnce(rootOrigin, userAgent, undefined, sitemapDirective);
  }
  const robotsRules = respectRobotsTxt ? robotsFetch.rules : { disallowedPaths: [] };
  const robotsAuditInfo = robotsFetch.audit;
  const sitemapAuditInfo = sitemapFetch.audit;
  metrics.sitemapIndexFilesExpanded = sitemapFetch.audit.indexFilesExpanded ?? 0;

  // Seed the queue with the homepage + sitemap URLs (sitemap never bypasses maxPages —
  // it's just an additional discovery source, subject to the same cap as everything else).
  //
  // Only URLs that belong to the client's own site are seeded. A sitemap can
  // legitimately list URLs on other domains (Google-hosted assets, partner
  // CDNs, analytics/cookie pages, social profiles) — crawling those as if
  // they were client pages would flag non-client-owned pages (e.g. Google
  // policy/support URLs) as audit findings. www/non-www are treated as the
  // same site (the www-variant checks below already treat them as one).
  //
  // rootHost must be the HOSTNAME (portless), not origin-with-protocol
  // stripped: new URL(...).hostname never includes the port, so comparing
  // against a string that kept the port made EVERY page on a non-default
  // port (staging boxes, localhost previews, intranet sites) fail the
  // client-host check and silently drop out of the crawl — the root cause
  // of "empty crawl" audits on ported origins.
  const rootHost = new URL(rootOrigin).hostname.toLowerCase();
  const rootHostWithoutWww = rootHost.replace(/^www\./, "");
  const isClientHost = (rawUrl: string): boolean => {
    try {
      const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
      return host === rootHostWithoutWww;
    } catch {
      return false;
    }
  };
  const seedUrls = [rootUrl];
  const sitemapSeedSet = new Set<string>();
  if (useSitemap) {
    const sitemapSeeds = sitemapFetch.urls.filter(isClientHost);
    for (const u of sitemapSeeds) sitemapSeedSet.add(u);
    seedUrls.push(...sitemapSeeds);
  }

  const queued = new Set<string>(); // normalized URLs already queued or visited
  const crawledFinalUrls = new Set<string>(); // normalized final (post-redirect) URLs already in `pages`

  function enqueue(rawUrl: string) {
    if (queue.length - queueHead + pages.length >= maxPages * 3) {
      metrics.dedupSkippedCount++; // discovery backlog cap — known but not queued
      return;
    }
    const normalized = normalizeForDedup(rawUrl, ignoreQueryParams);
    if (!normalized || queued.has(normalized)) {
      if (normalized) metrics.dedupSkippedCount++;
      return;
    }

    if (isAssetUrl(rawUrl)) {
      // Never spend a request on something that can only fail as a page.
      pagesSkippedAssets.push(rawUrl);
      queued.add(normalized); // don't re-consider it
      metrics.excludedAssetCount++;
      return;
    }

    if (isExcludedAuthPath(rawUrl)) {
      // Login/identity/checkout routes (OAuth flows, session pages) are
      // dynamic application endpoints, not pages — drop them entirely so
      // they can never surface as meaningless findings in the audit.
      queued.add(normalized); // don't re-consider it
      return;
    }

    if (respectRobotsTxt) {
      try {
        const pathname = new URL(rawUrl).pathname;
        if (!isPathAllowed(pathname, robotsRules)) {
          pagesSkippedRobots.push(rawUrl);
          queued.add(normalized); // don't re-consider it again
          metrics.blockedByRobotsCount++;
          return;
        }
      } catch {
        return; // invalid URL, skip silently
      }
    }

    queued.add(normalized);
    queue.push(rawUrl);
    metrics.queuedCount++;
  }

  const redirectChains: RedirectChainInfo[] = [];

  // Seed the queue. Sitemap URLs are counted separately so the metrics can
  // distinguish "discovered via links" from "discovered via sitemap" — the
  // two discovery sources that matter when diagnosing a one-page crawl.
  let sitemapSeedCount = 0;
  for (const seed of seedUrls) {
    if (sitemapSeedSet.has(seed)) sitemapSeedCount++;
    enqueue(seed);
  }
  metrics.sitemapUrlsCount = sitemapSeedCount;

  // The queue is now seeded (homepage + sitemap URLs) — re-emit so the
  // progress page sees the real discovered count before the first page
  // completes (the initial emit above ran before the fetches).
  emitProgress(true);

  // --- Bounded worker pool ---
  // BFS naturally: workers pull from the front of the queue, and pages they
  // crawl push newly-discovered internal links onto the back of the queue.
  //
  // IMPORTANT: an idle worker that finds the queue momentarily empty must
  // NOT exit immediately — on a typical site, page 1 (the homepage) is the
  // only seed, so the queue is empty until it finishes and discovers links.
  // If idle workers gave up at that point, concurrency would silently
  // collapse to effectively 1 worker for most real crawls. Instead, idle
  // workers poll briefly as long as other workers are still in flight and
  // might enqueue more work.
  let crawledCount = 0;
  let inFlight = 0;
  const POLL_INTERVAL_MS = 25;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Browser instance for rendering JS-heavy pages — lazy-initialized
  // only when a JS-only page with no links is encountered.
  let browserInstance: BrowserInstance | null = null;

  async function worker() {
    while (true) {
      if (crawledCount >= maxPages) return;
      if (options.signal?.aborted) return; // graceful stop on cancellation

      const nextUrl = queueHead < queue.length ? queue[queueHead++] : undefined;
      if (!nextUrl) {
        if (inFlight === 0) return; // genuinely nothing left, and no one will add more
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      // Compact the consumed prefix occasionally so queue[queueHead++]
      // stays cheap on huge sitemap seeds (avoids unbounded memory and
      // keeps the array small).
      if (queueHead > 1024 && queueHead * 2 > queue.length) {
        queue = queue.slice(queueHead);
        queueHead = 0;
      }

      // Reserve a slot before awaiting, so concurrent workers don't both
      // think they have room and jointly exceed maxPages. Safe because
      // there's no await between this check and the increment.
      crawledCount++;
      if (crawledCount > maxPages) {
        crawledCount--;
        metrics.droppedOverMaxPagesCount++;
        continue; // don't crawl it, but keep the URL out — it'll just be dropped
      }
      currentUrl = nextUrl;

inFlight++;
      try {
        const result = await crawlPage(nextUrl, {
          timeoutMs,
          userAgent,
          crawlHost,
          onRetry: () => {
            crawlRetries++;
          },
        });

        // Redirect collision guard: crawlPage can follow redirects
        // internally, so two different discovered links (different query
        // string, trailing slash, or path) can both resolve to the same
        // final URL. The enqueue-time dedup above only catches duplicate
        // *requests* — it can't know the final destination in advance. This
        // catches duplicate *results* instead, so the same page is never
        // pushed into `pages` twice (which was producing duplicate React
        // keys downstream, and would have meant paying for AI explanations
        // on the same page twice).
        // --- Diagnostic accounting (independent of whether the result is a
        // redirect-duplicate or not — every attempt is one row in the
        // metrics, and failures are recorded with their reason). ---
        metrics.crawledCount++;
        if (result.ok) {
          metrics.succeededCount++;
          const statusKey = String(result.statusCode);
          metrics.httpStatusDistribution[statusKey] = (metrics.httpStatusDistribution[statusKey] ?? 0) + 1;
          if (result.redirectHopCount !== null && result.redirectHopCount > 0) metrics.redirectsFollowedCount++;
          metrics.internalLinksFoundCount += result.internalLinks.length;
          metrics.externalLinksIgnoredCount += result.externalLinkCount ?? 0;
        } else {
          metrics.failedCount++;
          const statusKey = result.error.statusCode !== undefined ? String(result.error.statusCode) : "error";
          metrics.httpStatusDistribution[statusKey] = (metrics.httpStatusDistribution[statusKey] ?? 0) + 1;
          if (metrics.errors.length < 20) {
            metrics.errors.push({ url: result.url, type: result.error.type, message: result.error.message });
          }
        }

        const finalNormalized = result.ok ? normalizeForDedup(result.url, ignoreQueryParams) : null;
        const isRedirectDuplicate = finalNormalized !== null && crawledFinalUrls.has(finalNormalized);

        if (!isRedirectDuplicate) {
          if (finalNormalized) crawledFinalUrls.add(finalNormalized);
          // A crawled URL can end up somewhere that is NOT a client page:
          //  1. It redirects to an EXTERNAL host (partner bank, SSO
          //     provider, payment portal — e.g. a checkout flow landing on
          //     the card issuer's domain). Analyzing it would flag another
          //     company's site as the client's own content (thin content,
          //     missing H2, URL structure) in the report.
          //  2. It redirects INTO an authentication/session path on the
          //     same host (/idp/, /login, /checkout — enqueue-time
          //     filtering only sees the ORIGINAL path, not where a client
          //     URL leads). A login portal has dynamic tokens and no
          //     article structure by design; it must never be scored as
          //     thin content or a heading failure.
          // In both cases the redirect chain itself is still recorded
          // below (the client URL is real); the non-client page is never
          // pushed into the crawl, and its links never feed discovery.
          const isNonClientPage = result.ok && (!isClientHost(result.url) || isExcludedAuthPath(result.url));
          if (!isNonClientPage) {
            pages.push(result);
          }

          // Streaming hook: let the caller start expensive independent work
          // (CWV measurement, image size checks) for this page while the
          // crawl continues discovering others. Called only for pages that
          // actually entered `pages` — never for redirect-duplicate
          // results or non-client redirect targets, so streamed work
          // always maps 1:1 to crawl.pages.
          if (!isNonClientPage && options.onPage) {
            try {
              options.onPage(result);
            } catch (err: unknown) {
              // A throwing hook must never take down the crawl.
              const message = err instanceof Error ? err.message : String(err);
              console.warn(`[crawlSite] onPage hook failed for ${result.url}: ${message}`);
            }
          }

          // Hop count now comes from crawlPage itself (it already made the
          // HEAD requests needed to resolve the redirect chain before doing
          // its one GET) — no separate chain-following pass needed here.
          if (result.ok && result.redirectHopCount !== null && result.redirectHopCount > 0) {
            redirectChains.push({
              originalUrl: result.requestedUrl,
              finalUrl: result.url,
              hopCount: result.redirectHopCount,
              excessive: result.redirectHopCount > EXCESSIVE_REDIRECT_THRESHOLD,
            });
          }

          // Links on a non-client redirect target (external company's site
          // or a login portal) must not feed the client's discovery queue.
          if (result.ok && !isNonClientPage) {
            imagesAnalyzed += result.images.length;
            internalLinksAnalyzed += result.internalLinks.length;
            for (const link of result.internalLinks) {
              enqueue(link);
            }

            // Collect sitemap URLs discovered via <link rel="sitemap"> in HTML
            if (result.htmlSitemapUrls && result.htmlSitemapUrls.length > 0) {
              for (const sUrl of result.htmlSitemapUrls) {
                try {
                  const resolved = new URL(sUrl, result.url);
                  if (isClientHost(resolved.toString())) {
                    // Fetch this additional sitemap source asynchronously
                    fetchSitemapOnce(resolved.origin, userAgent, undefined, resolved.toString()).then((extra) => {
                      if (extra.urls.length > 0) {
                        for (const u of extra.urls) {
                          if (isClientHost(u)) enqueue(u);
                        }
                        metrics.sitemapUrlsCount += extra.urls.length;
                      }
                    }).catch(() => {}); // best-effort, never crashes crawl
                  }
                } catch {
                  // malformed sitemap URL — skip
                }
              }
            }

            // --- Browser-rendering fallback for JS-heavy pages ---
            // When a page is detected as JS-rendered (shell HTML) and has
            // no/few internal links, the raw HTML is a pre-hydration shell
            // that hides the real navigation. A headless browser can render
            // the JS and expose the actual links. This is the key fix for
            // Shopify/WooCommerce stores with JS-heavy themes (Dawn,
            // Prestige, etc.) where the raw HTML contains no <a href> tags.
            //
            // Additionally, when a page has missing_h1, attempt rendering
            // to verify whether the H1 exists in the rendered DOM. This
            // covers three scenarios:
            // 1. renderMode is "unknown" — ambiguous, H1 might be JS-rendered
            // 2. renderMode is "likely_js_only" — page is a JS shell
            // 3. needsH1Verification is true — page has framework markers
            //    (React/Next/Vue/Angular) suggesting content may be
            //    generated client-side, even if renderMode is "server_rendered"
            const needsLinkDiscovery = result.internalLinks.length === 0 &&
              result.ok && !isNonClientPage &&
              result.aeoSignals?.renderMode === "likely_js_only";
            const needsH1Recovery = result.ok && !isNonClientPage &&
              result.flags.includes("missing_h1") &&
              (result.aeoSignals?.renderMode === "unknown" ||
               result.aeoSignals?.renderMode === "likely_js_only" ||
               !!(result as any).needsH1Verification);
            if (needsLinkDiscovery || needsH1Recovery) {
              // Lazy-init browser — only launched when a JS-heavy page
              // is encountered with no discoverable links.
              if (!browserInstance) {
                browserInstance = await launchBrowser();
              }
              if (browserInstance) {
                try {
                  const rendered = await renderPageWithBrowser(result.url, browserInstance, timeoutMs * 2);
                  if (rendered.ok && rendered.html) {
                    // Parse the rendered HTML and extract links
                    const cheerio = await import("cheerio");
                    const $ = cheerio.load(rendered.html);
                    const renderedFinalHost = new URL(result.url).hostname.toLowerCase();
                    const renderedFinalHostNoWww = renderedFinalHost.replace(/^www\./, "");
                    const renderedCrawlHostNoWww = crawlHost.toLowerCase();
                    let renderedLinkCount = 0;
                    $("a[href]").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                      const href = $(el).attr("href");
                      if (!href) return;
                      try {
                        const resolved = new URL(href, result.url);
                        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
                        resolved.hash = "";
                        const host = resolved.hostname.toLowerCase();
                        const isInt =
                          host === renderedFinalHost ||
                          host.replace(/^www\./, "") === renderedFinalHostNoWww ||
                          host.replace(/^www\./, "") === renderedCrawlHostNoWww;
                        if (isInt) {
                          enqueue(resolved.toString());
                          renderedLinkCount++;
                        }
                      } catch {
                        // unresolvable href — skip
                      }
                    });
                    metrics.browserRenderedCount = (metrics.browserRenderedCount ?? 0) + 1;

                    // Re-analyze structural SEO elements (H1, H2-H6) from
                    // the rendered DOM. The raw HTML may have been a pre-
                    // hydration shell where the H1 didn't exist yet. If the
                    // rendered DOM contains a real H1, remove the false
                    // missing_h1 flag and record the source as "rendered".
                    // Also detect potential visual-heading images for context
                    // when H1 is still missing after rendering.
                    try {
                      const { reAnalyzeFromRenderedHtml } = await import("./crawlPage");
                      reAnalyzeFromRenderedHtml(result, rendered.html);
                      // Record verification outcome: did the rendered DOM have an H1?
                      if (result.h1.length > 0 && result.h1Source === "rendered") {
                        result.renderVerificationStatus = "rendered_h1_found";
                      } else {
                        result.renderVerificationStatus = "rendered_h1_still_missing";
                      }
                    } catch {
                      // re-analysis is best-effort — keep raw-HTML results
                    }

                    if (process.env.PROGRESS_DEBUG === "1") {
                      console.log(`[crawlSite] browser-rendered ${result.url}: found ${renderedLinkCount} internal links from rendered DOM`);
                    }
                  } else {
                    // Rendering returned but no HTML — record as failed verification
                    result.renderVerificationStatus = "render_failed";
                  }
                } catch (renderErr: unknown) {
                  // Browser rendering failed — continue with raw HTML results
                  // Record that verification was attempted but failed, so the
                  // report can distinguish "H1 genuinely missing" from "H1 could
                  // not be verified because rendering failed".
                  result.renderVerificationStatus = "render_failed";
                  const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
                  console.warn(`[crawlSite] browser rendering failed for ${result.url}: ${msg}`);
                }
              }
            }
          }
        }
        emitProgress(false);
      } finally {
        inFlight--;
      }
    }
  }

  // Progress has already been emitted: once before the pre-crawl fetches
  // (so the card leaves "Preparing crawl" immediately) and once after the
  // queue was seeded with the sitemap URLs.
  const workerCount = Math.max(1, Math.min(concurrency, CONCURRENCY.crawl.max));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  // Clean up the browser instance if one was launched for JS rendering.
  if (browserInstance) {
    const b = browserInstance as BrowserInstance;
    browserInstance = null;
    await b.close().catch(() => {});
  }
  emitProgress(true);
  if (process.env.PROGRESS_DEBUG === "1") {
    console.log(`[progress] crawl finished: pages=${pages.length}`);
  }

  // --- Why did the crawl stop? ---
  let terminationReason: import("./types").CrawlTerminationReason;
  if (options.signal?.aborted) terminationReason = "crawl_cancelled";
  else if (crawledCount >= maxPages) terminationReason = "max_pages_reached";
  else terminationReason = "crawl_complete";

  metrics.discoveredCount = metrics.queuedCount + metrics.blockedByRobotsCount + metrics.excludedAssetCount;

  // --- Low-coverage sanity check ---
  // When almost nothing was crawled but the site shows clear signals of
  // containing more pages (internal links found, sitemap URLs, robots-blocked
  // URLs, failed fetches), flag the crawl as potentially incomplete instead
  // of letting a one-page result read as a normal successful audit. A
  // genuinely one-page site has none of these signals and is reported
  // normally.
  const lowCoverageReasons: string[] = [];
  if (metrics.succeededCount <= 1) {
    if (metrics.internalLinksFoundCount > metrics.succeededCount) {
      lowCoverageReasons.push(
        `${metrics.internalLinksFoundCount} internal links were discovered, but only ${metrics.succeededCount} page${metrics.succeededCount === 1 ? "" : "s"} could be crawled.`
      );
    }
    if (sitemapFetch.urls.length > metrics.succeededCount) {
      lowCoverageReasons.push(
        `The sitemap listed ${sitemapFetch.urls.length} URLs, but only ${metrics.succeededCount} page${metrics.succeededCount === 1 ? "" : "s"} were crawled.`
      );
    }
    if (metrics.blockedByRobotsCount > 0) {
      lowCoverageReasons.push(
        `${metrics.blockedByRobotsCount} URL${metrics.blockedByRobotsCount === 1 ? "" : "s"} were skipped because robots.txt disallowed them.`
      );
    }
    if (metrics.failedCount > 0) {
      lowCoverageReasons.push(
        `${metrics.failedCount} URL${metrics.failedCount === 1 ? "" : "s"} failed to fetch (see crawl diagnostics).`
      );
    }
  }
  const lowCoverage = { detected: lowCoverageReasons.length > 0, reasons: lowCoverageReasons };
  if (lowCoverage.detected && process.env.PROGRESS_DEBUG === "1") {
    console.log(`[crawlSite] LOW COVERAGE: ${lowCoverageReasons.join(" ")}`);
  }

// --- Orphan page detection ---
  const inboundLinked = new Set<string>();
  for (const page of pages) {
    if (!page.ok) continue;
    for (const link of page.internalLinks) {
      const norm = normalizeForDedup(link, ignoreQueryParams);
      if (norm) inboundLinked.add(norm);
    }
  }
  const rootNormalized = normalizeForDedup(rootUrl, ignoreQueryParams);
  const orphanPages: string[] = [];
  for (const page of pages) {
    if (!page.ok) continue;
    const norm = normalizeForDedup(page.url, ignoreQueryParams);
    const isOrphan = norm !== null && norm !== rootNormalized && !inboundLinked.has(norm);
    page.isOrphan = isOrphan;
    if (isOrphan) {
      page.flags.push("orphan_page");
      orphanPages.push(page.url);
    }
  }

  // --- Cross-page duplicate detection ---
  const titleMap = new Map<string, string[]>();
  const descMap = new Map<string, string[]>();

  for (const page of pages) {
    if (!page.ok) continue;
    if (page.title.content) {
      const key = page.title.content.trim().toLowerCase();
      const list = titleMap.get(key) ?? [];
      list.push(page.url);
      titleMap.set(key, list);
    }
    if (page.metaDescription.content) {
      const key = page.metaDescription.content.trim().toLowerCase();
      const list = descMap.get(key) ?? [];
      list.push(page.url);
      descMap.set(key, list);
    }
  }

  const duplicateTitles: DuplicateGroup[] = Array.from(titleMap.entries())
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));

  const duplicateMetaDescriptions: DuplicateGroup[] = Array.from(descMap.entries())
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));

  // Post-crawl reconciliation: the wwwCheck probe runs BEFORE the main
  // crawl and can get blocked by Cloudflare/WAF even though the crawl
  // itself succeeded against the same URLs. Cross-reference the probe's
  // variant results with the actual crawl evidence so the report never
  // Post-crawl reconciliation: override any probe failure for the canonical
  // URL that the crawl itself proved reachable (WAF block, timeout, etc.).
  const okPages = pages.filter((p) => p.ok);
  if (wwwConsistency.variantResults.length > 0 && okPages.length > 0) {
    const originHost = new URL(rootUrl).hostname.toLowerCase();
    const originProto = new URL(rootUrl).protocol;
    const canonicalCrawled = okPages.some((p) => {
      try {
        const u = new URL(p.url);
        return u.hostname.toLowerCase() === originHost && u.protocol === originProto;
      } catch { return false; }
    });
    if (canonicalCrawled) {
      // Override legacy variantResults
      for (const v of wwwConsistency.variantResults) {
        const vHost = (() => { try { return new URL(v.url).hostname.toLowerCase(); } catch { return ""; } })();
        const vProto = (() => { try { return new URL(v.url).protocol; } catch { return ""; } })();
        if (vHost === originHost && vProto === originProto && !v.ok) {
          v.ok = true;
          v.finalUrl = new URL(rootUrl).toString();
        }
      }
      // Override enhanced variantProbes
      for (const p of wwwConsistency.variantProbes) {
        const pHost = (() => { try { return new URL(p.requestedUrl).hostname.toLowerCase(); } catch { return ""; } })();
        const pProto = (() => { try { return new URL(p.requestedUrl).protocol; } catch { return ""; } })();
        if (pHost === originHost && pProto === originProto && !p.ok) {
          p.ok = true;
          p.finalUrl = new URL(rootUrl).toString();
          p.status = "canonical";
          p.statusCode = 200;
          p.explanation = "This is the input URL used for the crawl. It was verified reachable during the audit.";
          p.errorType = null;
          p.errorMessage = null;
        }
      }
      // Re-evaluate consistency with the corrected probe results
      const reachable = wwwConsistency.variantResults.filter((r) => r.ok && r.finalUrl);
      if (reachable.length > 0) {
        const finalHosts = new Set(reachable.map((r) => new URL(r.finalUrl!).hostname.toLowerCase()));
        const finalProtocols = new Set(reachable.map((r) => new URL(r.finalUrl!).protocol));
        wwwConsistency.consistent = finalHosts.size === 1 && finalProtocols.size === 1;
        wwwConsistency.canonicalHost = new URL(reachable[0].finalUrl!).hostname;
        wwwConsistency.issue = wwwConsistency.consistent ? null : wwwConsistency.issue;
      }
    }
  }

return {
    rootUrl,
    crawledAt: new Date().toISOString(),
    maxPages,
    maxPagesReached: pages.length >= maxPages,
    terminationReason,
    metrics,
    lowCoverage,
    pages,
    pagesSkippedRobots,
    pagesSkippedAssets,
    crawlRetries,
    redirectChains,
    duplicateTitles,
    duplicateMetaDescriptions,
    robotsAudit: robotsAuditInfo,
    sitemapAudit: sitemapAuditInfo,
    orphanPages,
    wwwConsistency,
    // Raw robots.txt body (null when missing/unreachable) — lets runAudit's
    // AEO bot-access check reuse this single fetch instead of requesting
    // /robots.txt a second time (see runAudit.ts). Optional for backward
    // compatibility with previously cached audits.
    robotsTxtRaw: robotsFetch.rawText,
  };
}
