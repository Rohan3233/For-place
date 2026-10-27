/*
 * Benchmark harness for the crawler pipeline.
 *
 * Spins up an in-process synthetic site (pages, redirect chains, dead
 * links, images, robots.txt, sitemap.xml), adds a per-request latency to
 * model a real network, counts every HTTP request the crawler makes, then
 * runs runAudit with PageSpeed disabled and prints per-stage wall times,
 * request counts, and result invariants.
 *
 * Run with:  node qa/bench-crawler.cjs            (after dist-crawler build)
 * Env knobs: BENCH_PAGES=150 BENCH_LATENCY_MS=8 BENCH_REDIRECTS=8
 *
 * The printed REQ_* counters are the invariant to compare before/after an
 * optimization: the result (pages, broken links, images) must be identical
 * while fewer requests are made and/or stages get faster.
 */
const http = require("node:http");
// Point BENCH_DIST at an alternate build (e.g. a legacy baseline) to
// compare before/after: BENCH_DIST=../dist-legacy/runAudit
const { runAudit } = require(process.env.BENCH_DIST || "../dist-crawler/runAudit");

const PAGES = Number(process.env.BENCH_PAGES || 80);
const LATENCY_MS = Number(process.env.BENCH_LATENCY_MS || 8);
const N_REDIRECTS = Number(process.env.BENCH_REDIRECTS || 8);
const N_DEAD = Number(process.env.BENCH_DEAD || 12);
const N_IMAGES = Number(process.env.BENCH_IMAGES || 30);
const MAX_PAGES = Number(process.env.BENCH_MAX_PAGES || PAGES + 30);
const ORIGIN = "http://127.0.0.1:4977";

// --------------------------------------------------------------------------
// Synthetic site definition
// --------------------------------------------------------------------------
const route = new Map(); // pathname -> body | null (null = 404)
const redirects = new Map(); // pathname -> location (301)
const images = new Map(); // pathname -> bytes

function pageHtml(id, links, extraImgs = []) {
  const linkTags = links.map((l) => `<a href="${l}">link</a>`).join("");
  const imgTags = extraImgs.map((s) => `<img src="${s}" alt="img">`).join("");
  return `<!DOCTYPE html><html lang="en"><head><title>Bench Page ${id} — a title long enough to be in range</title>
<meta name="description" content="Benchmark page ${id} with a meta description that is comfortably long enough to pass the length checks here.">
<link rel="canonical" href="${ORIGIN}/page-${id}">
</head><body><h1>Bench Page ${id}</h1><p>Some body text for page ${id} so the word count is healthy and nothing gets flagged as thin content unnecessarily.</p>
${linkTags}${imgTags}</body></html>`;
}

// Homepage: links into the page graph, plus images/dead/redirect samples.
route.set("/", pageHtml("home", [`/page-0`, `/page-1`, `/page-2`, `/dead-0`, `/old-redir-0`], [`/img/img-0.jpg`]));

// Page graph: each page links to the next few pages (deterministic), the
// homepage, and a mix of dead links + redirect-chain links + images.
for (let i = 0; i < PAGES; i++) {
  const links = [];
  if (i > 0) links.push(`/page-${(i + 1) % PAGES}`);
  links.push(`/page-${(i + 2) % PAGES}`);
  links.push(`/page-${(i + 5) % PAGES}`);
  if (i % 7 === 0) links.push("/");
  if (i % 5 === 0) links.push(`/dead-${i % N_DEAD}`);
  if (i % 3 === 0) links.push(`/old-redir-${i % N_REDIRECTS}`);
  const imgs = [];
  if (i % 4 === 0) imgs.push(`/img/img-${i % N_IMAGES}.jpg`);
  if (i % 6 === 0) imgs.push(`/img/img-${(i + 3) % N_IMAGES}.jpg`);
  route.set(`/page-${i}`, pageHtml(i, links, imgs));
}

// Redirect chains: /old-redir-k -> /mid-redir-k -> /page-k (200).
for (let k = 0; k < N_REDIRECTS; k++) {
  redirects.set(`/old-redir-${k}`, `/mid-redir-${k}`);
  redirects.set(`/mid-redir-${k}`, `/page-${k}`);
}

// Dead links 404.
for (let k = 0; k < N_DEAD; k++) {
  route.set(`/dead-${k}`, null);
}

// Images: HEAD returns Content-Length; some are oversized (>= 200KB).
for (let k = 0; k < N_IMAGES; k++) {
  images.set(`/img/img-${k}.jpg`, k % 5 === 0 ? 300_000 : 40_000);
}

