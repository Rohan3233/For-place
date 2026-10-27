import type { RedirectChainInfo } from "./types";

/**
 * Extends the existing RedirectChainInfo (originalUrl, finalUrl, hopCount,
 * excessive) with the per-hop detail needed to actually explain a chain to
 * a client — which hops were 301 vs 302, and whether the chain hit the
 * crawler's safety cap (a strong loop signal, not proof by itself: a
 * legitimately long chain and a true redirect loop both hit the cap the
 * same way, so this is reported as "likely loop", not asserted as fact).
 *
 * REQUIRES a small upstream change: crawlPage.ts's countRedirectHopsViaHead
 * currently discards each hop's status code and only returns the final
 * hopCount. To get real per-hop detail (needed for `hopStatusCodes` below),
 * have it collect `{ status: res.status }` on every iteration and return
 * `steps: { url: string; status: number }[]` alongside `finalUrl`/`hopCount`,
 * then thread that onto RedirectChainInfo in crawlSite.ts's `redirectChains.push(...)`
 * call as `hopStatusCodes: result.redirectHopSteps?.map(s => s.status) ?? []`.
 * Until that patch lands, this module degrades gracefully (chainType stays
 * "unknown") rather than fabricating status codes it doesn't have.
 */

export const MAX_REDIRECT_HOPS_SAFETY_CAP = 10; // must match crawlPage.ts's MAX_REDIRECT_HOPS

export type RedirectChainType = "single_301" | "single_302" | "chain_301" | "chain_302" | "mixed_chain" | "unknown";

export interface RedirectChainAnalysis extends RedirectChainInfo {
  chainType: RedirectChainType;
  likelyLoop: boolean;
  recommendation: string;
}

function classifyChainType(hopStatusCodes: number[] | undefined): RedirectChainType {
  if (!hopStatusCodes || hopStatusCodes.length === 0) return "unknown";
  const kinds = new Set(hopStatusCodes.map((s) => (s >= 300 && s < 310 ? "3" + Math.floor(s / 10) : "other")));
  const is301 = hopStatusCodes.every((s) => s === 301);
  const is302 = hopStatusCodes.every((s) => s === 302 || s === 307);
  if (hopStatusCodes.length === 1) return is301 ? "single_301" : is302 ? "single_302" : "unknown";
  if (is301) return "chain_301";
  if (is302) return "chain_302";
  return kinds.size > 1 ? "mixed_chain" : "unknown";
}

function buildRecommendation(analysis: Pick<RedirectChainAnalysis, "hopCount" | "chainType" | "likelyLoop">): string {
  if (analysis.likelyLoop) {
    return "This chain hit the crawler's safety cap without resolving — that's a strong sign of an actual redirect loop (A→B→A) rather than a long-but-valid chain. Fix this immediately: a loop makes the page completely unreachable for both users and search engines.";
  }
  if (analysis.hopCount <= 1) {
    return "A single redirect hop is normal and not worth changing on its own.";
  }
  if (analysis.chainType === "mixed_chain") {
    return `This is a ${analysis.hopCount}-hop chain mixing permanent (301) and temporary (302) redirects — collapse it into one direct redirect from the original URL straight to the final destination, using a 301 if the move is permanent.`;
  }
  return `This is a ${analysis.hopCount}-hop redirect chain — each extra hop adds latency and burns crawl budget. Update the original link/redirect rule to point directly at the final destination instead of chaining through intermediate URLs.`;
}

/**
 * Enriches the crawl's existing redirectChains with chain-type and
 * likely-loop detection for the report. Pure function — no new network
 * calls, just interpretation of data crawlSite() already collected (plus
 * the optional hopStatusCodes extension described above).
 */
export function analyzeRedirectChains(
  chains: (RedirectChainInfo & { hopStatusCodes?: number[] })[]
): RedirectChainAnalysis[] {
  return chains.map((chain) => {
    const chainType = classifyChainType(chain.hopStatusCodes);
    const likelyLoop = chain.hopCount >= MAX_REDIRECT_HOPS_SAFETY_CAP;
    const analysis: RedirectChainAnalysis = {
      ...chain,
      chainType,
      likelyLoop,
      recommendation: "",
    };
    analysis.recommendation = buildRecommendation(analysis);
    return analysis;
  });
}
