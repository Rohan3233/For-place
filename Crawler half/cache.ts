import type { CacheProvider, CacheEntry } from "./types";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — matches the free-tier plan

/**
 * Schema version of the cached audit result. Bump this (increment by one)
 * whenever crawl behavior or the result shape changes materially — URL
 * exclusion rules, new findings, changed counting semantics, etc. The
 * version is appended to the cache key by runAudit.ts, so an entry stored
 * under an older version is simply never read again: the next audit of the
 * same domain re-crawls fresh instead of serving stale data. Old rows in
 * the cache table become orphans (unread) and are harmless.
 *
 * History:
 *  1 — initial versioned key (previous releases cached under the bare
 *      hostname with no version; those entries are ignored from now on,
 *      which is the point — they may predate the auth-path/external-host
 *      crawler exclusions).
 */
export const AUDIT_SCHEMA_VERSION = 1;

/**
 * Cache key is the domain (hostname), not the full URL — this is the whole
 * point of this module. Two different accounts auditing the same domain
 * within the TTL window should hit the same cache entry. This is what
 * closes the "repeat audit of the same site under different accounts"
 * margin risk flagged back in the original business doc (Section VI).
 *
 * runAudit.ts suffixes the version (AUDIT_SCHEMA_VERSION) onto this base
 * key, so a schema change re-crawls rather than replaying old data.
 */
export function domainCacheKey(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  // Treat www and non-www as the same cache entry — the actual crawl already
  // normalizes to whatever the site redirects to, so caching by bare
  // registrable-ish hostname (stripping a leading "www.") avoids splitting
  // one site's cache across two keys.
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function isCacheEntryFresh(entry: CacheEntry, ttlMs: number): boolean {
  const storedAt = new Date(entry.storedAt).getTime();
  if (Number.isNaN(storedAt)) return false;
  return Date.now() - storedAt < ttlMs;
}

/**
 * Simple in-memory provider — good enough for local dev, testing, and a
 * single-process CLI run. Do NOT use this in production on Vercel: each
 * serverless invocation gets its own memory, so caching would silently do
 * nothing across requests. Swap in a real provider (example below) before
 * shipping.
 */
export class InMemoryCacheProvider implements CacheProvider {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    this.store.set(key, entry);
  }
}

/**
 * For production, use SupabaseCacheProvider (see supabaseCache.ts) instead
 * of this in-memory one — it persists across serverless invocations, which
 * this deliberately does not.
 */

export { DEFAULT_TTL_MS };
