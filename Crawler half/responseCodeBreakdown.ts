import type { RunAuditResult } from "./types";
import { blockedFromAutomatedChecking } from "./brokenLinkClassification";

export interface ResponseCodeEntry {
  code: number;
  count: number;
  urls: string[]; // sample, capped
}

export interface ResponseCodeGroup {
  key: "2xx" | "3xx" | "4xx" | "5xx";
  label: string;
  count: number;
  codes: ResponseCodeEntry[];
}

/**
 * Counts of link-check PROBES that were refused by the server (403/401/429)
 * — kept separate from the page-level totals above so the two surfaces
 * reconcile on the page instead of looking like a data mismatch: the
 * breakdown counts crawled-page responses, while these are HEAD probes of
 * link destinations run with a non-browser user-agent (the same reason the
 * probes are excluded from the page counts).
 */
export interface ProbeStatusSummary {
  blockedCount: number;
  forbidden: number; // 401/403
  rateLimited: number; // 429
}

export interface ResponseCodeBreakdown {
  groups: ResponseCodeGroup[];
  totalChecked: number;
  probeStatus: ProbeStatusSummary;
}

const GROUP_DEFS: { key: ResponseCodeGroup["key"]; label: string; match: (n: number) => boolean }[] = [
  { key: "2xx", label: "2xx — Success", match: (n) => n >= 200 && n < 300 },
  { key: "3xx", label: "3xx — Redirect", match: (n) => n >= 300 && n < 400 },
  { key: "4xx", label: "4xx — Client Error", match: (n) => n >= 400 && n < 500 },
  { key: "5xx", label: "5xx — Server Error", match: (n) => n >= 500 && n < 600 },
];

/**
 * Tallies the HTTP status codes of CRAWLED PAGES ONLY — success and
 * failure results from audit.crawl.pages. Broken-link probes are
 * deliberately excluded: they run as HEAD requests with a non-browser
 * user-agent, so bot-protected sites (Akamai, Imperva, Cloudflare-style
 * WAFs) answer nearly all of them with 403 regardless of how healthy the
 * actual pages are. Counting them would drown the page-level picture in
 * hundreds/thousands of 403s and make a perfectly healthy site look
 * unreachable. Genuine link issues are already reported in their own
 * dedicated Broken Links section, where 403s carry the "Crawler Blocked"
 * label and an explanatory note.
 */
export function buildResponseCodeBreakdown(audit: RunAuditResult): ResponseCodeBreakdown {
  const codeMap = new Map<number, { count: number; urls: Set<string> }>();

  function record(code: number | null | undefined, url: string) {
    if (typeof code !== "number") return;
    const entry = codeMap.get(code) ?? { count: 0, urls: new Set<string>() };
    entry.count++;
    if (entry.urls.size < 25) entry.urls.add(url); // sample cap only — count is exact
    codeMap.set(code, entry);
  }

  for (const page of audit.crawl.pages) {
    if (page.ok) record(page.statusCode, page.url);
    else if (page.error.statusCode !== undefined) record(page.error.statusCode, page.url);
  }

  const groups: ResponseCodeGroup[] = GROUP_DEFS.map((g) => {
    const codes: ResponseCodeEntry[] = Array.from(codeMap.entries())
      .filter(([code]) => g.match(code))
      .map(([code, v]) => ({ code, count: v.count, urls: Array.from(v.urls) }))
      .sort((a, b) => a.code - b.code);
    return { key: g.key, label: g.label, count: codes.reduce((s, c) => s + c.count, 0), codes };
  }).filter((g) => g.count > 0);

  const totalChecked = Array.from(codeMap.values()).reduce((s, v) => s + v.count, 0);

  // Link-probe refusal summary, derived from the SAME canonical blocked
  // set the "Links blocked from automated checking" section displays — so
  // the two sections can never disagree about how many 429s/403s were
  // seen by the automated checker.
  const blocked = blockedFromAutomatedChecking(audit.brokenLinks);
  const probeStatus: ProbeStatusSummary = {
    blockedCount: blocked.length,
    forbidden: blocked.filter((l) => l.failureCategory === "forbidden" || l.statusCode === 401 || l.statusCode === 403).length,
    rateLimited: blocked.filter((l) => l.failureCategory === "rate_limited" || l.statusCode === 429).length,
  };

  return { groups, totalChecked, probeStatus };
}