const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${ORIGIN}/sitemap.xml\n`;
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from({ length: PAGES }, (_, i) => `  <url><loc>${ORIGIN}/page-${i}</loc></url>`).join("\n")}\n</urlset>\n`;

const counters = { total: 0, get: 0, head: 0, pages: 0, robots: 0, sitemap: 0, www: 0, img: 0, dead: 0, redirect: 0, other: 0 };

const server = http.createServer((req, res) => {
  counters.total++;
  if (req.method === "GET") counters.get++;
  else counters.head++;

  const path = decodeURIComponent((req.url || "/").split("?")[0]);

  if (path === "/robots.txt") counters.robots++;
  else if (path === "/sitemap.xml") counters.sitemap++;
  else if (path.startsWith("/img/")) counters.img++;
  else if (path.startsWith("/dead-")) counters.dead++;
  else if (path.startsWith("/old-redir-") || path.startsWith("/mid-redir-")) counters.redirect++;
  else if (path === "/" || path.startsWith("/page-")) counters.pages++;
  else counters.www++;

  setTimeout(() => {
    const loc = redirects.get(path);
    if (loc) {
      res.writeHead(301, { Location: loc, "Content-Type": "text/plain", "Content-Length": "6" });
      res.end("Moved");
      return;
    }
    if (images.has(path)) {
      const size = images.get(path);
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": String(size) });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": String(size) });
        res.end(Buffer.alloc(size));
      }
      return;
    }
    if (path === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(robotsTxt) });
      res.end(robotsTxt);
      return;
    }
    if (path === "/sitemap.xml") {
      res.writeHead(200, { "Content-Type": "application/xml", "Content-Length": Buffer.byteLength(sitemapXml) });
      res.end(sitemapXml);
      return;
    }
    if (path === "/llms.txt") {
      res.writeHead(404, { "Content-Type": "text/plain", "Content-Length": "0" });
      res.end();
      return;
    }
    const body = route.get(path);
    if (body === undefined || body === null) {
      res.writeHead(404, { "Content-Type": "text/plain", "Content-Length": "9" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  }, LATENCY_MS);
});

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  await new Promise((resolve) => server.listen(4977, "127.0.0.1", resolve));
  // Let the server warm (avoid TIME_WAIT noise on the first requests).
  await wait(50);

  const t0 = Date.now();
  const audit = await runAudit(ORIGIN, {
    maxPages: MAX_PAGES,
    fetchPageSpeed: false,
    skipCache: true,
    checkBrokenLinks: true,
    checkOversizedImages: true,
  });
  const wallMs = Date.now() - t0;
  const t = audit.timings || {};

  const okPages = audit.crawl.pages.filter((p) => p.ok).length;
  const failedPages = audit.crawl.pages.length - okPages;
  const broken = audit.brokenLinks;
  const brokenCount = broken.filter((l) => !l.ok).length;
  const blockedCount = broken.filter((l) => l.failureCategory === "blocked_by_robots").length;

  console.log("====================================================");
  console.log(`site: pages=${PAGES} redirects=${N_REDIRECTS} dead=${N_DEAD} images=${N_IMAGES} latency=${LATENCY_MS}ms`);
  console.log(`WALL_MS=${wallMs}`);
  console.log(`  crawlMs=${t.crawlMs} brokenLinksMs=${t.brokenLinksMs} streamedImagesMs=${t.streamedImagesMs} scoreAeoMs=${t.scoreAndAeoMs}`);
  console.log(`  crawlThroughput=${t.crawlThroughputPagesPerSec} pages/s  avgCrawlPageMs=${t.avgCrawlPageMs}ms`);
  console.log("------------------------------------------");
  console.log(`RESULT pages=${audit.crawl.pages.length} ok=${okPages} failed=${failedPages}`);
  console.log(`RESULT brokenLinks=${broken.length} broken=${brokenCount} blockedRobots=${blockedCount} skippedAsCrawled=${t.brokenLinksSkippedAsCrawled}`);
  console.log(`RESULT images=${audit.oversizedImages.length} oversized=${audit.oversizedImages.filter((i) => i.isOversized).length}`);
  console.log(`RESULT redirectChains=${audit.crawl.redirectChains.length} orphanPages=${audit.crawl.orphanPages.length}`);
  console.log("------------------------------------------");
  console.log(`REQ total=${counters.total} get=${counters.get} head=${counters.head}`);
  console.log(`REQ pages=${counters.pages} robots=${counters.robots} sitemap=${counters.sitemap} www=${counters.www} img=${counters.img} dead=${counters.dead} redirectHops=${counters.redirect} other=${counters.other}`);
  console.log("====================================================");

  server.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
