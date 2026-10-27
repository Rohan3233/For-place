import { crawlSite } from "./crawlSite";
import { checkBrokenLinks } from "./brokenLinks";
import { checkOneImage, resolveImageUrl, DEFAULT_OVERSIZED_IMAGE_THRESHOLD_BYTES } from "./imageChecks";
import { fetchPageSpeed, fetchPageSpeedForPages } from "./pagespeed";
import {
  selectCwvSampleWithDetails,
  aggregateCoreWebVitals,
  normalizePageSpeedKey,
  DEFAULT_CWV_SAMPLE_TARGET,
  SMALL_SITE_FULL_COVERAGE_THRESHOLD,
} from "./coreWebVitals";
import type { PageTypeCount } from "./pageTypes";
import { computeOverallScore } from "./score";
import {
  InMemoryCacheProvider,
  domainCacheKey,
  isCacheEntryFresh,
  DEFAULT_TTL_MS,
  AUDIT_SCHEMA_VERSION,
} from "./cache";
import { WorkQueue } from "./workQueue";
import { CONCURRENCY, clampConcurrency } from "./concurrency";
import type {
  RunAuditOptions,
  RunAuditResult,
  PageSpeedResult,
  PageCwvMeasurement,
  BrokenLinkResult,
  OversizedImageResult,
  CrawlSiteResult,
  CrawlPageResult,
  CrawlPageSuccess,
  CrawlTimings,
  CrawlProgress,
} from "./types";
import type { GroupedIssue } from "./groupIssues";
import { checkAiBotAccess, checkLlmsTxt } from "./aeoCrawlability";
import { buildAeoAuditResult } from "./aeoReport";
import { getIssueTemplate } from "./templates";
import { getRemediation } from "./remediation";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; SEOAuditBot/0.1; +https://example.com/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Per-image timeout for size checks (mirrors imageChecks.ts's default).
const IMAGE_CHECK_TIMEOUT_MS = 8000;
// Default per-attempt timeout for broken-link checks (lives here so runAudit
// owns the option's default; checkBrokenLinks has its own copy).
const BROKEN_LINK_TIMEOUT_MS = 8000;
// Throttle for runAudit's own progress emits (crawl emits are throttled
// inside crawlSite; this covers the post-crawl parallel stages).
const PROGRESS_INTERVAL_MS = 500;

function buildMinimalThinContentGroup(crawl: CrawlSiteResult): GroupedIssue[] {
  const instances = crawl.pages
    .filter((p): p is CrawlPageSuccess => p.ok && p.flags.includes("thin_content"))
    .map((p) => ({ url: p.url, suggestedText: null, aiGenerated: false, currentValue: null }));
  if (instances.length === 0) return [];
  const template = getIssueTemplate("thin_content")!;
  return [
    {
      flag: "thin_content",
      issueLabel: template.issueLabel,
      whyItMatters: template.whyItMatters,
      businessImpact: template.businessImpact,
      recommendedFix: template.recommendedFix,
      instances,
      instancesByUrl: new Set(instances.map((i) => i.url)),
      smartNote: "",
      codeSnippet: null,
      remediation: getRemediation("thin_content"),
    },
  ];
}

/**
 * Full audit pipeline: Stage 1 (single page) -> Stage 2 (multi-page crawl)
 * -> Stage 3 (broken links + PageSpeed + score), with a domain-level cache
 * checked before any of it runs.
 *
 * CACHING: this is the free-tier margin protection from the original
 * business doc (Section VI) — "letting users repeatedly audit the same
 * site without caching" was explicitly flagged as a revenue risk. A fresh
 * cache hit means zero crawl requests, zero PageSpeed calls, and zero cost,
 * regardless of which account or how many different accounts requested it.
 * Pass `skipCache: true` for tiers/flows that should always force a fresh
 * audit (e.g. a paid "force re-audit" action), and pass a real
 * `cacheProvider` (see cache.ts) once you're running this on Vercel, since
 * the default in-memory one does not persist across serverless invocations.
 *
 * IMPORTANT — matches the async processing plan from the original business
 * doc: PageSpeed is notoriously slow (20-45s) on its own. On a cache miss,
 * we kick it off *at the same time* as the crawl starts, not after the
 * crawl finishes, so the two run concurrently instead of stacking latencies.
 *
 * PIPELINING (performance): Core Web Vitals work never blocks the crawl
 * or the other audit stages. The homepage PSI call starts concurrently
 * with the crawl (it is always part of the sample). On small sites (and in
 * explicit measure-all mode) every page's measurement is streamed via
 * crawlSite's `onPage` hook — worker pools START before the crawl (see
 * WorkQueue.start/close), so calls begin the moment each page finishes
 * crawling and overlap the crawl itself. On medium/large sites the default
 * is a REPRESENTATIVE SAMPLE (~30 URLs across the site's page types, see
 * selectCwvSampleWithDetails): the sample depends on the finished crawl's
 * page-type distribution, so it is selected after the crawl and run as a
 * bounded concurrent batch IN PARALLEL with the broken-link and image
 * checks — those stages are never blocked waiting on PageSpeed. Results
 * are assembled in the deterministic sample order (homepage first).
 *
 * This function still waits for both to finish before returning (simplest
 * correct version for a CLI/backend function). For the actual web app, the
 * "lazy loading" pattern from the business doc means: don't call this
 * combined function from an HTTP handler that the user waits on — instead
 * kick off crawlSite() and fetchPageSpeed() as two separately-resolving
 * promises from your API layer, return the crawl result to the UI as soon
 * as it lands, and push the PageSpeed data in whenever it resolves
 * (websocket, polling, or a second endpoint). This function is the
 * batch/CLI-friendly version of that same idea.
 */
