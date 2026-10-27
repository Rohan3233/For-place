// QA probe: verify the crawler emits REAL live progress during a crawl and
// that the final counters match the audit result. Also verifies the
// "Crawling" state leaves "Preparing crawl" immediately (initial emit at
// crawl start with 0/1 counters) and that images/internal-links counts tick
// up live. Requires the QA site:
//   node qa/serve-site.mjs &   (port 4599)
//   node qa/probe-progress.cjs
const path = require("node:path");
const PROJ = "C:/Users/LENOVO/Desktop/SEO STARTUP/seoaudit-web";
const { runAudit } = require(path.join(PROJ, "dist-crawler/runAudit"));

const ORIGIN = "http://127.0.0.1:4599";

(async () => {
  const events = [];
  const startAt = Date.now();
  let firstPayloadAt = null;
  let firstCrawlPayload = null;
  let lastCrawl = null;
  let stageSeen = {};

  const audit = await runAudit(ORIGIN, {
    maxPages: 40,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: true,
    checkOversizedImages: true,
    oversizedImageThresholdBytes: 150000,
    onProgress: (p) => {
      const now = Date.now();
      if (!firstPayloadAt) firstPayloadAt = now;
      events.push(p);
      if (p.stage === "crawl") {
        if (!firstCrawlPayload) firstCrawlPayload = p;
        lastCrawl = p;
      }
      stageSeen[p.stage] = (stageSeen[p.stage] ?? 0) + 1;
    },
  });

  const finishedAt = Date.now();
  const failed = [];

  if (!firstPayloadAt) failed.push("NO progress payload ever arrived");
  else {
    const delta = firstPayloadAt - startAt;
    console.log(`first payload arrived ${delta}ms after start (audit ran ${finishedAt - startAt}ms)`);
    if (delta > 3000) failed.push(`first progress payload took ${delta}ms — too late to be "live"`);
  }
  if (!firstCrawlPayload) failed.push("no crawl-stage payload");
  else {
    // The crawl must report itself as started (stage crawl) immediately,
    // even before the first page finishes — this is what moves the card off
    // "Preparing crawl" while the homepage is still being fetched.
    console.log(
      `first crawl payload: discovered=${firstCrawlPayload.discovered} crawled=${firstCrawlPayload.crawled} queued=${firstCrawlPayload.queued} currentUrl=${firstCrawlPayload.currentUrl ? "set" : "missing"}`
    );
    if (firstCrawlPayload.crawled !== 0 && firstCrawlPayload.crawled !== 1)
      failed.push(`first crawl payload should carry 0/1 scanned, got ${firstCrawlPayload.crawled}`);
    if (!firstCrawlPayload.currentUrl) failed.push("first crawl payload missing currentUrl");
  }

  const crawls = events.filter((e) => e.stage === "crawl");
  if (crawls.length < 2) failed.push(`only ${crawls.length} crawl ticks — expected multiple live updates`);
  else {
    const scanned = crawls.map((c) => c.crawled);
    const monotonic = scanned.every((v, i) => i === 0 || v >= scanned[i - 1]);
    if (!monotonic) failed.push("crawled counter went backwards");
  }
  const discoveredSeq = crawls.map((c) => c.discovered);
  if (discoveredSeq.some((v, i) => i > 0 && v < discoveredSeq[i - 1]))
    failed.push("discovered counter went backwards");

  // Images / internal links must be reported live on crawl payloads and
  // must match the final result.
  const lastCrawlHasCounts =
    lastCrawl && lastCrawl.imagesAnalyzed != null && lastCrawl.internalLinksAnalyzed != null;
  if (!lastCrawlHasCounts) failed.push("final crawl payload missing imagesAnalyzed/internalLinksAnalyzed");
  else {
    const okPages = audit.crawl.pages.filter((p) => p.ok);
    const finalImages = okPages.reduce((s, p) => s + p.images.length, 0);
    const finalInternal = okPages.reduce((s, p) => s + p.internalLinks.length, 0);
    if (lastCrawl.imagesAnalyzed !== finalImages)
      failed.push(`final imagesAnalyzed=${lastCrawl.imagesAnalyzed} != result=${finalImages}`);
    if (lastCrawl.internalLinksAnalyzed !== finalInternal)
      failed.push(`final internalLinksAnalyzed=${lastCrawl.internalLinksAnalyzed} != result=${finalInternal}`);
    console.log(`final crawl payload: images=${lastCrawl.imagesAnalyzed} internalLinks=${lastCrawl.internalLinksAnalyzed} (result: ${finalImages} / ${finalInternal})`);
  }

  if (lastCrawl) {
    if (lastCrawl.crawled !== audit.crawl.pages.length)
      failed.push(`final tick crawled=${lastCrawl.crawled} != result pages=${audit.crawl.pages.length}`);
    const okPages = audit.crawl.pages.filter((p) => p.ok).length;
    if (lastCrawl.failed !== audit.crawl.pages.length - okPages)
      failed.push(`final tick failed=${lastCrawl.failed} != result failed=${audit.crawl.pages.length - okPages}`);
  }

  console.log(
    `stages seen: ${Object.entries(stageSeen).map(([k, v]) => `${k}=${v}`).join(", ")}  (expect crawl + broken_links + image_analysis)`
  );
  for (const s of ["broken_links", "image_analysis"]) {
    if (!stageSeen[s]) failed.push(`stage ${s} never emitted progress`);
  }

  if (failed.length) {
    console.error("FAILURES:");
    failed.forEach((f) => console.error("  - " + f));
    process.exit(1);
  }
  console.log("PROBE PASS — live progress is real, timely, rich, and matches the final result");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
