// QA probe: with auditStartedAt + auditCompletedAt stamped, the PDF's
// "Total runtime" must show the WALL-CLOCK span (18 min), not the summed
// stage durations (25m35s). Requires dist-crawler built + QA site running.
const fs = require("node:fs");
const path = require("node:path");
const PROJ = "C:/Users/LENOVO/Desktop/SEO STARTUP/seoaudit-web";
const { runAudit } = require(path.join(PROJ, "dist-crawler/runAudit"));
const { explainCrawl } = require(path.join(PROJ, "dist-crawler/explainPage"));
const { generateReportPdf } = require(path.join(PROJ, "dist-crawler/generateReportPdf"));

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

  // Simulate the job pipeline stamps: audit started at T, saved 18 min later.
  const startedAt = "2026-08-13T10:00:00.000Z";
  const completedAt = "2026-08-13T10:18:00.000Z";
  audit.auditStartedAt = startedAt;

  // Fake a parallel-stage sum larger than the wall span (the old bug).
  audit.timings.totalMs = 25 * 60 * 1000 + 35 * 1000;

  const explanations = await explainCrawl(audit.crawl, null);
  const pdf = await generateReportPdf(audit, explanations, {
    reportUrl: "https://app.seoaudit.ai/audit/qa-fixture/csv",
    auditCompletedAt: completedAt,
  });
  const out = path.join(__dirname, "runtime-report.pdf");
  fs.writeFileSync(out, pdf);

  // Dump the Audit Scope page text and find the Total runtime line.
  const { execSync } = require("node:child_process");
  const pyFile = path.join(__dirname, "_dump_runtime.py");
  fs.writeFileSync(
    pyFile,
    `import sys\nsys.path.insert(0, 'C:/Users/LENOVO/Desktop/SEO STARTUP/seoaudit-web/.pdfqa')\nimport pypdfium2 as pdfium\npdf = pdfium.PdfDocument(r"${out}")\nfor pno in range(len(pdf)):\n    t = pdf[pno].get_textpage().get_text_bounded()\n    if 'Total runtime' in t:\n        for line in t.splitlines():\n            ls = line.strip()\n            if 'Total runtime' in ls or ls in ('Crawl', 'Core Web Vitals', 'Broken links', 'Image analysis'):\n                print(f\"p{pno+1}: {ls}\")\n        break\n`
  );
  const dump = execSync(`python "${pyFile}"`, { encoding: "utf8" });
  fs.unlinkSync(pyFile);
  console.log(dump);
  const has18 = /Total runtime\s*18 min/.test(dump);
  const has2535 = /Total runtime\s*25 min 35 sec/.test(dump);
  console.log(has18 ? "PROBE PASS — Total runtime shows the 18 min wall-clock span" : "PROBE FAIL — did not find '18 min' total");
  if (has2535) console.log("PROBE FAIL — Total runtime still shows the summed 25 min 35 sec");
  process.exit(has18 && !has2535 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
