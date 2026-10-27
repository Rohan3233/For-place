import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { triggerAudit } from "@/app/actions/audits";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

/**
 * Shows purchase/audit status after a Paddle checkout completes. Unlike
 * the Stripe version, there is no "pending" row pre-created before
 * payment — Paddle's webhook (app/api/webhooks/paddle/route.ts) is the
 * ONLY thing that ever writes a paid_audits row, and only once payment is
 * confirmed. So "no row found yet" here means "webhook hasn't landed
 * yet" (normally near-instant), NOT an error — that's the key behavior
 * difference from the old Stripe version of this page.
 *
 * Still reads via the normal session-authenticated client, so RLS
 * (auth.uid() = user_id) guarantees a user only ever sees their own
 * purchase here.
 */
export default async function AuditPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ transaction_id?: string }>;
}) {
  const { transaction_id: transactionId } = await searchParams;

  if (!transactionId) {
    return (
      <Main>
        <p className="sa-body-text">No order to show. Start a new audit from the dashboard.</p>
      </Main>
    );
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("paid_audits")
    .select("id, status, target_url, max_pages, created_at, paid_at")
    .eq("paddle_transaction_id", transactionId)
    .maybeSingle();

  if (!order) {
    return (
      <Main>
        <p className="sa-muted-text">
          Waiting for payment confirmation from Paddle. This is usually
          near-instant — if it&rsquo;s been more than a minute, refresh below.
        </p>
        <RefreshLink transactionId={transactionId} />
      </Main>
    );
  }

  let existingAuditId: string | null = null;
  if (order.status === "paid") {
    const { data: existingAudit } = await supabase
      .from("audits")
      .select("id")
      .eq("paid_audit_id", order.id)
      .maybeSingle();
    existingAuditId = existingAudit?.id ?? null;
  }

  return (
    <Main>
      <p className="sa-order-url">{order.target_url}</p>
      <p className="sa-status-row">
        Status: <span className="sa-status-pill">{order.status}</span>
      </p>

      {existingAuditId ? (
        <>
          <p className="sa-ready-text">Your audit is ready.</p>
          <Link href={`/audit/${existingAuditId}`} className="sa-btn sa-btn-primary">
            View report
          </Link>
        </>
      ) : (
        <>
          <p className="sa-muted-text">
            Payment confirmed for up to {order.max_pages} pages. Run the
            audit now — this can take a minute or two.
          </p>
          <form
            action={async (formData: FormData) => {
              "use server";
              await triggerAudit(formData);
            }}
          >
            <input type="hidden" name="paidAuditId" value={order.id} />
            <button type="submit" className="sa-btn sa-btn-primary">
              Run audit
            </button>
          </form>
        </>
      )}
    </Main>
  );
}

function Main({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <div className="sa-wrap">
        <p className="sa-eyebrow">Order status</p>
        <h1 className="sa-h1">Your audit</h1>
        <div className="sa-card">{children}</div>
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
          --pass: #1F9D55;
          --pass-soft: #E7F6ED;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--font-body), system-ui, sans-serif;
          min-height: 100vh;
        }

        .sa-wrap { max-width: 440px; margin: 0 auto; padding: 64px 24px 40px; }
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
          margin: 0 0 20px;
        }

        .sa-card {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 28px;
          box-shadow: 0 1px 2px rgba(20, 23, 28, 0.04), 0 12px 32px rgba(20, 23, 28, 0.06);
        }

        .sa-body-text, .sa-muted-text { font-size: 14px; color: var(--ink-soft); line-height: 1.5; margin: 0; }
        .sa-order-url { font-family: var(--font-mono), monospace; font-weight: 600; font-size: 14px; margin: 0 0 10px; word-break: break-all; }
        .sa-status-row { font-size: 14px; color: var(--ink-soft); margin: 0 0 20px; }
        .sa-status-pill {
          font-family: var(--font-mono), monospace;
          font-weight: 700;
          font-size: 12px;
          color: var(--pass);
          background: var(--pass-soft);
          padding: 3px 10px;
          border-radius: 999px;
        }
        .sa-ready-text { color: var(--pass); font-size: 14px; margin: 0 0 16px; }

        .sa-btn {
          display: inline-block;
          padding: 11px 18px;
          border-radius: 7px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border: none;
          cursor: pointer;
          margin-top: 16px;
        }
        .sa-btn-primary { background: var(--ink); color: #fff; }
        .sa-btn-primary:hover { background: var(--signal); }
      `}</style>
    </main>
  );
}

function RefreshLink({ transactionId }: { transactionId: string }) {
  return (
    <Link
      href={`/audit/pending?transaction_id=${encodeURIComponent(transactionId)}`}
      className="sa-btn sa-btn-primary"
    >
      Refresh status
    </Link>
  );
}