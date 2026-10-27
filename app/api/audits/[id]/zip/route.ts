// app/api/audits/[id]/zip/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { spawn } from "node:child_process";
import path from "node:path";
import type { RunAuditResult, PageExplanationResult, AgencyBranding } from "@/lib/crawler/types";
import { deriveAuditTier } from "@/lib/tier";
import { generateAuditCsv } from "@/lib/crawler/generateAuditCsv";
import { sanitizeAgencyBranding } from "@/lib/crawler/agencyBranding";
import AdmZip from "adm-zip";

export const runtime = "nodejs";

type ZipBody = { agencyBranding?: unknown };

function runPdfWorker(
  audit: RunAuditResult,
  explanations: PageExplanationResult[],
  options: { reportUrl?: string; includeActionPlan?: boolean; whiteLabel?: boolean; brandName?: string; agencyBranding?: AgencyBranding }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), "dist-crawler", "generatePdfWorker.js");
    const child = spawn(process.execPath, [workerPath], { cwd: process.cwd(), env: process.env });

    const stdoutChunks: Buffer[] = [];
    let stderrText = "";
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderrText += chunk.toString()));
    child.stdin.on("error", () => {});
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderrText || `PDF worker exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });
    child.stdin.write(JSON.stringify({ audit, explanations, options }));
    child.stdin.end();
  });
}

/** Builds a zip Buffer from named file/Buffer pairs using adm-zip. */
function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const zip = new AdmZip();
  
  for (const file of files) {
    zip.addFile(file.name, file.data);
  }
  
  return zip.toBuffer();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleZip(request, id);
}

/**
 * POST accepts the request-scoped agency branding (Agency tier only). The
 * branding lives in memory for this one request — the PDF worker renders
 * it, and nothing is written to any database, user profile, workspace, or
 * audit record. The agency must supply it again for the next report.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: ZipBody;
  try {
    body = (await request.json()) as ZipBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  return handleZip(request, id, body);
}

async function handleZip(request: NextRequest, id: string, body?: ZipBody) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("audits")
    .select(
      "target_url, audit_result, explanations, share_token, paid_audit_id, subscription_id, white_label_brand_name, subscriptions(plan)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const subscription = Array.isArray(row.subscriptions) ? row.subscriptions[0] : row.subscriptions;
  const tier = deriveAuditTier(row, subscription?.plan ?? null);

  // Agency-only. Every other tier keeps using the separate PDF/CSV buttons —
  // this route intentionally refuses anyone else rather than silently
  // producing a zip for a tier that shouldn't have one.
  if (tier !== "agency") {
    return NextResponse.json(
      { error: "The combined ZIP download is only available on the Agency plan." },
      { status: 403 }
    );
  }

  // Request-scoped white-label branding — accepted ONLY for Agency-tier
  // requests, sanitized server-side, never persisted. A non-Agency tier
  // attempting to smuggle branding through a direct POST is rejected here.
  const hasBrandingPayload =
    body?.agencyBranding != null &&
    typeof body.agencyBranding === "object" &&
    Object.keys(body.agencyBranding as Record<string, unknown>).length > 0;
  let agencyBranding: AgencyBranding | undefined;
  if (hasBrandingPayload) {
    const sanitized = sanitizeAgencyBranding(body!.agencyBranding);
    if (!sanitized) {
      return NextResponse.json({ error: "Invalid branding data." }, { status: 400 });
    }
    agencyBranding = sanitized;
  }

  const audit = row.audit_result as RunAuditResult;
  const explanations = row.explanations as PageExplanationResult[];

  const csvUrl = new URL(`/api/audits/${id}/csv`, request.url);
  csvUrl.searchParams.set("token", row.share_token);

  const pdfOptions = {
    // No reportUrl / CSV-download-link needed inside the PDF for Agency —
    // white-labeling deliberately omits any link back to this app's own
    // domain (see the existing pdf/route.ts comment), and the CSV is
    // already bundled directly in the zip instead.
    reportUrl: undefined as string | undefined,
    includeActionPlan: true,
    whiteLabel: true,
    brandName: agencyBranding?.agencyName ?? row.white_label_brand_name ?? undefined,
    agencyBranding,
  };

  let pdfBuffer: Buffer;
  let csvBuffer: Buffer;
  try {
    [pdfBuffer, csvBuffer] = await Promise.all([
      runPdfWorker(audit, explanations, pdfOptions),
      Promise.resolve(Buffer.from(generateAuditCsv(audit, explanations).csvBody, "utf-8")),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error generating the report files.";
    console.error(`ZIP generation failed for audit ${id}: ${message}`);
    return NextResponse.json({ error: "Could not generate the report files." }, { status: 500 });
  }

  let zipBuffer: Buffer;
  try {
    zipBuffer = buildZip([
      { name: "SEO Audit Report.pdf", data: pdfBuffer },
      { name: "crawl-data.csv", data: csvBuffer },
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error building the zip archive.";
    console.error(`ZIP packaging failed for audit ${id}: ${message}`);
    return NextResponse.json({ error: "Could not package the report files." }, { status: 500 });
  }

  const filename = safeZipFilename(row.target_url);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function safeZipFilename(url: string): string {
  try {
    return `${new URL(url).hostname}-seo-audit.zip`;
  } catch {
    return "seo-audit.zip";
  }
}