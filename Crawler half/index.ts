import { crawlPage } from "./crawlPage";
import { crawlSite } from "./crawlSite";
import { runAudit } from "./runAudit";
import { explainCrawl } from "./explainPage";
import { GeminiProvider } from "./geminiProvider";
import { generateReportPdf } from "./generateReportPdf";
import * as fs from "fs";

async function main() {
  const targetUrl = process.argv[2] ?? "https://www.anthropic.com";
  const maxPagesArg = process.argv[3];
  const mode = process.argv[4]; // "full" = Stage 3, "explain" = Stage 3 + AI layer

  if (maxPagesArg) {
    const maxPages = parseInt(maxPagesArg, 10);
    if (Number.isNaN(maxPages) || maxPages < 1) {
      console.error(`Invalid maxPages argument: "${maxPagesArg}"`);
      process.exit(1);
    }

    if (mode === "pdf") {
      // Full pipeline including the PDF report itself, e.g.:
      // GEMINI_API_KEY=yourkey npm start https://example.com 5 pdf
      // Writes report.pdf to the current directory.
      const audit = await runAudit(targetUrl, {
        maxPages,
        pageSpeedApiKey: process.env.PSI_API_KEY,
      });
      const llm = process.env.GEMINI_API_KEY ? new GeminiProvider(process.env.GEMINI_API_KEY) : null;
      const explanations = await explainCrawl(audit.crawl, llm);
      const pdfBuffer = await generateReportPdf(audit, explanations);
      fs.writeFileSync("report.pdf", pdfBuffer);
      console.log(`Wrote report.pdf (${pdfBuffer.length} bytes). Overall score: ${audit.score.overallScore}/100.`);
      return;
    }

    if (mode === "explain") {
      // Full pipeline including AI explanations, e.g.:
      // GEMINI_API_KEY=yourkey npm start https://example.com 5 explain
      // Falls back to template-only explanations (no AI calls) if
      // GEMINI_API_KEY isn't set — useful for testing the crawl/score
      // pipeline without burning API credits.
      const audit = await runAudit(targetUrl, {
        maxPages,
        pageSpeedApiKey: process.env.PSI_API_KEY,
      });
      const llm = process.env.GEMINI_API_KEY ? new GeminiProvider(process.env.GEMINI_API_KEY) : null;
      if (!llm) {
        console.error("(No GEMINI_API_KEY set — explanations will be template-only, no AI calls.)");
      }
      const explanations = await explainCrawl(audit.crawl, llm);
      console.log(JSON.stringify({ audit, explanations }, null, 2));
      return;
    }

    if (mode === "full") {
      // Stage 3: crawl + broken links + PageSpeed + score, with domain caching.
      // e.g. `npm start https://example.com 15 full`
      // Requires PSI_API_KEY env var for reliable PageSpeed results.
      // Note: this CLI uses a fresh in-memory cache each run (process exits
      // after printing), so you won't see cache hits across separate `npm
      // start` invocations — that only shows up within a single process
      // (see cache.test.ts) or once a persistent provider (Supabase, etc.)
      // is wired in for the real app.
      const result = await runAudit(targetUrl, {
        maxPages,
        pageSpeedApiKey: process.env.PSI_API_KEY,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Stage 2: crawl the whole site, e.g. `npm start https://example.com 15`
    const result = await crawlSite(targetUrl, { maxPages });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Stage 1: single page only, e.g. `npm start https://example.com`
  const result = await crawlPage(targetUrl);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  // Should never happen — crawlPage never throws — but kept as a safety net.
  console.error("Unexpected error running crawler:", err);
  process.exit(1);
});
