"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { prepareSubscriptionCheckout } from "@/app/actions/subscriptionCheckout";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

const PADDLE_PRO_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO!;
const PADDLE_AGENCY_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_AGENCY!;

type Plan = "pro" | "agency";

export default function SubscribePage() {
  const router = useRouter();
  const [paddle, setPaddle] = useState<Paddle>();
  const [error, setError] = useState<string | null>(null);
  const [submittingPlan, setSubmittingPlan] = useState<Plan | null>(null);

  useEffect(() => {
    initializePaddle({
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") {
          router.push("/dashboard?subscribed=1");
        }
      },
    }).then((instance) => {
      if (instance) setPaddle(instance);
    });
  }, [router]);

  async function handleSubscribe(plan: Plan) {
    setSubmittingPlan(plan);
    setError(null);

   const result = await prepareSubscriptionCheckout(plan);
    if (result.error || !result.userId) {
      setError(result.error ?? "Something went wrong. Try again.");
      setSubmittingPlan(null);
      return;
    }

    if (!paddle) {
      setError("Payment system is still loading. Wait a second and try again.");
      setSubmittingPlan(null);
      return;
    }

    const priceId = plan === "pro" ? PADDLE_PRO_PRICE_ID : PADDLE_AGENCY_PRICE_ID;

    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: result.email ? { email: result.email } : undefined,
      customData: { user_id: result.userId, plan },
    });

    setSubmittingPlan(null);
  }

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <div className="sa-wrap">
        <Link href="/dashboard" className="sa-back-link">&larr; Dashboard</Link>

        <p className="sa-eyebrow">Subscribe</p>
        <h1 className="sa-h1">Choose a plan</h1>
        <p className="sa-lede">Recurring monthly audits. Payment is handled by Paddle — a secure checkout will open right here.</p>

        {error && <p className="sa-error">{error}</p>}

        <div className="sa-plans">
          <div className="sa-plan">
            <p className="sa-plan-name">Pro</p>
            <p className="sa-plan-price">$30<span className="sa-plan-period">/mo</span></p>
            <p className="sa-plan-detail">100 pages per audit · 30 reports / month</p>
            <button
              onClick={() => handleSubscribe("pro")}
              disabled={submittingPlan !== null}
              className="sa-btn sa-btn-primary sa-btn-block"
            >
              {submittingPlan === "pro" ? "Preparing checkout…" : "Subscribe to Pro"}
            </button>
          </div>

          <div className="sa-plan sa-plan-featured">
            <p className="sa-plan-badge">More headroom</p>
            <p className="sa-plan-name">Agency</p>
            <p className="sa-plan-price">$80<span className="sa-plan-period">/mo</span></p>
            <p className="sa-plan-detail">200 pages per audit · 100 reports / month</p>
            <button
              onClick={() => handleSubscribe("agency")}
              disabled={submittingPlan !== null}
              className="sa-btn sa-btn-primary sa-btn-block"
            >
              {submittingPlan === "agency" ? "Preparing checkout…" : "Subscribe to Agency"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .sa-root {
          --paper: #F6F5F2;
          --paper-raised: #FFFFFF;
          --ink: #14171C;
          --ink-soft: #52565C;
          --line: #E0DFDA;
          --signal: #1D6FD8;
          --signal-soft: #EAF1FC;
          --fail: #D9432E;
          --fail-soft: #FBE9E6;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--font-body), system-ui, sans-serif;
          min-height: 100vh;
        }

        .sa-wrap { max-width: 620px; margin: 0 auto; padding: 48px 24px 60px; }
        .sa-back-link {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-soft);
          text-decoration: none;
          margin-bottom: 24px;
        }
        .sa-back-link:hover { color: var(--signal); }

        .sa-eyebrow {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--signal);
          margin: 0 0 10px;
        }
        .sa-h1 {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 26px;
          letter-spacing: -0.01em;
          margin: 0 0 10px;
        }
        .sa-lede { font-size: 14px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 24px; max-width: 440px; }

        .sa-error {
          font-size: 13px;
          color: var(--fail);
          background: var(--fail-soft);
          border-radius: 6px;
          padding: 8px 10px;
          margin: 0 0 20px;
        }

        .sa-plans {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .sa-plan {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 24px;
          position: relative;
        }
        .sa-plan-featured { border-color: var(--signal); box-shadow: 0 0 0 1px var(--signal); }
        .sa-plan-badge {
          font-family: var(--font-mono), monospace;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--signal);
          background: var(--signal-soft);
          display: inline-block;
          padding: 3px 8px;
          border-radius: 999px;
          margin: 0 0 12px;
        }
        .sa-plan-name { font-size: 13px; font-weight: 600; color: var(--ink-soft); margin: 0 0 6px; }
        .sa-plan-price {
          font-family: var(--font-display), sans-serif;
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 8px;
        }
        .sa-plan-period { font-size: 14px; color: var(--ink-soft); font-weight: 500; }
        .sa-plan-detail {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          color: var(--ink-soft);
          margin: 0 0 20px;
        }

        .sa-btn {
          display: inline-block;
          padding: 11px 18px;
          border-radius: 7px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
        }
        .sa-btn-primary { background: var(--ink); color: #fff; }
        .sa-btn-primary:hover { background: var(--signal); }
        .sa-btn-primary:disabled { opacity: 0.6; cursor: default; }
        .sa-btn-block { width: 100%; }

        @media (max-width: 540px) {
          .sa-plans { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}