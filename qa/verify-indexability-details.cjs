// QA verification: a failed Indexability check must now produce a detailed
// issue section in the PDF (not just a count in the grid).
//   node qa/serve-site.mjs &
//   node qa/verify-indexability-details.cjs
const path = require("node:path");
const PROJ = "C:/Users/LENOVO/Desktop/SEO STARTUP/seoaudit-web";
const { runAudit } = require(path.join(PROJ, "dist-crawler/runAudit"));
const { buildIndexabilityChecks, buildIndexabilityDetailGroups } = require(path.join(PROJ, "dist-crawler/indexabilityChecks"));
const { generateReportPdf } = require(path.join(PROJ, "dist-crawler/generateReportPdf"));

const ORIGIN = "http://127.0.0.1:4599";

(async () => {
  const audit = await runAudit(`${ORIGIN}/`, {
    maxPages: 60,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: false,
    checkOversizedImages: false,
  });

  const checks = buildIndexabilityChecks(audit);
  const failed = checks.filter((c) => !c.passed);
  console.log("--- Indexability checks ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} ${c.label}: ${c.affectedCount} affected`);
  }
  if (failed.length === 0) {
    console.log("NO failed checks on QA site — cannot verify detail pages. Check fixtures.");
    process.exit(1);
  }

  const detailGroups = buildIndexabilityDetailGroups(audit);
  console.log(`\ndetail groups for failed checks: ${detailGroups.length}`);
  for (const g of detailGroups) {
    console.log(`- flag=${g.flag} instances=${g.instances.length} whyItMatters=${g.whyItMatters ? "present" : "MISSING"} businessImpact=${g.businessImpact ? "present" : "MISSING"} fix=${g.recommendedFix ? "present" : "MISSING"} snippet=${g.codeSnippet ? "present" : "none"}`);
    const urls = g.instances.map((i) => i.url);
    const check = checks.find((c) => c.key === g.flag);
    const same = check && urls.length === check.affectedUrls.length && urls.every((u) => check.affectedUrls.includes(u));
    console.log(`  URLs match check data: ${same ? "YES" : "NO"} (${urls.length} urls)`);
  }

  // Render the PDF and verify the detail page content is present.
  const pdf = await generateReportPdf(audit, [], {
    includeActionPlan: false,
    reportUrl: "https://example.com/audit/x",
  });
  require("fs").writeFileSync(path.join(PROJ, "qa/out-indexability.pdf"), pdf);
  console.log(`\nPDF rendered: ${pdf.length} bytes -> qa/out-indexability.pdf`);

  const { execFileSync } = require("node:child_process");
  const out = execFileSync(
    "python",
    [
      path.join(PROJ, "qa/check-pdf-text.py"),
      path.join(PROJ, "qa/out-indexability.pdf"),
      "Page blocked from indexing (noindex meta tag)",
      "BUSINESS IMPACT",
      "RECOMMENDED FIX",
      "HOW TO VERIFY THIS FIX",
      "AFFECTED PAGES",
      "ESTIMATED TIME",
      "noindex",
    ],
    { encoding: "utf8" }
  );
  const found = out
    .trim()
    .split("\n")
    .map((line) => {
      const [ok, needle] = line.split("|");
      return [needle, ok === "FOUND"];
    });
  console.log("\n--- PDF text checks ---");
  for (const [needle, ok] of found) console.log(`${ok ? "FOUND" : "MISSING"} "${needle}"`);
  const allOk = found.every(([, ok]) => ok) && detailGroups.length === failed.length;
  console.log(allOk ? "\nVERIFY PASS — failed indexability checks have full detail pages" : "\nVERIFY FAIL");
  process.exit(allOk ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
