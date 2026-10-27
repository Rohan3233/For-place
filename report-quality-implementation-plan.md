# Report Quality Pass: 9.2 → 9.8+ — Implementation Plan

Scope note: I only have direct access to `aeoCopy.ts`, `aeoTypes.ts`, `aeoReport.ts`, `reportDocument.tsx`,
`page.tsx`, `aeoCrawlability.ts`, `aeoSignals.ts`, `runAudit.ts`, and `route.ts`. Anything that requires
`scoreProjection.ts`, `priorityIssues.ts`, `categoryScores.ts`, `brokenLinks.ts`, `responseCodeBreakdown.ts`,
`smartRecommendations.ts`, or `templates.ts` is marked **Recommended-only** below — I implemented what's possible
at the render layer without those files, and flagged the rest precisely so it's a quick follow-up once shared.

Status legend: ✅ Shipped this pass · 🟡 Partially shipped (render-layer fix; source-of-truth fix still needed) · ⬜ Recommended-only (needs a file I don't have)

---

## Tier 1 — Do now (shipped this pass, zero backend/crawler dependency)

### 1. Never allow scores above 100 — ✅ Shipped
- **Why it matters:** "100+" reads as a bug to a paying client, not a projection. It's the single most obvious
  "this was automated" tell in the closing page.
- **Complexity:** Trivial — a `Math.min(100, ...)` clamp at render time.
- **React PDF compatibility:** None — pure arithmetic on values already being rendered.
- **Backend/crawler changes:** None required for the fix itself. The underlying `projectScoreAfterFixes()` in
  `scoreProjection.ts` should also be capped at its source (🟡 — I clamped at render time as a defensive backstop,
  but the calculation itself may still be producing >100 internally, which is worth fixing properly if you can
  share that file).
- **Impact:** High — removes a visible defect for near-zero cost.

### 2. Separate genuine broken links from temporary failures — ✅ Shipped
- **Why it matters:** Reporting a 429 or a DNS blip with the same weight as a 404 inflates the broken-link count
  and undermines trust the moment a client reruns the crawl and the number changes. This is exactly the kind of
  thing a senior consultant would never let ship.
- **What I built:** New `brokenLinkClassification.ts` — classifies each failed link as `broken` (404, 410, DNS
  failure, or any other non-transient error) vs. `temporary` (429, 408, 502, 503, 504, connection reset, SSL/TLS
  handshake failures) using `statusCode`/`errorMessage`, which were already on every broken-link record. Wired
  into both `reportDocument.tsx` (new "Temporary Crawl Issues" page, separate from "Broken Links") and `page.tsx`
  (new "Temporary crawl issues" section). Also fixed an existing inconsistency where the web report's broken-link
  count didn't exclude `blocked_by_robots` links the way the PDF already did — both now agree.
- **Complexity:** Low-medium. One new ~50-line utility, reused in two places.
- **React PDF compatibility:** New page follows the exact same `<Page wrap>` / grouped-list pattern already used
  for Broken Links — no new primitives.
- **Backend/crawler changes:** None — classification happens entirely from data already captured.
- **Impact:** High — this is a genuine trust issue, not just polish.

### 3. Improve response code reporting — ✅ Shipped
- **Why it matters:** "Status 429" and "Status 404" read as raw API dumps. "429 Rate Limited" and "404 Not Found"
  read as something a human reviewed.
- **What I built:** New `statusCodeLabels.ts` with a lookup table (200 OK, 301/302/307/308 Redirect variants, 404
  Not Found, 410 Gone, 429 Rate Limited, 5xx variants, etc.), with a safe `Status {code}` fallback for anything
  not in the table. Wired into the Response Code Breakdown detail rows and the Broken Links status column in both
  the PDF and web report.
- **Complexity:** Trivial.
- **React PDF compatibility:** None — text substitution only.
- **Backend/crawler changes:** None — `responseCodeBreakdown.ts` already buckets by individual code; this only
  changes the label shown for each code.
- **Impact:** Medium-high, very cheap.

### 5. Improve wording (remove robotic phrasing) — ✅ Shipped for the instance found; ⬜ rest needs other files
- **What I found and fixed:** "Batch / Template Fix Recommended" → *"This issue is template-driven — a single
  template update can likely resolve it across every affected page."* (full version, issue cards) and *"Template
  fix — resolves every page at once"* (compact version, action plan / web table, where space is tighter). Fixed
  in both `reportDocument.tsx` and `page.tsx`.
- **What I could not find:** The exact sentence you flagged — *"AI starter drafts aren't included on this tier —
  expand these manually, or upgrade for AI-assisted drafts"* — is not in any of the 9 files I have access to. It
  almost certainly lives in `smartRecommendations.ts`, `priorityIssues.ts`, or `templates.ts`. **This needs those
  files** — I don't want to guess-edit strings I can't see, since a wrong guess could break a tier-gating check
  that references that exact string elsewhere.
- **Complexity:** Trivial per-instance; scope is the only unknown until those files are shared.
- **Impact:** High — this is the most damaging tell in the report (explicitly reveals "AI-generated, paywalled").

### 8. Improve estimated effort presentation — ✅ Shipped
- **What I built:** `effortIndicatorEmoji()` — derives 🟢/🟡/🔴 from the existing time-estimate label text
  (`"~15 minutes"` → 🟢, `"~2 hours"` → 🟡, `"~2 days"` → 🔴, using minute/hour thresholds) with no new
  estimation logic. Applied to the issue-card impact row, the Priority Fixes table, and the 30-Day Action Plan in
  both the PDF and web report.
- **Complexity:** Trivial — regex over an existing string, defensive fallback (no icon) if the label format ever
  changes shape.
- **React PDF compatibility:** Emoji render as plain glyphs in `<Text>` — same approach already used for
  `IMPACT_EMOJI` elsewhere in this file, so this isn't a new risk.
- **Impact:** Medium — small visual upgrade, very cheap.

### 4. Explain category scores — 🟡 Shipped for known categories, defensive fallback for unknown ones
- **What I built:** A one-sentence `CATEGORY_EXPLANATION` lookup (Performance, Accessibility, Metadata, Content,
  Technical — the five keys visible via the existing `CATEGORY_ANCHOR` map) rendered under each category's score
  bar in both the PDF and web report, with a generic fallback sentence for any category key I can't see in the
  files I have (protects against `categoryScores.ts` returning a key I don't know about).
- **Risk flagged honestly:** I don't have `categoryScores.ts`, so these five sentences are my best inference of
  what feeds each score from how the rest of the report uses those flags (e.g. Technical = canonical/redirect/
  indexability/robots, per the existing `INDEXABILITY_FLAGS` set and AEO technical-readiness checks). **Worth a
  quick sanity check against the actual scoring weights** once that file's available, in case the real weighting
  differs from what I inferred.
- **Impact:** Medium-high, client-facing "why" is one of the more common freelance-client questions.

### 10. Improve trust (measured vs. estimated vs. calculated) — 🟡 Shipped a first pass
- **What I built:** Added *"Measured live via Google PageSpeed Insights — not an estimate"* under the Performance
  heading, and *"Impact, difficulty, and time estimates ... are calculated from issue type and page count, not
  guarantees"* under the Priority Fixes note, in both surfaces. The existing projection disclaimer on the closing
  page already covered that box.
- **What's left:** A full audit/label pass across every number in the report (schema counts = detected, category
  scores = calculated, broken links = measured, etc.) is worth doing but is genuinely a per-section judgment call
  best made with the actual scoring/estimation source files in hand, so I've scoped this as a light first pass
  rather than claiming full coverage.
- **Impact:** Medium — mostly matters for a technically literate client who'll interrogate the numbers.

### 12. Polish AEO/GEO — ✅ Shipped (score + reordering); layout split already done in the prior pass
- **What I built:** An "AI Readiness Score" (pass-count / total-check-count from the AEO checks already computed,
  via the existing `aeoSummary()` helper — no new detection logic) shown at the top of the AEO section in both
  surfaces, plus each category's checks now sort failing-first so the highest-priority AI issues are the first
  thing a reader sees per category, without changing what's in each category.
- **Complexity:** Low — pure arithmetic + `.sort()` on data already assembled.
- **React PDF compatibility:** Reuses the existing `scoreBlock`/`scoreNumber` styles from the cover page instead
  of inventing new components, per the "extend, don't replace" instruction.
- **Impact:** High — this was flagged as already one of the strongest sections; a summary score gives it the same
  "premium tool" affordance the overall score has on page 1.

---

## Tier 2 — High value, but needs a file I don't have

| # | Item | Needs | Why I stopped here |
|---|------|-------|---------------------|
| 5 (remainder) | Strip all AI/tier/upgrade language | `smartRecommendations.ts`, `priorityIssues.ts`, `templates.ts` | Can't find or safely edit strings I can't see |
| 1 (root cause) | Cap projection math at its source, not just at render | `scoreProjection.ts` | Render-layer clamp shipped as a safe backstop; the real fix is one line in that file |
| 4 (verification) | Confirm category weighting matches the sentences I wrote | `categoryScores.ts` | Sentences are a reasonable inference, not verified against actual weights |
| 9 | New executive visual summaries (severity distribution, quick-wins-vs-long-term, most impactful issues) | Mostly already exist (`issueDistribution`, exec stat cards) — a genuinely *new* chart (e.g. quick-wins-vs-long-term split) would need a small new data-shaping function, likely in `priorityIssues.ts` or a new `chartMath.ts` addition | Your instructions explicitly say "avoid decorative charts" and "don't increase page count unnecessarily" — I didn't want to add a chart just to check a box. If you want this, the highest-value one is **Quick Wins vs. Long-Term Work** as a single stacked bar on the existing Quick Wins page (no new page). |

---

## Tier 3 — Genuinely lower priority / higher effort for the value

- **6. Whitespace/visual hierarchy pass** — I made targeted spacing additions (new explanation lines, score
  blocks) but did **not** do a wholesale spacing pass across ~30 pages, per your explicit "polish, don't redesign"
  instruction — a blind global spacing change risks the exact overflow/clipping bugs you're trying to eliminate.
  Recommend doing this as a visual QA pass against a real rendered PDF, not a blind code edit.
- **7. Severity badge visual differentiation** — existing `priorityHigh/Medium/Low` and `impactPillHigh/Medium/Low`
  styles already use distinct colors + background tints; I didn't find a concrete case where they're not
  distinguishable. If you have a specific page/screenshot where this reads as weak, that's a 10-minute fix — right
  now it'd be guessing at a problem I can't reproduce from the code alone.
- **11. Full consistency audit** — I fixed the one concrete inconsistency I found (web report's broken-link count
  not excluding robots-blocked links, now matching the PDF). A true wall-to-wall consistency audit (capitalization,
  terminology, icon usage) spans files I don't have visibility into (`templates.ts`, `groupIssues.ts`,
  `priorityIssues.ts` all generate label strings). Best done as a dedicated pass once the full file set is available,
  rather than partially auditing 5 of ~15 files and calling it done.
- **13. General agency polish** — folded into the items above rather than treated as its own bucket; genuinely
  "homemade-feeling" details I could actually see and fix (the "100+" bug, "Status 429", robotic batch-fix text)
  are already addressed above.

---

## Bottom line

Everything in **Tier 1** is implemented, TypeScript-checked, and preserves your existing layout, pagination, and
React PDF patterns exactly as instructed — no new page count beyond the one necessary new page (Temporary Crawl
Issues, which only renders when there actually are temporary failures to show). **Tier 2 and 3** are scoped
precisely enough that each is a fast follow-up once you can share `scoreProjection.ts`, `priorityIssues.ts`,
`categoryScores.ts`, and `smartRecommendations.ts`/`templates.ts` — at that point items #1 (root cause), #4
(verification), #5 (remainder), and #9 (if wanted) are all same-session work, not a new research effort.
