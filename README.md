# SEOAudit AI — Web App

Next.js application wrapping the SEOAudit AI crawler/audit engine
(`lib/crawler/`): authentication, subscriptions and payments (Paddle),
audit jobs with live progress, and PDF/CSV/ZIP report delivery.

**Read the full documentation first:** `../README.md` (repository root) —
it contains the complete architecture guide, route/action reference,
scoring and caching internals, environment-variable table, deployment
notes, and buyer handoff instructions.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in your own values
npm run build                      # compiles lib/crawler → dist-crawler/, then next build
npm run dev                        # http://localhost:3000
```

Setup order and every required environment variable are documented in
`../README.md` (Installation → Configuration). In short: create a Supabase
project, run the SQL migrations in `supabase/migrations/` **in numeric
order** (001 → 014, with `0010.audit.table.change.sql` after 012), then
configure Paddle sandbox prices and the webhook.

### Common gotcha: first login bounces back to /login

Supabase requires **email confirmation** before a new signup can sign in
(default project setting). If you sign up, get redirected, and are
immediately bounced back to `/login`, confirm the email Supabase sent —
or disable email confirmation under Authentication → Providers while
developing. This is Supabase's setting, not an application bug.

## Tests

The crawler/audit engine has its own hand-rolled test suite, executed via
`ts-node` against `tsconfig.crawler.json` (kept separate from Next.js's
`tsconfig.json` because Next's build settings — `moduleResolution:
bundler`, `noEmit` — are incompatible with running these files directly):

```bash
npm run test:all
```

Individual suites: `npm run test`, `test:site`, `test:score`, `test:cache`,
`test:pdf`, `test:projection`, `test:consistency`, `test:cwv`, and others —
see `package.json`. Most suites are pure unit tests; `test:site` performs
real network crawls.

## Where things live

| Path | Purpose |
|---|---|
| `lib/crawler/` | The audit engine (crawl, score, AEO/GEO, CWV, PDF/CSV/ZIP) |
| `lib/supabase/` | Browser / server / admin / middleware Supabase clients |
| `app/` | Pages, server actions (`app/actions/`), API routes (`app/api/`) |
| `supabase/migrations/` | SQL schema, applied manually in numeric order |
| `qa/` | Ad-hoc development/QA scripts (not part of the product) |

## License

This source code is distributed under a separate commercial license.
The license terms supplied with the purchase govern permitted use,
modification, deployment, redistribution, and resale.
