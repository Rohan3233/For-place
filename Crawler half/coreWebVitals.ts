/**
 * Website-wide Core Web Vitals — the single source of truth for every
 * performance number in the report (PDF, web UI, score, priority list,
 * check coverage, What's Working, AEO checks).
 *
 * WHY THIS EXISTS: Core Web Vitals used to be measured on ONE page — the
 * homepage — via a single PageSpeed Insights call, and the whole report
 * (including the SEO score's performance category) was derived from that
 * one value. That produced misleading results in both directions: a fast
 * homepage masked slow templates, and one slow homepage dragged the entire
 * domain's performance score down. This module replaces that with a
 * page-level pipeline:
 *
 *   crawl -> select pages to evaluate (default: every page on small
 *   sites; a deterministic representative sample across page types on
 *   larger sites) -> collect per-page lab data -> aggregate website-wide
 *   -> score
 *
 * The aggregation method is deliberately simple and defensible:
 *
 *   - A page "passes" Core Web Vitals when every measurable OFFICIAL vital
 *     (LCP, INP, CLS) is in the "good" range — matching Google's own
 *     definition of a page passing CWV. TTFB is displayed as a supporting
 *     metric but never counts toward pass/fail (it is not an official
 *     Core Web Vital).
 *   - The website-wide score IS the pass rate: percentage of evaluated
 *     pages passing. No averaging of arbitrary values.
 *   - Missing data never becomes 0 or 100: if no page could be evaluated,
 *     the score is null and the status is "insufficient_data".
 */

import type {
  CrawlSiteResult,
  CrawlPageSuccess,
  PageCwvMeasurement,
  PageSpeedMetrics,
  CoreWebVitalsAggregate,
  VitalAggregate,
  RunAuditResult,
} from "./types";
import { buildInternalLinkGraph } from "./internalLinkGraph";
import {
  classifyPageType,
  countPageTypes,
  isPageSpeedEligible,
  PAGE_TYPE_LABELS,
  type PageTypeCount,
} from "./pageTypes";
import { rateLcp, rateInp, rateCls, rateTtfb, formatMs, formatCls, type VitalRating } from "./webVitals";

/** Official Core Web Vitals (used for the pass/fail classification). */
const OFFICIAL_VITALS = ["lcp", "inp", "cls"] as const;

/**
 * Deterministic website-wide status rule — documented here as the single
 * place it lives. The site PASSES Core Web Vitals when at least 90% of
 * evaluated pages pass (every measurable official vital in the good
 * range), FAILS below that, and is INSUFFICIENT_DATA when no page could
 * be evaluated. Deliberately stricter than Chrome's origin-level CrUX
 * guidance (75% of page loads good) because this is lab data, not
 * real-user field data. No AI, no arbitrary scoring, no averaging, no
 * homepage proxy: the status is always derived from the aggregated
 * page-level results.
 */
const CWV_PASS_THRESHOLD_PCT = 90;

/** Median of raw values — robust against a single outlier page. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const VITAL_LABELS: Record<string, string> = {
  lcp: "Largest Contentful Paint",
  inp: "Interaction to Next Paint",
  cls: "Cumulative Layout Shift",
  ttfb: "Time to First Byte",
};

function formatVitalValue(vital: string, raw: number): string {
  if (vital === "cls") return formatCls(raw);
  return formatMs(raw);
}

function rateVital(vital: string, raw: number): VitalRating {
  if (vital === "lcp") return rateLcp(raw) ?? "good";
  if (vital === "inp") return rateInp(raw) ?? "good";
  if (vital === "cls") return rateCls(raw) ?? "good";
  return rateTtfb(raw) ?? "good";
}

/**
 * Default target size for the representative Core Web Vitals sample on
 * medium/large sites (~20-40 URLs per the product requirement; 30 sits in
 * the middle). Small sites skip sampling entirely and measure every page
 * (see SMALL_SITE_FULL_COVERAGE_THRESHOLD).
 */
export const DEFAULT_CWV_SAMPLE_TARGET = 30;

/**
 * Sites with at most this many successfully crawled pages get FULL Core Web
 * Vitals coverage by default — at that size, "measure everything" is cheap
 * (a handful of PSI calls) and avoids any sampling at all.
 */
