# Patch notes — apply alongside the new files

New files (drop in as-is):
- lib/crawler/languageDetect.ts
- lib/crawler/noindexClassification.ts
- lib/crawler/redirectChainAnalysis.ts
- lib/crawler/responseCodeBreakdown.ts
- lib/crawler/brandContext.ts
- lib/crawler/explainPage.ts        (replaces the existing file)
- app/api/audits/[id]/zip/route.ts  (new — Agency-only ZIP download)

Everything below is a small, targeted edit to an existing file. None of
these regenerate a whole file — apply them as diffs so nothing else in
those files changes.

---

## 1. `npm install archiver` (+ `@types/archiver` as a dev dep)

Used by the new zip route.

---

## 2. `lib/crawler/types.ts`

Add one field to `CrawlPageSuccess` (both copies in the file — yes, the
type is defined twice in the current file; add it to both, or better,
delete the duplicate definition while you're in there):

```ts
export interface CrawlPageSuccess {
  // ...existing fields...
  htmlLang: string | null; // raw <html lang="..."> attribute, unnormalized
}
```

Optionally, add per-hop status codes to `RedirectChainInfo` (needed for
`redirectChainAnalysis.ts`'s 301-vs-302-vs-mixed classification; without
it, chain type reports as "unknown" but loop detection still works):

```ts
export interface RedirectChainInfo {
  originalUrl: string;
  finalUrl: string;
  hopCount: number;
  excessive: boolean;
  hopStatusCodes?: number[]; // NEW — one entry per redirect hop, e.g. [301, 301, 302]
}
```

---

## 3. `lib/crawler/crawlPage.ts`

**a) Capture `<html lang>`** — inside the `cheerio.load(html)` block,
near the other top-level extractions:

```ts
const htmlLangRaw = $("html").attr("lang")?.trim() || null;
```

...and add `htmlLang: htmlLangRaw,` to the returned success object.

**b) (Optional, only if you want real chain-type detection) capture
per-hop status codes** in `countRedirectHopsViaHead`. Change its return
type and push a status onto a `steps` array each loop iteration:

```ts
async function countRedirectHopsViaHead(...): Promise<{ finalUrl: string; hopCount: number; hopStatusCodes: number[] } | null> {
  let currentUrl = startUrl;
  let hopCount = 0;
  const hopStatusCodes: number[] = [];
  for (let i = 0; i < MAX_REDIRECT_HOPS; i++) {
    // ...existing fetch...
    const isRedirect = res.status >= 300 && res.status < 400;
    if (!isRedirect) return { finalUrl: currentUrl, hopCount, hopStatusCodes };
    hopStatusCodes.push(res.status);
    // ...existing location handling...
    hopCount++;
  }
  return { finalUrl: currentUrl, hopCount, hopStatusCodes };
}
```

Then thread `headChainResult.hopStatusCodes` through to wherever
`redirectHopCount` is set on the result, as a new `redirectHopStatusCodes`
field on `CrawlPageSuccess`, so `crawlSite.ts` can put it on
`RedirectChainInfo.hopStatusCodes` when it pushes into `redirectChains`.

This is the one genuinely non-trivial upstream change in this batch —
budget real review time for it, it touches a hot path (every redirecting
page). Everything else here is additive.

---

## 4. `lib/crawler/priorityIssues.ts` and `lib/crawler/score.ts` — smart noindex

Import `isLikelySystemPage` from `noindexClassification.ts`. In both
files, wherever noindex pages are counted toward severity/score
(`priorityIssues.ts`'s `CRITICAL_FLAGS` handling for `noindex_meta_tag`
/ `noindex_x_robots_tag`, and `score.ts`'s `FLAG_WEIGHTS` for the same
two keys, plus the "majority noindexed -> cap score at 25" block), split
the affected page list into system-page vs. real:

```ts
const realNoindexPages = noindexPages.filter((p) => !isLikelySystemPage(p.url));
const systemNoindexPages = noindexPages.filter((p) => isLikelySystemPage(p.url));
```

Only `realNoindexPages.length` should feed the critical count / score
penalty / majority-noindexed cap. `systemNoindexPages` should still be
listed in the Indexability Checks section (never hidden — see the
existing "always show, pass or fail" principle in
`indexabilityChecks.ts`) but under an "Intentional / Safe" heading rather
than counted as a problem. `indexabilityChecks.ts`'s
`buildIndexabilityChecks()` is the natural place to split
`affectedUrls` into `affectedUrls` (needs review) and a new
`safeUrls` array using the same filter.

