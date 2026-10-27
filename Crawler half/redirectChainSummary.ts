import type { CrawlSiteResult, RedirectChainInfo } from "./types";

export interface RedirectChainSummary {
  /** True only when an actual multi-hop CHAIN (2+ sequential hops, e.g.
   * A → B → C) exists. Single-hop redirects are normal and are NOT a
   * finding — they land in `singleHops` instead. */
  hasChains: boolean;
  /** Multi-hop chains only (hopCount >= 2) — these are the real findings. */
  chains: RedirectChainInfo[];
  /** Single-hop redirects (hopCount <= 1, e.g. /ebook → /ebooks). Normal
   * and not worth changing — shown as an informational note, never styled
   * or labeled as an issue. */
  singleHops: RedirectChainInfo[];
  excessiveCount: number;
  healthyMessage: string;
}

/**
 * Always-present wrapper around crawl.redirectChains so both report
 * surfaces can render the section unconditionally — with an explicit
 * "nothing found" state instead of omitting the section entirely.
 *
 * FIX (false positive): the crawl records every redirected URL, including
 * clean single-hop 301s. Previously those were counted as "redirect chains
 * found", flagging a normal site with a handful of one-hop redirects as
 * having a redirect problem. Only paths with 2+ sequential hops are a real
 * chain; single hops are surfaced as an informational "redirects in place"
 * note instead of a finding.
 */
export function buildRedirectChainSummary(crawl: CrawlSiteResult): RedirectChainSummary {
  const all = crawl.redirectChains;
  const chains = all.filter((r) => r.hopCount >= 2);
  const singleHops = all.filter((r) => r.hopCount <= 1);
  return {
    hasChains: chains.length > 0,
    chains,
    singleHops,
    excessiveCount: chains.filter((r) => r.excessive).length,
    healthyMessage:
      singleHops.length > 0
        ? "No problematic redirect chains — every redirect resolves within a single hop."
        : "No redirect chains detected — every crawled URL resolves without extra hops.",
  };
}