export const SMALL_SITE_FULL_COVERAGE_THRESHOLD = 40;

/**
 * Deterministic cache/dedup key for one PageSpeed measurement: scheme
 * normalized to https (an http page and its https twin are the same
 * measurement target), fragment stripped, trailing slash stripped, host
 * lowercased. The query string is deliberately KEPT — two URLs that differ
 * only by query parameters can be genuinely different pages and must not
 * be merged (same rule as the requirement: never merge genuinely different
 * URLs). Falls back to the raw string for unparseable URLs so a weird URL
 * still dedups consistently with itself.
 */
export function normalizePageSpeedKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    u.protocol = "https:";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Deterministic representative sample of pages to evaluate for CWV,
 * covering the site's page architectures rather than a raw URL count:
 *
 *   1. The homepage always first.
 *   2. One representative from every detected page type (product, category,
 *      blog, article, service, pricing, about, contact, FAQ, ...) — the
 *      most internally-linked page of each type, ties broken by URL.
 *   3. Remaining budget filled round-robin across page types, each round
 *      taking the next most-linked page of each type — so large groups
 *      (e.g. 200 product pages) contribute a few representatives instead
 *      of swamping the sample, and no group gets zero coverage.
 *
 * Pages are grouped by classifyPageType() (URL pattern + title/H1 signal);
 * within a group the most-linked pages come first because hub/template
 * pages shape how the rest of the site loads. The result is deterministic:
 * the same crawl always yields the same sample. Sample size is capped at
 * `limit` (default handled by the caller).
 */
export function selectCwvSamplePages(crawl: CrawlSiteResult, limit: number): string[] {
  return selectCwvSampleWithDetails(crawl, limit).urls;
}

/**
 * Like selectCwvSamplePages, but also returns the per-page-type breakdown
 * of the chosen sample (deterministic PAGE_TYPE_ORDER), so the report can
 * say "Templates represented: 8" and name them. See selectCwvSamplePages
 * for the selection rules.
 */
export function selectCwvSampleWithDetails(
  crawl: CrawlSiteResult,
  limit: number
): { urls: string[]; templateBreakdown: PageTypeCount[] } {
  const cap = Math.max(1, Math.floor(limit));
  const graph = buildInternalLinkGraph({ crawl } as RunAuditResult);
  const inbound = graph.inboundCount;

  // Homepage = the page matching the root URL (normalized); fall back to
  // the most-linked page at path "/" when the root spelling never appears
  // in the crawl (host/path variants) — same seed logic as the link graph.
  let homepageUrl: string | null = graph.resolveTarget(crawl.rootUrl);
  if (!homepageUrl) {
    const homeCandidates = graph.okCrawlPages
      .filter((p) => {
        try {
          return new URL(p.url).pathname === "/";
        } catch {
          return false;
        }
      })
      .sort((a, b) => (inbound.get(b.url) ?? 0) - (inbound.get(a.url) ?? 0));
    homepageUrl = homeCandidates[0]?.url ?? null;
  }

  // Defense-in-depth: only URLs PageSpeed can actually evaluate (HTTP(S),
  // HTML, no obvious static asset) are candidates. The crawl already
  // guarantees ok pages are successful HTML, so this rarely filters
  // anything — it exists so a stray non-HTML page never burns a request.
  const candidates = graph.okCrawlPages.filter(
    (p) => p.url !== homepageUrl && isPageSpeedEligible(p.url)
  );

  // Group candidates by page type; sort each group by inbound links desc,
  // then URL — deterministic and template-important-first.
  const groups = new Map<string, CrawlPageSuccess[]>();
  for (const p of candidates) {
    const type = classifyPageType(p);
    const list = groups.get(type) ?? [];
    list.push(p);
    groups.set(type, list);
  }
  const orderedGroups: { type: string; pages: CrawlPageSuccess[] }[] = [];
  for (const t of Object.keys(PAGE_TYPE_LABELS)) {
    const list = groups.get(t);
    if (!list) continue;
    list.sort(
      (a, b) =>
        (inbound.get(b.url) ?? 0) - (inbound.get(a.url) ?? 0) ||
        a.url.localeCompare(b.url)
    );
    orderedGroups.push({ type: t, pages: list });
  }
  // Groups NOT in the fixed label set (shouldn't happen — classifyPageType
  // only returns known types) still participate, sorted by name.
  for (const t of Array.from(groups.keys()).sort()) {
    if (PAGE_TYPE_LABELS[t as keyof typeof PAGE_TYPE_LABELS] === undefined) {
      const list = groups.get(t)!;
      list.sort(
        (a, b) =>
          (inbound.get(b.url) ?? 0) - (inbound.get(a.url) ?? 0) ||
          a.url.localeCompare(b.url)
      );
      orderedGroups.push({ type: t, pages: list });
    }
  }

  const selected: string[] = [];
  const push = (u: string): void => {
    if (selected.length >= cap || selected.includes(u)) return;
    selected.push(u);
  };
  if (homepageUrl) push(homepageUrl);

  // Round 1: one representative per page type (the most-linked page).
  for (const g of orderedGroups) {
    if (selected.length >= cap) break;
    const first = g.pages[0];
    if (first) push(first.url);
  }
  // Round 2: round-robin across types — each round takes the next
  // most-linked page of every type, so large groups contribute more pages
  // than tiny ones without ever dominating the sample.
  if (selected.length < cap) {
    let round = 1;
    let addedAny = true;
    while (selected.length < cap && addedAny) {
      addedAny = false;
      for (const g of orderedGroups) {
        if (selected.length >= cap) break;
        const next = g.pages[round]?.url;
        if (next) {
          push(next);
          addedAny = true;
        }
      }
      round++;
    }
  }

  // Per-type breakdown of the CHOSEN sample (homepage included) — what the
  // report actually claims was tested.
  const sampledPages = graph.okCrawlPages.filter((p) => selected.includes(p.url));
  const templateBreakdown = countPageTypes(sampledPages);

  return { urls: selected, templateBreakdown };
}

