# Patch notes — AI Search Optimization (AEO/GEO) section

Same convention as the existing `PATCH_NOTES.md`: new files drop in as-is,
everything else below is a targeted diff to an existing file. Apply as
diffs, not full-file regenerations.

**Scope note:** this implements the feature as *report presentation* —
one new section in both report surfaces, reusing existing detection
logic wherever a check already exists elsewhere (indexability, canonicals,
robots/sitemap, redirect chains, broken links, Core Web Vitals, alt text,
meta title/description, thin content). It does **not** change `score.ts`
or the underlying flags those checks are based on — moving where
something is *displayed* is a much smaller, safer change than moving
what's *detected*, and nothing in the request asked for the SEO score
itself to change.

---

## New files (drop in as-is)

- `lib/crawler/aeoTypes.ts`
- `lib/crawler/aeoSignals.ts`
- `lib/crawler/aeoCrawlability.ts`
- `lib/crawler/aeoCopy.ts`
- `lib/crawler/aeoReport.ts`

---

## 1. `lib/crawler/types.ts`

Add one field to `CrawlPageSuccess` (the interface, not the duplicate —
per the existing note in `PATCH_NOTES.md`, that duplicate should already
be gone; if it isn't, add to both and then delete the duplicate):

```ts
export interface CrawlPageSuccess {
  // ...existing fields...
  aeoSignals: AeoPageSignals; // see lib/crawler/aeoSignals.ts
}
```

Import at the top:

```ts
import type { AeoPageSignals } from "./aeoSignals";
```

Add to `RunAuditResult`:

```ts
export interface RunAuditResult {
  // ...existing fields...
  aeo: import("./aeoTypes").AeoAuditResult;
}
```

---

## 2. `lib/crawler/crawlPage.ts`

**a) Import the new extractor** near the top:

```ts
import { extractAeoSignals } from "./aeoSignals";
```

**b) Capture `jsonLdBlocks` for reuse** — it's already collected inside
the existing cheerio block for schema detection; no change needed there,
just don't let it go out of scope before the new call below.

**c) Call `extractAeoSignals` right before the `return` in the success
path**, after `wordCount` and `structuredData` are computed (it needs
`visibleText`, `wordCount`, and `jsonLdBlocks`, all already in scope at
that point):

```ts
const aeoSignals = extractAeoSignals($, finalUrl, visibleText, wordCount, jsonLdBlocks);
```

**d) Add `aeoSignals,` to the returned success object**, alongside the
existing `htmlLang,`.

This is the only change to `crawlPage.ts` itself — all the actual
heuristics live in `aeoSignals.ts` so this hot-path file stays readable.

---

## 3. `lib/crawler/runAudit.ts`

Add the AEO network checks (bot access + llms.txt) alongside the
existing `crawlPromise` / `pageSpeedPromise` parallel kickoff, and build
the final `aeo` result after the crawl resolves (it needs `groupedIssues`,
which today is computed downstream in `explainPage.ts`/`groupIssues.ts` —
see note below).

```ts
import { checkAiBotAccess, fetchRawRobotsTxt, checkLlmsTxt } from "./aeoCrawlability";
import { buildAeoAuditResult } from "./aeoReport";
// groupExplanationsByIssue is normally called later (after explainCrawl),
// but AEO's thin_content display only needs the flag + affected URLs, not
// the AI-generated suggestion text — so it's cheapest to give
// buildAeoAuditResult a minimal GroupedIssue-shaped list built directly
// from crawl.pages here, rather than threading explanations into runAudit
// (which doesn't otherwise depend on the AI layer at all). See the
// "Minimal thin-content group" snippet below.
```

Kick off the two new network calls in parallel with the existing crawl/
PageSpeed promises:

```ts
const rootOrigin = (() => {
  try {
    return new URL(rootUrl).origin;
  } catch {
    return null;
  }
})();

const aeoBotAccessPromise = rootOrigin
  ? fetchRawRobotsTxt(rootOrigin, userAgent).then((txt) => checkAiBotAccess(txt))
  : Promise.resolve(checkAiBotAccess(null));
const aeoLlmsTxtPromise = rootOrigin
  ? checkLlmsTxt(rootOrigin, userAgent)
  : Promise.resolve({ present: false, url: "" });
```

