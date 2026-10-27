import Link from "next/link";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <main className={`${display.variable} ${body.variable} ${mono.variable} sa-root`}>
      <header className="sa-nav">
        <span className="sa-logo">SEOAudit AI</span>
        <nav className="sa-nav-links">
          <Link href="/login" className="sa-link">Log in</Link>
          <Link href="/signup" className="sa-btn sa-btn-primary">Sign up</Link>
        </nav>
      </header>

      <section className="sa-hero">
        <div className="sa-hero-copy">
          <p className="sa-eyebrow">AI Search Readiness · Technical SEO · On-page · Performance</p>
          <h1 className="sa-h1">
            Full site audit.
            <br />
            Plain English.
            <br />
            <span className="sa-accent">Before your coffee gets cold.</span>
          </h1>
          <p className="sa-lede">
            Point it at any site and get a scored, client-ready PDF that shows
            how AI assistants like ChatGPT Search, Google Gemini, and Perplexity
            find, trust, and cite your content — alongside the classic
            technical, on-page, and performance fixes. Ready in under 60 seconds.
          </p>
          <div className="sa-cta-row">
            <Link href="/signup" className="sa-btn sa-btn-primary sa-btn-lg">Run a free audit →</Link>
            <a href="#pricing" className="sa-link sa-link-muted">See pricing</a>
          </div>
          <p className="sa-trust">No card required · 1 free audit per day</p>
        </div>

        <div className="sa-panel" aria-hidden="true">
          <div className="sa-sweep" />
          <div className="sa-panel-head">
            <span className="sa-dot" />
            <span className="sa-panel-title">auditing yoursite.com<span className="sa-cursor">_</span></span>
          </div>
          <div className="sa-panel-rule" />
          <ul className="sa-checklist">
            <li className="sa-check sa-check-1"><span>AI Search Readiness (AEO/GEO)</span><span className="sa-tick">✓</span></li>
            <li className="sa-check sa-check-2"><span>Technical SEO</span><span className="sa-tick">✓</span></li>
            <li className="sa-check sa-check-3"><span>On-page SEO</span><span className="sa-tick">✓</span></li>
            <li className="sa-check sa-check-4"><span>Performance</span><span className="sa-tick">✓</span></li>
          </ul>
          <div className="sa-panel-rule" />
          <div className="sa-score">
            <span className="sa-score-num">87<span className="sa-score-max">/100</span></span>
            <span className="sa-score-label">Overall SEO score</span>
            <div className="sa-chips">
              <span className="sa-chip sa-chip-fail">2 critical</span>
              <span className="sa-chip sa-chip-warn">5 moderate</span>
              <span className="sa-chip sa-chip-pass">12 passed</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sa-features">
        <div className="sa-feature">
          <p className="sa-feature-label">01 · AI Search Readiness (AEO / GEO Index)</p>
          <p className="sa-feature-text">A complete diagnostic breakdown of how easily an LLM can extract, trust, and cite your pages across ChatGPT Search, Google Gemini, Perplexity, and Apple Intelligence.</p>
        </div>
        <div className="sa-feature">
          <p className="sa-feature-label">02 · AI Engine Scraping &amp; Fetchability</p>
          <p className="sa-feature-text">Verifies your site architecture doesn't block or time out major AI crawler bots — GPTBot, ClaudeBot, PerplexityBot, and Google-Extended.</p>
        </div>
        <div className="sa-feature">
          <p className="sa-feature-label">03 · Semantic Density &amp; Entity Mapping</p>
          <p className="sa-feature-text">Pinpoints where vague writing or weak structure confuses AI parsers, so your pages read as clear, citable entity definitions.</p>
        </div>
        <div className="sa-feature">
          <p className="sa-feature-label">04 · AI Footprint &amp; Authority Verification</p>
          <p className="sa-feature-text">Checks the identity schema, sameAs cross-references, and trust signals AI systems require before they risk recommending your brand.</p>
        </div>
      </section>

      <section className="sa-pricing" id="pricing">
        <p className="sa-eyebrow sa-eyebrow-center">Pricing</p>
        <div className="sa-plans">
          <div className="sa-plan">
            <p className="sa-plan-name">Free</p>
            <p className="sa-plan-price">$0</p>
            <p className="sa-plan-detail">15 pages · 1 audit / day</p>
          </div>
          <div className="sa-plan">