/**
 * Pure aggregation of per-page measurements into the website-wide result.
 * Deterministic: the same measurements always produce the same aggregate.
 * `options.templatesRepresented` / `options.templateBreakdown` describe the
 * page-type coverage of the performance sample (see selectCwvSampleWithDetails)
 * and drive the honest "representative sample across page types" scope note.
 */
export function aggregateCoreWebVitals(
  measurements: PageCwvMeasurement[],
  totalPages: number,
  scopeNoteOverride?: string,
  options: {
    fullCrawlCoverage?: boolean;
    templatesRepresented?: number;
    templateBreakdown?: PageTypeCount[];
  } = {}
): CoreWebVitalsAggregate {
  const evaluated = measurements.filter((m) => m.ok && hasOfficialVital(m.metrics));
  const evaluatedPages = evaluated.length;

  // Per-vital buckets + medians across every page that produced a usable
  // measurement for that vital (not just CWV-evaluated pages — a page with
  // only TTFB data still provides a real TTFB data point). The pass/fail
  // classification below is separate and uses only the official vitals on
  // evaluated pages.
  const okMeasurements = measurements.filter((m) => m.ok && m.metrics);
  const buildVital = (vital: "lcp" | "inp" | "cls" | "ttfb"): VitalAggregate => {
    const values: number[] = [];
    let good = 0;
    let needsImprovement = 0;
    let poor = 0;
    for (const m of okMeasurements) {
      const raw =
        vital === "lcp"
          ? m.metrics!.lcpMs
          : vital === "inp"
            ? m.metrics!.inpMs
            : vital === "cls"
              ? m.metrics!.clsScore
              : m.metrics!.ttfbMs;
      if (raw === null) continue;
      values.push(raw);
      const rating = rateVital(vital, raw);
      if (rating === "good") good++;
      else if (rating === "needs-improvement") needsImprovement++;
      else poor++;
    }
    const med = median(values);
    return {
      rated: values.length,
      good,
      needsImprovement,
      poor,
      median: med,
      rating: med === null ? null : rateVital(vital, med),
    };
  };

  const lcp = buildVital("lcp");
  const inp = buildVital("inp");
  const cls = buildVital("cls");
  const ttfb = buildVital("ttfb");

  // Pass/fail per page, official vitals only: passing = every measurable
  // official vital is "good". Evaluated pages always have >=1 measurable
  // official vital (that is what "evaluated" means here).
  let passingPages = 0;
  for (const m of evaluated) {
    // Same page-level classification the CSV's per-page sheet uses — one
    // source of truth for what "passing" means.
    if (classifyPageCwv(m.metrics) === "pass") passingPages++;
  }
  const failingPages = evaluatedPages - passingPages;
  const passRate = evaluatedPages > 0 ? Math.round((passingPages / evaluatedPages) * 100) : null;

  // Worst URLs: evaluated pages with at least one official vital rated
  // "poor", pages with the most poor vitals first, URL as the tiebreaker.
  const worstByPage: { url: string; entries: { vital: string; value: string; rating: VitalRating }[] }[] = [];
  for (const m of evaluated) {
    const metrics = m.metrics!;
    const entries: { vital: string; value: string; rating: VitalRating }[] = [];
    const check = (vital: "lcp" | "inp" | "cls", raw: number | null) => {
      if (raw === null) return;
      const rating = rateVital(vital, raw);
      if (rating === "poor") {
        entries.push({ vital: VITAL_LABELS[vital], value: formatVitalValue(vital, raw), rating });
      }
    };
    check("lcp", metrics.lcpMs);
    check("inp", metrics.inpMs);
    check("cls", metrics.clsScore);
    if (entries.length > 0) worstByPage.push({ url: m.url, entries });
  }
  worstByPage.sort(
    (a, b) => b.entries.length - a.entries.length || a.url.localeCompare(b.url)
  );
  const worstUrls = worstByPage.flatMap((p) => p.entries.map((e) => ({ url: p.url, ...e })));

  const score = passRate;
  const status: CoreWebVitalsAggregate["status"] =
    evaluatedPages === 0
      ? "insufficient_data"
      : (passRate ?? 0) >= CWV_PASS_THRESHOLD_PCT
        ? "pass"
        : "fail";

  // Representative-sample wording: when runAudit passed the page-type
  // breakdown, say so explicitly ("across 8 page types — Product 12,
  // Category 8, ...") so the report never reads as if every crawled page
  // was performance-tested. Tests call aggregateCoreWebVitals without
  // template info, so that clause degrades to a generic phrasing.
  const sampleSize = measurements.length;
  const templatesRepresented = options.templatesRepresented ?? 0;
  const breakdownText =
    options.templateBreakdown && options.templateBreakdown.length > 0
      ? ` (${options.templateBreakdown.map((t) => `${t.label} ${t.pages}`).join(", ")})`
      : "";
  const sampleScopeText = options.fullCrawlCoverage
    ? "every crawled page was evaluated (no sampling cap). This is lab data from this audit, not site-wide field data (CrUX) from real users; treat it as a starting point, not the whole domain."
    : `a deterministic sample of ${sampleSize} representative page${
        sampleSize === 1 ? "" : "s"
      }${
        templatesRepresented > 0
          ? ` across ${templatesRepresented} page type${templatesRepresented === 1 ? "" : "s"}${breakdownText}`
          : " across the site's major page types/templates"
      }, chosen for coverage of the site's page architectures. This is lab data from this audit, not site-wide field data (CrUX) from real users; treat it as a starting point, not the whole domain.`;
  const scopeNote =
    scopeNoteOverride ??
    (evaluatedPages === 0
      ? measurements.length === 0
        ? `The Core Web Vitals check did not run for this audit — no performance data exists to report (${totalPages} page${
            totalPages === 1 ? "" : "s"
          } were crawled). Site-wide field data (CrUX) is not part of this audit.`
        : `Lab data could not be collected for any of the ${measurements.length} page${
            measurements.length === 1 ? "" : "s"
          } attempted via Google PageSpeed Insights (mobile strategy). Site-wide field data (CrUX) is not part of this audit, so Core Web Vitals could not be evaluated.`
      : `Lab-measured on ${evaluatedPages} of ${totalPages} crawled page${
          totalPages === 1 ? "" : "s"
        } via Google PageSpeed Insights (mobile strategy) — ${sampleScopeText}`);

  return {
    totalPages,
    sampleSize,
    evaluatedPages,
    passingPages,
    failingPages,
    passRate,
    lcp,
    inp,
    cls,
    ttfb,
    score,
    status,
    pages: measurements,
    worstUrls,
    scopeNote,
    fullCrawlCoverage: options.fullCrawlCoverage ?? false,
    templatesRepresented: templatesRepresented > 0 ? templatesRepresented : undefined,
    templateBreakdown:
      options.templateBreakdown && options.templateBreakdown.length > 0
        ? options.templateBreakdown
        : undefined,
  };
}

