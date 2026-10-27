// QA probe: run the REAL crawler against https://crawler-test.com/ (the same
// site the user tested) and print every live crawl-progress payload so we can
// SEE the counters tick up in real time, exactly as the loading page should.
//   node qa/probe-live-crawler-test.cjs
const path = require("node:path");
const PROJ = "C:/Users/LENOVO/Desktop/SEO STARTUP/seoaudit-web";
const { runAudit } = require(path.join(PROJ, "dist-crawler/runAudit"));

const TARGET = "https://crawler-test.com/";

(async () => {
  const startAt = Date.now();
  let firstPayloadAt = null;
  let firstCrawl = null;
  let lastCrawl = null;
  let emitted = 0;
  const milestones = [];

  const audit = await runAudit(TARGET, {
    maxPages: 30,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: false,
    checkOversizedImages: false,
    onProgress: (p) => {
      emitted++;
      const now = Date.now();
      if (!firstPayloadAt) firstPayloadAt = now;
      if (p.stage === "crawl") {
        if (!firstCrawl) firstCrawl = p;
        lastCrawl = p;
        const t = Math.round((now - startAt) / 1000);
        milestones.push(
          `t=${String(t).padStart(3)}s  discovered=${String(p.discovered).padStart(3)}  scanned=${String(p.crawled).padStart(3)}  remaining=${String(p.queued).padStart(3)}  images=${String(p.imagesAnalyzed ?? 0).padStart(4)}  links=${String(p.internalLinksAnalyzed ?? 0).padStart(4)}  url=${p.currentUrl ?? "-"}`
        );
      }
    },
  });

  const finishedAt = Date.now();
  const crawl = audit.crawl;

  console.log("\n=== LIVE PROGRESS PAYLOADS (crawl stage) ===");
  console.log(milestones.slice(0, 6).join("\n"));
  console.log("  ...");
  console.log(milestones.slice(-4).join("\n"));
  console.log(`\nemitted ${emitted} payloads total`);

  const firstDelta = firstPayloadAt ? firstPayloadAt - startAt : -1;
  console.log(`first payload ${firstDelta}ms after start`);

  if (firstCrawl) {
    console.log(
      `first crawl payload: discovered=${firstCrawl.discovered} scanned=${firstCrawl.crawled} currentUrl=${firstCrawl.currentUrl ?? "-"}`
    );
  }

  // Final consistency check: live values vs the audit result.
  const finalCrawled = crawl.pages.length;
  const finalFailed = crawl.pages.filter((p) => !p.ok).length;
  const finalImages = crawl.pages.reduce((s, p) => s + p.images.length, 0);
  const finalLinks = crawl.pages.reduce((s, p) => s + p.internalLinks.length, 0);
  console.log(`\naudit result: pages=${finalCrawled} failed=${finalFailed} images=${finalImages} internalLinks=${finalLinks}`);
  if (lastCrawl) {
    console.log(
      `last live crawl payload: scanned=${lastCrawl.crawled} images=${lastCrawl.imagesAnalyzed} links=${lastCrawl.internalLinksAnalyzed}`
    );
    const ok =
      lastCrawl.crawled === finalCrawled &&
      lastCrawl.imagesAnalyzed === finalImages &&
      lastCrawl.internalLinksAnalyzed === finalLinks;
    console.log(`live values match final result: ${ok ? "YES" : "NO"}`);
  }
  console.log(`audit ran ${Math.round((finishedAt - startAt) / 1000)}s wall-clock`);
})();
