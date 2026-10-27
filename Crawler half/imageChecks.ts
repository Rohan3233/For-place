import { fetchWithRetry, describeNetworkError } from "./fetchWithRetry";
import type { CrawlPageResult, OversizedImageResult } from "./types";

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_OVERSIZED_IMAGE_THRESHOLD_BYTES = 200_000; // 200KB — a common rule-of-thumb ceiling for a single web image

/**
 * Checks every unique image discovered during the crawl for its file size
 * via a HEAD request's Content-Length header, flagging any image at or
 * above thresholdBytes as oversized. Mirrors checkBrokenLinks in shape and
 * concurrency handling — same bounded worker pool, same "never throws"
 * per-image error handling.
 *
 * HONEST LIMITATION: relies on the server returning an accurate
 * Content-Length on HEAD — some CDNs/servers omit it or return an
 * estimate. When it's missing, the image is reported with
 * contentLengthBytes: null and ok: false, rather than guessed at.
 */
export async function checkOversizedImages(
  pages: CrawlPageResult[],
  options: {
    userAgent: string;
    concurrency?: number;
    timeoutMs?: number;
    thresholdBytes?: number;
  }
): Promise<OversizedImageResult[]> {
  const {
    userAgent,
    concurrency = DEFAULT_CONCURRENCY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    thresholdBytes = DEFAULT_OVERSIZED_IMAGE_THRESHOLD_BYTES,
  } = options;

  // Resolve each image src against the page it was found on, since <img
  // src> is frequently relative. Collect a linkedFrom set, same dedup
  // pattern as brokenLinks.ts.
  const imageSources = new Map<string, Set<string>>();
  for (const page of pages) {
    if (!page.ok) continue;
    for (const image of page.images) {
      const resolved = resolveImageUrl(image.src, page.url);
      if (!resolved) continue;
      const sources = imageSources.get(resolved) ?? new Set<string>();
      sources.add(page.url);
      imageSources.set(resolved, sources);
    }
  }

  const uniqueImages = Array.from(imageSources.keys());
  const results: OversizedImageResult[] = [];
  let index = 0;

  async function worker() {
    while (index < uniqueImages.length) {
      const current = uniqueImages[index];
      index++;
      const outcome = await checkOneImage(current, userAgent, timeoutMs, thresholdBytes);
      results.push({ src: current, ...outcome, linkedFrom: Array.from(imageSources.get(current) ?? []) });
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, uniqueImages.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/**
 * Resolves an <img> src against the page it was found on. Exported so
 * runAudit can stream image size checks while the crawl is still running
 * (same dedup-by-URL + linkedFrom pattern, just incremental) without
 * duplicating the resolution logic.
 */
export function resolveImageUrl(src: string, base: string): string | null {
  try {
    const resolved = new URL(src, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Checks a single image's file size via HEAD Content-Length. Exported so
 * runAudit can stream these checks during the crawl; checkOversizedImages
 * remains for callers that have the full page set up front.
 */
export async function checkOneImage(
  url: string,
  userAgent: string,
  timeoutMs: number,
  thresholdBytes: number
): Promise<Omit<OversizedImageResult, "src" | "linkedFrom">> {
  // Retry transient failures before reporting an image as uncheckable — a
  // one-shot timeout must never surface as an image error in the report.
  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      { method: "HEAD", headers: { "User-Agent": userAgent }, redirect: "follow" },
      { timeoutMs, maxAttempts: 2 }
    );
  } catch (err: unknown) {
    return {
      contentLengthBytes: null,
      isOversized: false,
      ok: false,
      errorMessage: describeNetworkError(err),
    };
  }
  if (!res.ok) {
    return {
      contentLengthBytes: null,
      isOversized: false,
      ok: false,
      errorMessage: `Received ${res.status} checking image size.`,
    };
  }
    const lengthHeader = res.headers.get("content-length");
    const contentLengthBytes = lengthHeader ? parseInt(lengthHeader, 10) : null;
    if (contentLengthBytes === null || Number.isNaN(contentLengthBytes)) {
      return {
        contentLengthBytes: null,
        isOversized: false,
        ok: false,
        errorMessage: "Server did not report a Content-Length header.",
      };
    }
    return {
      contentLengthBytes,
      isOversized: contentLengthBytes >= thresholdBytes,
      ok: true,
      errorMessage: null,
    };
}