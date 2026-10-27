"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface TriggerAuditResult {
  error: string | null;
}

export async function triggerAudit(formData: FormData): Promise<TriggerAuditResult> {
  const paidAuditId = String(formData.get("paidAuditId") ?? "").trim();
  if (!paidAuditId) {
    return { error: "Missing order reference." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to be logged in." };
  }

  const { data: order, error: orderError } = await supabase
    .from("paid_audits")
    .select("id, target_url, max_pages, status")
    .eq("id", paidAuditId)
    .maybeSingle();

  if (orderError || !order) {
    return { error: "Order not found." };
  }
  if (order.status !== "paid") {
    return { error: "This order hasn't been paid yet." };
  }

  const { data: existing } = await supabase
    .from("audits")
    .select("id")
    .eq("paid_audit_id", order.id)
    .maybeSingle();

  if (existing) {
    redirect(`/audit/${existing.id}`);
  }

  const { data: existingJob } = await supabase
    .from("audit_jobs")
    .select("id")
    .eq("paid_audit_id", order.id)
    .in("status", ["analyzing", "generating_ai", "saving", "done"])
    .maybeSingle();

  if (existingJob) {
    redirect(`/audit/progress/${existingJob.id}`);
  }

  const { data: job, error: jobError } = await supabase
    .from("audit_jobs")
    .insert({
      user_id: user.id,
      source: "payg",
      paid_audit_id: order.id,
      target_url: order.target_url,
      status: "analyzing",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return { error: `Could not start the audit: ${jobError?.message ?? "unknown error"}` };
  }

  redirect(`/audit/progress/${job.id}`);
}