// QA render: reproduce the robots.txt "Directives detected" overlap by
// running the real pipeline against the QA site and patching robotsAudit
// with many directive blocks (nike-like: long paths, several user agents).
//
//   node qa/serve-site.mjs &      (server on 127.0.0.1:4599)
//   node qa/render-robots.cjs
const fs = require("node:fs");
const path = require("node:path");
const PROJ = "C:/Users/LENOVO/Desktop/SEO STARTUP/seoaudit-web";
const { runAudit } = require(path.join(PROJ, "dist-crawler/runAudit"));
const { explainCrawl } = require(path.join(PROJ, "dist-crawler/explainPage"));
const { generateReportPdf } = require(path.join(PROJ, "dist-crawler/generateReportPdf"));

const ORIGIN = "http://127.0.0.1:4599";

const nikeDirectives = [
  { userAgent: "*", disallows: ["/member/inboxes", "/checkout/", "/cart", "/store-locator", "/nike-by-you", "/offers"], allows: [] },
  { userAgent: "Baiduspider", disallows: ["/product/", "/search/", "/member/", "/account/", "/help/"], allows: ["/product/featured"] },
  { userAgent: "HaoSouSpider", disallows: ["/member/inboxes", "/checkout/", "/cart", "/offers/"], allows: [] },
  { userAgent: "Sogou web spider", disallows: ["/member/", "/account/", "/cart", "/checkout/", "/wishlist"], allows: [] },
  { userAgent: "Sogou inst spider", disallows: ["/search/", "/product/", "/gift-cards/"], allows: [] },
  { userAgent: "Sogou spider2", disallows: ["/nike-by-you/", "/offers/", "/members/"], allows: [] },
];

(async () => {
  const audit = await runAudit(ORIGIN, {
    maxPages: 40,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: true,
    checkOversizedImages: true,
    oversizedImageThresholdBytes: 150000,
  });

  // Patch in nike-like robots data.
  audit.crawl.robotsAudit = {
    status: "found",
    disallowedPaths: [
      "/member/inboxes",
      "/checkout/",
      "/cart",
      "/store-locator",
      "/nike-by-you",
      "/offers",
      "/product/",
      "/search/",
      "/member/",
      "/account/",
      "/help/",
      "/wishlist",
      "/gift-cards/",
      "/members/",
      "/locator",
      "/returns",
      "/size-guide",
      "/help-center",
    ],
    httpStatus: 200,
    sitemapDirective: "https://www.nike.com/sitemap-locator-index.xml",
    directives: nikeDirectives,
  };

  // Give the robots page some blocked pages so the full section renders.
  audit.crawl.pagesSkippedRobots = [
    "https://www.nike.com/member/inboxes",
    "https://www.nike.com/checkout/",
    "https://www.nike.com/cart",
    "https://www.nike.com/store-locator",
    "https://www.nike.com/nike-by-you",
  ];

  const explanations = await explainCrawl(audit.crawl, null);
  const pdf = await generateReportPdf(audit, explanations, {
    reportUrl: "https://app.seoaudit.ai/audit/qa-fixture/csv",
  });

  const out = path.join(__dirname, "robots-report.pdf");
  fs.writeFileSync(out, pdf);
  console.log(`Wrote ${out} (${pdf.length} bytes)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
