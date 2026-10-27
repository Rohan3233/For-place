"use client";

import { useState } from "react";
import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { triggerFreeAudit } from "@/app/actions/freeAudit";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

/**
 * Entry point for the free tier: 1 audit per day (UTC), up to 15 pages,
 * no payment. Separate from /audit/new (PAYG) and
 * /audit/new-subscription (Pro/Agency) — same reasoning as before, keep
 * each tier's working flow isolated rather than one shared smart router.
 */
export default function NewFreeAuditPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);

    const result = await triggerFreeAudit(formData);
    // triggerFreeAudit redirects on success, so reaching this line at all
    // means it returned an error instead.
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <div className="sa-form-wrap">
        <Link href="/dashboard" className="sa-back-link">&larr; Dashboard</Link>

        <div className="sa-card">
          <p className="sa-eyebrow">Free</p>
          <h1 className="sa-h1">Free audit</h1>
          <p className="sa-lede">1 free audit per day, up to 15 pages. No card required.</p>

          <form action={handleSubmit} className="sa-form">
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

            {error && <p className="sa-error">{error}</p>}

            <button type="submit" disabled={submitting} className="sa-btn sa-btn-primary sa-btn-block">
              {submitting ? "Running audit…" : "Run free audit"}
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