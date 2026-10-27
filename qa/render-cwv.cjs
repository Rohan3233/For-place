// QA render: verifies the new website-wide Core Web Vitals implementation
// end-to-end in the PDF:
//   1. cwv-mixed.pdf  — multi-page aggregate (homepage good, others mixed)
//   2. cwv-insufficient.pdf — no evaluable pages -> page must STILL render
//   3. cwv-legacy.pdf  — no cwv field (old cached audit) -> fallback works
//
// Requires dist-crawler built (npm run build:crawler) and the QA site
// server running (node qa/serve-site.mjs).
const fs = require("node:fs");
const path = require("node:path");
const { runAudit } = require("../dist-crawler/runAudit");
const { explainCrawl } = require("../dist-crawler/explainPage");
const { generateReportPdf } = require("../dist-crawler/generateReportPdf");
const { selectCwvSamplePages, aggregateCoreWebVitals } = require("../dist-crawler/coreWebVitals");

const ORIGIN = "http://127.0.0.1:4599";

function metrics(lcp, inp, cls, ttfb) {
  return {
    performanceScore: null,
    lcpMs: lcp,
    clsScore: cls,
    inpMs: inp,
    ttfbMs: ttfb,
    isMobileFriendly: true,
    accessibilityScore: 74,
    accessibilityIssues: [],
  };
}

(async () => {
  const audit = await runAudit(ORIGIN, {
    maxPages: 40,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: true,
    checkOversizedImages: true,
    oversizedImageThresholdBytes: 150000,
  });

  // --- Scenario 1: multi-page aggregate ---------------------------------
  const sampleUrls = selectCwvSamplePages(audit.crawl, 10);
  const measurements = sampleUrls.map((url, i) => {
    if (i === 0) return { url, ok: true, metrics: metrics(1800, 120, 0.03, 400) }; // homepage good
    if (i === 1) return { url, ok: true, metrics: metrics(5100, 620, 0.29, 1900) }; // LCP+INP+CLS poor
    if (i === 2) return { url, ok: true, metrics: metrics(4600, 180, 0.05, 900) }; // LCP poor
    if (i === 3) return { url, ok: true, metrics: metrics(1800, 120, 0.31, 500) }; // CLS poor
    if (i === 4 || i === 5) return { url, ok: true, metrics: metrics(3000, 250, 0.08, 1200) }; // needs-improvement LCP/INP
    if (i === 6) return { url, ok: false, error: "PageSpeed API quota exceeded (test)" }; // failed
    return { url, ok: true, metrics: metrics(1600, 100, 0.02, 350) }; // rest good
  });
  audit.cwv = aggregateCoreWebVitals(measurements, audit.crawl.pages.length);

  // Accessibility is homepage-lab data, still rendered from pageSpeed.
  audit.pageSpeed = {
    ok: true,
    url: `${ORIGIN}/`,
    strategy: "mobile",
    metrics: metrics(1800, 120, 0.03, 400),
  };

  const explanations = await explainCrawl(audit.crawl, null);
  const opts = { reportUrl: "https://app.seoaudit.ai/audit/qa-fixture/csv" };

  const pdfMixed = await generateReportPdf(audit, explanations, opts);
  fs.writeFileSync(path.join(__dirname, "cwv-mixed.pdf"), pdfMixed);
  console.log(`cwv-mixed.pdf: ${pdfMixed.length} bytes | score=${audit.cwv.score}% evaluated=${audit.cwv.evaluatedPages}/${audit.cwv.sampleSize} passing=${audit.cwv.passingPages} status=${audit.cwv.status}`);

  // --- Scenario 2: insufficient data (no evaluable pages) ----------------
  const insufficientAudit = { ...audit, cwv: aggregateCoreWebVitals([], audit.crawl.pages.length) };
  const pdfInsufficient = await generateReportPdf(insufficientAudit, explanations, opts);
  fs.writeFileSync(path.join(__dirname, "cwv-insufficient.pdf"), pdfInsufficient);
  console.log(`cwv-insufficient.pdf: ${pdfInsufficient.length} bytes | score=${insufficientAudit.cwv.score} status=${insufficientAudit.cwv.status}`);

  // --- Scenario 3: legacy audit (no cwv field, homepage pageSpeed only) --
  const legacyAudit = { ...audit, cwv: undefined };
  const pdfLegacy = await generateReportPdf(legacyAudit, explanations, opts);
  fs.writeFileSync(path.join(__dirname, "cwv-legacy.pdf"), pdfLegacy);
  console.log(`cwv-legacy.pdf: ${pdfLegacy.length} bytes`);

  console.log("Total crawled:", audit.crawl.pages.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
