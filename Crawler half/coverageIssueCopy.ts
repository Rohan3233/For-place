/**
 * Why-it-matters / business-impact / recommended-fix copy for the handful
 * of checks in the Complete SEO Check Coverage catalog that have no
 * ISSUE_TEMPLATES entry (templates.ts) and no auxiliary copy
 * (auxiliaryIssueCopy.ts). Written once here so the coverage page, the
 * PDF, and the CSV export all reuse the SAME copy — never duplicated
 * inline in a renderer.
 *
 * Every check NOT listed here already has its copy from one of the two
 * existing sources (a GroupedIssue, an IssueTemplate, or an
 * AuxiliarySectionCopy constant), and those are reused as-is per the
 * "preserve existing recommendations" rule.
 */
export interface CoverageIssueCopy {
  whatItIs?: string;
  whyItMatters: string;
  businessImpact: string;
  recommendedFix: string;
  implementationGuidance?: string;
  codeSnippet?: { label: string; code: string };
  afterFixing?: string;
}

export const COVERAGE_ISSUE_COPY: Record<string, CoverageIssueCopy> = {
  // --- Core Web Vitals (website-wide metrics) ----------------------------
  webvital_lcp_poor: {
    whatItIs:
      "Largest Contentful Paint (LCP) measures how long it takes for the largest visible content element — usually a hero image, video thumbnail, or large text block — to fully render on screen. It is one of Google's three official Core Web Vitals and directly reflects when a visitor can actually see and begin interacting with the page's main content.",
    whyItMatters:
      "A slow LCP means visitors stare at a blank or partially rendered page before the main content appears. Google uses LCP as a ranking signal, and visitors on slow pages leave before content loads — increasing bounce rate and reducing engagement.",
    businessImpact:
      "Every second of delay before the main content appears pushes visitors closer to leaving. For e-commerce sites, slow LCP on product pages means potential customers abandon before seeing what they came to buy. For service businesses, slow landing pages lose leads to faster competitors. Google treats LCP as a ranking signal, so poor LCP can reduce organic visibility for the most important pages.",
    recommendedFix:
      "Optimize the largest content element on each affected page. Compress and resize hero images, serve modern formats (WebP/AVIF), preload the main image or hero font, and remove render-blocking CSS/JavaScript that delays the main content from appearing.",
    implementationGuidance:
      "1. Identify the largest content element on each affected page (usually the hero image). 2. Compress images to under 200KB where possible. 3. Convert to WebP or AVIF format. 4. Add a preload hint for the hero image in the HTML head. 5. Defer non-critical CSS and JavaScript. 6. Re-measure LCP after deployment.",
    codeSnippet: {
      label: "Preload hero image for faster LCP",
      code: "<link rel=\"preload\" as=\"image\" href=\"/images/hero.webp\" type=\"image/webp\">\n\n<!-- Use modern image formats with fallback -->\n<img src=\"/images/hero.webp\"\n     width=\"1200\" height=\"630\"\n     alt=\"Hero image description\">",
    },
    afterFixing:
      "After optimizing LCP, the main content element will render noticeably faster — visitors will see the hero image, key text, or primary content within 2.5 seconds instead of waiting. This reduces bounce rates, improves user engagement, and sends a positive Core Web Vitals signal to Google.",
  },
  webvital_inp_poor: {
    whatItIs:
      "Interaction to Next Paint (INP) measures how quickly the page responds when a visitor taps, clicks, or types. It captures the delay between a user interaction and the visual response — essentially how 'snappy' the page feels during real use. A good INP means the page responds within 200 milliseconds of any interaction.",
    whyItMatters:
      "High INP means the page feels unresponsive — buttons appear to do nothing, menus lag, and forms feel broken. Google uses INP as one of its three official Core Web Vitals, and unresponsive pages frustrate visitors into leaving.",
    businessImpact:
      "When visitors click a button and nothing happens for a second, they assume the site is broken and leave. For e-commerce, this means abandoned carts. For service sites, it means lost enquiries. Every delayed interaction is a lost conversion opportunity, and Google penalizes slow-responding pages in search rankings.",
    recommendedFix:
      "Reduce main-thread work on each affected page. Break up long JavaScript tasks, defer or remove non-critical third-party scripts (analytics, chat widgets, social embeds), and keep event handlers lightweight so the browser can respond to input immediately.",
    implementationGuidance:
      "1. Use Chrome DevTools Performance tab to identify long tasks (>50ms). 2. Break long tasks into smaller chunks using requestIdleCallback or setTimeout. 3. Defer non-critical third-party scripts. 4. Use web workers for heavy computations. 5. Optimize event handlers to complete quickly. 6. Re-test INP after deployment.",
    codeSnippet: {
      label: "Defer non-critical JavaScript",
      code: "<!-- Defer scripts that don't affect initial interaction -->\n<script src=\"analytics.js\" defer></script>\n<script src=\"chat-widget.js\" defer></script>\n\n<!-- Break up long tasks -->\n<script>\nfunction processLargeDataset(data) {\n  const chunk = data.splice(0, 100);\n  // Process chunk...\n  if (data.length > 0) {\n    requestIdleCallback(() => processLargeDataset(data));\n  }\n}\n</script>",
    },
    afterFixing:
      "After reducing INP, every button click, menu tap, and form interaction will feel instant — the page responds within 200ms instead of lagging. Visitors can complete tasks without frustration, which directly improves conversion rates and sends a positive Core Web Vitals signal to Google.",
  },
  webvital_cls_poor: {
    whatItIs:
      "Cumulative Layout Shift (CLS) measures how much the page content moves unexpectedly while it loads. When images, ads, or embeds push content around after the page starts rendering, visitors click the wrong thing or lose their place. A good CLS score means the page layout stays stable as content loads.",
    whyItMatters:
      "Unexpected layout shifts frustrate visitors mid-task — a tap lands on the wrong link, text moves while reading, or a button shifts just as the user clicks it. CLS is one of Google's three official Core Web Vitals, and unstable pages penalize both user experience and search rankings.",
    businessImpact:
      "Layout shifts cause accidental clicks on the wrong links or buttons, which means visitors end up on pages they didn't intend to visit — or worse, accidentally add items to a cart or submit a form. For e-commerce, this creates confusion and abandoned purchases. For lead-generation sites, it creates frustrated visitors who leave instead of converting. Google also uses CLS as a ranking signal.",
    recommendedFix:
      "Reserve space for every image and embedded element using width/height attributes or aspect-ratio CSS. Avoid injecting content above existing content after the page loads. Use CSS transform/opacity for animations instead of properties that trigger layout reflow.",
    implementationGuidance:
      "1. Add explicit width and height attributes to all images and videos. 2. Use aspect-ratio CSS for responsive media. 3. Reserve ad slot dimensions before ads load. 4. Avoid dynamically injecting banners or notifications above content. 5. Use skeleton screens instead of loading spinners. 6. Re-measure CLS after deployment.",
    codeSnippet: {
      label: "Prevent layout shifts with explicit dimensions",
      code: "<!-- Always specify width and height on images -->\n<img src=\"/images/product.webp\"\n     width=\"400\" height=\"300\"\n     alt=\"Product name\"\n     style=\"aspect-ratio: 4/3; width: 100%; height: auto;\">\n\n<!-- Reserve space for dynamic content -->\n<div style=\"min-height: 250px; background: #f5f5f5;\">\n  <!-- Ad or dynamic content loads here -->\n</div>",
    },
    afterFixing:
      "After fixing CLS, the page layout will remain stable as content loads — no more unexpected jumps, shifting text, or buttons moving just as the user clicks. This creates a smoother, more professional experience that keeps visitors engaged and reduces accidental interactions.",
  },
  webvital_ttfb_poor: {
    whatItIs:
      "Time to First Byte (TTFB) measures how long the server takes to start responding to a visitor's request. It captures the delay between when a browser requests a page and when it receives the first byte of data. TTFB is the foundation of every other load metric — a slow TTFB delays everything that follows.",
    whyItMatters:
      "Every millisecond of server delay is added to the front of every other load metric — a slow TTFB slows down the whole page, not just one element. A high TTFB often indicates server-side bottlenecks that no amount of front-end optimization can fix.",
    businessImpact:
      "Slow server response delays every visitor's first impression of your site. If the server takes 2+ seconds to respond, visitors see a blank screen for that long before anything loads. This is especially damaging for mobile visitors on slower connections, and it directly impacts LCP — the single biggest contributor to a slow page regardless of how well the front end is optimized.",
    recommendedFix:
      "Improve server response time on each affected page. Enable server-side caching (full-page cache and object cache), move to faster hosting or add a CDN with edge delivery, optimize database queries, and ensure the server uses HTTP/2 or HTTP/3 for faster connection handling.",
    implementationGuidance:
      "1. Enable full-page caching (Redis, Varnish, or CDN edge caching). 2. Add a CDN like Cloudflare or Fastly to serve pages from edge locations closer to visitors. 3. Optimize slow database queries identified in server logs. 4. Enable HTTP/2 or HTTP/3 on the server. 5. Consider upgrading hosting if the server is consistently slow. 6. Re-measure TTFB after deployment.",
    codeSnippet: {
      label: "Enable server-side caching (PHP/WordPress example)",
      code: "<!-- WordPress: Add object caching with Redis -->\n<!-- wp-config.php -->\n define( 'WP_CACHE', true );\n define( 'REDIS_HOST', '127.0.0.1' );\n\n<!-- Nginx: Enable full-page caching -->\n location / {\n   proxy_cache my_cache;\n   proxy_cache_valid 200 1h;\n   proxy_cache_use_stale error timeout;\n }",
    },
    afterFixing:
      "After improving TTFB, the server will respond faster to every request — visitors will see content begin loading sooner, and every subsequent metric (LCP, FCP, INP) will improve as a result. This creates a faster, more responsive experience across the entire site.",
  },

  // --- Technical / site-wide checks --------------------------------------
  excessive_redirects: {
    whyItMatters:
      "Each redirect hop adds a full network round trip before the browser reaches the real page, and consumes crawl budget search engines allocate to your site. Chains of four or more hops are considered excessive for exactly this reason.",
    businessImpact:
      "Visitors on slow connections wait through every hop, and crawl budget spent on redirect hops is budget not spent discovering real pages — both slow the site down and waste search-engine resources.",
    recommendedFix:
      "Collapse each multi-hop chain: point the original URL directly at the final destination with a single 301 redirect, and update internal links to reference the final URL so no redirect is needed at all.",
  },
  www_inconsistent: {
    whyItMatters:
      "When www and non-www (or http and https) variants of your domain don't all redirect to one canonical version, search engines can treat them as separate sites — splitting backlink and ranking signals between copies of the same content.",
    businessImpact:
      "Every backlink and ranking signal earned by one variant can fail to consolidate onto the version your customers actually see — silently weakening the authority of the whole domain.",
    recommendedFix:
      "Choose one canonical domain (www or non-www, always https) and add a permanent 301 redirect from every other variant at the server/DNS level — not just a canonical tag, which search engines treat as a hint rather than a guarantee.",
  },
  robots_blocked_links: {
    whyItMatters:
      "Links that point into paths disallowed by robots.txt were never checked during the crawl — a block is not evidence the link is broken, but it also means the link's destination was never verified.",
    businessImpact:
      "An unverified link could be dead, redirected, or serving the wrong content, and it will keep appearing on the site — potentially sending visitors to a dead end that no automated check has ever caught.",
    recommendedFix:
      "Confirm each blocked path is intentionally excluded (admin areas, staging, archives). If any should be reachable, allow it in robots.txt so the link can be checked and crawled normally.",
  },
};
