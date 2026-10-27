"use client";

import { useState } from "react";
import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { signIn } from "@/app/actions/auth";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await signIn(formData);
    // signIn() only returns on failure — success redirects server-side and
    // never reaches this line.
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <div className="sa-auth-wrap">
        <Link href="/" className="sa-logo">SEOAudit AI</Link>

        <div className="sa-card">
          <h1 className="sa-h1">Log in</h1>

          <form action={handleSubmit} className="sa-form">
            <label className="sa-label">
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="sa-input"
              />
            </label>
            <label className="sa-label">
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="sa-input"
              />
            </label>

            {error && <p className="sa-error">{error}</p>}

            <button type="submit" disabled={submitting} className="sa-btn sa-btn-primary sa-btn-block">
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="sa-switch">
            No account? <Link href="/signup" className="sa-link">Sign up</Link>
          </p>
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

        .sa-auth-wrap {
          max-width: 360px;
          margin: 0 auto;
          padding: 64px 24px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .sa-logo {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--ink);
          text-decoration: none;
          margin-bottom: 32px;
        }

        .sa-card {
          width: 100%;
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 32px 28px;
          box-shadow: 0 1px 2px rgba(20, 23, 28, 0.04), 0 12px 32px rgba(20, 23, 28, 0.06);
        }

        .sa-h1 {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 22px;
          letter-spacing: -0.01em;
          margin: 0 0 24px;
        }

        .sa-form { display: flex; flex-direction: column; gap: 16px; }
        .sa-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-soft);
        }
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
          text-decoration: none;
          border: none;
          cursor: pointer;
        }
        .sa-btn-primary { background: var(--ink); color: #fff; }
        .sa-btn-primary:hover { background: var(--signal); }
        .sa-btn-primary:disabled { opacity: 0.6; cursor: default; }
        .sa-btn-block { width: 100%; }

        .sa-switch {
          margin: 20px 0 0;
          font-size: 13px;
          color: var(--ink-soft);
          text-align: center;
        }
        .sa-link { color: var(--signal); text-decoration: none; font-weight: 600; }
        .sa-link:hover { text-decoration: underline; }
      `}</style>
    </main>
  );
}