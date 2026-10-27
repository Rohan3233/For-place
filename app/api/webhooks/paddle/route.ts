import { type NextRequest, NextResponse } from "next/server";
import { EventName } from "@paddle/paddle-node-sdk";
import { paddle } from "@/lib/paddle";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYG_PRICE_USD_CENTS } from "@/lib/paddle";

export const runtime = "nodejs";

const PLAN_LIMITS: Record<"pro" | "agency", { max_pages: number; reports_per_month: number }> = {
  pro: { max_pages: 100, reports_per_month: 30 },
  agency: { max_pages: 350, reports_per_month: 60 },
};

export async function POST(request: NextRequest) {
  const signature = request.headers.get("paddle-signature") ?? "";
  const secret = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing signature or webhook secret." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = await paddle.webhooks.unmarshal(rawBody, secret, signature);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown signature verification error.";
    console.error(`Paddle webhook signature verification failed: ${message}`);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (!event) {
    return NextResponse.json({ received: true, ignored: "unknown" });
  }

  const supabase = createAdminClient();

  // --- Subscription lifecycle events ---
  if (event.eventType === EventName.SubscriptionCreated || event.eventType === EventName.SubscriptionUpdated) {
    const subscription = event.data;
    const customData = subscription.customData as { user_id?: string; plan?: string } | null;
    const plan = customData?.plan as "pro" | "agency" | undefined;

    if (!customData?.user_id || !plan || !PLAN_LIMITS[plan]) {
      console.error(`Paddle subscription ${subscription.id} is missing valid customData (user_id/plan).`);
      return NextResponse.json({ error: "Missing customData on subscription." }, { status: 400 });
    }

    const currentPeriod = subscription.currentBillingPeriod;
    const limits = PLAN_LIMITS[plan];

    // On genuine renewal (period start changed), reset usage to 0.
    // On any other update (e.g. status change), preserve existing usage —
    // we fetch the current row first to decide which case this is.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("current_period_start, reports_used_this_period")
      .eq("paddle_subscription_id", subscription.id)
      .maybeSingle();

    const isNewPeriod = !existing || existing.current_period_start !== currentPeriod?.startsAt;

    const { error } = await supabase.from("subscriptions").upsert(
      {
        user_id: customData.user_id,
        paddle_subscription_id: subscription.id,
        plan,
        status: subscription.status,
        max_pages: limits.max_pages,
        reports_per_month: limits.reports_per_month,
        reports_used_this_period: isNewPeriod ? 0 : existing!.reports_used_this_period,
        current_period_start: currentPeriod?.startsAt ?? new Date().toISOString(),
        current_period_end: currentPeriod?.endsAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "paddle_subscription_id" }
    );

    if (error) {
      console.error(`Failed to upsert subscription ${subscription.id}: ${error.message}`);
      return NextResponse.json({ error: "Database update failed." }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  }

  if (event.eventType === EventName.SubscriptionCanceled) {
    const subscription = event.data;
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("paddle_subscription_id", subscription.id);

    if (error) {
      console.error(`Failed to mark subscription ${subscription.id} canceled: ${error.message}`);
      return NextResponse.json({ error: "Database update failed." }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  }

  // --- One-time PAYG transaction events (existing logic, unchanged) ---
  if (event.eventType !== EventName.TransactionCompleted && event.eventType !== EventName.TransactionPaid) {
    return NextResponse.json({ received: true, ignored: event.eventType });
  }

  const transaction = event.data;

const customData = transaction.customData as { user_id?: string; target_url?: string; plan?: string } | null;

  // Subscription-related transactions carry `plan` (or a subscriptionId) instead of
  // `target_url` — they're not PAYG purchases, skip silently instead of erroring.
  if (transaction.subscriptionId || customData?.plan || !customData?.target_url) {
    return NextResponse.json({ received: true, ignored: "not_a_payg_transaction" });
  }

  if (!customData?.user_id) {
    console.error(`Paddle transaction ${transaction.id} is missing user_id.`);
    return NextResponse.json({ error: "Missing customData on transaction." }, { status: 400 });
  }

  const { error } = await supabase.from("paid_audits").upsert(
    {
      user_id: customData.user_id,
      target_url: customData.target_url,
      paddle_transaction_id: transaction.id,
      status: "paid",
      paid_at: new Date().toISOString(),
      max_pages: 50,
      amount_cents: PAYG_PRICE_USD_CENTS,
    },
    { onConflict: "paddle_transaction_id" }
  );

  if (error) {
    console.error(`Failed to upsert paid_audits row for transaction ${transaction.id}: ${error.message}`);
    return NextResponse.json({ error: "Database update failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}