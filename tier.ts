export type AuditTier = "free" | "payg" | "freelancer" | "agency";

export function deriveAuditTier(
  row: { paid_audit_id: string | null; subscription_id: string | null },
  subscriptionPlan?: "pro" | "agency" | null
): AuditTier {
  if (row.subscription_id) {
    return subscriptionPlan === "agency" ? "agency" : "freelancer";
  }
  if (row.paid_audit_id) return "payg";
  return "free";
}