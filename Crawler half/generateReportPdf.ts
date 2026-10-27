import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "./reportDocument";
import type { RunAuditResult, PageExplanationResult, ReportOptions } from "./types";

/**
 * Generates the client-ready PDF report — the deliverable a freelancer
 * actually sends to their client, per the business doc's core pitch.
 *
 * Deliberately a thin wrapper: all the actual layout/styling lives in
 * reportDocument.tsx. This function's only job is to render that document
 * to a Buffer and hand it back — callers (an API route, presumably) decide
 * what to do with the bytes (upload to storage, stream as a download,
 * etc.), which is out of scope for this crawler package.
 */
export async function generateReportPdf(
  audit: RunAuditResult,
  explanations: PageExplanationResult[],
  options: ReportOptions = {}
): Promise<Buffer> {
 return renderToBuffer(
  React.createElement(ReportDocument, { audit, explanations, options }) as React.ReactElement<import("@react-pdf/renderer").DocumentProps>
);
}
