const fs = require("node:fs");
const path = require("node:path");
const { runAudit } = require("../dist-crawler/runAudit");
const { explainCrawl } = require("../dist-crawler/explainPage");
const { generateReportPdf } = require("../dist-crawler/generateReportPdf");
const { aggregateCoreWebVitals } = require("../dist-crawler/coreWebVitals");

const ORIGIN = "http://127.0.0.1:4599";
const scenario = process.argv[2] ?? "insufficient"; // insufficient | mixed

(async () => {
  const audit = await runAudit(ORIGIN, {
    maxPages: 40,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: false,
    checkOversizedImages: false,
  });
  audit.pageSpeed = { ok: false, url: `${ORIGIN}/`, error: "test" };
  if (scenario === "mixed") {
    const sampleUrls = ["https://example.com/", "https://example.com/a", "https://example.com/b"];
    const metrics = (lcp, inp, cls, ttfb) => ({ performanceScore: null, lcpMs: lcp, clsScore: cls, inpMs: inp, ttfbMs: ttfb, isMobileFriendly: true, accessibilityScore: null, accessibilityIssues: [] });
    audit.cwv = aggregateCoreWebVitals(
      [
        { url: sampleUrls[0], ok: true, metrics: metrics(1800, 120, 0.03, 400) },
        { url: sampleUrls[1], ok: true, metrics: metrics(5000, 600, 0.3, 2000) },
        { url: sampleUrls[2], ok: true, metrics: metrics(3000, 250, 0.08, 1200) },
      ],
      audit.crawl.pages.length
    );
  } else {
    audit.cwv = aggregateCoreWebVitals([], audit.crawl.pages.length);
  }
  const explanations = await explainCrawl(audit.crawl, null);
  await generateReportPdf(audit, explanations, { reportUrl: "https://app.seoaudit.ai/audit/qa-fixture/csv" });
  console.log(`RENDERED scenario=${scenario}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