---

## 5. `app/actions/auditJob.ts` — call-site update (breaking change)

The new `explainPage.ts` changes `explainCrawl`'s signature from
`(crawl, llm, thinContentAi?)` to `(crawl, llm)` — the third-parameter
thin-content-AI gating is removed (see the "AUDITOR-NOT-COPYWRITER" note
in the new file). Update the call:

```ts
// before
const explanations = await explainCrawl(auditResult.crawl, llm, {
  allowThinContentAi: true,
  usageCounter: { used: 0 },
});

// after
const explanations = await explainCrawl(auditResult.crawl, llm);
```

`app/actions/freeAudit.ts` already calls `explainCrawl(audit.crawl, null)`
with no third argument, so it needs no change.

**Product note:** this removes the existing Pro/Agency "AI starter draft"
feature for thin-content pages, per the explicit "auditor, not content
creator — never invent replacement content" requirement. If you want to
keep that feature available as an opt-in (clearly labeled "AI draft," off
by default), say so and it can be reinstated as a separate, explicitly-
named field rather than folded into the default explanation flow.

`smartRecommendations.ts`'s `buildIssueGroupSmartNote()` has a branch
specifically about `aiCount` for `thin_content` that references this
feature — simplify that branch to drop the AI-coverage sentence since
`aiGenerated` will now always be `false` for `thin_content` instances.

---

## 6. `app/api/audits/[id]/csv/route.ts` — export the CSV builder

Not shown in the provided file set, but referenced by both the existing
`pdf/route.ts` (via `csvUrl`) and the new `zip/route.ts`. Whatever
function currently builds the CSV buffer inside that route's `GET`
handler needs to be **extracted and exported** so both the existing GET
handler and the new zip route call the identical logic:

```ts
export async function generateAuditCsv(
  audit: RunAuditResult,
  explanations: PageExplanationResult[]
): Promise<Buffer> {
  // ...existing buffer-building logic, moved here unchanged...
}

export async function GET(request: NextRequest, { params }: ...) {
  // ...existing auth/tier checks unchanged...
  const csvBuffer = await generateAuditCsv(audit, explanations);
  // ...existing response unchanged...
}
```

No behavior change for the Freelancer tier — same function, same output,
just callable from two places instead of one.

**UTF-8 note:** wherever the CSV string is turned into a `Buffer`,
prepend a UTF-8 BOM (`\uFEFF`) before encoding, e.g.:

```ts
const csvBuffer = Buffer.from("\uFEFF" + csvString, "utf-8");
```