function hasOfficialVital(metrics: PageCwvMeasurement["metrics"]): metrics is PageSpeedMetrics {
  return (
    metrics !== undefined &&
    (metrics.lcpMs !== null || metrics.inpMs !== null || metrics.clsScore !== null)
  );
}

/** One page's overall Core Web Vitals status — the SINGLE page-level
 * classification used by both the website aggregate and the CSV's
 * per-page dataset, so no surface can ever disagree about whether a page
 * passes:
 *   - "pass": every measurable official vital (LCP/INP/CLS) is good;
 *   - "fail": at least one measurable official vital is not good;
 *   - "not_available": no usable official vital (PSI failed, or only
 *     TTFB/other non-official data came back) — never counted as a pass
 *     OR a fail. */
export type PageCwvStatus = "pass" | "fail" | "not_available";

export function classifyPageCwv(metrics: PageCwvMeasurement["metrics"]): PageCwvStatus {
  if (!hasOfficialVital(metrics)) return "not_available";
  const official: (VitalRating | null)[] = [
    metrics.lcpMs !== null ? rateLcp(metrics.lcpMs) : null,
    metrics.inpMs !== null ? rateInp(metrics.inpMs) : null,
    metrics.clsScore !== null ? rateCls(metrics.clsScore) : null,
  ];
  return official.every((r) => r === null || r === "good") ? "pass" : "fail";
}