Await them alongside the existing `Promise.all([crawlPromise, pageSpeedPromise])`
(add them to that same `Promise.all`, or a second one right after — either
is fine, they're independent and cheap).

**Minimal thin-content group**, built without the AI layer:

```ts
function buildMinimalThinContentGroup(crawl: CrawlSiteResult): GroupedIssue[] {
  const instances = crawl.pages
    .filter((p): p is CrawlPageSuccess => p.ok && p.flags.includes("thin_content"))
    .map((p) => ({ url: p.url, suggestedText: null, aiGenerated: false, currentValue: null }));
  if (instances.length === 0) return [];
  const template = getIssueTemplate("thin_content")!; // from templates.ts, already imported elsewhere
  return [
    {
      flag: "thin_content",
      issueLabel: template.issueLabel,
      whyItMatters: template.whyItMatters,
      businessImpact: template.businessImpact,
      recommendedFix: template.recommendedFix,
      instances,
      smartNote: "",
    },
  ];
}
```

Then, right before building `result`:

```ts
const [aeoBotAccess, aeoLlmsTxt] = await Promise.all([aeoBotAccessPromise, aeoLlmsTxtPromise]);
const aeo = buildAeoAuditResult(
  { crawl, brokenLinks, oversizedImages, pageSpeed, score } as RunAuditResult,
  aeoBotAccess,
  aeoLlmsTxt,
  buildMinimalThinContentGroup(crawl)
);
```

And add `aeo,` to the `result` object.

**Why this doesn't duplicate the "real" thin_content group used in
Issues by Type:** the report layer (`reportDocument.tsx` / web
`page.tsx`) already computes its own full `groupedIssues` (with AI
suggestions) from `explanations`, which only exist after `explainCrawl()`
runs — a step that happens *outside* `runAudit()` (see `freeAudit.ts` /
`auditJob.ts`). `runAudit()` itself never had access to AI-generated
explanations and still doesn't; the minimal group above is only what's
needed to list affected URLs for display, not to duplicate the AI text.

---

## 4. `reportDocument.tsx` (PDF) — insertion point

Insert the new AEO page(s) **immediately before** the existing:

```tsx
{options.includeActionPlan !== false && actionPlan.length > 0 && (
  <Page size="A4" style={styles.page} wrap>
    <Text style={styles.sectionHeading}>Suggested 30-Day Action Plan</Text>
    ...
```

New block to add right above it:

```tsx
<Page size="A4" style={styles.page} wrap>
  <Text style={styles.sectionHeading}>AI Search Optimization (AEO/GEO)</Text>
  <Text style={styles.priorityNote}>
    How discoverable and citable this site is to AI answer engines (ChatGPT, Claude, Perplexity, Gemini, and
    similar) — a complementary lens to the traditional SEO checks above, not a replacement for them.
  </Text>
  {groupAeoChecksByCategory(audit.aeo.checks).map((group) => (
    <View key={group.category} wrap={false} style={{ marginBottom: 14 }}>
      <Text style={[styles.issueLabel, { fontSize: 12, marginBottom: 6 }]}>{group.category}</Text>
      <View style={styles.checksGrid}>
        {group.checks.map((check) => (
          <View key={check.key} style={styles.checkCard} wrap={false}>
            <View style={styles.checkCardHead}>
              <Text style={styles.checkCardLabel}>{check.label}</Text>
              <Text style={check.passed ? styles.checkCardPass : styles.checkCardFail}>
                {check.passed ? "PASS" : check.affectedCount > 0 ? `${check.affectedCount} affected` : "REVIEW"}
              </Text>
            </View>
            <Text style={styles.checkCardStatus}>{check.statusText}</Text>
            {!check.passed && (
              <Text style={[styles.issueText, { marginTop: 4 }]}>
                <Text style={styles.issueLabelKey}>Recommended fix: </Text>
                {check.recommendedFix}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  ))}
  <Footer options={options} />
</Page>
```

Add the import at the top of the file:

```tsx
import { groupAeoChecksByCategory } from "./aeoTypes";
```

This deliberately reuses `styles.checksGrid` / `styles.checkCard` /
`styles.checkCardHead` / `styles.checkCardLabel` / `styles.checkCardPass`
/ `styles.checkCardFail` / `styles.checkCardStatus` — all already defined
for Indexability Checks / Complete SEO Check Coverage, so no new styles
needed and the visual language matches automatically.

### Removing the moved checks from their old PDF locations

For each of the following, the **detection logic and score impact stay
exactly as-is** — only remove the *rendering* from the old spot, since
it now also appears (with AEO-specific copy) in the new section:

- **Meta title / Meta description**: in `otherIssuesRemaining`, also
  exclude `"missing_title"`, `"title_length_out_of_range"`,
  `"missing_meta_description"`, `"meta_description_length_out_of_range"`
  the same way `SCHEMA_FLAGS_HANDLED_ELSEWHERE` already excludes the
  schema flags — add a new `Set` and filter it out alongside the existing
  one.
- **Image alt text**: exclude `"missing_alt_text"` from `imageIssues`
  the same way (filter before rendering the Image SEO page).
- **Indexability**: the dedicated "Indexability Checks" page — keep it as
  the source of truth (per its own "always show, pass or fail" principle
  from `indexabilityChecks.ts`); do NOT remove it. The new AEO section's
  `indexability_aeo` check is additive framing, not a replacement — this
  is explicitly allowed to appear in both places since one is the
  technical detail page and the other is a one-line AEO-framed summary
  pointing back at it (see its `recommendedFix` copy: "see the
  Indexability Checks section above").
- **Canonicals, Robots.txt/Sitemap, Redirect Chains, Broken Links, Core
  Web Vitals**: same reasoning as Indexability — these already have
  dedicated, detailed pages elsewhere in the report. The AEO checks
  summarize and re-frame them, they don't replace the detail pages. Do
  not remove those pages.

  (Reasoning for treating title/description/alt-text differently from
  indexability/canonicals/etc.: the former three are simple binary
  page-level flags with no dedicated page of their own today — they only
  ever lived inside the generic "Issues by Type" / "Image SEO" grouped-
  issue cards, so leaving them there AND in AEO would be a true duplicate
  with identical presentation. The latter five have substantial dedicated
  pages — Broken Links grouped by failure category, Redirect Chain detail,
  full Core Web Vitals scale bars, etc. — that the flat AEO check-card
  format can't and shouldn't try to replace.)

---

## 5. `app/audit/[id]/page.tsx` (web report) — insertion point

Insert the new section **immediately before**:

```tsx
{tier !== "free" && actionPlan.length > 0 && (
  <section className="sa-actionplan">
    <h2 className="sa-h2">Suggested 30-day action plan</h2>
    ...
```

New block:

```tsx
<section className="sa-issues">
  <h2 className="sa-h2">AI Search Optimization (AEO/GEO)</h2>
  <p className="sa-priority-note">
    How discoverable and citable this site is to AI answer engines (ChatGPT, Claude, Perplexity, Gemini, and
    similar) — a complementary lens to the SEO checks above, not a replacement for them.
  </p>
  {groupAeoChecksByCategory(audit.aeo.checks).map((group) => (
    <div key={group.category} style={{ marginBottom: 24 }}>
      <h3 className="sa-issue-title" style={{ marginBottom: 10 }}>{group.category}</h3>
      <div className="sa-checks-grid">
        {group.checks.map((check) => (
          <div key={check.key} className="sa-check-card">
            <div className="sa-check-head">
              <span className="sa-check-label">{check.label}</span>
              <span className={check.passed ? "sa-check-pass" : "sa-check-fail"}>
                {check.passed ? "PASS" : check.affectedCount > 0 ? `${check.affectedCount} affected` : "REVIEW"}
              </span>
            </div>
            <p className="sa-check-status">{check.statusText}</p>
            {!check.passed && (
              <p className="sa-issue-why" style={{ marginTop: 6 }}>
                <strong>Recommended fix:</strong> {check.recommendedFix}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  ))}
</section>
```

Add the import at the top of the file:

```tsx
import { groupAeoChecksByCategory } from "@/lib/crawler/aeoTypes";
```

Same reuse principle as the PDF: `.sa-checks-grid` / `.sa-check-card` /
`.sa-check-head` / `.sa-check-label` / `.sa-check-pass` / `.sa-check-fail`
/ `.sa-check-status` are all already defined (Indexability Checks /
Complete SEO Check Coverage) — zero new CSS needed.

### Removing the moved checks from their old web-report locations

Same three (title, description, alt text) and same reasoning as the PDF
section above — filter `"missing_title"`, `"title_length_out_of_range"`,
`"missing_meta_description"`, `"meta_description_length_out_of_range"`,
and `"missing_alt_text"` out of `otherIssues` / `imageIssues` before
rendering "Issues by type" / "Image SEO". Indexability, canonicals,
robots/sitemap, redirect chains, broken links, and Core Web Vitals keep
their existing dedicated sections, unchanged, for the same reasoning
given in the PDF notes.

---

## 6. Cache / backward-compatibility note

Cached audit results (`cache.ts` / `SupabaseCacheProvider`) written
*before* this patch won't have an `aeo` field. `runAudit.ts`'s cache-hit
path already has a precedent for this exact situation — the existing
`crawlDurationMs ?? 0` / `auditDate ?? cached.storedAt` backfill. Add the
same pattern:

```ts
aeo: cached.result.aeo ?? { botAccess: [], llmsTxt: { present: false, url: "" }, checks: [] },
```

so an old cached entry renders an empty (not broken) AEO section instead
of crashing the report page. `CrawlPageSuccess.aeoSignals` is similarly
optional in practice for old cached crawl data even though the type says
otherwise — `aeoReport.ts` already treats it defensively (`p.aeoSignals`
checked before use), so no report-time change is needed there.

---

## 7. Testing note

None of this has been executed against a live site in this environment
(same honest caveat as the rest of this codebase — see `README.md`'s
"Honest status" section). Before shipping: run a real audit against a
site with known robots.txt bot rules, an llms.txt file, and some FAQ/
Article schema, and visually confirm the new PDF page and web section
both render sensibly and agree with each other.
