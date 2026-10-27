import type { RunAuditResult, CrawlPageSuccess } from "./types";

/**
 * Normalizes a URL to the same canonical key crawlSite uses for its
 * visited/dedup set (strip hash, strip query params, strip trailing slash,
 * lowercase). Without this, the link-graph math resolved links only by
 * exact string (plus trailing-slash tolerance), so a single
 * "?utm_source=x" or "?page=2" suffix on an internal link silently broke
 * inbound counting and BFS traversal — which is exactly how a site with a
 * handful of parameterized links ended up reporting "max link depth 1"
 * and hundreds of pages as "not reachable". Now every link resolves
 * through the SAME key as the pages themselves, so the graph can never
 * see fewer connections than the crawler's own dedup did.
 */
function normalizeKey(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    u.search = "";
    // Canonicalize the host for graph purposes: "www." is the same site as
    // the bare domain, and http/https are the same page once the crawl has
    // collapsed redirects into final URLs. Without this, a site that 301s
    // example.com -> www.example.com (or http -> https) stores every page
    // under the FINAL host while rootUrl and many in-HTML hrefs still use
    // the ORIGINAL spelling — the home-page BFS seed then never matches
    // (depth chart collapses to all zeros / "not reached") and otherwise
    // valid internal links stop resolving for inbound counting. Both sides
    // of every comparison go through this same function, so consistency is
    // preserved.
    if (u.hostname.startsWith("www.")) u.hostname = u.hostname.slice(4);
    u.protocol = "https:";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString().toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Shared internal-link graph computation — ONE source of truth for every
 * internal-linking metric in the report (PDF, web, CSV, indexability
 * checks):
 *
 *   orphanPages        — pages with ZERO internal links pointing at them.
 *                        This is the "true orphan" definition: nothing in
 *                        the crawl links to the page. It says nothing
 *                        about whether the home page can reach the page.
 *   notReachedWithinDepth — pages that EXIST in the crawl (and may be
 *                        linked) but have no path from the home page
 *                        through the internal-link graph (BFS). Often
 *                        sitemap-/canonical-discovered pages. Deliberately
 *                        a DIFFERENT metric from orphans — the report must
 *                        never present these as interchangeable.
 *
 * Previously this logic lived inline in reportDocument.tsx, which meant the
 * CSV generator had no way to know the exact same set of orphan / weakly
 * connected pages. Extracting it here gives both surfaces ONE source of
 * truth, so the PDF's "+ N more" counts and the CSV's exported rows can
 * never disagree.
 */
export interface InternalLinkGraph {
  okCrawlPages: CrawlPageSuccess[];
  urlToPage: Map<string, CrawlPageSuccess>;
  resolveTarget: (link: string) => string | null;
  inboundCount: Map<string, number>;
  totalInternalLinks: number;
  /** Pages with zero internal links pointing at them (discovered + inferred). */
  orphanPages: string[];
  /** Pages with exactly one inbound internal link. */
  weaklyConnected: { url: string; inbound: number }[];
  /** True orphan count excluding the home page (home can legitimately have
   * zero inbound links when the site uses relative links). */
  maxLinkDepth: number;
  /** Depth distribution counts for depths 0..3. */
  depthDistribution: number[];
  /** Pages at depth >= 4 from home. */
  depthDeepCount: number;
  /** Ok pages with no path from the home page through internal links. */
  notReachedWithinDepth: string[];
}

export function buildInternalLinkGraph(audit: RunAuditResult): InternalLinkGraph {
  const okCrawlPages = audit.crawl.pages.filter((p): p is CrawlPageSuccess => p.ok);
  const urlToPage = new Map(okCrawlPages.map((p) => [p.url, p]));
  const keyToUrl = new Map<string, string>();
  for (const p of okCrawlPages) {
    const key = normalizeKey(p.url);
    if (key && !keyToUrl.has(key)) keyToUrl.set(key, p.url);
  }

  const resolveTarget = (link: string): string | null => {
    const key = normalizeKey(link);
    if (!key) return null;
    return keyToUrl.get(key) ?? null;
  };

  const inboundCount = new Map<string, number>();
  for (const p of okCrawlPages) {
    for (const link of p.internalLinks) {
      const target = resolveTarget(link);
      if (target) inboundCount.set(target, (inboundCount.get(target) ?? 0) + 1);
    }
  }

  const totalInternalLinks = okCrawlPages.reduce((sum, p) => sum + p.internalLinks.length, 0);

  const rootKey = normalizeKey(audit.crawl.rootUrl);
  const orphanPages = [
    ...new Set([
      ...audit.crawl.orphanPages,
      ...okCrawlPages
        .filter(
          (p) => (inboundCount.get(p.url) ?? 0) === 0 && normalizeKey(p.url) !== rootKey
        )
        .map((p) => p.url),
    ]),
  ];

  const weaklyConnected = okCrawlPages
    .filter((p) => (inboundCount.get(p.url) ?? 0) === 1 && !orphanPages.includes(p.url))
    .map((p) => ({ url: p.url, inbound: 1 }))
    .sort((a, b) => a.url.localeCompare(b.url));

  // --- Reachability: BFS from the home page across the internal-link
  // graph. Keys and resolution are shared with the inbound math above, so
  // "reachable" and "linked" can never disagree about which links exist.
  const linkDepth = new Map<string, number>();
  // Seed BFS from the actual homepage. Prefer the exact rootUrl match; if
  // the root spelling never appears among the crawled pages (host/path
  // variants the crawl itself didn't record), fall back to the ok page at
  // path "/" — the site's homepage — so the depth chart always starts from
  // the real root of the link graph instead of silently reporting every
  // page as unreachable. Prefer the fallback candidate with the most
  // inbound links when more than one root-path page exists.
  let seedUrl = rootKey ? (keyToUrl.get(rootKey) ?? null) : null;
  if (!seedUrl) {
    const homeCandidates = okCrawlPages
      .filter((p) => {
        try {
          return new URL(p.url).pathname === "/";
        } catch {
          return false;
        }
      })
      .sort((a, b) => (inboundCount.get(b.url) ?? 0) - (inboundCount.get(a.url) ?? 0));
    seedUrl = homeCandidates[0]?.url ?? null;
  }
  if (seedUrl) {
    linkDepth.set(seedUrl, 0);
    const queue: string[] = [seedUrl];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const currentDepth = linkDepth.get(current) ?? 0;
      const page = urlToPage.get(current);
      if (!page) continue;
      for (const link of page.internalLinks) {
        const target = resolveTarget(link);
        if (target && !linkDepth.has(target)) {
          linkDepth.set(target, currentDepth + 1);
          queue.push(target);
        }
      }
    }
  }

  const maxLinkDepth = okCrawlPages.reduce(
    (max, p) => Math.max(max, linkDepth.get(p.url) ?? -1),
    -1
  );
  const depthDistribution = [0, 1, 2, 3].map(
    (d) => okCrawlPages.filter((p) => linkDepth.get(p.url) === d).length
  );
  const depthDeepCount = okCrawlPages.filter((p) => (linkDepth.get(p.url) ?? -1) >= 4).length;
  const notReachedWithinDepth = okCrawlPages
    .filter((p) => !linkDepth.has(p.url))
    .map((p) => p.url);

  return {
    okCrawlPages,
    urlToPage,
    resolveTarget,
    inboundCount,
    totalInternalLinks,
    orphanPages,
    weaklyConnected,
    maxLinkDepth,
    depthDistribution,
    depthDeepCount,
    notReachedWithinDepth,
  };
}
