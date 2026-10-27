import * as cheerio from "cheerio";
import type {
  CrawlPageResult,
  CrawlPageOptions,
  CrawlErrorType,
  HeadingCounts,
  ImageFinding,
} from "./types";
import { extractAeoSignals, rawContentSignal, isLikelyJsOnly, detectFrameworkSignals, needsH1VerificationRender } from "./aeoSignals";
import { fetchWithRetry, describeNetworkError } from "./fetchWithRetry";
import {
  extractImageFilename,
  isNonDescriptiveImageFilename,
  type ImageFilenameQuality,
} from "./imageFilename";
import { urlSeoFlagsForUrl } from "./urlSeo";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; SEOAuditBot/0.1; +https://example.com/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
// Safety caps for the manual redirect walk (see fetchWithManualRedirects):
// MAX_FOLLOW_REDIRECTS matches undici's own fetch default, so a chain that
// works under redirect:"follow" still works here; MAX_REPORTED_HOPS mirrors
// the old HEAD-chain cap so hop counts/status codes stay identical to
// previous reports for chains of 10 or fewer hops.
const MAX_FOLLOW_REDIRECTS = 20;
const MAX_REPORTED_HOPS = 10;

const META_DESC_MIN = 120;
const META_DESC_MAX = 160;
const TITLE_MIN = 50;
const TITLE_MAX = 60;
const THIN_CONTENT_WORD_THRESHOLD = 300;
const NON_OPTIMIZED_IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "gif", "bmp", "tiff"]);

/**
 * Utility-page intent paths. Store locators, contact, cart, checkout, and
 * stores pages are legitimately short — their entire purpose is a form, an
 * address block, or a redirect, not prose content. Flagging them as "Thin
 * Content" because they're under 300 words creates false positives that
 * inflate task counts and erode trust in the report. Pages matching these
 * paths get a benign `utility_page` marker instead of `thin_content` (no
 * template -> never rendered as an issue anywhere).
 */
const UTILITY_PAGE_PATTERNS = [
  /^\/locations?(\/|$)/i,
  /^\/contact(\/|$)/i,
  /^\/cart(\/|$)/i,
  /^\/checkout(\/|$)/i,
  /^\/stores?(\/|$)/i,
];

