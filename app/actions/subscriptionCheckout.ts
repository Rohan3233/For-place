"use server";

import { createClient } from "@/lib/supabase/server";

export interface PrepareSubscriptionCheckoutResult {
  error: string | null;
  userId?: string;
  email?: string;
}

export async function prepareSubscriptionCheckout(
  plan: "pro" | "agency"
): Promise<PrepareSubscriptionCheckoutResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to be logged in to subscribe." };
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("plan", plan)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return {
      error: `You already have an active ${
        plan === "agency" ? "Agency" : "Pro"
      } subscription.`,
    };
  }

  return {
    error: null,
    userId: user.id,
    email: user.email ?? undefined,
  };
}