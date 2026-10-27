"use client";

import { useState } from "react";
import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { triggerSubscriptionAudit } from "@/app/actions/subscriptionAudit";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

interface SubscriptionOption {
  id: string;
  plan: "pro" | "agency";
}

export default function NewSubscriptionAuditForm({
  subscriptions,
}: {
  subscriptions: SubscriptionOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(subscriptions[0]?.id ?? "");

  const selectedPlan = subscriptions.find((s) => s.id === selectedId)?.plan ?? null;

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    formData.set("subscriptionId", selectedId);

    const result = await triggerSubscriptionAudit(formData);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  if (subscriptions.length === 0) {
    return (
      <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
        <div className="sa-form-wrap">
          <Link href="/dashboard" className="sa-back-link">&larr; Dashboard</Link>
          <div className="sa-card">
            <p className="sa-lede">No active subscription found on your account.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <div className="sa-form-wrap">
        <Link href="/dashboard" className="sa-back-link">&larr; Dashboard</Link>

        <div className="sa-card">
          <p className="sa-eyebrow">Subscription</p>
          <h1 className="sa-h1">New audit</h1>
          <p className="sa-lede">Included with your subscription — no extra charge. Uses one report from your monthly allowance.</p>

<form action={handleSubmit} className="sa-form">
  {subscriptions.length > 1 && (
  <div className="sa-label">
    Which plan should this audit use?
    <div className="sa-plan-radio-group">
      {subscriptions.map((s) => (
        <label key={s.id} className="sa-plan-radio-row">
          <input
            type="radio"
            name="subscriptionChoice"
            checked={selectedId === s.id}
            onChange={() => setSelectedId(s.id)}
          />
          {s.plan === "agency" ? "Agency" : "Pro"} plan
        </label>
      ))}
    </div>
  </div>
)}
            <label className="sa-label">
              Website URL
              <input
                id="targetUrl"
                name="targetUrl"
                type="url"
                placeholder="https://example.com"
                required
                className="sa-input"
              />
            </label>

            {selectedPlan === "agency" && (
              <label className="sa-label">
                Agency / brand name <span className="sa-label-optional">(optional — shown on the PDF instead of our branding)</span>
                <input
                  id="agencyName"
                  name="agencyName"
                  type="text"
                  placeholder="Your Agency Co."
                  maxLength={80}
                  className="sa-input"
                />
              </label>
            )}

            {error && <p className="sa-error">{error}</p>}

            <button type="submit" disabled={submitting || !selectedId} className="sa-btn sa-btn-primary sa-btn-block">
              {submitting ? "Running audit…" : "Run audit"}
            </button>
          </form>
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
          .sa-label-optional { font-weight: 400; color: var(--ink-soft); font-size: 12px; }

        .sa-form-wrap { max-width: 440px; margin: 0 auto; padding: 48px 24px 40px; }
        .sa-back-link {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-soft);
          text-decoration: none;
          margin-bottom: 24px;
        }
        .sa-back-link:hover { color: var(--signal); }

        .sa-card {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 32px 28px;
          box-shadow: 0 1px 2px rgba(20, 23, 28, 0.04), 0 12px 32px rgba(20, 23, 28, 0.06);
        }

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
          font-size: 22px;
          letter-spacing: -0.01em;
          margin: 0 0 10px;
        }
        .sa-lede { font-size: 14px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 24px; }

        .sa-form { display: flex; flex-direction: column; gap: 16px; }
        .sa-label { display: block; font-size: 13px; font-weight: 500; color: var(--ink-soft); }
        .sa-plan-radio-group { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.sa-plan-radio-row { display: flex; align-items: center; gap: 8px; font-weight: 400; color: var(--ink); font-size: 14px; }
        .sa-input {
          display: block;
          width: 100%;
          margin-top: 6px;
          padding: 10px 12px;
          font-size: 14px;
          font-family: var(--font-body), sans-serif;
          color: var(--ink);
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 7px;
          box-sizing: border-box;
        }
        .sa-input:focus {
          outline: none;
          border-color: var(--signal);
          box-shadow: 0 0 0 3px var(--signal-soft);
        }

        .sa-error {
          font-size: 13px;
          color: var(--fail);
          background: var(--fail-soft);
          border-radius: 6px;
          padding: 8px 10px;
          margin: 0;
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
      `}</style>
    </main>
  );
}