function isUtilityPagePath(pathname: string): boolean {
  return UTILITY_PAGE_PATTERNS.some((re) => re.test(pathname));
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeError(
  url: string,
  type: CrawlErrorType,
  message: string,
  statusCode?: number
): CrawlPageResult {
  return {
    ok: false,
    url,
    fetchedAt: nowIso(),
    error: { type, message, ...(statusCode !== undefined ? { statusCode } : {}) },
  };
}

/**
 * Resolves an href against a base URL and returns it normalized (no hash),
 * or null if it isn't a resolvable http(s) link (mailto:, tel:, javascript:, etc.)
 */
function resolveHref(href: string, base: URL): URL | null {
  try {
    const resolved = new URL(href, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    resolved.hash = "";
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Normalizes a URL string for equality comparison only (e.g. canonical
 * self-reference checks). Strips a single trailing slash from the path so
 * "https://example.com" and "https://example.com/" are treated as equal.
 * Does NOT mutate the URLs used elsewhere — comparison-only.
 */
function normalizeForComparison(u: URL): string {
  const clone = new URL(u.toString());
  clone.hash = "";
  if (clone.pathname !== "/" && clone.pathname.endsWith("/")) {
    clone.pathname = clone.pathname.slice(0, -1);
  }
  return clone.toString();
}

interface ManualFetchResult {
  /** The final (non-3xx) response — reused directly for page content. */
  response: Response;
  /** Number of redirects followed, capped at MAX_REPORTED_HOPS. */
  hopCount: number;
  /** One HTTP status per followed hop (e.g. [301, 301]), capped at MAX_REPORTED_HOPS. */
  hopStatusCodes: number[];
  /** URL targeted by each followed redirect, in order (final URL is response.url). */
  hopUrls: string[];
}

/**
 * Fetches a URL following redirects MANUALLY (redirect: "manual" + a loop)
 * so the redirect chain's hop count, per-hop status codes, and hop URLs are
 * captured from the SAME requests that fetch the page. Previously this
 * needed a second HEAD-based pass over the chain after the GET, doubling
 * the requests on every redirecting page; now a redirecting page costs one
 * request per hop total (N vs 2N), the sequential HEAD walk is gone, and
 * the final response is reused directly for content.
 *
 * Redirect semantics mirror undici's redirect:"follow" for GETs: every 3xx
 * is followed as a GET up to MAX_FOLLOW_REDIRECTS (undici's own cap — a
 * longer chain fails, same as before); a 3xx without a usable http(s)
 * Location is treated as the final response; and each hop is retried
 * independently for transient failures via fetchWithRetry (a flaky hop no
 * longer forces the whole chain to re-walk from the start).
 */
async function fetchWithManualRedirects(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; maxAttempts: number }
): Promise<ManualFetchResult> {
  let currentUrl = url;
  const hopStatusCodes: number[] = [];
  const hopUrls: string[] = [];

  for (let hop = 0; ; hop++) {
    const response = await fetchWithRetry(
      currentUrl,
      { ...init, redirect: "manual" },
      { timeoutMs: opts.timeoutMs, maxAttempts: opts.maxAttempts }
    );

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) {
      return {
        response,
        hopCount: Math.min(hopStatusCodes.length, MAX_REPORTED_HOPS),
        hopStatusCodes: hopStatusCodes.slice(0, MAX_REPORTED_HOPS),
        hopUrls: hopUrls.slice(0, MAX_REPORTED_HOPS),
      };
    }

    const location = response.headers.get("location");
    let next: URL | null = null;
    if (location) {
      try {
        const resolved = new URL(location, currentUrl);
        // A redirect to a non-http(s) scheme (mailto:, javascript:, …) can't
        // be fetched — treat the 3xx as terminal rather than letting fetch
        // throw on the exotic scheme.
        if (resolved.protocol === "http:" || resolved.protocol === "https:") next = resolved;
      } catch {
        next = null; // unparseable Location — terminal, same as before
      }
    }
    if (!next) {
      return {
        response,
        hopCount: Math.min(hopStatusCodes.length, MAX_REPORTED_HOPS),
        hopStatusCodes: hopStatusCodes.slice(0, MAX_REPORTED_HOPS),
        hopUrls: hopUrls.slice(0, MAX_REPORTED_HOPS),
      };
    }

    if (hop >= MAX_FOLLOW_REDIRECTS) {
      // Same failure mode as undici's fetch (redirect count exceeded) — the
      // page is reported as a network error rather than looping forever.
      throw new Error(`Redirect count exceeded after ${MAX_FOLLOW_REDIRECTS} hops.`);
    }
    hopStatusCodes.push(response.status);
    hopUrls.push(next.toString());
    currentUrl = next.toString();
  }
}

/**
 * Infers an image's format from its file extension in the src URL.
 * Deliberately extension-based, not a real content-type sniff — this
 * crawler doesn't download image bytes during the HTML pass, and the
 * extension is a reliable-enough signal for the vast majority of real
 * sites. Returns null for extensionless URLs/data URIs, where no
 * reasonable guess is possible.
 */
function inferImageFormat(src: string): string | null {
  const withoutQuery = src.split(/[?#]/)[0];
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Fetches and analyzes a single URL for on-page SEO signals.
 * Never throws — all failure modes resolve to a structured CrawlPageError.
 */
export async function crawlPage(
  url: string,
  options: CrawlPageOptions = {}
): Promise<CrawlPageResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  let requestedUrl: URL;
  try {
    requestedUrl = new URL(url);
  } catch {
    return makeError(url, "invalid_url", `"${url}" is not a valid URL.`);
  }

  // Fetch the page while manually walking any redirect chain in the SAME
  // pass (see fetchWithManualRedirects) — the common no-redirect case still
  // costs exactly one request, and a redirecting page costs one request per
  // hop instead of the previous GET + HEAD-chain double walk. Retries for
  // transient failures (timeouts, connection resets, 5xx) happen per hop
  // inside fetchWithRetry before declaring a page error — a one-shot
  // network fluke must never surface in the report as if the page itself
  // were broken.
  let fetchResult: ManualFetchResult;
  try {
    fetchResult = await fetchWithManualRedirects(
      requestedUrl.toString(),
      {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
      },
      { timeoutMs, maxAttempts: 2 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return makeError(url, "timeout", `Request timed out after ${timeoutMs}ms (retried once).`);
    }
    return makeError(url, "network_error", describeNetworkError(err));
  }
  const response = fetchResult.response;

  if (!response.ok) {
    return makeError(
      url,
      "http_error",
      `Received non-200 response: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const contentType = response.headers.get("content-type");
  const xRobotsTagRaw = response.headers.get("x-robots-tag");
  const xRobotsTagNoindex = xRobotsTagRaw ? /noindex/i.test(xRobotsTagRaw) : false;
  if (!contentType || !contentType.toLowerCase().includes("html")) {
    return makeError(
      url,
      "non_html_content_type",
      `Expected an HTML content-type but got "${contentType ?? "none"}".`
    );
  }

  // IMPORTANT: use the *final* URL after redirects for all resolution and
  // comparison logic below (canonical checks, internal-link hostname
  // matching, and the `url` field we return). `response.url` reflects
  // wherever the fetch actually landed (e.g. http -> https, non-www -> www).
  // `requestedUrl` is kept separately only to report what the caller asked for.
  let finalUrl: URL;
  try {
    finalUrl = new URL(response.url || requestedUrl.toString());
  } catch {
    finalUrl = requestedUrl;
  }
  const redirected = normalizeForComparison(finalUrl) !== normalizeForComparison(requestedUrl);

  // Hop data comes straight from the manual redirect walk — 0 and empty for
  // the common no-redirect case, and (unlike the old HEAD chain) always
  // known for pages that redirected, since the walk IS the fetch.
  const redirectHopCount: number | null = fetchResult.hopCount;
  const redirectHopStatusCodes: number[] = fetchResult.hopStatusCodes;
  const redirectHopUrls: string[] = fetchResult.hopUrls;

  let html: string;
  try {
    html = await response.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to read response body.";
    return makeError(url, "network_error", message);
  }

  try {
    const $ = cheerio.load(html);
    const flags: string[] = [];
    // Client-side-rendered templates (React/Next CSR, Vue, etc.) serve a
    // shell: nav/footer in the raw HTML, the actual article injected into an
    // empty mount container after JS runs. A plain-HTTP crawler sees the
    // shell — so content-presence checks (H1, H2, thin content) would be
    // false positives on it, and the "Primary content available in raw HTML"
    // AEO check is the finding that actually applies. Computed once, shared
    // with aeoSignals.ts, so the flag logic and the AEO check agree.
    const rawContentSig = rawContentSignal($);
    const jsOnlyPage = isLikelyJsOnly(rawContentSig);
    const robotsMetaRaw = $('meta[name="robots"]').first().attr("content") ?? "";
    const metaNoindex = /noindex/i.test(robotsMetaRaw);
    const metaNofollow = /nofollow/i.test(robotsMetaRaw);

    if (metaNoindex) flags.push("noindex_meta_tag");
    if (xRobotsTagNoindex) flags.push("noindex_x_robots_tag");

    // --- htmlLang ---
    const htmlLangRaw = $("html").attr("lang");
    const htmlLang = htmlLangRaw && htmlLangRaw.trim() ? htmlLangRaw.trim() : null;

    // --- Title ---
    const titleContentRaw = $("title").first().text();
    const titleContent = titleContentRaw ? titleContentRaw.trim() : null;
    if (!titleContent) {
      flags.push("missing_title");
    } else if (titleContent.length < TITLE_MIN || titleContent.length > TITLE_MAX) {
      flags.push("title_length_out_of_range");
    }
    const title = {
      content: titleContent,
      length: titleContent ? titleContent.length : 0,
    };

    // --- Meta description ---
    const metaDescRaw = $('meta[name="description"]').first().attr("content");
    const metaDescContent = metaDescRaw ? metaDescRaw.trim() : null;
    if (!metaDescContent) {
      flags.push("missing_meta_description");
    } else if (metaDescContent.length < META_DESC_MIN || metaDescContent.length > META_DESC_MAX) {
      flags.push("meta_description_length_out_of_range");
    }
    const metaDescription = {
      content: metaDescContent,
      length: metaDescContent ? metaDescContent.length : 0,
    };

    // --- H1s ---
    // The fundamental test is whether an <h1> ELEMENT exists in the DOM.
    // Text extraction is secondary — used for display and grouping, not
    // for the existence check. This handles all nesting patterns:
    //   <h1>Title</h1>
    //   <h1><span>Title</span></h1>
    //   <h1><img src="..." alt="Title"></h1>
    //   <h1><img src="..." alt=""></h1>  ← H1 exists, alt is a separate issue
    const h1: string[] = [];
    $("h1").each((_, el) => {
      const $el = $(el);
      let text = $el.text().trim();
      // When H1 contains only an <img>, .text() returns empty. Use the
      // image's alt text as the H1 content for display purposes.
      if (!text) {
        const imgAlt = $el.find("img").attr("alt");
        if (imgAlt && imgAlt.trim()) text = imgAlt.trim();
      }
      // Always count the H1 element — even if text extraction yields
      // nothing (e.g. <h1><img alt=""></h1>). The element EXISTS and
      // search engines recognize it as an H1.
      h1.push(text || "[H1 element present]");
    });
    // No H1 in the raw HTML could mean the H1 is genuinely missing, or it
    // could mean the page renders client-side (H1 injected by JS after the
    // shell loads). The latter is a real AI-crawlability problem but NOT a
    // missing-H1 finding — the render_mode AEO check reports it instead.
    if (h1.length === 0 && !jsOnlyPage) flags.push("missing_h1");
    if (h1.length > 1) flags.push("multiple_h1");

    // --- Framework detection + H1 verification heuristic ---
    // Even when renderMode is "server_rendered", the page may still have
    // a JS-rendered H1. The renderMode heuristic measures overall content
    // presence (body word count), not H1-specific rendering. Framework
    // signals detect pages where structural content is plausibly generated
    // client-side.
    const frameworkSignals = detectFrameworkSignals($);
    const h1VerificationNeeded = h1.length === 0 && !jsOnlyPage &&
      needsH1VerificationRender(false, rawContentSig, frameworkSignals);

    // --- Potential visual heading (image-based) ---
    // When no H1 exists in the raw HTML, detect whether a prominent image
    // near the top of the main content could function as a visual page
    // heading. This is contextual only — it does NOT replace the missing-H1
    // finding. If browser rendering later finds a real H1, this is cleared.
    let potentialVisualHeadingResult: import("./types").CrawlPageSuccess["potentialVisualHeading"] = null;
    if (h1.length === 0 && !jsOnlyPage) {
      potentialVisualHeadingResult = detectPotentialVisualHeading($);
    }

    // --- H2-H6 counts ---
    const headings: HeadingCounts = {
      h2: $("h2").length,
      h3: $("h3").length,
      h4: $("h4").length,
      h5: $("h5").length,
      h6: $("h6").length,
    };
    if (headings.h2 === 0 && !jsOnlyPage) flags.push("missing_h2");

    // --- <base href> detection ---
    // Many Shopify/WooCommerce stores (and sites using CDN asset resolution)
    // include a <base href> tag. When present, ALL relative URLs (images,
    // scripts, stylesheets) resolve against the base href, not the page URL.
    // We detect it and use it for resolving image src URLs, while link
    // discovery still resolves against finalUrl (correct for crawl discovery
    // since we want the site's own pages, not CDN asset paths).
    const baseHrefRaw = $("base").first().attr("href");
    let baseUrlForImages: URL = finalUrl;
    if (baseHrefRaw) {
      try {
        const resolved = new URL(baseHrefRaw, finalUrl);
        if (resolved.protocol === "http:" || resolved.protocol === "https:") {
          baseUrlForImages = resolved;
        }
      } catch {
        // malformed <base href> — fall back to finalUrl
      }
    }

    // --- Images ---
    // Filename quality is decided by the SHARED imageFilename helper: it
    // decodes CDN/proxy URLs (e.g. /_next/image?url=...) before checking
    // descriptiveness, so images served through Next.js's optimizer or a
    // similar proxy are judged by their REAL filename, not by "image".
    // Image discovery covers: <img src>, srcset, <picture>/<source srcset>,
    // data-src/data-srcset (lazy loading), and og:image/twitter:image meta.
    const images: ImageFinding[] = [];
    const imageSrcSet = new Set<string>(); // deduplicate image URLs
    let missingAltCount = 0;
    let missingLazyCount = 0;
    let missingSrcsetCount = 0;
    let missingDimCount = 0;
    let genericFilenameCount = 0;

    // Helper: add an image to the list if it hasn't been seen yet.
    // Resolves relative src against baseUrlForImages (<base href> or finalUrl).
    function addImage(rawSrc: string, alt: string | null, hasLazy: boolean, hasSrcset: boolean, hasDims: boolean = true) {
      if (!rawSrc || rawSrc.startsWith("data:")) return; // skip data URIs
      let resolvedSrc: string;
      try {
        const u = new URL(rawSrc, baseUrlForImages);
        u.hash = "";
        resolvedSrc = u.toString();
      } catch {
        resolvedSrc = rawSrc; // fallback to raw if resolution fails
      }
      if (imageSrcSet.has(resolvedSrc)) return; // already added
      imageSrcSet.add(resolvedSrc);
      const filename = extractImageFilename(resolvedSrc, finalUrl.toString());
      const filenameQuality: ImageFilenameQuality = isNonDescriptiveImageFilename(filename) ? "generic" : "good";
      if (filenameQuality === "generic") genericFilenameCount++;
      images.push({ src: resolvedSrc, alt, hasLazyLoading: hasLazy, hasSrcset, hasDimensions: hasDims, filenameQuality, sizeBytes: null });
    }

    // Helper: parse a srcset attribute string and return all image URLs.
    function parseSrcset(srcset: string): string[] {
      if (!srcset) return [];
      return srcset
        .split(/\s*,\s*/)
        .map((entry) => entry.trim().split(/\s+/)[0])
        .filter((url) => !!url && !url.startsWith("data:"));
    }

    // 1. Extract images from <img src> (primary source)
    $("img").each((_, el) => {
      const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
      const altAttr = $(el).attr("alt");
      const alt = altAttr !== undefined ? altAttr : null;
      if (!alt || alt.trim() === "") missingAltCount++;

      const hasLazyLoading = ($(el).attr("loading") ?? "").toLowerCase() === "lazy" ||
        !!$(el).attr("data-src"); // data-src is a lazy-loading signal
      if (!hasLazyLoading) missingLazyCount++;

      const hasSrcset = !!$(el).attr("srcset") || !!$(el).attr("data-srcset");
      if (!hasSrcset) missingSrcsetCount++;

      // Check for explicit width and height attributes — missing dimensions
      // cause layout shifts (CLS) and prevent the browser from reserving space.
      const hasWidth = !!$(el).attr("width");
      const hasHeight = !!$(el).attr("height");
      const hasDims = hasWidth && hasHeight;
      if (!hasDims) missingDimCount++;

      // Add the primary src (or data-src for lazy-loaded images)
      if (src) addImage(src, alt, hasLazyLoading, hasSrcset, hasDims);

      // Also extract from srcset / data-srcset
      const srcset = $(el).attr("srcset") ?? $(el).attr("data-srcset") ?? "";
      for (const srcUrl of parseSrcset(srcset)) {
        addImage(srcUrl, alt, hasLazyLoading, true, hasDims);
      }
    });

    // 2. Extract images from <picture> / <source srcset>
    $("picture source").each((_, el) => {
      const srcset = $(el).attr("srcset") ?? "";
      for (const srcUrl of parseSrcset(srcset)) {
        addImage(srcUrl, null, false, true);
      }
    });

    // 3. Extract Open Graph / Twitter Card images (these are important for
    //    social sharing and are often high-quality product/page images)
    const ogImage = $("meta[property='og:image']").attr("content");
    if (ogImage) addImage(ogImage, null, false, false);
    const twitterImage = $("meta[name='twitter:image']").attr("content") ?? $("meta[property='twitter:image']").attr("content");
    if (twitterImage) addImage(twitterImage, null, false, false);

    if (missingAltCount > 0) flags.push("missing_alt_text");
    if (images.length > 0 && missingLazyCount > 0) flags.push("missing_lazy_loading");
    if (images.length > 0 && missingSrcsetCount > 0) flags.push("missing_responsive_images");
    if (images.length > 0 && missingDimCount > 0) flags.push("missing_image_dimensions");
    if (genericFilenameCount > 0) flags.push("poor_image_filenames");

    // --- Canonical ---
    // Resolved and compared against finalUrl (post-redirect), not the
    // originally-requested URL, so http->https / non-www->www redirects
    // don't produce false "canonical_mismatch" flags.
    const canonicalHrefRaw = $('link[rel="canonical"]').first().attr("href");
    let canonicalUrlNormalized: string | null = null;
    let isSelfReferencing: boolean | null = null;
    if (!canonicalHrefRaw) {
      flags.push("missing_canonical");
    } else {
      const resolved = resolveHref(canonicalHrefRaw, finalUrl);
      if (!resolved) {
        flags.push("missing_canonical");
      } else {
        canonicalUrlNormalized = resolved.toString();
        isSelfReferencing =
          normalizeForComparison(resolved) === normalizeForComparison(finalUrl);
        if (!isSelfReferencing) flags.push("canonical_mismatch");
      }
    }

    // --- Structured data / Schema markup ---
    const jsonLdBlocks: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text().trim();
      if (raw) jsonLdBlocks.push(raw);
    });
    const hasMicrodata = $("[itemscope]").length > 0;
    const hasRdfa = $("[typeof]").length > 0;

    const schemaTypes: string[] = [];
    for (const block of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(block);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          const graph = Array.isArray(entry?.["@graph"]) ? entry["@graph"] : [entry];
          for (const node of graph) {
            const type = node?.["@type"];
            if (typeof type === "string") schemaTypes.push(type);
            else if (Array.isArray(type)) schemaTypes.push(...type.filter((t: unknown) => typeof t === "string"));
          }
        }
      } catch {
        // malformed JSON-LD — handled by invalid_schema_markup below
      }
    }

    const uniqueSchemaTypes = Array.from(new Set(schemaTypes));
    const hasValidJsonLd = jsonLdBlocks.length > 0 && uniqueSchemaTypes.length > 0;
    const hasAnyStructuredData = hasValidJsonLd || hasMicrodata || hasRdfa;

    if (!hasAnyStructuredData) {
      flags.push("missing_schema_markup");
    } else if (jsonLdBlocks.length > 0 && uniqueSchemaTypes.length === 0) {
      flags.push("invalid_schema_markup");
    }

    const structuredData: import("./types").StructuredDataFinding = {
      present: hasAnyStructuredData,
      types: uniqueSchemaTypes,
      format: hasValidJsonLd ? "json-ld" : hasMicrodata ? "microdata" : hasRdfa ? "rdfa" : null,
    };

    // --- Internal links ---
    // Hostname comparison uses finalUrl so links matching the site's real
    // (post-redirect) domain are correctly counted as internal. The site's
    // crawlHost (www-stripped) is also honored: many sites don't redirect
    // www onto non-www (or vice versa) and link to the other variant with
    // absolute URLs — treating those links as external is a real cause of
    // crawls that stop after one page. Only the www/non-www pair collapses;
    // unrelated subdomains stay external (scope is the configured site).
    //
    // NOTE: link discovery resolves against finalUrl, NOT <base href>.
    // <base href> typically points to a CDN for asset resolution; using it
    // for link discovery would cause navigation links to resolve against the
    // CDN domain instead of the site's own domain, losing discoverable pages.
    const internalLinksSet = new Set<string>();
    let externalLinkCount = 0;
    const finalHost = finalUrl.hostname.toLowerCase();
    const finalHostNoWww = finalHost.replace(/^www\./, "");
    const crawlHostNoWww = (options.crawlHost ?? finalHost).toLowerCase().replace(/^www\./, "");

    function isInternalHost(host: string): boolean {
      const h = host.toLowerCase();
      return (
        h === finalHost ||
        h.replace(/^www\./, "") === finalHostNoWww ||
        (options.crawlHost !== undefined && h.replace(/^www\./, "") === crawlHostNoWww)
      );
    }

    // Extract links from <a href> (primary source)
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const resolved = resolveHref(href, finalUrl);
      if (!resolved) return;
      if (isInternalHost(resolved.hostname)) {
        internalLinksSet.add(resolved.toString());
      } else {
        externalLinkCount++;
      }
    });

    // Extract pagination links from <link rel="next"> and <link rel="prev">
    // These are often the ONLY way to discover paginated collection/category
    // pages on Shopify and WooCommerce sites.
    $("link[rel='next'], link[rel='prev']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const resolved = resolveHref(href, finalUrl);
      if (!resolved) return;
      if (isInternalHost(resolved.hostname)) {
        internalLinksSet.add(resolved.toString());
      }
    });

    // Extract sitemap references from <link rel="sitemap">
    // Some sites declare their sitemap via HTML rather than robots.txt.
    // Store these for the crawlSite sitemap-discovery phase.
    const htmlSitemapUrls: string[] = [];
    $("link[rel='sitemap']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) htmlSitemapUrls.push(href);
    });

    const internalLinks = Array.from(internalLinksSet);
    if (internalLinks.length === 0) flags.push("no_internal_links");

    // --- Word count (visible text only) ---
    const bodyClone = $("body").clone();
    bodyClone.find("script, style, noscript, template, svg").remove();
    const visibleText = bodyClone.text();
    const wordCount = visibleText
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0).length;
    if (wordCount < THIN_CONTENT_WORD_THRESHOLD) {
      // A JS-rendered page's low word count is an artifact of the crawler
      // seeing the pre-hydration shell — the content IS there, just not in
      // the raw HTML. Report that via the render_mode AEO check instead of
      // a false thin-content finding.
      if (jsOnlyPage) {
        // fall through — render_mode check owns this page
      } else if (isUtilityPagePath(finalUrl.pathname)) {
        // Utility pages (store locators, contact, cart, checkout, stores)
        // are legitimately short by design — never flag them as thin content.
        // See isUtilityPagePath() above.
        flags.push("utility_page");
      } else {
        flags.push("thin_content");
      }
    }

    // --- Soft-404 detection ---
    // A page that returns HTTP 200 but whose content strongly indicates
    // "not found" is a soft 404 — search engines may treat it as a real
    // page, wasting crawl budget on a dead URL. Only flag when MULTIPLE
    // strong signals converge to avoid false positives on legitimate
    // low-content pages, utility pages, or pages with "404" in their
    // content for other reasons.
    const SOFT_404_SIGNALS = /not\s+found|does\s+not\s+exist|page\s+not|no\s+results|couldn.t\s+find|sorry.*not.*available|this\s+page\s+is\s+unavailable/i;
    const titleForSoft404 = (titleContent ?? "").toLowerCase();
    const h1Text = h1.join(" ").toLowerCase();
    const bodyLower = visibleText.substring(0, 500).toLowerCase(); // first 500 chars
    const titleSignals = SOFT_404_SIGNALS.test(titleForSoft404);
    const h1Signals = h1.length > 0 && SOFT_404_SIGNALS.test(h1Text);
    const bodySignals = SOFT_404_SIGNALS.test(bodyLower);
    // Require at least 2 strong signals AND low word count to avoid
    // false positives on pages that mention "not found" in their content.
    const soft404SignalCount = (titleSignals ? 1 : 0) + (h1Signals ? 1 : 0) + (bodySignals ? 1 : 0);
    if (soft404SignalCount >= 2 && wordCount < 100 && !isUtilityPagePath(finalUrl.pathname)) {
      flags.push("soft_404");
    }

    // --- URL structure (shared evaluation — see urlSeo.ts; also used for
    // error/non-HTML URLs so the URL SEO section can't miss any of them) ---
    flags.push(...urlSeoFlagsForUrl(finalUrl));

    // --- AEO Signals ---
    const aeoSignals = extractAeoSignals($, finalUrl, visibleText, wordCount, jsonLdBlocks);
  
    return {
      ok: true,
      url: finalUrl.toString(),
      requestedUrl: requestedUrl.toString(),
      redirected,
      redirectHopCount,
      redirectHopStatusCodes,
      redirectHopUrls,
      fetchedAt: nowIso(),
      statusCode: response.status,
      contentType,
      title,
      metaDescription,
      h1,
      headings,
      images,
      canonical: { url: canonicalUrlNormalized, isSelfReferencing },
      internalLinks,
      externalLinkCount,
      wordCount,
      flags,
      structuredData,
      robotsMeta: { noindex: metaNoindex, nofollow: metaNofollow },
      xRobotsTag: { raw: xRobotsTagRaw, noindex: xRobotsTagNoindex },
      isOrphan: false,
      htmlLang,
      aeoSignals,
      htmlSitemapUrls: htmlSitemapUrls.length > 0 ? htmlSitemapUrls : undefined,
      h1Source: h1.length > 0 ? "raw" : null,
      needsH1Verification: h1VerificationNeeded || undefined,
      potentialVisualHeading: potentialVisualHeadingResult ?? null,
      renderVerificationStatus: h1.length > 0 ? "not_needed" : (h1VerificationNeeded ? "not_attempted" : "not_attempted"),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to parse HTML.";
    return makeError(url, "parse_error", message);
  }
}

// ---------------------------------------------------------------------------
// Rendered-DOM re-analysis
// ---------------------------------------------------------------------------

/**
 * Detects whether a prominent image near the top of the main content may
 * function as a visual page heading. Uses multiple signals (position,
 * ancestor semantics, class/id keywords, alt text, image dimensions) to
 * score confidence. Returns null when no candidate is found.
 *
 * This is a CONTEXTUAL signal only — it does NOT replace a missing H1.
 * When an H1 is absent, the caller can optionally report this as extra
 * context alongside the missing-H1 finding.
 */
function detectPotentialVisualHeading($: any): { src: string; alt: string | null; confidence: number } | null {
  // Find the main content container: <main>, <article>, [role="main"], or
  // fall back to <body>.
  const mainContainer = $("main, article, [role='main']").first();
  const searchRoot = mainContainer.length ? mainContainer : $("body");
  if (!searchRoot.length) return null;

  // Keywords in class/id that suggest a hero/banner/title/heading section
  const HERO_KEYWORDS = /hero|banner|title|heading|jumbotron|masthead|splash|intro|top|above|cover|lead/i;
  // Keywords in alt text or filename suggesting a title/heading image
  const TITLE_KEYWORDS = /title|heading|banner|hero|logo|brand|name/i;

  // Collect all <img> elements in the search root with their ancestor info
  const candidates: Array<{
    el: any;
    src: string;
    alt: string | null;
    position: number; // 0-indexed among all elements in search root
    inHeroSection: boolean;
    altHasTitleKeyword: boolean;
    filenameHasTitleKeyword: boolean;
    isLargeImage: boolean;
  }> = [];

  // Walk the first ~20 significant elements to find images near the top
  const allChildren = searchRoot.children().toArray();
  let elementIndex = 0;
  const MAX_SCAN_ELEMENTS = 30;

  for (const child of allChildren) {
    if (elementIndex >= MAX_SCAN_ELEMENTS) break;
    const $child = $(child);

    // Check if this element or any ancestor is a hero/banner section
    const heroAncestor = $child.closest("[class], [id]").filter((_: number, el: any) => {
      const classId = `${$(el).attr("class") ?? ""} ${$(el).attr("id") ?? ""}`;
      return HERO_KEYWORDS.test(classId);
    }).length > 0;

    // Find images in this element
    const imgs = $child.find("img").addBack("img");
    imgs.each((_: number, imgEl: any) => {
      const $img = $(imgEl);
      const src = $img.attr("src") ?? $img.attr("data-src") ?? "";
      if (!src || src.startsWith("data:")) return;

      const alt = $img.attr("alt") ?? null;
      const filename = src.split("?")[0].split("/").pop() ?? "";

      // Check dimensions — we can read width/height attributes or CSS
      const widthAttr = parseInt($img.attr("width") ?? "0", 10);
      const heightAttr = parseInt($img.attr("height") ?? "0", 10);
      const isLargeByAttr = widthAttr >= 400 || heightAttr >= 200;

      candidates.push({
        el: $img,
        src,
        alt,
        position: elementIndex,
        inHeroSection: heroAncestor,
        altHasTitleKeyword: alt ? TITLE_KEYWORDS.test(alt) : false,
        filenameHasTitleKeyword: TITLE_KEYWORDS.test(filename),
        isLargeImage: isLargeByAttr,
      });
    });

    elementIndex++;
  }

  if (candidates.length === 0) return null;

  // Score each candidate. Position alone is NOT enough — the image must
  // also have at least one strong signal (hero section, title-related
  // alt/filename, or large dimensions) to be considered a visual heading.
  let bestCandidate: typeof candidates[0] | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    let positionScore = 0;
    let strongSignalScore = 0;

    // Position: first image in the main content gets high score
    if (c.position <= 2) positionScore = 30;
    else if (c.position <= 5) positionScore = 20;
    else if (c.position <= 10) positionScore = 10;

    // Strong signals — these confirm the image is likely a heading, not
    // just an image that happens to be near the top
    if (c.inHeroSection) strongSignalScore += 25;
    if (c.altHasTitleKeyword) strongSignalScore += 15;
    if (c.filenameHasTitleKeyword) strongSignalScore += 10;
    if (c.isLargeImage) strongSignalScore += 10;

    // Must have at least one strong signal (>= 10) beyond position
    if (strongSignalScore < 10) continue;

    const score = positionScore + strongSignalScore +
      // First image overall gets a small bonus
      (c === candidates[0] ? 10 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = c;
    }
  }

  // Threshold: need moderate confidence (40+)
  if (!bestCandidate || bestScore < 40) return null;

  // Cap at 100
  const confidence = Math.min(100, bestScore);

  return {
    src: bestCandidate.src,
    alt: bestCandidate.alt,
    confidence,
  };
}

/**
 * Re-analyzes structural SEO elements (H1, H2-H6 headings) from rendered
 * HTML produced by browser rendering. Updates the page result in-place:
 *
 * - If the rendered DOM contains an H1 that was missing from the raw HTML,
 *   the `missing_h1` flag is removed, the h1 array is populated, and
 *   h1Source is set to "rendered".
 * - Same logic for H2 / missing_h2.
 * - Heading counts (h2-h6) are updated to reflect the rendered DOM.
 * - If H1 is still missing after rendering, a potentialVisualHeading is
 *   detected for contextual reporting.
 *
 * This function does NOT re-run link/image/schema/canonical analysis —
 * those are either already correct from the raw HTML or not affected by
 * JS rendering in the same way heading structure is.
 *
 * @param result  The original crawlPage result (mutated in-place)
 * @param renderedHtml  The full rendered HTML from the browser
 */
export function reAnalyzeFromRenderedHtml(
  result: import("./types").CrawlPageSuccess,
  renderedHtml: string
): void {
  try {
    const $ = cheerio.load(renderedHtml);

    // --- H1 re-check ---
    const renderedH1: string[] = [];
    $("h1").each((_, el) => {
      const $el = $(el);
      let text = $el.text().trim();
      // Same alt-text fallback as crawlPage's H1 extraction
      if (!text) {
        const imgAlt = $el.find("img").attr("alt");
        if (imgAlt && imgAlt.trim()) text = imgAlt.trim();
      }
      // Always count the H1 element — same logic as crawlPage's extraction
      renderedH1.push(text || "[H1 element present]");
    });

    const hadMissingH1 = result.flags.includes("missing_h1");
    const hadMultipleH1 = result.flags.includes("multiple_h1");

    if (renderedH1.length > 0 && hadMissingH1) {
      // Rendered DOM has H1(s) but raw HTML didn't — update the result.
      // Only update when the raw HTML was missing H1; if raw already had
      // H1s, keep those (the raw source is authoritative for that case).
      result.flags = result.flags.filter((f) => f !== "missing_h1");
      result.h1 = renderedH1;
      result.h1Source = "rendered";

      // Check multiple H1
      if (renderedH1.length > 1) {
        if (!result.flags.includes("multiple_h1")) {
          result.flags.push("multiple_h1");
        }
      } else if (hadMultipleH1) {
        result.flags = result.flags.filter((f) => f !== "multiple_h1");
      }
    } else if (renderedH1.length > 0 && !hadMissingH1) {
      // Rendered DOM has H1(s) and raw HTML also had H1(s) — keep raw.
      // No change needed.
    } else if (hadMissingH1) {
      // H1 still missing after rendering — detect potential visual heading
      const visualHeading = detectPotentialVisualHeading($);
      result.potentialVisualHeading = visualHeading;
    }

    // --- H2-H6 re-check ---
    const renderedHeadings = {
      h2: $("h2").length,
      h3: $("h3").length,
      h4: $("h4").length,
      h5: $("h5").length,
      h6: $("h6").length,
    };

    const hadMissingH2 = result.flags.includes("missing_h2");
    if (renderedHeadings.h2 > 0 && hadMissingH2) {
      result.flags = result.flags.filter((f) => f !== "missing_h2");
    }

    result.headings = renderedHeadings;
  } catch {
    // Rendered HTML failed to parse — keep original result unchanged.
    // This is non-fatal: the raw-HTML analysis is still valid.
  }
}