export async function runAudit(rootUrl: string, options: RunAuditOptions): Promise<RunAuditResult> {
  const auditStartedAt = Date.now();
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const checkBrokenLinksEnabled = options.checkBrokenLinks ?? true;
  const checkOversizedImagesEnabled = options.checkOversizedImages ?? true;
  const fetchPageSpeedEnabled = options.fetchPageSpeed ?? true;
  // Injectable PSI fetcher (testing/benchmarking) — defaults to the real
  // PageSpeed Insights client. Same never-throw contract as fetchPageSpeed.
  const pageSpeedFetcher = options.pageSpeedFetcher ?? fetchPageSpeed;
  const cacheProvider = options.cacheProvider ?? new InMemoryCacheProvider();
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_TTL_MS;
  const skipCache = options.skipCache ?? false;

  // Concurrency comes from the centralized config (see concurrency.ts) —
  // every pool clamped into [1, max] so no caller can launch an unbounded
  // request storm.
  const crawlConcurrency = clampConcurrency(options.concurrency, CONCURRENCY.crawl);
  const pageSpeedConcurrency = clampConcurrency(options.pageSpeedConcurrency, CONCURRENCY.pageSpeed);
  const imageCheckConcurrency = clampConcurrency(options.imageCheckConcurrency, CONCURRENCY.imageChecks);
  const brokenLinkConcurrency = clampConcurrency(options.brokenLinkConcurrency, CONCURRENCY.brokenLinks);
  const brokenLinkPerHostConcurrency = clampConcurrency(
    options.brokenLinkPerHostConcurrency,
    CONCURRENCY.brokenLinksPerHost
  );
  const brokenLinkTimeoutMs = options.brokenLinkTimeoutMs ?? BROKEN_LINK_TIMEOUT_MS;
  const oversizedImageThresholdBytes =
    options.oversizedImageThresholdBytes ?? DEFAULT_OVERSIZED_IMAGE_THRESHOLD_BYTES;

  // --- Progress relay (observability, negligible cost) -------------------
  // Each stage throttles ITSELF (at most one emit per 500ms per stage plus a
  // forced final emit per stage). The throttle must be per stage, not one
  // shared window: the crawl, the Core Web Vitals stream and the image
  // stream all run concurrently, and a single shared timestamp lets the
  // first stage to emit each 500ms window silently starve the others —
  // making their live tiles appear frozen on the progress page. Crawl
  // progress is passed straight through (crawlSite already throttles it).
  // Emits are best-effort: a throwing observer must never take down the
  // audit.
  const lastEmitByStage: Partial<Record<CrawlProgress["stage"], number>> = {};
  function emitProgress(stage: CrawlProgress["stage"], fields: Partial<CrawlProgress>, force = false): void {
    if (!options.onProgress) return;
    const now = Date.now();
    const last = lastEmitByStage[stage] ?? 0;
    if (!force && now - last < PROGRESS_INTERVAL_MS) return;
    lastEmitByStage[stage] = now;
    try {
      options.onProgress({ stage, elapsedMs: now - auditStartedAt, ...fields } as CrawlProgress);
    } catch {
      /* observer must never break the audit */
    }
  }

  // domainCacheKey() parses rootUrl as a URL internally. If rootUrl is
  // malformed, that throws — and unlike crawlSite (which now guards its own
  // URL parsing and reports invalid_url gracefully), that would happen here
  // before crawlSite even runs. Rather than duplicate URL validation, just
  // treat a failed key derivation as "no caching for this call" and let the
  // actual crawl below surface the invalid_url error the normal way.
  let cacheKey: string | null;
  try {
    // The schema version is part of the key: when crawl behavior changes
    // (URL exclusions, new checks, counting fixes), the NEXT audit of the
    // same domain must re-crawl instead of serving an entry stored under
    // an older crawl. Entries written before versioning existed (bare
    // hostname key) are never read again — which is exactly what we want
    // here, since they may predate the auth-path / external-host crawler
    // exclusions.
    cacheKey = `${domainCacheKey(rootUrl)}@v${AUDIT_SCHEMA_VERSION}`;
  } catch {
    cacheKey = null;
  }

  if (!skipCache && cacheKey) {
    // A broken cache (provider down, network blip, malformed stored data)
    // must never take down the audit itself — fall through to a fresh
    // crawl instead. This matches the never-throw contract every other
    // module in this codebase follows (crawlPage, crawlSite, robots.ts).
    try {
      const cached = await cacheProvider.get(cacheKey);
      if (cached && isCacheEntryFresh(cached, cacheTtlMs)) {
        return {
          ...cached.result,
          crawlDurationMs: cached.result.crawlDurationMs ?? 0,
          auditDate: cached.result.auditDate ?? cached.storedAt,
          fromCache: true,
          cachedAt: cached.storedAt,
          aeo: cached.result.aeo ?? {
            botAccess: [],
            llmsTxt: { present: false, url: "" },
            checks: [],
            categoryScores: [],
            overallScore: 0,
            entityConsistencyDetail: { items: [], consistencyScorePct: 0 },
            searchSummary: { overallScore: 0, strengths: [], topPriorities: [] },
          },
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown cache read error.";
      console.warn(`Cache read failed for "${cacheKey}", falling back to a fresh audit: ${message}`);
      // fall through — proceed exactly as a normal cache miss
    }
  }

  // --- Cache miss (or skipCache) — do the real work. ---
  // Kick off the crawl, the HOMEPAGE PageSpeed call, and the AEO network
  // checks at the same time. The homepage is the one URL known before the
  // crawl lands, and PSI is the slowest single step (20-45s), so it starts
  // immediately rather than waiting for the crawl to finish. The remaining
  // Core Web Vitals sample (default: every crawled page) is streamed via
  // crawlSite's onPage hook below so those calls overlap the crawl too.
  // Each of these runs concurrently with the crawl — their own wall times
  // are measured individually so the timing report is honest about where
  // time was spent, not just aliased to the crawl window.
  let homepagePageSpeedMs = 0;
  let cwvRetries = 0;
  // Per-request durations (avg/max instrumentation) and the in-run PSI
  // result cache: no URL is ever measured twice within one audit, and the
  // cache is the reassembly point for the streamed + batch paths.
  const cwvRequestDurations: number[] = [];
  const pageSpeedCache = new Map<string, PageCwvMeasurement>(); // key: normalizePageSpeedKey(url)
  let cwvCacheHits = 0;
  // CWV is measured as ONE wall-clock span (see CrawlTimings.cwvWallMs): the
  // homepage PSI call is the first CWV work and starts here, concurrently
  // with the crawl; the span ends when the last measurement resolves below.
  // This replaces the old "sum the parallel phases" model, which
  // double-counted overlap and could show a CWV duration longer than the
  // whole audit (e.g. 9m32s vs a 8m02s total).
  const cwvWallStart = Date.now();
  const homepageSpeedPromise: Promise<PageSpeedResult> = (async () => {
    const start = Date.now();
    try {
      return fetchPageSpeedEnabled
        ? await pageSpeedFetcher(rootUrl, {
            apiKey: options.pageSpeedApiKey,
            strategy: options.pageSpeedStrategy ?? "mobile",
            onRetry: () => {
              cwvRetries++;
            },
          })
        : ({ ok: false, url: rootUrl, error: "PageSpeed check disabled." } as const);
    } finally {
      homepagePageSpeedMs = Date.now() - start;
      if (fetchPageSpeedEnabled) cwvRequestDurations.push(homepagePageSpeedMs);
    }
  })();

  // AEO network checks
  const rootOrigin = (() => {
    try {
      return new URL(rootUrl).origin;
    } catch {
      return null;
    }
  })();

  let aeoNetworkMs = 0;
  const aeoNetworkStart = Date.now();
  // The AI-bot robots.txt analysis deliberately reuses the robots.txt
  // body crawlSite already fetched (crawl.robotsTxtRaw) instead of
  // requesting /robots.txt a second time — the previous duplicate fetch
  // was a parallel request with a predetermined answer. The parse itself
  // (checkAiBotAccess) is pure CPU and runs after the crawl lands. Only
  // the llms.txt check is unique network work, so it still runs
  // concurrently with the crawl.
  const aeoLlmsTxtPromise = rootOrigin
    ? checkLlmsTxt(rootOrigin, userAgent)
    : Promise.resolve({ present: false, url: "" });

  // --- Streaming collectors (pipelining: overlap expensive per-page work
  // with the crawl itself). ---
  // Streaming runs only when EVERY ok crawled page will be measured: in
  // explicit measure-all mode, or by default on small sites (maxPages <=
  // the full-coverage threshold, where the default limit is "all pages").
  // In those modes each page's measurement can start as soon as the page
  // completes, so calls overlap the crawl. The default representative-
  // sample mode on larger sites CAN'T stream — the sample depends on the
  // finished crawl's page-type distribution and link graph — so it runs as
  // a post-crawl batch in parallel with broken links and image checks (see
  // the assembly below).
  //
  // KEY PERFORMANCE CHANGE: the worker pools are started BEFORE the crawl
  // (WorkQueue.start) — workers are alive while crawlSite pushes tasks via
  // onPage, so PageSpeed/image calls overlap the crawl itself instead of
  // only starting after it resolves. close() is called once the crawl
  // resolves (no more pages will arrive), and the start() promises resolve
  // once the queues drain.
  const streamCwv =
    fetchPageSpeedEnabled &&
    (options.pageSpeedMeasureAll === true ||
      (options.pageSpeedPageLimit === undefined &&
        typeof options.maxPages === "number" &&
        options.maxPages <= SMALL_SITE_FULL_COVERAGE_THRESHOLD));
  const cwvStreamQueue = new WorkQueue();
  const cwvStreamedKeys = new Set<string>(); // exact final URLs pushed to the stream (progress accounting)
  const imageStreamQueue = new WorkQueue();
  const imageSources = new Map<string, Set<string>>();
  const imageOutcomes = new Map<string, Omit<OversizedImageResult, "src" | "linkedFrom">>();

  let cwvCompleted = 0;
  let cwvFailedCount = 0;
  let imageCompleted = 0;

  // Normalized comparison for "is this the homepage" — mirrors the
  // homepage-exclusion logic below (trailing-slash-insensitive string op),
  // so the same spelling rules apply to streaming as to the batch path.
  const withoutTrailingSlash = (u: string) => (u.endsWith("/") ? u.slice(0, -1) : u);
  const homepageCrawlKey = withoutTrailingSlash(rootUrl);

  function onPage(page: CrawlPageResult): void {
    if (!page.ok) return;

    if (streamCwv && withoutTrailingSlash(page.url) !== homepageCrawlKey && !cwvStreamedKeys.has(page.url)) {
      cwvStreamedKeys.add(page.url);
      const key = normalizePageSpeedKey(page.url);
      if (pageSpeedCache.has(key)) {
        // Same URL already measured (homepage alias, redirect twin) — the
        // expensive analysis is never run twice within one audit.
        cwvCacheHits++;
        cwvCompleted++;
        emitProgress("core_web_vitals", {
          processed: cwvCompleted,
          retries: cwvRetries,
          rate: cwvRate(cwvCompleted),
        });
      } else {
        cwvStreamQueue.push(() =>
          pageSpeedFetcher(page.url, {
            apiKey: options.pageSpeedApiKey,
            strategy: options.pageSpeedStrategy ?? "mobile",
            onRetry: () => {
              cwvRetries++;
            },
          }).then((single) => {
            const measurement: PageCwvMeasurement = single.ok
              ? { url: page.url, ok: true, metrics: single.metrics }
              : { url: page.url, ok: false, error: single.error };
            pageSpeedCache.set(normalizePageSpeedKey(page.url), measurement);
            cwvCompleted++;
            if (!single.ok) cwvFailedCount++;
            emitProgress("core_web_vitals", {
              processed: cwvCompleted,
              retries: cwvRetries,
              rate: cwvRate(cwvCompleted),
            });
          })
        );
      }
    }

    if (checkOversizedImagesEnabled) {
      for (const image of page.images) {
        const resolved = resolveImageUrl(image.src, page.url);
        if (!resolved) continue;
        const sources = imageSources.get(resolved) ?? new Set<string>();
        const isNew = sources.size === 0;
        sources.add(page.url);
        imageSources.set(resolved, sources);
        if (isNew) {
          imageStreamQueue.push(() =>
            checkOneImage(resolved, userAgent, IMAGE_CHECK_TIMEOUT_MS, oversizedImageThresholdBytes).then(
              (outcome) => {
                imageOutcomes.set(resolved, outcome);
                imageCompleted++;
                emitProgress("image_analysis", {
                  processed: imageCompleted,
                  rate: imageRate(imageCompleted),
                });
              }
            )
          );
        }
      }
    }
  }

  function cwvRate(processed: number): number {
    return Math.round((processed / Math.max(1, (Date.now() - auditStartedAt) / 1000)) * 10) / 10;
  }
  function imageRate(processed: number): number {
    return Math.round((processed / Math.max(1, (Date.now() - auditStartedAt) / 1000)) * 10) / 10;
  }

  // Start the streaming worker pools BEFORE the crawl so expensive work
  // overlaps discovery.
  const cwvQueueStart = Date.now();
  const cwvRunPromise = streamCwv ? cwvStreamQueue.start(pageSpeedConcurrency) : Promise.resolve();
  const imageQueueStart = Date.now();
  const imageRunPromise = checkOversizedImagesEnabled
    ? imageStreamQueue.start(imageCheckConcurrency)
    : Promise.resolve();

  const crawlStart = Date.now();
  const [crawl, homepageSpeed, aeoLlmsTxt] = await Promise.all([
    crawlSite(rootUrl, {
      ...options,
      onPage,
      onProgress: options.onProgress, // crawlSite throttles crawl-stage emits itself
    }),
    homepageSpeedPromise,
    aeoLlmsTxtPromise,
  ]);
  const crawlMs = Date.now() - crawlStart;
  aeoNetworkMs = Date.now() - aeoNetworkStart;
  // Derived from the crawl's own robots.txt fetch — no extra request (see
  // the comment above). null when robots.txt is missing/unreachable, which
  // checkAiBotAccess treats as "everything allowed", same as before.
  const aeoBotAccess = checkAiBotAccess(crawl.robotsTxtRaw ?? null);
  console.log(`[runAudit] crawl took ${crawlMs}ms, homepage PSI ${homepagePageSpeedMs}ms, AEO network checks ${aeoNetworkMs}ms`);

  // The crawl has resolved, so the streamed CWV set is now fixed: every ok
  // page except the homepage (onPage fired for all of them). Emit the exact
  // total so the progress UI can show an accurate bar while the PSI calls
  // drain in parallel with the broken-link stage.
  if (streamCwv && cwvStreamedKeys.size > 0) {
    emitProgress(
      "core_web_vitals",
      { processed: cwvCompleted, total: cwvStreamedKeys.size, retries: cwvRetries },
      true
    );
  }

  // No more pages will arrive — let the streaming queues finish their
  // backlog (their start() promises resolve once drained).
  cwvStreamQueue.close();
  imageStreamQueue.close();

  // Broken links are independent of the streaming queues (they only need
  // the finished page set), so they start immediately, in parallel with the
  // streaming drains below.
  const brokenLinksStart = Date.now();
  const brokenLinksPromise: Promise<{
    results: BrokenLinkResult[];
    skippedAsCrawled: number;
    retries: number;
    reusedAsBroken: number;
  }> =
    checkBrokenLinksEnabled
      ? checkBrokenLinks(crawl.pages, {
          userAgent,
          concurrency: brokenLinkConcurrency,
          perHostConcurrency: brokenLinkPerHostConcurrency,
          timeoutMs: brokenLinkTimeoutMs,
          // Reuses the informational robots.txt data crawlSite already fetched
          // (see robotsAuditInfo) — no extra network calls needed here.
          robotsDisallowedPaths: crawl.robotsAudit.disallowedPaths,
          onProgress: ({ processed, total }) => {
            const elapsedSec = Math.max(1, (Date.now() - brokenLinksStart) / 1000);
            emitProgress("broken_links", {
              processed,
              total,
              rate: Math.round((processed / elapsedSec) * 10) / 10,
            });
          },
        })
      : Promise.resolve({ results: [], skippedAsCrawled: 0, retries: 0, reusedAsBroken: 0 });

  // Drain the streamed CWV + image work. Both pools run concurrently; each
  // timing is measured from its queue start so the report sees the honest
  // wall window (which overlaps the crawl — stages are not additive).
  const [streamedCwvMs, streamedImagesMs] = await Promise.all([
    (async () => {
      await cwvRunPromise;
      return Date.now() - cwvQueueStart;
    })(),
    (async () => {
      await imageRunPromise;
      return Date.now() - imageQueueStart;
    })(),
  ]);

  // Assemble the oversized-image results from the streamed checks. Every
  // unique image was checked exactly once; linkedFrom now carries the full
  // source list (all pages are in). Sorted deterministically (first linking
  // page, then URL) so output is stable across runs despite the crawl-order
  // arrival.
  const oversizedImages: OversizedImageResult[] = checkOversizedImagesEnabled
    ? Array.from(imageSources.entries())
        .map(([src, sources]) => ({
          src,
          ...(imageOutcomes.get(src) ?? {
            contentLengthBytes: null,
            isOversized: false,
            ok: false,
            errorMessage: "Image size check did not complete.",
          }),
          linkedFrom: Array.from(sources),
        }))
        .sort(
          (a, b) =>
            (a.linkedFrom[0] ?? "").localeCompare(b.linkedFrom[0] ?? "") || a.src.localeCompare(b.src)
        )
    : [];
  emitProgress("image_analysis", { processed: imageCompleted, rate: imageRate(imageCompleted) }, true);

  // Website-wide Core Web Vitals covers EVERY successfully crawled page by
  // default — the evaluated set IS the crawl, so the report can never
  // overstate coverage. `pageSpeedPageLimit` remains an explicit operator
  // override to bound audit time on very large sites (PSI is 20-45s/page).
  const okCrawlPageCount = crawl.pages.filter((p) => p.ok).length;
  // Default CWV scope: full coverage on small sites (cheap — a handful of
  // PSI calls), a representative page-type sample on larger ones (see
  // selectCwvSampleWithDetails). Explicit options win: pageSpeedMeasureAll
  // forces every page; pageSpeedPageLimit sets the sample size directly.
  const cwvPageLimit =
    options.pageSpeedMeasureAll === true
      ? okCrawlPageCount
      : options.pageSpeedPageLimit !== undefined
        ? Math.max(1, Math.floor(options.pageSpeedPageLimit))
        : okCrawlPageCount <= SMALL_SITE_FULL_COVERAGE_THRESHOLD
          ? okCrawlPageCount
          : DEFAULT_CWV_SAMPLE_TARGET;
  const sampleSelection = fetchPageSpeedEnabled
    ? selectCwvSampleWithDetails(crawl, cwvPageLimit)
    : { urls: [] as string[], templateBreakdown: [] as PageTypeCount[] };
  const sampleUrls = sampleSelection.urls;
  const homepageMeasurement: PageCwvMeasurement = homepageSpeed.ok
    ? { url: homepageSpeed.url, ok: true, metrics: homepageSpeed.metrics }
    : { url: rootUrl, ok: false, error: homepageSpeed.error };
  // Cache the homepage result so no later stage can ever re-request it.
  pageSpeedCache.set(normalizePageSpeedKey(homepageMeasurement.url), homepageMeasurement);
  // The sample is chosen from the crawl's link graph, which can normalize
  // URL spelling (e.g. a trailing slash); the homepage was already measured
  // above, so never evaluate it a second time.
  const remainingCwvUrls = sampleUrls.filter(
    (u) => withoutTrailingSlash(u) !== withoutTrailingSlash(homepageMeasurement.url)
  );

  // Assemble the remaining measurements through the shared in-run cache,
  // so a URL measured once (streamed during the crawl, or a homepage/
  // redirect alias) is never requested again. In streaming mode the
  // measurements were already collected via onPage; defensively fetch any
  // that somehow missed the stream. In sampling mode, run the bounded
  // concurrent batch now — in parallel with the broken-link and image
  // checks already in flight.
  const remainingCwvStart = Date.now();
  const remainingCwvMeasurements: PageCwvMeasurement[] = await (async () => {
    if (remainingCwvUrls.length > 0) {
      // Emit the known total BEFORE the first PSI call lands so the
      // progress UI shows "0 of N pages analyzed" instead of a stale tile.
      emitProgress(
        "core_web_vitals",
        { processed: cwvCompleted, total: remainingCwvUrls.length, retries: cwvRetries },
        true
      );
    }
    const uncached = remainingCwvUrls.filter(
      (u) => !pageSpeedCache.has(normalizePageSpeedKey(u))
    );
    // "Cache hits" = requests genuinely avoided: cached results that were
    // NOT already fetched by the stream. In streaming mode every page was
    // just measured via onPage, so nothing here is a hit (and the progress
    // counter is already accurate). In batch mode, cached-but-not-streamed
    // results (e.g. a homepage alias or redirect twin) count as hits and
    // start the progress bar already advanced.
    const cacheHitCount = remainingCwvUrls.filter(
      (u) => !cwvStreamedKeys.has(u) && pageSpeedCache.has(normalizePageSpeedKey(u))
    ).length;
    if (cacheHitCount > 0) {
      cwvCacheHits += cacheHitCount;
      if (!streamCwv) cwvCompleted = cacheHitCount;
    }
    let batchFailedCount = 0;
    if (uncached.length > 0) {
      const batch = await fetchPageSpeedForPages(uncached, {
        apiKey: options.pageSpeedApiKey,
        strategy: options.pageSpeedStrategy ?? "mobile",
        concurrency: pageSpeedConcurrency,
        fetchSingle: pageSpeedFetcher,
        onRetry: () => {
          cwvRetries++;
        },
        onRequestDuration: (url, durationMs) => {
          cwvRequestDurations.push(durationMs);
        },
        onProgress: (processed) => {
          cwvCompleted = cacheHitCount + processed; // keep the final force-emit honest
          emitProgress("core_web_vitals", {
            processed: cwvCompleted,
            total: remainingCwvUrls.length,
            retries: cwvRetries,
            rate: cwvRate(cwvCompleted),
          });
        },
      });
      batchFailedCount = batch.filter((m) => !m.ok).length;
      for (const m of batch) {
        pageSpeedCache.set(normalizePageSpeedKey(m.url), m);
      }
    }
    const results: PageCwvMeasurement[] = remainingCwvUrls.map(
      (u) => pageSpeedCache.get(normalizePageSpeedKey(u))!
    );
    if (streamCwv) {
      // Streamed failures were already counted in onPage as they completed;
      // only the defensive fetches (URLs that missed the stream) add new
      // failures here.
      cwvFailedCount += batchFailedCount;
    } else {
      cwvFailedCount += results.filter((m) => !m.ok).length;
    }
    return results;
  })();
  const remainingCwvMs = Date.now() - remainingCwvStart;
  // All CWV work has now resolved (homepage + streamed drain + any remaining
  // fetches), so the wall-clock span is complete. Guarded to 0 when PageSpeed
  // is disabled — there is no CWV work to measure then, and a 0ms stage is
  // omitted from the runtime breakdown rather than shown as "0 sec".
  const cwvWallMs = fetchPageSpeedEnabled ? Math.max(0, Date.now() - cwvWallStart) : 0;
  emitProgress(
    "core_web_vitals",
    { processed: cwvCompleted, total: remainingCwvUrls.length, retries: cwvRetries },
    true
  );

  const { results: brokenLinks, skippedAsCrawled, retries: brokenLinkRetries, reusedAsBroken } = await brokenLinksPromise;
  const brokenLinksMs = Date.now() - brokenLinksStart;
  const brokenLinksFailed = brokenLinks.filter((l) => !l.ok).length;
  emitProgress(
    "broken_links",
    {
      processed: brokenLinks.length,
      total: brokenLinks.length,
      retries: brokenLinkRetries,
      rate: Math.round((brokenLinks.length / Math.max(1, brokenLinksMs / 1000)) * 10) / 10,
    },
    true
  );
  console.log(
    `[runAudit] post-crawl phases: brokenLinks ${brokenLinksMs}ms (${brokenLinks.length} checked, ${skippedAsCrawled} skipped as already proven ok, ${brokenLinkRetries} retries), streamedCWV drain ${streamedCwvMs}ms, streamedImages drain ${streamedImagesMs}ms, remainingCWV ${remainingCwvMs}ms`
  );
  console.log(`[runAudit] checkBrokenLinks found ${brokenLinks.length} unique links`);
  console.log(`[runAudit] checkOversizedImages found ${oversizedImages.length} unique images`);

  // Aggregate the per-page measurements into the single website-wide CWV
  // result every report section consumes. If CWV evaluation is disabled
  // (fetchPageSpeed: false), the aggregate is an honest insufficient-data
  // state — never a fabricated score.
  const cwvMeasurements: PageCwvMeasurement[] = fetchPageSpeedEnabled
    ? [homepageMeasurement, ...remainingCwvMeasurements]
    : [];
  const cwv = aggregateCoreWebVitals(cwvMeasurements, crawl.pages.length, undefined, {
    // True when the limit covered every crawled page — drives the scope
    // note wording ("every crawled page" vs "a deterministic sample").
    fullCrawlCoverage: cwvPageLimit >= okCrawlPageCount,
    // Page-type coverage of the performance sample, so the report can say
    // "representative pages across 8 page types (Product 12, Category 8...)"
    // instead of reading like every crawled page was performance-tested.
    templatesRepresented: sampleSelection.templateBreakdown.length,
    templateBreakdown: sampleSelection.templateBreakdown,
  });
  const pageSpeed = homepageSpeed;

  const scoreAndAeoStart = Date.now();

  // Compute a preliminary AEO score from crawl data for the AI Search
  // Readiness pillar. This is a lightweight computation that can run
  // before the full AEO audit, giving the scoring function the AEO
  // component it needs for the three-pillar model.
  const okPages = crawl.pages.filter((p): p is CrawlPageSuccess => p.ok);
  const aeoCheckCount = [
    // Schema presence
    okPages.some((p) => p.structuredData.present && p.structuredData.types.length > 0) ? 1 : 0,
    // Entity consistency (simplified check)
    okPages.length > 0 ? 1 : 0,
    // Bot access
    ...aeoBotAccess.map((b) => b.status !== "blocked" ? 1 : 0),
    // llms.txt
    aeoLlmsTxt.present ? 1 : 0,
  ];
  const aeoPassCount = aeoCheckCount.filter((v) => v === 1).length;
  const aeoScore = aeoCheckCount.length > 0
    ? Math.round((aeoPassCount / aeoCheckCount.length) * 100)
    : null;

  const score = computeOverallScore(crawl, brokenLinks, oversizedImages, cwv, aeoScore);

  const aeo = buildAeoAuditResult(
    { crawl, brokenLinks, oversizedImages, pageSpeed, cwv, score } as RunAuditResult,
    aeoBotAccess,
    aeoLlmsTxt,
    buildMinimalThinContentGroup(crawl)
  );
  const scoreAndAeoMs = Date.now() - scoreAndAeoStart;

  // --- Structured timing instrumentation (observability) ---
  const hopHeads = crawl.pages.reduce((sum, p) => sum + (p.ok && p.redirectHopCount !== null ? p.redirectHopCount : 0), 0);
  const pagesOk = crawl.pages.filter((p) => p.ok).length;
  const crawlThroughputPagesPerSec =
    Math.round((pagesOk / Math.max(1, crawlMs / 1000)) * 10) / 10;
  const timings: CrawlTimings = {
    totalMs: Date.now() - auditStartedAt,
    crawlMs,
    homepagePageSpeedMs,
    aeoNetworkMs,
    streamedCwvMs,
    streamedImagesMs,
    remainingCwvMs,
    cwvWallMs,
    brokenLinksMs,
    scoreAndAeoMs,
    cacheWriteMs: 0, // filled after the cache write below
    pagesCrawled: crawl.pages.length,
    pagesOk,
    pagesFailed: crawl.pages.length - pagesOk,
    pagesSkippedRobots: crawl.pagesSkippedRobots.length,
    cwvRequests: cwvMeasurements.length,
    brokenLinksChecked: brokenLinks.length,
    brokenLinksSkippedAsCrawled: skippedAsCrawled,
    /** Links whose 4xx outcome the crawl already proved (no request made). */
    brokenLinksReusedAsBroken: reusedAsBroken,
    imagesChecked: oversizedImages.length,
    // Approximate direct-to-site requests: page GETs + redirect-hop HEADs +
    // link checks + image checks + robots.txt + sitemap.xml. Excludes
    // PageSpeed API calls (see cwvRequests) and retry attempts.
    httpRequests: crawl.pages.length + hopHeads + brokenLinks.length + oversizedImages.length + 2,
    // Extended observability (optional fields — older cached audits stay valid)
    cwvRetries,
    cwvFailed: cwvFailedCount,
    cwvTemplatesRepresented: sampleSelection.templateBreakdown.length,
    cwvCacheHits,
    cwvAvgRequestMs:
      cwvRequestDurations.length > 0
        ? Math.round(cwvRequestDurations.reduce((a, b) => a + b, 0) / cwvRequestDurations.length)
        : undefined,
    cwvMaxRequestMs:
      cwvRequestDurations.length > 0 ? Math.max(...cwvRequestDurations) : undefined,
    cwvFullCoverage: cwvPageLimit >= okCrawlPageCount,
    crawlRetries: crawl.crawlRetries ?? 0,
    brokenLinkRetries,
    brokenLinksFailed,
    crawlConcurrency,
    brokenLinkConcurrency,
    brokenLinkPerHostConcurrency,
    pageSpeedConcurrency,
    imageCheckConcurrency,
    crawlThroughputPagesPerSec,
    avgCrawlPageMs: pagesOk > 0 ? Math.round(crawlMs / pagesOk) : undefined,
  };

  const result: RunAuditResult = {
    crawl,
    brokenLinks,
    oversizedImages,
    pageSpeed,
    cwv,
    score,
    fromCache: false,
    crawlDurationMs: Date.now() - auditStartedAt,
    auditDate: new Date().toISOString(),
    aeo,
  };

  // Same principle as the read above: a failed cache write means the next
  // request won't get a cache hit, which is a cost/latency problem, not a
  // correctness problem — it must not fail the audit the user is waiting on.
  // Also skip entirely if cacheKey is null (rootUrl couldn't be parsed) —
  // the crawl result above will already contain the invalid_url error in
  // this case, there's nothing meaningful to cache under a domain we
  // couldn't determine.
  if (cacheKey) {
    const cacheWriteStart = Date.now();
    try {
      await cacheProvider.set(cacheKey, { result, storedAt: new Date().toISOString() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown cache write error.";
      console.warn(`Cache write failed for "${cacheKey}", continuing without caching this result: ${message}`);
    }
    timings.cacheWriteMs = Date.now() - cacheWriteStart;
  }
  result.timings = timings;

  emitProgress("finalizing", {}, true);

  console.log(
    `[runAudit] TIMINGS total=${(timings.totalMs / 1000).toFixed(1)}s ` +
      `crawl=${(crawlMs / 1000).toFixed(1)}s ` +
      `cwvStream=${(streamedCwvMs / 1000).toFixed(1)}s cwvRemaining=${(remainingCwvMs / 1000).toFixed(1)}s cwvWall=${(cwvWallMs / 1000).toFixed(1)}s (${timings.cwvRequests} PSI calls, ${timings.cwvTemplatesRepresented ?? 0} templates, ${cwvCacheHits} cache hits, ${cwvRetries} retries, ${cwvFailedCount} failed, avg ${timings.cwvAvgRequestMs ?? "?"}ms) ` +
      `images=${(streamedImagesMs / 1000).toFixed(1)}s (${timings.imagesChecked} checks) ` +
      `brokenLinks=${(brokenLinksMs / 1000).toFixed(1)}s (${timings.brokenLinksChecked} checked, ${timings.brokenLinksSkippedAsCrawled} skipped-as-crawled, ${reusedAsBroken} reused-as-broken, ${brokenLinkRetries} retries) ` +
      `scoreAeo=${(scoreAndAeoMs / 1000).toFixed(1)}s cacheWrite=${(timings.cacheWriteMs / 1000).toFixed(1)}s ` +
      `pages=${timings.pagesCrawled} ok=${timings.pagesOk} failed=${timings.pagesFailed} httpRequests≈${timings.httpRequests}`
  );

  return result;
}
