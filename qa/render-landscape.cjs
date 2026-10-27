// QA render script: runs the real audit pipeline against the local QA site
// (see serve-site.mjs) and writes a landscape PDF. Requires dist-crawler to
// be built first (npm run build:crawler) and the site server running.
//
//   node qa/serve-site.mjs &
//   node qa/render-landscape.cjs
const fs = require("node:fs");
const path = require("node:path");
const { runAudit } = require("../dist-crawler/runAudit");
const { explainCrawl } = require("../dist-crawler/explainPage");
const { generateReportPdf } = require("../dist-crawler/generateReportPdf");

const ORIGIN = "http://127.0.0.1:4599";

(async () => {
  const audit = await runAudit(ORIGIN, {
    maxPages: 40,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: true,
    checkOversizedImages: true,
    oversizedImageThresholdBytes: 150000,
  });

  // Patch PageSpeed so the Performance & Core Web Vitals page renders.
  audit.pageSpeed = {
    ok: true,
    url: `${ORIGIN}/`,
    strategy: "mobile",
    metrics: {
      performanceScore: 58,
      lcpMs: 4100,
      clsScore: 0.28,
      inpMs: 480,
      ttfbMs: 1500,
      isMobileFriendly: true,
      accessibilityScore: 74,
      accessibilityIssues: [
        {
          id: "color-contrast",
          title: "Elements must have sufficient color contrast",
          description: "Some page text does not have enough contrast against its background to be readable by low-vision users.",
        },
        {
          id: "image-alt",
          title: "Images must have alternate text",
          description: "One or more images on the page are missing descriptive alternative text.",
        },
      ],
    },
  };

  const explanations = await explainCrawl(audit.crawl, null);
  const pdf = await generateReportPdf(audit, explanations, {
    reportUrl: "https://app.seoaudit.ai/audit/qa-fixture/csv",
  });

  const out = path.join(__dirname, "landscape-report.pdf");
  fs.writeFileSync(out, pdf);
  console.log(`Wrote ${out} (${pdf.length} bytes)`);
  console.log(`Overall score: ${audit.score.overallScore}`);
  console.log(`Pages crawled: ${audit.crawl.pages.length}`);
  console.log(`Broken links: ${audit.brokenLinks.length}`);
  console.log(`Oversized images: ${audit.oversizedImages.length}`);
  console.log(`AEO checks: ${audit.aeo.checks.length}`);
  console.log(`Duplicates titles: ${audit.crawl.duplicateTitles.length}, metas: ${audit.crawl.duplicateMetaDescriptions.length}`);
  console.log(`Redirect chains: ${audit.crawl.redirectChains.length}`);
  console.log(`Skipped by robots: ${audit.crawl.pagesSkippedRobots.length}`);
  console.log(`Orphans: ${audit.crawl.orphanPages.length}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
