/**
 * Lightweight post-generation diversity check for the report's per-issue
 * explanation copy.
 *
 * The report's credibility hinges on reading like an experienced consultant
 * wrote it — the moment every "Business impact" paragraph starts from the
 * same template with only the page count swapped in, a careful client spots
 * the automation. The explanations are curated static templates today (see
 * templates.ts / auxiliaryIssueCopy.ts), but any future AI-generated or
 * rewritten copy should be held to the same standard. This compares the
 * impact/fix sentences of every issue type present in ONE report pairwise
 * and flags near-duplicates (> 80% token overlap) for review.
 *
 * This is a DEV-SIDE diagnostic (console.warn) — it never surfaces in the
 * client-facing report. It lives on the shared grouping path
 * (groupExplanationsByIssue), so both the PDF and the web report inherit
 * the same check with no extra call sites.
 */

interface CopyCarrier {
  flag: string;
  businessImpact: string;
  recommendedFix: string;
}

const NEAR_DUPLICATE_OVERLAP = 0.8;

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}

/** Fraction of the SHORTER sentence's tokens present in the longer one —
 * the right measure for the failure mode we're guarding against, where two
 * sentences differ only in the swapped-in page count. */
function containmentOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const shorter = ta.size <= tb.size ? ta : tb;
  const longer = ta.size <= tb.size ? tb : ta;
  let shared = 0;
  for (const t of shorter) if (longer.has(t)) shared++;
  return shared / shorter.size;
}

// Warn once per (field, pair) per process — the grouping path can run more
// than once in a single process (PDF worker + web render), and there's no
// value in spamming the same finding.
const warnedPairs = new Set<string>();

export function flagNearDuplicateCopy(groups: CopyCarrier[]): void {
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      for (const field of ["businessImpact", "recommendedFix"] as const) {
        const va = a[field];
        const vb = b[field];
        if (!va || !vb) continue;
        const overlap = containmentOverlap(va, vb);
        if (overlap >= NEAR_DUPLICATE_OVERLAP) {
          const key = `${field}:${a.flag}<>${b.flag}`;
          if (warnedPairs.has(key)) continue;
          warnedPairs.add(key);
          console.warn(
            `[copyVarietyCheck] "${a.flag}" and "${b.flag}" have near-identical ${field} ` +
              `copy (${Math.round(overlap * 100)}% token overlap) — this reads as a template with the page count ` +
              `swapped in. Rewrite one of them before shipping the report.`
          );
        }
      }
    }
  }
}
