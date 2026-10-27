/**
 * Classifies whether a noindexed URL is very likely an intentional,
 * safe exclusion (login/admin/checkout/account-type pages) versus a
 * genuine indexability problem worth flagging as critical.
 *
 * This is a path-based heuristic, not a guarantee — a site COULD
 * legitimately want /account indexed (rare, but possible), and the
 * report should never claim certainty it doesn't have. See
 * classifyNoindexUrl()'s `confidence` field: callers should present
 * "Intentional / Safe" as a best guess, not a fact, and let a human
 * confirm.
 */
export type NoindexClassification = "intentional_safe" | "needs_review" | "critical_accidental";

export interface NoindexVerdict {
  classification: NoindexClassification;
  reason: string;
  confidence: "high" | "medium";
  /** Pillar-level severity derived from classification — maps directly
   * to the finding's severity field. Intentional safe pages never inflate
   * the critical-issue count. */
  severity: "info" | "warning" | "critical";
}

// Path segments that overwhelmingly correlate with system/utility pages a
// site owner would never want ranking in search anyway. Matched against
// the URL's pathname, case-insensitively, as whole path segments (not
// substrings) to avoid false positives like "/loginfo" or "/scarterly".
const SAFE_SYSTEM_PATH_PATTERNS: RegExp[] = [
  /(^|\/)login(\/|$)/i,
  /(^|\/)logout(\/|$)/i,
  /(^|\/)signin(\/|$)/i,
  /(^|\/)sign-in(\/|$)/i,
  /(^|\/)signup(\/|$)/i,
  /(^|\/)sign-up(\/|$)/i,
  /(^|\/)admin(\/|$)/i,
  /(^|\/)wp-admin(\/|$)/i,
  /(^|\/)checkout(\/|$)/i,
  /(^|\/)cart(\/|$)/i,
  /(^|\/)basket(\/|$)/i,
  /(^|\/)account(\/|$)/i,
  /(^|\/)my-account(\/|$)/i,
  /(^|\/)dashboard(\/|$)/i,
  /(^|\/)order-confirmation(\/|$)/i,
  /(^|\/)order-received(\/|$)/i,
  /(^|\/)thank-you(\/|$)/i,
  /(^|\/)reset-password(\/|$)/i,
  /(^|\/)forgot-password(\/|$)/i,
  /(^|\/)verify-email(\/|$)/i,
  /(^|\/)staging(\/|$)/i,
  /(^|\/)preview(\/|$)/i,
  /(^|\/)internal(\/|$)/i,
];

export function classifyNoindexUrl(url: string): NoindexVerdict {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Malformed URL — can't classify path, don't guess.
    return { classification: "needs_review", reason: "Could not parse the URL to check its path.", confidence: "medium", severity: "warning" };
  }

  const matched = SAFE_SYSTEM_PATH_PATTERNS.find((re) => re.test(pathname));
  if (matched) {
    return {
      classification: "intentional_safe",
      reason:
        "This looks like a system/account page (login, checkout, admin, etc.) — noindex here is standard practice, not a problem. A quick manual confirmation is worthwhile, but this is not an urgent issue.",
      confidence: "high",
      severity: "info",
    };
  }

  return {
    classification: "needs_review",
    reason: "This doesn't match a known system-page pattern, so a noindex tag here is more likely to be hiding real content from search — worth confirming it's intentional.",
    confidence: "medium",
    severity: "warning",
  };
}

/**
 * Convenience filter for the priority/scoring layer: only URLs that
 * classify as needing review should count toward "critical" severity for
 * noindex flags. Intentional/safe ones still get reported (never hidden —
 * see indexabilityChecks.ts's "always show, pass or fail" principle) but
 * shouldn't inflate the critical-issue count or the score penalty.
 */
export function isLikelySystemPage(url: string): boolean {
  return classifyNoindexUrl(url).classification === "intentional_safe";
}
