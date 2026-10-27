import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveAuditTier } from "@/lib/tier";
import type { RunAuditResult, PageExplanationResult, CrawlPageSuccess } from "@/lib/crawler/types";
import { generateAuditCsv } from "@/lib/crawler/generateAuditCsv";

/**
 * Restored CSV export (item #5 — this existed before and disappeared
 * during a refactor). Every place in the PDF that shows "+N more pages
 * affected" or "+N more images/links" links here instead of printing
 * hundreds of URLs into the PDF itself.
 *
 * AUTH: this is a public link (a freelancer's own client won't have a
 * login on this app), so — same pattern as generateReportPdf's reportUrl
 * — it's authenticated by a share_token query param instead of a session,
 * not by requiring the requester to be logged in.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  // Deliberately the admin/service-role client, NOT the session client —
  // this route is a public, token-authenticated link (see the auth note
  // above), so it must work for a request with no login session at all.
  // Security here is enforced entirely by the share_token comparison
  // below, not by RLS.
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from("audits")
    .select(
      "target_url, audit_result, explanations, share_token, paid_audit_id, subscription_id, subscriptions(plan)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  // Token must match exactly — this is the only auth check for a public
  // link, same trust boundary as the PDF's reportUrl.
  if (!row.share_token || row.share_token !== token) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });
  }

  const subscription = Array.isArray(row.subscriptions) ? row.subscriptions[0] : row.subscriptions;
  const tier = deriveAuditTier(row, subscription?.plan ?? null);

  // Matches the PDF route: CSV exports are a paid-tier feature (PAYG,
  // Freelancer/Pro, and Agency) — Free tier doesn't get PDF downloads at
  // all, so there's nothing for this link to be attached to there either.
  if (tier === "free") {
    return NextResponse.json({ error: "CSV export isn't included on the Free plan." }, { status: 403 });
  }

const audit = row.audit_result as RunAuditResult;
  const explanations = row.explanations as PageExplanationResult[];
  const flag = request.nextUrl.searchParams.get("flag");

  const { csvBody, filenameSuffix } = generateAuditCsv(audit, explanations, flag);
  const filename = safeFilename(row.target_url);

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}-${filenameSuffix}.csv"`,
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