import Link from "next/link";
import { redirect } from "next/navigation";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import ProgressRunner from "./ProgressRunner";
import type { AuditJobStatus } from "@/app/actions/auditJob";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export default async function AuditProgressPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("audit_jobs")
    .select("id, status, resulting_audit_id, error_message, target_url, created_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !row) {
    return (
      <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
        <div className="sa-notfound">
          <p className="sa-notfound-text">
            Audit job not found &mdash; it may not exist, or may belong to a different account.
          </p>
          <Link href="/dashboard" className="sa-link">&larr; Back to dashboard</Link>
        </div>
        <style>{progressStyles}</style>
      </main>
    );
  }

  // If the job already finished (e.g. this page was reached via back
  // button after completion), skip the runner entirely and go straight
  // to the report.
  if (row.status === "done" && row.resulting_audit_id) {
    redirect(`/audit/${row.resulting_audit_id}`);
  }

  const initialStatus: AuditJobStatus = {
    id: row.id,
    status: row.status as AuditJobStatus["status"],
    resultingAuditId: row.resulting_audit_id,
    errorMessage: row.error_message,
    startedAt: (row as { created_at?: string | null }).created_at ?? null,
  };

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <header className="sa-nav">
        <span className="sa-logo">SEOAudit AI</span>
        <Link href="/dashboard" className="sa-link">&larr; Dashboard</Link>
      </header>

      <section className="sa-progress-head">
        <p className="sa-eyebrow">Running audit</p>
        <h1 className="sa-h1-sm">{row.target_url}</h1>
        <ProgressRunner initialStatus={initialStatus} />
      </section>

      <style>{progressStyles}</style>
    </main>
  );
}

const progressStyles = `
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
    --fail: #D9432E;
    --fail-soft: #FBE9E6;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-body), system-ui, sans-serif;
    min-height: 100vh;
  }

  .sa-nav {
    max-width: 640px;
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
  .sa-link { color: var(--signal); text-decoration: none; font-size: 14px; font-weight: 600; }
  .sa-link:hover { text-decoration: underline; }

  .sa-notfound { max-width: 480px; margin: 120px auto; text-align: center; padding: 0 24px; }
  .sa-notfound-text { color: var(--ink-soft); margin-bottom: 16px; }

  .sa-progress-head { max-width: 640px; margin: 0 auto; padding: 60px 24px 80px; }
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
    font-size: 24px;
    letter-spacing: -0.01em;
    margin: 0 0 36px;
    word-break: break-word;
  }
`;