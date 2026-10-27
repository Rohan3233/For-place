import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

const { data: audits, error } = await supabase
    .from("audits")
    .select("id, target_url, overall_score, pages_crawled, created_at")
    .eq("user_id", user?.id ?? "")
    .order("created_at", { ascending: false });

  // Determines whether the third quick-action card sends the user to run
  // a subscription audit, or to /subscribe to get one first — /subscribe
  // was otherwise an orphaned page with no link pointing to it anywhere.
const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, plan, reports_per_month, reports_used_this_period")
    .eq("user_id", user?.id ?? "")
    .eq("status", "active");

  const activeSubscriptions = subscriptions ?? [];
  const hasActiveSubscription = activeSubscriptions.length > 0;

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <header className="sa-nav">
        <span className="sa-logo">SEOAudit AI</span>
<div className="sa-nav-right">
          {hasActiveSubscription ? (
            activeSubscriptions.map((sub) => (
              <span key={sub.id} className="sa-plan-badge sa-plan-badge-active">
                {sub.plan === "agency" ? "Agency" : "Freelancer"} plan active
              </span>
            ))
          ) : (
            <span className="sa-plan-badge">No active subscription</span>
          )}
          <span className="sa-user-email">{user?.email}</span>
          <form action={signOut}>
            <button type="submit" className="sa-btn sa-btn-ghost">Log out</button>
          </form>
        </div>
      </header>

      <section className="sa-dash-head">
        <p className="sa-eyebrow">Dashboard</p>
        <h1 className="sa-h1-sm">Run a new audit</h1>
      </section>

      <section className="sa-quick-actions">
        <Link href="/audit/new-free" className="sa-action-card">
          <p className="sa-action-label">Free</p>
          <p className="sa-action-title">Free audit</p>
          <p className="sa-action-detail">15 pages · 1 per day</p>
        </Link>
        <Link href="/audit/new" className="sa-action-card">
          <p className="sa-action-label">$5</p>
          <p className="sa-action-title">Pay-as-you-go</p>
          <p className="sa-action-detail">50 pages · one-off</p>
        </Link>
{hasActiveSubscription ? (
          <Link href="/audit/new-subscription" className="sa-action-card sa-action-card-featured">
            <p className="sa-action-label">Included</p>
            <p className="sa-action-title">Subscription audit</p>
            <p className="sa-action-detail">
              {activeSubscriptions.length > 1
                ? "Choose a plan on the next screen"
                : `Uses your ${activeSubscriptions[0].plan} plan quota`}
            </p>
          </Link>
        ) : (
          <Link href="/subscribe" className="sa-action-card sa-action-card-featured">
            <p className="sa-action-label">Pro · Agency</p>
            <p className="sa-action-title">Get a subscription</p>
            <p className="sa-action-detail">Recurring monthly audits, included</p>
          </Link>
        )}
      </section>
      {activeSubscriptions.length > 0 && (
        <section className="sa-quota">
          <h2 className="sa-h2">Your plan usage</h2>
          <div className="sa-quota-grid">
            {activeSubscriptions.map((sub) => {
              const remaining = Math.max(0, sub.reports_per_month - sub.reports_used_this_period);
              return (
                <div key={sub.id} className="sa-quota-card">
                  <p className="sa-quota-plan">{sub.plan === "agency" ? "Agency" : "Freelancer"} plan</p>
                  <p className="sa-quota-num">
                    {remaining} <span className="sa-quota-of">/ {sub.reports_per_month}</span>
                  </p>
                  <p className="sa-quota-label">reports remaining this period</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="sa-history">
        <h2 className="sa-h2">Your audits</h2>

        {error && (
          <p className="sa-error">Couldn&rsquo;t load your audit history: {error.message}</p>
        )}

        {!error && (!audits || audits.length === 0) && (
          <div className="sa-empty">
            <p className="sa-empty-title">No audits yet</p>
            <p className="sa-empty-text">Run your first one above — free, no card required.</p>
          </div>
        )}

        {audits && audits.length > 0 && (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Score</th>
                  <th>Pages</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit) => (
                  <tr key={audit.id}>
                    <td className="sa-td-site">{audit.target_url}</td>
                    <td>
                      <span className={`sa-score-chip ${scoreClass(audit.overall_score)}`}>
                        {audit.overall_score}
                      </span>
                    </td>
                    <td className="sa-td-mono">{audit.pages_crawled}</td>
                    <td className="sa-td-mono sa-td-muted">
                      {new Date(audit.created_at).toLocaleDateString()}
                    </td>
                    <td className="sa-td-action">
                      <Link href={`/audit/${audit.id}`} className="sa-link">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`
        .sa-root {
          --paper: #F6F5F2;
          --paper-raised: #FFFFFF;
          --ink: #14171C;
          --ink-soft: #52565C;
          --line: #E0DFDA;
          --signal: #1D6FD8;
          --signal-soft: #EAF1FC;
          --pass: #1F9D55;
          --pass-soft: #E7F6ED;
          --warn: #D98A1A;
          --warn-soft: #FBF0DF;
          --fail: #D9432E;
          --fail-soft: #FBE9E6;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--font-body), system-ui, sans-serif;
          min-height: 100vh;
        }

        .sa-nav {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sa-logo {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 18px;
          letter-spacing: -0.01em;
        }
        .sa-nav-right { display: flex; align-items: center; gap: 16px; }
        .sa-user-email {
          font-family: var(--font-mono), monospace;
          font-size: 13px;
          color: var(--ink-soft);
        }

        .sa-btn {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid var(--line);
          background: var(--paper-raised);
          color: var(--ink);
          cursor: pointer;
        }
        .sa-btn-ghost:hover { border-color: var(--ink); }

        .sa-link { color: var(--signal); text-decoration: none; font-size: 13px; font-weight: 600; }
        .sa-link:hover { text-decoration: underline; }

        .sa-dash-head { max-width: 1120px; margin: 0 auto; padding: 56px 24px 0; }
        .sa-eyebrow {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--signal);
          margin: 0 0 10px;
        }
        .sa-h1-sm {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 30px;
          letter-spacing: -0.01em;
          margin: 0;
        }

        .sa-quick-actions {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
          .sa-quota { max-width: 1120px; margin: 0 auto; padding: 28px 24px 0; }
.sa-quota-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.sa-quota-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; }
.sa-quota-plan { font-size: 12px; font-weight: 600; color: var(--ink-soft); margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.sa-quota-num { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 26px; margin: 0; }
.sa-quota-of { font-size: 14px; color: var(--ink-soft); font-weight: 500; }
.sa-quota-label { font-size: 12px; color: var(--ink-soft); margin: 4px 0 0; }
        .sa-action-card {
          display: block;
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 20px;
          text-decoration: none;
          color: var(--ink);
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .sa-action-card:hover { border-color: var(--signal); transform: translateY(-2px); }
        .sa-action-card-featured { border-color: var(--signal); box-shadow: 0 0 0 1px var(--signal); }
        .sa-action-label {
          font-family: var(--font-mono), monospace;
          font-size: 11px;
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
        .sa-action-title { font-weight: 600; font-size: 15px; margin: 0 0 4px; }
        .sa-action-detail {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          color: var(--ink-soft);
          margin: 0;
        }

        .sa-history { max-width: 1120px; margin: 0 auto; padding: 48px 24px 80px; }
        .sa-h2 {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 18px;
          margin: 0 0 18px;
        }

        .sa-error {
          color: var(--fail);
          background: var(--fail-soft);
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 14px;
        }

        .sa-empty {
          border: 1px dashed var(--line);
          border-radius: 10px;
          padding: 40px 24px;
          text-align: center;
        }
        .sa-empty-title { font-weight: 600; margin: 0 0 6px; }
        .sa-empty-text { color: var(--ink-soft); font-size: 14px; margin: 0; }

        .sa-table-wrap {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 10px;
          overflow: hidden;
        }
        .sa-plan-badge {
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink-soft);
}
.sa-plan-badge-active { background: var(--signal-soft); color: var(--signal); }
        .sa-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .sa-table th {
          text-align: left;
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--ink-soft);
          padding: 12px 16px;
          border-bottom: 1px solid var(--line);
        }
        .sa-table td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
        }
        .sa-table tr:last-child td { border-bottom: none; }
        .sa-td-site { font-weight: 500; }
        .sa-td-mono { font-family: var(--font-mono), monospace; }
        .sa-td-muted { color: var(--ink-soft); }
        .sa-td-action { text-align: right; }

        .sa-score-chip {
          font-family: var(--font-mono), monospace;
          font-weight: 700;
          font-size: 13px;
          padding: 3px 10px;
          border-radius: 999px;
        }
        .sa-score-pass { background: var(--pass-soft); color: var(--pass); }
        .sa-score-warn { background: var(--warn-soft); color: var(--warn); }
        .sa-score-fail { background: var(--fail-soft); color: var(--fail); }

        @media (max-width: 780px) {
          .sa-quick-actions { grid-template-columns: 1fr; }
          .sa-table-wrap { overflow-x: auto; }
          .sa-table { min-width: 560px; }
        }
      `}</style>
    </main>
  );
}

function scoreClass(score: number): string {
  if (score >= 80) return "sa-score-pass";
  if (score >= 50) return "sa-score-warn";
  return "sa-score-fail";
}