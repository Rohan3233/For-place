"use server";

import { createClient } from "@/lib/supabase/server";

export interface PrepareCheckoutResult {
  error: string | null;
  userId?: string;
  email?: string;
  normalizedUrl?: string;
}

/**
 * Validates the target URL and confirms the user is logged in — same
 * checks the old Stripe flow did before creating a Checkout Session. This
 * version creates NO db row and NO payment session itself: Paddle's
 * checkout is a client-side overlay (the user never leaves this page), so
 * there's no "pending" state to pre-insert. The paid_audits row is
 * created directly by the webhook (app/api/webhooks/paddle/route.ts) once
 * payment is actually confirmed, using the user_id and target_url
 * returned here and passed through as Paddle's customData.
 */
export async function prepareCheckout(formData: FormData): Promise<PrepareCheckoutResult> {
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
    return { error: "You need to be logged in to purchase an audit." };
  }

  return { error: null, userId: user.id, email: user.email ?? undefined, normalizedUrl };
}