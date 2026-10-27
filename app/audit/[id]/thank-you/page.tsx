import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export default async function AuditThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tier?: string }>;
}) {
  const { id } = await params;
  const { tier } = await searchParams;
  const isPayg = tier === "payg";

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      {/* PAYG only: silently trigger the real PDF download in the background.
          The PDF route sends Content-Disposition: attachment, so even inside
          a hidden iframe the browser downloads the file rather than
          navigating away from this page. */}
      {isPayg && (
        <iframe src={`/api/audits/${id}/pdf`} style={{ display: "none" }} title="pdf-download" />
      )}

      <div className="sa-wrap">
        <p className="sa-eyebrow">{isPayg ? "Report downloaded" : "Thanks for running an audit"}</p>
        <h1 className="sa-h1">Thanks for trusting us.</h1>

        {isPayg ? (
          <>
            <p className="sa-lede">
              Your PDF should be downloading now. If it doesn&rsquo;t start automatically,{" "}
              <a href={`/api/audits/${id}/pdf`} className="sa-inline-link">click here</a>.
            </p>
            <p className="sa-lede">
              If you run audits regularly, a monthly plan works out cheaper than paying
              per report — and adds a 30-day action plan, CSV exports, and more pages per crawl.
            </p>
            <Link href="/#pricing" className="sa-btn sa-btn-primary">See subscription plans</Link>
          </>
        ) : (
          <>
            <p className="sa-lede">
              The Free plan doesn&rsquo;t include PDF downloads. Upgrading gets you:
            </p>
            <ul className="sa-perks">
              <li>A downloadable, client-ready PDF report</li>
              <li>A suggested 30-day action plan</li>
              <li>AI-written suggestions for titles, meta descriptions, and H1s</li>
              <li>Up to 50–350 pages per crawl, instead of 15</li>
            </ul>
            <div className="sa-cta-row">
              <Link href="/audit/new" className="sa-btn sa-btn-primary">Try Pay-as-you-go — $5</Link>
              <Link href="/#pricing" className="sa-btn sa-btn-ghost">See all plans</Link>
            </div>
          </>
        )}

        <Link href="/dashboard" className="sa-back-link">&larr; Back to dashboard</Link>
      </div>

      <style>{`
        .sa-root {
          --paper: #F6F5F2; --paper-raised: #FFFFFF; --ink: #14171C; --ink-soft: #52565C;
          --line: #E0DFDA; --signal: #1D6FD8; --signal-soft: #EAF1FC;
          background: var(--paper); color: var(--ink); font-family: var(--font-body), system-ui, sans-serif; min-height: 100vh;
        }
        .sa-wrap { max-width: 520px; margin: 0 auto; padding: 72px 24px 48px; }
        .sa-eyebrow { font-family: var(--font-mono), monospace; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--signal); margin: 0 0 12px; }
        .sa-h1 { font-family: var(--font-display), sans-serif; font-weight: 700; font-size: 28px; margin: 0 0 18px; }
        .sa-lede { font-size: 15px; line-height: 1.6; color: var(--ink-soft); margin: 0 0 16px; }
        .sa-inline-link { color: var(--signal); font-weight: 600; }
        .sa-perks { margin: 0 0 24px; padding-left: 20px; color: var(--ink-soft); font-size: 14px; line-height: 1.8; }
        .sa-cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
        .sa-btn { display: inline-block; padding: 11px 18px; border-radius: 7px; font-size: 14px; font-weight: 600; text-decoration: none; }
        .sa-btn-primary { background: var(--ink); color: #fff; }
        .sa-btn-primary:hover { background: var(--signal); }
        .sa-btn-ghost { background: var(--paper-raised); border: 1px solid var(--line); color: var(--ink); }
        .sa-back-link { display: block; margin-top: 20px; font-size: 13px; font-weight: 600; color: var(--ink-soft); text-decoration: none; }
      `}</style>
    </main>
  );
}