/**
 * One page's measurement for a given vital — used by the issues sections
 * (affected pages) and by the CSV export (the complete per-metric dataset).
 */
export interface CoreWebVitalPageValue {
  url: string;
  /** Formatted value (e.g. "2.4s", "0.31") for display. */
  value: string;
  /** Raw measured value (ms for LCP/INP/TTFB, score for CLS). */
  raw: number;
  rating: VitalRating;
}

export type CoreWebVitalKey = "lcp" | "inp" | "cls" | "ttfb";

/** One affected page for a given vital — the evidence rows the issues
 * sections render (URL + formatted value + rating). */
export interface CoreWebVitalAffectedPage {
  url: string;
  value: string;
  rating: VitalRating;
}

const AFFECTED_VITAL_FIELD: Record<CoreWebVitalKey, "lcpMs" | "inpMs" | "clsScore" | "ttfbMs"> = {
  lcp: "lcpMs",
  inp: "inpMs",
  cls: "clsScore",
  ttfb: "ttfbMs",
};

/**
 * Every measured page with a usable value for `vital`, with the formatted
 * value and rating — the COMPLETE per-metric dataset (good pages included)
 * that the CSV export uses so nothing is ever truncated. Derived from the
 * SAME aggregate (`cwv.pages`) every report surface reads, so the check
 * coverage rows, the PDF issues pages, the web report, and the CSV can
 * never disagree about which pages are affected. Deterministic order.
 */
export function coreWebVitalPageValues(
  cwv: CoreWebVitalsAggregate,
  vital: CoreWebVitalKey
): CoreWebVitalPageValue[] {
  const field = AFFECTED_VITAL_FIELD[vital];
  const out: CoreWebVitalPageValue[] = [];
  for (const m of cwv.pages) {
    if (!m.ok || !m.metrics) continue;
    const raw = m.metrics[field];
    if (raw === null) continue;
    out.push({ url: m.url, value: formatVitalValue(vital, raw), raw, rating: rateVital(vital, raw) });
  }
  out.sort((a, b) => a.url.localeCompare(b.url));
  return out;
}

/**
 * Pages whose measurement for `vital` is NOT in the good range (poor or
 * needs improvement), with the measured value and rating — the evidence
 * rows behind the Core Web Vitals issues sections. `ratingFilter` lets
 * callers narrow to one bucket (e.g. only "poor" for a failing coverage
 * row vs. only "needs-improvement" for a warn row).
 */