Excel (the #1 consumer of a "download CSV" button) misdetects encoding
without a BOM and will mangle non-Latin CSV content even though the bytes
are valid UTF-8 — this is very likely a real contributor to the
"corrupted characters" symptom you're seeing for non-English sites,
independent of anything on the AI-generation side.

---

## 7. `app/audit/[id]/page.tsx` — Agency download button

Change the Agency branch of the download button block from:

```tsx
) : (
  <a href={`/api/audits/${row.id}/pdf`} className="sa-btn sa-btn-primary">
    Download PDF report
  </a>
)}
```

to:

```tsx
) : (
  <a href={`/api/audits/${row.id}/zip`} className="sa-btn sa-btn-primary">
    Download report (PDF + CSV)
  </a>
)}
```

The Free and PAYG branches above it are untouched. The Freelancer
(`tier === "freelancer"`) case isn't in this ternary at all today — it's
implicitly falling into the same `else` as Agency currently. **Check
this**: if Freelancer currently shares that same `else` branch (i.e.
`tier === "agency"` and `tier === "freelancer"` both hit the PDF link
today), you need to split it three ways so Freelancer keeps the plain PDF
link and only Agency gets the zip:

```tsx
{tier === "free" ? (
  <Link href={`/audit/${row.id}/thank-you?tier=free`} className="sa-btn sa-btn-primary">
    Download PDF report
  </Link>
) : tier === "payg" ? (
  <Link href={`/audit/${row.id}/thank-you?tier=payg`} className="sa-btn sa-btn-primary">
    Download PDF report
  </Link>
) : tier === "freelancer" ? (
  <a href={`/api/audits/${row.id}/pdf`} className="sa-btn sa-btn-primary">
    Download PDF report
  </a>
) : (
  <a href={`/api/audits/${row.id}/zip`} className="sa-btn sa-btn-primary">
    Download report (PDF + CSV)
  </a>
)}
```

Also add a matching CSV-only button for Freelancer if one doesn't already
exist elsewhere on the page (the task says Freelancer keeps "separate PDF
and CSV download buttons exactly as it does now" — if that second button
already exists elsewhere in the page and I just don't have it in the
provided file, no change needed there).

---

## 8. `lib/crawler/reportDocument.tsx` — multi-script PDF fonts

This is the other real contributor to "corrupted characters," and it's a
font-coverage problem, not a text-encoding bug: Helvetica only covers
WinAnsi (Latin), and the file currently registers exactly one extra font,
`NotoSansThai`, which covers Thai + Latin and nothing else. Any Chinese,
Japanese, Korean, Arabic, or Devanagari (Hindi/Nepali) text run through
that font renders as missing-glyph boxes or garbled output — that matches
the `£*&^%$#` / `????` symptom exactly.

Fix: register one Noto font per script actually needed, and pick the
family per-report based on `detectPrimaryLanguage()`'s `script` field:

```ts
Font.register({ family: "NotoSansSC", fonts: [{ src: path.join(__dirname, "fonts", "NotoSansSC.ttf") }] });      // Chinese
Font.register({ family: "NotoSansJP", fonts: [{ src: path.join(__dirname, "fonts", "NotoSansJP.ttf") }] });      // Japanese
Font.register({ family: "NotoSansKR", fonts: [{ src: path.join(__dirname, "fonts", "NotoSansKR.ttf") }] });      // Korean
Font.register({ family: "NotoSansArabic", fonts: [{ src: path.join(__dirname, "fonts", "NotoSansArabic.ttf") }] }); // Arabic
Font.register({ family: "NotoSansDevanagari", fonts: [{ src: path.join(__dirname, "fonts", "NotoSansDevanagari.ttf") }] }); // Hindi + Nepali
// keep the existing NotoSansThai registration for Thai
```

Then compute once per report:

```ts
const lang = detectPrimaryLanguage(okPagesForScope);
const scriptFontFamily: Record<DetectedLanguage["script"], string> = {
  latin: "NotoSansThai", // any Latin-covering font works; reusing this avoids adding a redundant Latin-only font
  "cjk-han": "NotoSansSC",
  japanese: "NotoSansJP",
  korean: "NotoSansKR",
  arabic: "NotoSansArabic",
  devanagari: "NotoSansDevanagari",
  other: "NotoSansThai",
};
const contentFontFamily = scriptFontFamily[lang.script];
```

...and use `contentFontFamily` (instead of the hardcoded `"NotoSansThai"`
string) everywhere `styles.duplicateValue`, `styles.suggestedTextBlock`,
`styles.beforeText`, and `styles.instanceUrl` are applied — those are
exactly the styles already flagged in the file's own comments as "the
only places non-Latin text can actually appear." Since `StyleSheet.create`
values are static, the cleanest approach is to build those specific style
objects inline with `fontFamily: contentFontFamily` rather than pulling
them from the static `styles` object, or generate the whole stylesheet
inside `ReportDocument()` after `lang` is known instead of at module load.

**You'll need to source the actual `.ttf` files** (Noto Sans SC/JP/KR/
Arabic/Devanagari are all free, Google-hosted, same family as the Thai
one already in the repo) and add them to the same `fonts/` directory
`NotoSansThai.ttf` currently lives in. I can't fetch/ship font binaries
from here — this is the one item in this whole list that needs an asset,
not just code.

---

## 9. Report page additions (web report + PDF) for items not yet wired to UI

The following new modules produce data but aren't yet rendered anywhere:
`redirectChainAnalysis.ts` and `responseCodeBreakdown.ts`. Wire them into
`app/audit/[id]/page.tsx` and `reportDocument.tsx` the same way the
existing `wwwConsistency` / `indexabilityChecks` sections are wired in —
compute once (`analyzeRedirectChains(audit.crawl.redirectChains)`,
`buildResponseCodeBreakdown(audit.crawl)`), then render a section for
each following the existing card/table patterns already in both files.
I left this as data-layer-only rather than guessing at final visual
design, since both files have a clear existing visual language and I'd
rather match it than improvise inline styles you'd have to redo.
