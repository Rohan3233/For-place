/**
 * Shared retry-with-backoff helper for the crawler.
 *
 * The audit crawls and validates dozens to thousands of URLs. Real networks
 * have transient failures — a dropped connection, a slow server, a brief
 * rate limit — that are NOT evidence a page or link is broken. Reporting
 * those as findings makes the audit less accurate, not more.
 *
 * This helper retries only the failures that are plausibly transient
 * (timeouts, connection resets/refusals, DNS hiccups, 429/5xx) with
 * exponential backoff + jitter, and gives up immediately on definitive
 * answers (4xx, DNS-not-found on a stable domain). Callers keep their own
 * error classification — this only removes the one-shot flukes.
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;

/** HTTP statuses that commonly clear on retry (throttling, server hiccups). */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Node/undici error codes that are usually transient. */
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/** Message patterns that indicate a transient network-layer failure. */
const RETRYABLE_ERROR_PATTERNS = [
  /socket hang up/i,
  /tls handshake/i,
  /ssl /i,
  /network error/i,
  /fetch failed/i,
  /terminated/i,
  /undici/i,
  /connection (reset|closed|refused|aborted)/i,
];

export interface FetchWithRetryOptions {
  /** Per-attempt timeout. Default 10s. */
  timeoutMs?: number;
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay for the first backoff (doubles each retry). Default 250ms. */
  baseDelayMs?: number;
  /** Also retry retryable HTTP statuses (429/5xx). Default true. */
  retryHttpStatus?: boolean;
  /**
   * Called each time a retry is about to happen (network flake or
   * retryable status). Lets callers count real retries for instrumentation
   * without changing retry behavior. Never throws from here.
   */
  onRetry?: (attempt: number, err?: unknown, status?: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter so parallel workers don't stampede. */
function backoffMs(baseMs: number, attempt: number): number {
  const windowMs = baseMs * Math.pow(2, attempt);
  return Math.round(windowMs / 2 + Math.random() * (windowMs / 2));
}

function errorCodeOf(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const code = (cause as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

function isRetryableError(err: unknown): boolean {
  // Timeouts (AbortError) are the classic transient failure.
  if (err instanceof Error && err.name === "AbortError") return true;

  const code = errorCodeOf(err);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

  const message = err instanceof Error ? err.message : String(err);
  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(message));
}

/**
 * Human-readable description of a network-layer failure, digging into the
 * undici cause chain so a report never has to show a bare "fetch failed".
 * Returns a description string — never throws.
 */
export function describeNetworkError(err: unknown): string {
  const cause = err && typeof err === "object" ? (err as { cause?: unknown }).cause : undefined;
  const code = errorCodeOf(err);
  const causeMessage =
    cause instanceof Error ? cause.message : cause && typeof cause === "object" ? String((cause as { message?: unknown }).message ?? "") : "";
  const message = err instanceof Error ? err.message : String(err);
  const haystack = `${code ?? ""} ${causeMessage} ${message}`.toLowerCase();

  if (code === "ECONNREFUSED" || haystack.includes("econnrefused") || haystack.includes("bad port") || haystack.includes("connection refused")) {
    return "Connection refused — the server actively rejected the request.";
  }
  if (code === "ECONNRESET" || haystack.includes("econnreset") || haystack.includes("connection reset")) {
    return "Connection reset — the server closed the connection mid-request.";
  }
  if (code === "ECONNABORTED" || haystack.includes("econnaborted")) {
    return "Connection aborted before the request completed.";
  }
  if (code === "ETIMEDOUT" || haystack.includes("etimedout") || haystack.includes("timed out")) {
    return "Connection timed out — the server did not respond in time.";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || haystack.includes("enotfound") || haystack.includes("eai_again") || haystack.includes("getaddrinfo")) {
    return "Could not resolve the domain (DNS lookup failed).";
  }
  if (code === "EPIPE" || haystack.includes("epipe")) {
    return "Connection lost while writing the request.";
  }
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || haystack.includes("ehostunreach") || haystack.includes("enetunreach")) {
    return "The server's network is unreachable.";
  }

  // Fall back to the deepest useful message — prefer the cause (undici's
  // "fetch failed" wrapper hides the real error) over the generic message.
  const fallback = causeMessage && causeMessage !== "fetch failed" ? causeMessage : message;
  return fallback || "Connection failed.";
}

/**
 * Fetches a URL with retry on transient failures.
 *
 * Resolves with the first definitive Response (any non-retryable status,
 * or a retryable status that never cleared). Throws only when every attempt
 * failed at the network layer — callers classify the error as before, but
 * only a persistent failure reaches them.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 10000,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    retryHttpStatus = true,
    onRetry,
  } = opts;

  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      // cache: "no-store" — every crawler fetch is a live measurement, never
      // a cacheable artifact. Under Next.js, fetch is instrumented with its
      // own fetch cache; without no-store, an aborted/failed request logs a
      // noisy "Failed to set fetch cache" error and successful ones can be
      // deduped/persisted across the audit, which would corrupt results.
      response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      lastError = err;
      if (!isRetryableError(err)) break; // definitive failure — don't waste attempts
      if (attempt < maxAttempts - 1) {
        try {
          onRetry?.(attempt + 1, err);
        } catch {
          /* observer must never break the fetch */
        }
        await sleep(backoffMs(baseDelayMs, attempt));
      }
      continue;
    }
    clearTimeout(timeoutHandle);

    // A retryable status that cleared on a later attempt becomes success;
    // if it never clears we return the last response and let the caller
    // classify it (e.g. 503 -> server_error) rather than treating a
    // persistent server error as a network fluke.
    if (retryHttpStatus && RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1) {
      lastResponse = response;
      try {
        onRetry?.(attempt + 1, undefined, response.status);
      } catch {
        /* observer must never break the fetch */
      }
      await sleep(backoffMs(baseDelayMs, attempt));
      continue;
    }

    return response;
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("Request failed after retries.");
}
