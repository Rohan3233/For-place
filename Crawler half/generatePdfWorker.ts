// Runs in its own Node child process (see generateReportPdf's known
// incompatibility with Next.js App Router route handlers). Reads audit
// data as JSON from stdin, writes raw PDF bytes to stdout.
// IMPORTANT: never console.log here — stdout is reserved for the PDF
// binary. Use console.error for any logging/debugging.

import { generateReportPdf } from "./generateReportPdf";
import type { RunAuditResult, PageExplanationResult, ReportOptions } from "./types";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const raw = await readStdin();
  const { audit, explanations, options } = JSON.parse(raw) as {
    audit: RunAuditResult;
    explanations: PageExplanationResult[];
    options?: ReportOptions;
  };

  const pdfBuffer = await generateReportPdf(audit, explanations, options ?? {});
  process.stdout.write(pdfBuffer);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});