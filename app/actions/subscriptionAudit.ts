"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface TriggerSubscriptionAuditResult {
  error: string | null;
}

/**
 * Kicks off an audit for a Pro/Agency subscriber, paid for by their
 * monthly quota instead of a one-time Paddle transaction.
 *
 * This only performs eligibility checks and creates an audit_jobs row.
 * The progress page runs the actual audit pipeline.
 */
export async function triggerSubscriptionAudit(
  formData: FormData
): Promise<TriggerSubscriptionAuditResult> {
  const targetUrl = String(formData.get("targetUrl") ?? "").trim();
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();

  if (!targetUrl) {
    return { error: "Enter a URL to audit." };
  }

  if (!subscriptionId) {
    return { error: "Select which plan to use for this audit." };
  }

  let normalizedUrl: string;

  try {
    normalizedUrl = new URL(targetUrl).toString();
  } catch {
    return {
      error: "That doesn't look like a valid URL. Include https://",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to be logged in." };
  }

  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .select(
      "id, plan, status, max_pages, reports_per_month, reports_used_this_period"
    )
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (subError || !subscription) {
    return { error: "Could not find that subscription on your account." };
  }

  if (subscription.status !== "active") {
    return {
      error: "That subscription isn't active. Check your billing status.",
    };
  }

  if (
    subscription.reports_used_this_period >=
    subscription.reports_per_month
  ) {
    return {
      error: "You've used all your reports for this billing period.",
    };
  }

  const agencyName = String(formData.get("agencyName") ?? "").trim();

  const { data: job, error: jobError } = await supabase
    .from("audit_jobs")
    .insert({
      user_id: user.id,
      subscription_id: subscription.id,
      source: "subscription",
      target_url: normalizedUrl,
      status: "analyzing",
      white_label_brand_name:
        subscription.plan === "agency" && agencyName
          ? agencyName
          : null,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return {
      error: `Could not start the audit: ${
        jobError?.message ?? "unknown error"
      }`,
    };
  }

  redirect(`/audit/progress/${job.id}`);
}