<p className="sa-plan-name">Pay-as-you-go</p>
            <p className="sa-plan-price">$5</p>
            <p className="sa-plan-detail">50 pages · one-off</p>
          </div>
<Link href="/subscribe" className="sa-plan sa-plan-featured sa-plan-link">
            <p className="sa-plan-badge">Most popular</p>
            <p className="sa-plan-name">Pro</p>
            <p className="sa-plan-price">$30<span className="sa-plan-period">/mo</span></p>
            <p className="sa-plan-detail">100 pages · 30 reports / month</p>
          </Link>
          <Link href="/subscribe" className="sa-plan sa-plan-link">
            <p className="sa-plan-name">Agency</p>
            <p className="sa-plan-price">$80<span className="sa-plan-period">/mo</span></p>
            <p className="sa-plan-detail">350 pages · 60 reports / month</p>
          </Link>
        </div>
      </section>

      <footer className="sa-footer">
        <span className="sa-logo sa-logo-sm">SEOAudit AI</span>
        <div className="sa-footer-links">
          <Link href="/login" className="sa-link">Log in</Link>
          <Link href="/signup" className="sa-link">Sign up</Link>
        </div>
        <span className="sa-copyright">© {year} SEOAudit AI</span>
      </footer>

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
        .sa-nav-links { display: flex; align-items: center; gap: 20px; }

        .sa-link {
          color: var(--ink);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }
        .sa-link:hover { color: var(--signal); }
        .sa-link-muted { color: var(--ink-soft); }
        .sa-link-muted:hover { color: var(--ink); }

        .sa-btn {
          display: inline-block;
          padding: 10px 18px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid transparent;
        }
        .sa-btn-primary { background: var(--ink); color: #fff; }
        .sa-btn-primary:hover { background: var(--signal); }
        .sa-btn-lg { padding: 13px 24px; font-size: 15px; border-radius: 8px; }

        .sa-hero {
          max-width: 1120px;
          margin: 0 auto;
          padding: 72px 24px 88px;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 56px;
          align-items: center;
        }

        .sa-eyebrow {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--signal);
          margin: 0 0 18px;
        }
        .sa-eyebrow-center { text-align: center; margin-bottom: 12px; }

        .sa-h1 {
          font-family: var(--font-display), sans-serif;
          font-weight: 700;
          font-size: 46px;
          line-height: 1.08;
          letter-spacing: -0.015em;
          margin: 0 0 22px;
        }
        .sa-accent { color: var(--signal); }

        .sa-lede {
          font-size: 16px;
          line-height: 1.6;
          color: var(--ink-soft);
          max-width: 460px;
          margin: 0 0 30px;
        }

        .sa-cta-row { display: flex; align-items: center; gap: 22px; margin-bottom: 16px; flex-wrap: wrap; }
        .sa-trust {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          color: var(--ink-soft);
          margin: 0;
        }

        .sa-panel {
          position: relative;
          overflow: hidden;
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 22px 24px 26px;
          min-height: 420px;
          box-shadow: 0 1px 2px rgba(20, 23, 28, 0.04), 0 12px 32px rgba(20, 23, 28, 0.06);
        }
        .sa-sweep {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--signal) 50%, transparent);
          opacity: 0.5;
        }
        @media (prefers-reduced-motion: no-preference) {
          .sa-sweep { animation: sa-sweep-move 3.6s ease-in-out infinite; }
        }
        @keyframes sa-sweep-move {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 0.5; }
          90% { opacity: 0.5; }
          100% { transform: translateY(420px); opacity: 0; }
        }

        .sa-panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .sa-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--signal); flex-shrink: 0; }
        .sa-panel-title {
          font-family: var(--font-mono), monospace;
          font-size: 13px;
          color: var(--ink-soft);
        }
        .sa-cursor { color: var(--signal); }
        @media (prefers-reduced-motion: no-preference) {
          .sa-cursor { animation: sa-blink 1s step-end infinite; }
        }
        @keyframes sa-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

        .sa-panel-rule { height: 1px; background: var(--line); margin: 16px 0; }

        .sa-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .sa-check {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: var(--font-mono), monospace;
          font-size: 14px;
          color: var(--ink);
        }
        .sa-tick { color: var(--pass); font-weight: 700; }
        @media (prefers-reduced-motion: no-preference) {
          .sa-check { opacity: 0; animation: sa-check-in 0.4s ease forwards; }
          .sa-check-1 { animation-delay: 0.3s; }
          .sa-check-2 { animation-delay: 0.85s; }
          .sa-check-3 { animation-delay: 1.4s; }
          .sa-check-4 { animation-delay: 1.95s; }
        }
        @keyframes sa-check-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .sa-score { text-align: center; padding-top: 4px; }
        @media (prefers-reduced-motion: no-preference) {
          .sa-score { opacity: 0; animation: sa-score-in 0.5s ease forwards; animation-delay: 1.9s; }
        }
        @keyframes sa-score-in {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        .sa-score-num {
          font-family: var(--font-mono), monospace;
          font-size: 44px;
          font-weight: 700;
          color: var(--ink);
        }
        .sa-score-max { font-size: 18px; color: var(--ink-soft); font-weight: 500; }
        .sa-score-label {
          display: block;
          font-size: 12px;
          color: var(--ink-soft);
          margin-top: 2px;
          margin-bottom: 14px;
        }
        .sa-chips { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
        .sa-chip {
          font-family: var(--font-mono), monospace;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 999px;
        }
        .sa-chip-fail { background: var(--fail-soft); color: var(--fail); }
        .sa-chip-warn { background: var(--warn-soft); color: var(--warn); }
        .sa-chip-pass { background: var(--pass-soft); color: var(--pass); }

        .sa-features {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 24px 88px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 32px;
          border-top: 1px solid var(--line);
          padding-top: 56px;
        }
        .sa-feature-label {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          font-weight: 600;
          color: var(--signal);
          margin: 0 0 10px;
        }
        .sa-feature-text { font-size: 14px; line-height: 1.6; color: var(--ink-soft); margin: 0; }

        .sa-pricing {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 24px 96px;
          text-align: center;
        }
        .sa-plans {
          margin-top: 28px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          text-align: left;
        }
.sa-plan {
          background: var(--paper-raised);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 20px;
          position: relative;
        }
        .sa-plan-link {
          text-decoration: none;
          color: var(--ink);
          display: block;
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .sa-plan-link:hover { border-color: var(--signal); transform: translateY(-2px); }
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
          margin: 0 0 10px;
        }
        .sa-plan-name { font-size: 13px; font-weight: 600; color: var(--ink-soft); margin: 0 0 6px; }
        .sa-plan-price {
          font-family: var(--font-display), sans-serif;
          font-size: 26px;
          font-weight: 700;
          margin: 0 0 8px;
        }
        .sa-plan-period { font-size: 14px; color: var(--ink-soft); font-weight: 500; }
        .sa-plan-detail {
          font-family: var(--font-mono), monospace;
          font-size: 12px;
          color: var(--ink-soft);
          margin: 0;
        }

        .sa-footer {
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 24px 40px;
          border-top: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .sa-logo-sm { font-size: 14px; }
        .sa-footer-links { display: flex; gap: 18px; }
        .sa-copyright { font-size: 12px; color: var(--ink-soft); }

        @media (max-width: 880px) {
          .sa-hero { grid-template-columns: 1fr; padding-top: 48px; }
          .sa-h1 { font-size: 34px; }
          .sa-features { grid-template-columns: 1fr; gap: 28px; }
          .sa-plans { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 520px) {
          .sa-plans { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}