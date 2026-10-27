import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { spawn } from "node:child_process";
import path from "node:path";
import type { RunAuditResult, PageExplanationResult, AgencyBranding } from "@/lib/crawler/types";
import { deriveAuditTier } from "@/lib/tier";
import { sanitizeAgencyBranding } from "@/lib/crawler/agencyBranding";

type PdfBody = { agencyBranding?: unknown };

function runPdfWorker(
  audit: RunAuditResult,
  explanations: PageExplanationResult[],
  options: { reportUrl?: string; includeActionPlan?: boolean; whiteLabel?: boolean; brandName?: string; agencyBranding?: AgencyBranding; auditCompletedAt?: string }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Compiled by `npm run build:crawler` (runs automatically as part of
    // `npm run build`, see package.json) — NOT ts-node. Spawning ts-node
    // at request time worked locally but doesn't reliably work in
    // Vercel's serverless environment (live TS compilation inside a
    // function invocation, no persistent filesystem guarantees, extra
    // cold-start cost). This spawns a plain compiled .js file with plain
    // node instead — nothing TypeScript-related happens at request time.
    const workerPath = path.join(process.cwd(), "dist-crawler", "generatePdfWorker.js");

    const child = spawn(process.execPath, [workerPath], {
      cwd: process.cwd(),
      env: process.env,
    });

    const stdoutChunks: Buffer[] = [];
    let stderrText = "";

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderrText += chunk.toString()));
    child.stdin.on("error", () => {
      // Child may have already exited/closed stdin (e.g. crashed on startup);
      // the real failure reason will surface via stderrText and the "close" handler.
    });

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

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePdf(request, id);
}

/**
 * POST accepts request-scoped white-label branding. Branding is Agency-tier
 * only and use-and-discard: it lives in memory for this one request, is
 * rendered into the PDF, and is never persisted — the agency enters it again
 * for every report. Any non-Agency tier attempting to send branding through
 * a direct request is rejected server-side (not just hidden in the UI).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PdfBody;
  try {
    body = (await request.json()) as PdfBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  return handlePdf(request, id, body);
}

async function handlePdf(request: NextRequest, id: string, body?: PdfBody) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

const { data: row, error } = await supabase
    .from("audits")
    .select("target_url, audit_result, explanations, share_token, paid_audit_id, subscription_id, white_label_brand_name, created_at, subscriptions(plan)")
    .eq("id", id)
    .maybeSingle();

if (error || !row) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

const subscription =
  Array.isArray(row.subscriptions)
    ? row.subscriptions[0]
    : row.subscriptions;

const tier = deriveAuditTier(row, subscription?.plan ?? null);
  if (tier === "free") {
    return NextResponse.json(
      { error: "PDF downloads aren't included on the Free plan." },
      { status: 403 }
    );
  }
const audit = row.audit_result as RunAuditResult;
  const explanations = row.explanations as PageExplanationResult[];
  // Points to the public, token-authenticated CSV export rather than the
  // login-gated web report — a freelancer's own client won't have an
  // account on this app, so a link requiring login would just 404 them
  // into a login wall. The CSV route checks share_token instead of a
  // session, so it works for anyone with the link.
const includeCsvLink = tier === "freelancer" || tier === "agency";
  const csvUrl = new URL(`/api/audits/${id}/csv`, request.url);
  csvUrl.searchParams.set("token", row.share_token);

  // Request-scoped white-label branding — Agency tier only. A freelancer or
  // payg tier attempting to inject branding through a direct POST is
  // rejected here; this is server-side enforcement, not just UI hiding.
  const hasBrandingPayload =
    body?.agencyBranding != null &&
    typeof body.agencyBranding === "object" &&
    Object.keys(body.agencyBranding as Record<string, unknown>).length > 0;
  let agencyBranding: AgencyBranding | undefined;
  if (hasBrandingPayload) {
    if (tier !== "agency") {
      return NextResponse.json(
        { error: "White-label branding is only available on the Agency plan." },
        { status: 403 }
      );
    }
    const sanitized = sanitizeAgencyBranding(body!.agencyBranding);
    if (!sanitized) {
      return NextResponse.json({ error: "Invalid branding data." }, { status: 400 });
    }
    agencyBranding = sanitized;
  }

const pdfOptions: Parameters<typeof runPdfWorker>[2] = {
    reportUrl: includeCsvLink ? csvUrl.toString() : undefined,
    includeActionPlan: true, // safe: this route already returned 403 above for tier === "free"
    // Audits row created_at = when the audit was saved = the end of the
    // whole pipeline (analysis + AI + save). Combined with the audit's
    // auditStartedAt (stamped at job creation), the PDF's "Total runtime"
    // is a true wall-clock span, not a sum of parallel stage durations.
    auditCompletedAt: row.created_at ?? undefined,
  };
  if (agencyBranding) {
    pdfOptions.whiteLabel = true;
    pdfOptions.brandName = agencyBranding.agencyName ?? row.white_label_brand_name ?? undefined;
    pdfOptions.agencyBranding = agencyBranding;
  } else if (tier === "agency" && row.white_label_brand_name) {
    pdfOptions.whiteLabel = true;
    pdfOptions.brandName = row.white_label_brand_name;
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await runPdfWorker(audit, explanations, pdfOptions);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown PDF generation error.";
    console.error(`PDF generation failed for audit ${id}: ${message}`);
    return NextResponse.json({ error: "Could not generate PDF." }, { status: 500 });
  }

  const filename = safeFilename(row.target_url);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}

function safeFilename(url: string): string {
  try {
    return `seo-audit-${new URL(url).hostname}`;
  } catch {
    return "seo-audit-report";
  }
}