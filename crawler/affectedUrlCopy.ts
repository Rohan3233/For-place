/**
 * Centralized "more affected URLs" copy.
 *
 * Every place in the PDF or web report that truncates an affected-URL list
 * must build its "+ N more" note through this helper, so that:
 *   - the remaining count is always derived from the SAME numbers the CSV
 *     export uses (total affected == full list, shown == displayed),
 *   - the CSV-availability claim is only ever made when the CSV genuinely
 *     contains the complete list (csvAvailable === true),
 *   - the wording stays identical across every section of the report.
 */

export type AffectedNoun = "page" | "URL" | "link" | "image" | "chain";

/** Remaining affected items after `shown` have been displayed. Never negative. */
export function remainingAffectedCount(total: number, shown: number): number {
  return Math.max(0, total - shown);
}

function pluralize(noun: AffectedNoun, count: number): string {
  if (count === 1) return noun;
  switch (noun) {
    case "URL":
      return "URLs";
    case "page":
      return "pages";
    case "link":
      return "links";
    case "image":
      return "images";
    case "chain":
      return "chains";
  }
}

/**
 * Truncated-sample remainder line with the FULL arithmetic spelled out, so
 * the "shown + remaining == total" identity is checkable from the page the
 * note lands on even when the sample list itself splits across a page
 * boundary (a bottom-placed note can otherwise sit next to only part of
 * the sample, making "shown + N" look wrong to a reader).
 *
 * E.g. for total 126, shown 10: "showing 10 of 126; 116 more pages
 * affected". Returns null when nothing is left (all items are displayed).
 */
export function sampleRemainderText(total: number, shown: number, noun: AffectedNoun): string | null {
  const remaining = remainingAffectedCount(total, shown);
  if (remaining <= 0) return null;
  return `showing ${shown} of ${total}; ${remaining} more ${pluralize(noun, remaining)} affected`;
}

/**
 * "+ 43 more pages affected" (no CSV suffix). Returns null when nothing is
 * left — callers must render nothing in that case. The PDF embeds a CSV
 * link into the suffix itself, so it needs the prefix separately.
 */
export function moreAffectedPrefix(total: number, shown: number, noun: AffectedNoun): string | null {
  const remaining = remainingAffectedCount(total, shown);
  if (remaining <= 0) return null;
  return `+ ${remaining} more ${pluralize(noun, remaining)} affected`;
}

/** Standard suffix appended when the complete list is genuinely in the CSV. */
export const CSV_FULL_LIST_SUFFIX = " — full list available in the CSV export.";

/**
 * Builds the complete "+ N more ..." note as a plain string (used by the web
 * report, where the CSV download lives on the same page).
 *
 * - Returns null when nothing is left (all affected items are displayed).
 * - When `csvAvailable` is true, appends " — full list available in the CSV
 *   export." so the client always knows the complete list is in the CSV.
 * - When false, returns the plain "+ N more" note (no false CSV claim).
 */
export function buildMoreAffectedCopy(
  total: number,
  shown: number,
  noun: AffectedNoun,
  csvAvailable: boolean
): string | null {
  const prefix = moreAffectedPrefix(total, shown, noun);
  if (!prefix) return null;
  return csvAvailable ? `${prefix}${CSV_FULL_LIST_SUFFIX}` : prefix;
}
