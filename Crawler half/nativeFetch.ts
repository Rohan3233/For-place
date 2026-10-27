/**
 * Native HTTP fetch for the crawler, implemented directly on node:http /
 * node:https.
 *
 * WHY THIS EXISTS: Next.js patches `globalThis.fetch` inside server
 * components/server actions and wraps every request with its own fetch
 * cache. That wrapper is harmless for normal page fetches, but the crawler
 * deliberately ABORTS requests (PageSpeed's 45s timeout, per-page/link
 * timeouts with retry) — and Next's wrapper tries to write the aborted
 * request into its fetch cache, fails, and logs a scary "Failed to set
 * fetch cache ... [AbortError] (INDEX_SIZE_ERR ...)" stack dump for every
 * single abort. `cache: "no-store"` does not stop that in Next 15.5.
 *
 * This helper talks to node:http/node:https directly, so Next's fetch-cache
 * instrumentation never sees the request at all. No dependency changes, no
 * behavior change for the audit: same TLS, same redirects, same headers,
 * same status/headers/body semantics — just no Next interception.
 *
 * It implements only what the crawler actually uses: GET/HEAD (and POST
 * with a JSON body for the LLM provider), a redirect loop, a per-request
 * timeout, AbortSignal support, and a minimal Response-compatible surface
 * (ok/status/statusText/url/headers.get/text/json). Responses are read
 * fully into memory (capped at 16MB — the crawler never streams bodies),
 * and no `accept-encoding` header is sent, so servers reply uncompressed
 * and no decompression is needed.
 */

import * as http from "node:http";
import * as https from "node:https";

export interface NativeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  /** Final URL after any followed redirects. */
  readonly url: string;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface NativeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** "follow" (default) or "manual" (return the 3xx response). */
  redirect?: "follow" | "manual";
  signal?: AbortSignal;
  /** Per-request timeout; default 15s. Timeouts reject with an AbortError. */
  timeoutMs?: number;
}

const MAX_BODY_BYTES = 16 * 1024 * 1024;
const MAX_REDIRECTS = 10;
const DEFAULT_TIMEOUT_MS = 15_000;

function makeAbortError(): Error {
  const err = new Error("This operation was aborted");
  err.name = "AbortError";
  return err;
}

function requestOnce(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
  signal: AbortSignal | undefined
): Promise<NativeFetchResponse> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, { method, headers }, (res) => {
      const status = res.statusCode ?? 0;
      const statusText = res.statusMessage ?? "";
      const finalUrl = url.toString();
      const rawHeaders = res.headers; // IncomingHttpHeaders — lowercase keys
      const chunks: Buffer[] = [];
      let size = 0;
      let abortedBySize = false;

      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          abortedBySize = true;
          req.destroy(new Error("Response body exceeds 16MB."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (abortedBySize) return; // request already destroyed
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText,
          url: finalUrl,
          headers: {
            get: (name: string) => {
              const value = rawHeaders[name.toLowerCase()];
              if (value === undefined) return null;
              return Array.isArray(value) ? value.join(", ") : value;
            },
          },
          text: async () => text,
          json: async () => JSON.parse(text),
        });
      });
    });

    const timeoutHandle = setTimeout(() => req.destroy(makeAbortError()), timeoutMs);
    const onAbort = () => req.destroy(makeAbortError());
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutHandle);
        req.destroy(makeAbortError());
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
    req.on("error", (err) => {
      clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/**
 * Native GET/HEAD/POST with optional redirect following. Rejects on
 * network errors, timeouts (AbortError), or exceeding the redirect cap —
 * mirroring what `fetch` would do, minus Next's fetch-cache wrapper.
 */
export async function nativeFetch(
  input: string | URL,
  init: NativeFetchInit = {}
): Promise<NativeFetchResponse> {
  let method = (init.method ?? "GET").toUpperCase();
  let headers = init.headers ?? {};
  let body = init.body;
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const followRedirects = (init.redirect ?? "follow") === "follow";

  let current = new URL(input.toString());
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const res = await requestOnce(current, method, headers, body, timeoutMs, init.signal);
    if (!followRedirects || res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    current = new URL(location, current);
    // Per HTTP spec, 301/302/303 redirects switch to GET without the body;
    // 307/308 preserve method and body. (The crawler's only POST is the
    // LLM call, which never redirects — this is just spec-correctness.)
    if (method === "POST") {
      method = "GET";
      body = undefined;
    }
  }
  throw new Error("Too many redirects.");
}
