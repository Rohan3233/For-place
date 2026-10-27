"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseCacheProvider } from "@/lib/crawler/supabaseCache";
import { runAudit } from "@/lib/crawler/runAudit";
import { explainCrawl } from "@/lib/crawler/explainPage";


const FREE_MAX_PAGES = 15;

export interface TriggerFreeAuditResult {
  error: string | null;
}

/**
 * Runs a free-tier audit: no payment, no subscription — just capped at 15
 * pages and 1 per user per UTC day (business doc pricing table). A free
 * audit is identified purely by having BOTH paid_audit_id and
 * subscription_id null on the audits row; no new column or table needed.
 *
 * "1/day" resets at UTC midnight, not the user's local time — simplest
 * correct implementation. Revisit only if this actually causes complaints.
 */
export async function triggerFreeAudit(formData: FormData): Promise<TriggerFreeAuditResult> {
  const targetUrl = String(formData.get("targetUrl") ?? "").trim();
  if (!targetUrl) {
    return { error: "Enter a URL to audit." };
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = new URL(targetUrl).toString();
  } catch {
    return { error: "That doesn't look like a valid URL. Include https://" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to be logged in." };
  }

  // UTC midnight boundary for "today".
  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);

  const { data: todaysFreeAudit, error: checkError } = await supabase
    .from("audits")
    .select("id")
    .eq("user_id", user.id)
    .is("paid_audit_id", null)
    .is("subscription_id", null)
    .gte("created_at", startOfTodayUtc.toISOString())
    .maybeSingle();

  if (checkError) {
    return { error: `Could not check your free audit usage: ${checkError.message}` };
  }
  if (todaysFreeAudit) {
    return { error: "You've used your free audit for today. Come back tomorrow, or upgrade for more." };
  }

  // Domain-level cache (see lib/crawler/supabaseCache.ts): two accounts
  // auditing the same domain within the 7-day TTL share one crawl. Uses the
  // service-role client because the cache table has RLS enabled with no
  // policies (backend-only by design), and runAudit's own try/catch degrades
  // gracefully to a fresh audit if the cache is unavailable.
  const audit = await runAudit(normalizedUrl, {
    maxPages: FREE_MAX_PAGES,
    pageSpeedApiKey: process.env.PSI_API_KEY,
    cacheProvider: new SupabaseCacheProvider(createAdminClient()),
  });

// Free tier never calls the AI layer, regardless of whether an API key
// is configured — this is a deliberate product tier boundary, not an
// availability check.
const explanations = await explainCrawl(audit.crawl, null);

  const { data: inserted, error: insertError } = await supabase
    .from("audits")
    .insert({
      user_id: user.id,
      paid_audit_id: null,
      subscription_id: null,
      target_url: normalizedUrl,
      overall_score: audit.score.overallScore,
      pages_crawled: audit.crawl.pages.length,
      audit_result: audit,
      explanations,
    })
    .select("id")
    .single();

  if (insertError) {
    return { error: `Audit completed but could not be saved: ${insertError.message}` };
  }

  redirect(`/audit/${inserted.id}`);
}