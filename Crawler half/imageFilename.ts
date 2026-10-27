/**
 * Shared image-filename logic — used by crawlPage.ts's per-page
 * "poor_image_filenames" flag (and available to any surface that needs to
 * reason about image filenames). Deterministic, no AI, pure string/URL
 * math — same spirit as every other crawler check.
 *
 * FIX (proxied URLs): the old extraction took the last path segment of the
 * raw src, so a Next.js image-optimizer URL like
 *
 *   /_next/image?url=%2Fimages%2Fcareers-carousel%2Fcareers_carousel_4.webp&w=3840&q=75
 *
 * yielded "image" as the filename — and the descriptiveness check ran
 * against that meaningless segment, so real non-descriptive filenames
 * served through the proxy were never flagged. This helper decodes the
 * proxy's `url` query parameter (Next.js /_next/image, Cloudflare's
 * /cdn-cgi/image, willnorris/imageproxy, imgix ?url= form) and runs the
 * check against the REAL filename.
 */

import type { RunAuditResult } from "./types";

export type ImageFilenameQuality = "good" | "generic";

/** Proxy/CDN paths whose real image path travels in a query param. The
 * two framework-reserved paths are intentionally NOT anchored to the path
 * start: real sites serve them from nested prefixes too (e.g. Framer
 * serves /creators-assets/_next/image/?url=...&w=3840&q=100), and an
 * unanchored match on a reserved framework path cannot be a false
 * positive the way a generic word could. */
export const PROXY_PATH_PATTERNS = [
  /\/_next\/image/i, // Next.js image optimizer: ?url=<encoded path>
  /\/cdn-cgi\/image/i, // Cloudflare Images / image resizing
  /^\/imgix/i, // imgix (query-param form)
  /^\/imageproxy/i, // willnorris/imageproxy: ?url=
  /^\/resizer/i,
  /^\/images\/resize/i,
];

/**
 * Extracts the REAL filename from an image src, resolving relative srcs
 * against the page URL and decoding CDN/proxy URLs first:
 *
 *   1. If the src points at a known proxy path (or carries a `url` query
 *      param), decode that param and take the last path segment of the
 *      decoded inner URL (recursively, in case the value is itself a
 *      proxied path).
 *   2. Otherwise take the last path segment of the raw URL.
 *
 * Returns "" when nothing usable can be extracted.
 */
export function extractImageFilename(src: string, baseUrl: string): string {
  if (!src) return "";
  let url: URL;
  try {
    url = new URL(src, baseUrl);
  } catch {
    return "";
  }

  const rawPath = url.pathname;
  const looksProxied = PROXY_PATH_PATTERNS.some((p) => p.test(rawPath)) || url.searchParams.has("url");

  if (looksProxied) {
    const encoded = url.searchParams.get("url");
    if (encoded) {
      try {
        const decoded = decodeURIComponent(encoded);
        const inner = new URL(decoded, baseUrl);
        // The decoded value may itself be another proxy URL — recurse once
        // more so nested ?url= chains still surface the real filename.
        const innerFilename = extractImageFilename(inner.toString(), baseUrl);
        if (innerFilename) return innerFilename;
      } catch {
        // malformed encoding — fall through to the raw path below
      }
    }
    // Cloudflare's /cdn-cgi/image/<options>/<real-path> form keeps the real
    // path IN the pathname: the last segment is already the filename.
    const lastSegment = rawPath.split("/").pop() ?? "";
    if (lastSegment && /\.[a-z0-9]{2,5}$/i.test(lastSegment)) return lastSegment;
  }

  return rawPath.split("/").pop() ?? "";
}

/**
 * Generic camera/CMS default names: image1.png, IMG_1234.jpg, DSC_0001.webp,
 * photo_2.png, screenshot-3.jpg, default.png. Digits optional so bare
 * "image.png" / "default.png" are caught too.
 */
const GENERIC_FILENAME_PATTERN =
  /^(img|image|dsc|photo|pic|screenshot|screen|snap|default|camera|untitled)[-_]?\d*\.(jpe?g|png|gif|webp|avif)$/i;

/** Purely numeric filenames (e.g. 1682345678.webp — timestamp-style). */
const NUMERIC_FILENAME_PATTERN = /^\d+\.(jpe?g|png|gif|webp|avif)$/i;

/** Long hex-looking strings (e.g. a1b2c3d4e5f6... .png — hash-style). */
const HASH_FILENAME_PATTERN = /^[0-9a-f]{10,}\.(jpe?g|png|gif|webp|avif)$/i;

/**
 * Two words + trailing index with no further context (careers_carousel_4,
 * hero_banner_2). A 2-word + number pattern is too thin to tell search
 * engines what the image actually shows — treat it as non-descriptive.
 * Three-or-more-word names (genai_home_earth.png, bottom_lifeat-leapfrog_3)
 * carry enough context and are left alone.
 */
const WORD_WORD_INDEX_PATTERN = /^[a-z][a-z0-9]*[_-][a-z][a-z0-9]*[_-]?\d+\.(jpe?g|png|gif|webp|avif)$/i;

/** Classifies a filename as "good" (descriptive) or "generic" (not). */
export function classifyImageFilename(filename: string): ImageFilenameQuality {
  if (
    GENERIC_FILENAME_PATTERN.test(filename) ||
    NUMERIC_FILENAME_PATTERN.test(filename) ||
    HASH_FILENAME_PATTERN.test(filename) ||
    WORD_WORD_INDEX_PATTERN.test(filename)
  ) {
    return "generic";
  }
  return "good";
}

/** Convenience boolean wrapper used by the crawl flag. */
export function isNonDescriptiveImageFilename(filename: string): boolean {
  return classifyImageFilename(filename) === "generic";
}

export interface NonDescriptiveImageFinding {
  /** Absolute src as it appears on the page (may be a proxy/CDN URL such as
   * /_next/image?url=...). This is the URL a client sees in the report. */
  src: string;
  /** The decoded REAL filename extracted from the src (e.g. careers_carousel_4.webp). */
  filename: string;
  /** Pages the image appears on (deduped, crawl order). */
  pages: string[];
}

/**
 * Collects every non-descriptive image across the crawl, deduped by
 * resolved src, with the pages it appears on. Uses the per-image
 * filenameQuality already computed by crawlPage — which decodes proxied
 * URLs first — so the PDF/web Image SEO sections can list the actual
 * offending images (e.g. the full /_next/image URL plus its real
 * filename) instead of only the affected pages.
 */
export function buildNonDescriptiveImageFindings(audit: RunAuditResult): NonDescriptiveImageFinding[] {
  const bySrc = new Map<string, NonDescriptiveImageFinding>();
  for (const page of audit.crawl.pages) {
    if (!page.ok) continue;
    for (const image of page.images) {
      if (image.filenameQuality !== "generic") continue;
      let src = image.src;
      try {
        src = new URL(image.src, page.url).toString();
      } catch {
        // keep the raw src when it cannot be resolved against the page
      }
      let finding = bySrc.get(src);
      if (!finding) {
        finding = { src, filename: extractImageFilename(image.src, page.url), pages: [] };
        bySrc.set(src, finding);
      }
      if (!finding.pages.includes(page.url)) finding.pages.push(page.url);
    }
  }
  return [...bySrc.values()].sort((a, b) => b.pages.length - a.pages.length);
}