export function coreWebVitalAffectedPages(
  cwv: CoreWebVitalsAggregate,
  vital: CoreWebVitalKey,
  ratingFilter?: VitalRating
): CoreWebVitalAffectedPage[] {
  return coreWebVitalPageValues(cwv, vital)
    .filter((p) => p.rating !== "good" && (!ratingFilter || p.rating === ratingFilter))
    .map((p) => ({ url: p.url, value: p.value, rating: p.rating }));
}

/**
 * Pages in the sample WITHOUT a usable value for `vital` — surfaced
 * explicitly (e.g. "13 pages without available LCP data") so missing data
 * is never silently dropped, and never treated as passing or failing.
 * Derived from the same aggregate fields the renderers already read
 * (`sampleSize` = pages attempted, `VitalAggregate.rated` = pages with a
 * usable value for that vital).
 */
export function coreWebVitalNotAvailable(
  cwv: CoreWebVitalsAggregate,
  vital: CoreWebVitalKey
): number {
  return Math.max(0, cwv.sampleSize - cwv[vital].rated);
}

/** One row of the CSV's per-page Core Web Vitals sheet — every sampled
 * page with all vitals and the SAME overall page classification
 * (classifyPageCwv) the site aggregate uses, so the CSV and the PDF/web
 * summaries can never disagree. */
export interface CoreWebVitalPageRow {
  url: string;
  /** "pass" | "fail" | "not_available" — see classifyPageCwv. */
  overall: PageCwvStatus;
  /** Measured value + rating per vital; null when not measured. */
  lcp: { value: string; rating: VitalRating | null } | null;
  inp: { value: string; rating: VitalRating | null } | null;
  cls: { value: string; rating: VitalRating | null } | null;
  ttfb: { value: string; rating: VitalRating | null } | null;
  /** Present when the page could not be measured at all (ok === false). */
  error?: string;
}

/**
 * The COMPLETE per-page Core Web Vitals dataset — every sampled page,
 * every vital's value + rating, and the overall page status. This is what
 * the CSV's per-page export contains, so the PDF and web summaries are
 * always a subset of this file and nothing is ever truncated or lost.
 * Derived from the SAME aggregate (`cwv.pages`) every surface reads;
 * deterministic order (homepage first, then sample order).
 */
export function coreWebVitalPageRows(cwv: CoreWebVitalsAggregate): CoreWebVitalPageRow[] {
  const cell = (vital: CoreWebVitalKey, raw: number | null) =>
    raw === null ? null : { value: formatVitalValue(vital, raw), rating: rateVital(vital, raw) };

  return cwv.pages.map((m) => {
    const row: CoreWebVitalPageRow = {
      url: m.url,
      overall: classifyPageCwv(m.metrics),
      lcp: null,
      inp: null,
      cls: null,
      ttfb: null,
    };
    if (m.error) row.error = m.error;
    if (m.metrics) {
      row.lcp = cell("lcp", m.metrics.lcpMs);
      row.inp = cell("inp", m.metrics.inpMs);
      row.cls = cell("cls", m.metrics.clsScore);
      row.ttfb = cell("ttfb", m.metrics.ttfbMs);
    }
    return row;
  });
}

/**
 * Returns the website-wide CWV aggregate for an audit. Fresh audits carry
 * `audit.cwv`; audits cached before page-level collection existed do not,
 * so this falls back to an aggregate built from the single homepage
 * measurement (explicitly labelled as a legacy single-page measurement)
 * or to an honest "insufficient data" aggregate. Consumers must always go
 * through this helper — never read `audit.cwv` directly — so old cached
 * reports render the same always-present page without inventing data.
 */
export function resolveCoreWebVitals(audit: RunAuditResult): CoreWebVitalsAggregate {
  if (audit.cwv) return audit.cwv;

  const totalPages = audit.crawl.pages.length;
  const measurements: PageCwvMeasurement[] = audit.pageSpeed.ok
    ? [{ url: audit.pageSpeed.url, ok: true, metrics: audit.pageSpeed.metrics }]
    : [];
  return aggregateCoreWebVitals(
    measurements,
    totalPages,
    `Single-page measurement from a prior audit run — only the homepage was evaluated at that time. Re-run the audit to collect website-wide Core Web Vitals.`
  );
}
