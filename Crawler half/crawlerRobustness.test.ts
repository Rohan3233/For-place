/**
 * Comprehensive crawler robustness tests.
 *
 * Tests cover the exact scenarios that cause "1 page crawled, 0 URLs, 0 images"
 * on real-world Shopify/WooCommerce sites:
 *
 * 1. <base href> handling (CDN asset resolution)
 * 2. Lazy-loaded images (data-src, data-srcset)
 * 3. Responsive images (srcset, <picture>/<source>)
 * 4. Open Graph / Twitter Card image extraction
 * 5. <link rel="next/prev"> pagination discovery
 * 6. <link rel="sitemap"> HTML sitemap discovery
 * 7. Sitemap index expansion
 * 8. Alternative sitemap locations
 * 9. JS-heavy page shell (browser-rendering fallback trigger)
 * 10. Shopify-like site structure
 * 11. WooCommerce-like site structure
 * 12. Mixed valid + broken links
 * 13. Canonical URL resolution
 * 14. Redirect handling
 * 15. robots.txt blocking
 *
 * Run: npx ts-node lib/crawler/crawlerRobustness.test.ts
 */

import { crawlPage } from "./crawlPage";
import { crawlSite } from "./crawlSite";

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

// Type-safe mock fetch assignment helper
function mockGlobalFetch(fn: unknown): void {
  // @ts-expect-error - simplified mock signature for testing
  global.fetch = fn;
}

// ============================================================================
// Mock fetch helper — returns different HTML based on URL
// ============================================================================
type MockPage = { html: string; status?: number; contentType?: string; redirect?: string };
type MockPages = Record<string, MockPage>;

function createMockFetch(pages: MockPages, robotsTxt?: string, sitemapXml?: string) {
  return async function mockFetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    // Robots.txt
    if (url.endsWith("/robots.txt")) {
      if (robotsTxt !== undefined) {
        return {
          ok: true, status: 200, url, statusText: "OK",
          headers: { get: (n: string) => n.toLowerCase() === "content-type" ? "text/plain" : null },
          text: async () => robotsTxt,
        } as unknown as Response;
      }
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
    }

    // Sitemap
    if (url.endsWith("/sitemap.xml") || url.endsWith("/sitemap_index.xml")) {
      if (sitemapXml !== undefined) {
        return {
          ok: true, status: 200, url, statusText: "OK",
          headers: { get: (n: string) => n.toLowerCase() === "content-type" ? "application/xml" : null },
          text: async () => sitemapXml,
        } as unknown as Response;
      }
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
    }

    // HEAD requests (for redirect walking)
    if (method === "HEAD") {
      return { ok: true, status: 200, url, headers: { get: () => null } } as unknown as Response;
    }

    // Page content
    const page = pages[url];
    if (page) {
      if (page.redirect) {
        return {
          ok: false, status: page.status ?? 301, url, statusText: "Moved",
          headers: { get: (n: string) => n.toLowerCase() === "location" ? page.redirect : null },
        } as unknown as Response;
      }
      return {
        ok: true, status: page.status ?? 200, url, statusText: "OK",
        headers: { get: (n: string) => n.toLowerCase() === "content-type" ? (page.contentType ?? "text/html; charset=utf-8") : null },
        text: async () => page.html,
      } as unknown as Response;
    }

    return { ok: false, status: 404, url, statusText: "Not Found", headers: { get: () => null }, text: async () => "" } as unknown as Response;
  };
}

// ============================================================================
// TEST 1: <base href> image resolution
// ============================================================================
async function testBaseHrefImageResolution() {
  const originalFetch = global.fetch;

  const HTML = `
    <html>
      <head>
        <base href="https://cdn.shopify.com/s/files/1/0001/0002/">
        <title>Product Page - Great Widget Store</title>
        <meta name="description" content="This is a great widget product page with enough description text to pass the length check.">
        <link rel="canonical" href="https://shop.myshopify.com/products/widget">
      </head>
      <body>
        <h1>Great Widget</h1>
        <img src="images/widget-hero.jpg" alt="Widget hero image">
        <img src="/files/1/0001/0002/products/widget-detail.webp" alt="Widget detail" data-src="lazy-loaded.jpg">
        <a href="/collections/all">All Products</a>
        <a href="/products/other-widget">Other Widget</a>
        <a href="https://www.shop.myshopify.com/about">About</a>
        <p>This is a product page with enough content to test word count and avoid thin content flags in the crawler.</p>
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://shop.myshopify.com/": { html: HTML },
  }));

  const result = await crawlPage("https://shop.myshopify.com/", { crawlHost: "shop.myshopify.com" });
  global.fetch = originalFetch;

  assertTrue("page crawls successfully", result.ok);
  if (!result.ok) return;

  // Images should be resolved against <base href>, not the page URL
  assertTrue("images found (at least 2)", result.images.length >= 2);
  assertTrue("hero image resolves to CDN domain", result.images.some((img) => img.src.includes("cdn.shopify.com")));
  assertTrue("detail image resolves against base href", result.images.some((img) => img.src.includes("cdn.shopify.com/files/")));
  assertTrue("internal links found", result.internalLinks.length >= 2);
  assertTrue("internal links resolve to shop domain (not CDN)", result.internalLinks.every((link) => link.includes("shop.myshopify.com")));
  assertTrue("no canonical_mismatch false positive", !result.flags.includes("canonical_mismatch"));

  console.log("  Images:", result.images.map((i) => i.src));
  console.log("  Links:", result.internalLinks);
}

// ============================================================================
// TEST 2: Lazy-loaded images (data-src, data-srcset)
// ============================================================================
async function testLazyLoadedImages() {
  const originalFetch = global.fetch;

  const HTML = `
    <html>
      <head>
        <title>Gallery Page - Photo Studio with Great Services</title>
        <meta name="description" content="Professional photo studio offering portrait, commercial, and event photography services across the city.">
      </head>
      <body>
        <h1>Photo Gallery</h1>
        <img src="placeholder.gif" data-src="/images/gallery-1.jpg" alt="Gallery photo 1" loading="lazy">
        <img src="placeholder.gif" data-src="/images/gallery-2.jpg" data-srcset="/images/gallery-2-sm.jpg 480w, /images/gallery-2-lg.jpg 1200w" alt="Gallery photo 2" loading="lazy">
        <img src="/images/eager.jpg" alt="Eager loaded image">
        <a href="/portfolio">Portfolio</a>
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://studio.example.com/gallery": { html: HTML },
  }));

  const result = await crawlPage("https://studio.example.com/gallery", { crawlHost: "studio.example.com" });
  global.fetch = originalFetch;

  assertTrue("page crawls successfully", result.ok);
  if (!result.ok) return;

  // Should find images from data-src and srcset, not just placeholder.gif
  assertTrue("found images from data-src (at least 3)", result.images.length >= 3);
  assertTrue("data-src image resolved", result.images.some((img) => img.src.includes("gallery-1.jpg")));
  assertTrue("data-srcset image resolved", result.images.some((img) => img.src.includes("gallery-2")));
  assertTrue("eager image found", result.images.some((img) => img.src.includes("eager.jpg")));
  assertTrue("placeholder.gif is NOT in the image list", !result.images.some((img) => img.src.includes("placeholder.gif")));

  console.log("  Images:", result.images.map((i) => i.src));
}

// ============================================================================
// TEST 3: <picture>/<source> element image discovery
// ============================================================================
async function testPictureElementImages() {
  const originalFetch = global.fetch;

  const HTML = `
    <html>
      <head>
        <title>Responsive Images Demo - Modern Web Design Studio</title>
        <meta name="description" content="A modern web design studio showcasing responsive image techniques and best practices for web performance.">
      </head>
      <body>
        <h1>Responsive Images</h1>
        <picture>
          <source srcset="/images/hero-wide.avif" type="image/avif">
          <source srcset="/images/hero-wide.webp" type="image/webp">
          <img src="/images/hero-fallback.jpg" alt="Hero image">
        </picture>
        <picture>
          <source srcset="/images/product-480.jpg 480w, /images/product-960.jpg 960w" media="(min-width: 600px)">
          <img src="/images/product-320.jpg" alt="Product photo">
        </picture>
        <a href="/products">Products</a>
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://demo.example.com/responsive": { html: HTML },
  }));

  const result = await crawlPage("https://demo.example.com/responsive", { crawlHost: "demo.example.com" });
  global.fetch = originalFetch;

  assertTrue("page crawls successfully", result.ok);
  if (!result.ok) return;

  // Should find images from <source srcset> as well as <img src>
  assertTrue("found images from picture/source (at least 5)", result.images.length >= 5);
  assertTrue("avif source found", result.images.some((img) => img.src.includes("hero-wide.avif")));
  assertTrue("webp source found", result.images.some((img) => img.src.includes("hero-wide.webp")));
  assertTrue("fallback found", result.images.some((img) => img.src.includes("hero-fallback.jpg")));
  assertTrue("srcset sizes found", result.images.some((img) => img.src.includes("product-480")));
  assertTrue("srcset large found", result.images.some((img) => img.src.includes("product-960")));

  console.log("  Images:", result.images.map((i) => i.src));
}

// ============================================================================
// TEST 4: Open Graph / Twitter Card image extraction
// ============================================================================
async function testOgTwitterImages() {
  const originalFetch = global.fetch;

  const HTML = `
    <html>
      <head>
        <title>Blog Post About SEO Best Practices and Optimization</title>
        <meta name="description" content="A comprehensive guide to SEO best practices covering technical optimization, content strategy, and link building.">
        <meta property="og:image" content="https://cdn.example.com/social/og-image.jpg">
        <meta property="og:title" content="SEO Best Practices">
        <meta name="twitter:image" content="https://cdn.example.com/social/twitter-card.jpg">
        <meta name="twitter:card" content="summary_large_image">
      </head>
      <body>
        <h1>SEO Best Practices</h1>
        <p>Content about SEO here.</p>
        <a href="/blog">Blog</a>
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://blog.example.com/seo-guide": { html: HTML },
  }));

  const result = await crawlPage("https://blog.example.com/seo-guide", { crawlHost: "blog.example.com" });
  global.fetch = originalFetch;

  assertTrue("page crawls successfully", result.ok);
  if (!result.ok) return;

  assertTrue("og:image extracted", result.images.some((img) => img.src.includes("og-image.jpg")));
  assertTrue("twitter:image extracted", result.images.some((img) => img.src.includes("twitter-card.jpg")));
  assertTrue("at least 2 images total", result.images.length >= 2);

  console.log("  Images:", result.images.map((i) => i.src));
}

// ============================================================================
// TEST 5: <link rel="next/prev"> pagination discovery
// ============================================================================
async function testPaginationLinkDiscovery() {
  const originalFetch = global.fetch;

  const HTML = `
    <html>
      <head>
        <title>Product Collection - All Widgets Available Here</title>
        <meta name="description" content="Browse our complete collection of widgets. We offer the best selection of high-quality widgets for every need.">
        <link rel="next" href="/collections/all?page=2">
      </head>
      <body>
        <h1>All Widgets</h1>
        <a href="/products/widget-1">Widget 1</a>
        <a href="/products/widget-2">Widget 2</a>
        <a href="/collections/all?page=2">Next Page</a>
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://store.myshopify.com/collections/all": { html: HTML },
  }));

  const result = await crawlPage("https://store.myshopify.com/collections/all", { crawlHost: "store.myshopify.com" });
  global.fetch = originalFetch;

  assertTrue("page crawls successfully", result.ok);
  if (!result.ok) return;

  // Should find pagination link from <link rel="next"> even if not in <a href>
  assertTrue("pagination link discovered via <link rel='next'>",
    result.internalLinks.some((l) => l.includes("page=2")));
  assertTrue("regular links also found", result.internalLinks.length >= 2);

  console.log("  Links:", result.internalLinks);
}

// ============================================================================
// TEST 6: <link rel="sitemap"> HTML sitemap discovery
// ============================================================================
async function testHtmlSitemapDiscovery() {
  const originalFetch = global.fetch;

  const HTML = `
    <html>
      <head>
        <title>Homepage - Great Site with Lots of Content</title>
        <meta name="description" content="Welcome to our great site. We have lots of content about many topics that interest our visitors.">
        <link rel="sitemap" href="/sitemap_index.xml" type="application/xml">
      </head>
      <body>
        <h1>Welcome</h1>
        <a href="/about">About</a>
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://site.example.com/": { html: HTML },
  }));

  const result = await crawlPage("https://site.example.com/", { crawlHost: "site.example.com" });
  global.fetch = originalFetch;

  assertTrue("page crawls successfully", result.ok);
  if (!result.ok) return;

  assertTrue("htmlSitemapUrls captured", result.htmlSitemapUrls !== undefined);
  assertTrue("sitemap URL found in HTML", !!result.htmlSitemapUrls?.some((u) => u.includes("sitemap_index.xml")));

  console.log("  HTML Sitemaps:", result.htmlSitemapUrls);
}

// ============================================================================
// TEST 7: JS-heavy page shell detection (browser-rendering trigger)
// ============================================================================
async function testJsShellDetection() {
  const originalFetch = global.fetch;

  // This simulates a Shopify Dawn theme homepage: a shell with nav/footer
  // in the raw HTML, but the actual content and links are rendered by JS.
  const SHELL_HTML = `
    <html>
      <head>
        <title>My Shopify Store</title>
        <script src="/cdn.shopify.com/s/assets/theme.js"></script>
        <script src="/cdn.shopify.com/s/assets/vendor.js"></script>
        <script src="/cdn.shopify.com/s/assets/app.js"></script>
      </head>
      <body>
        <div id="MainContent">
          <!-- Content injected by JavaScript -->
        </div>
        <footer>
          <p>&copy; 2024 My Store</p>
        </footer>
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://myshop.myshopify.com/": { html: SHELL_HTML },
  }));

  const result = await crawlPage("https://myshop.myshopify.com/", { crawlHost: "myshop.myshopify.com" });
  global.fetch = originalFetch;

  assertTrue("page crawls successfully (even if shell)", result.ok);
  if (!result.ok) return;

  // The page should be detected as JS-only
  assertTrue("renderMode detected as likely_js_only", result.aeoSignals?.renderMode === "likely_js_only");
  assertTrue("no internal links in shell HTML", result.internalLinks.length === 0);
  assertTrue("no_internal_links flag set", result.flags.includes("no_internal_links"));

  console.log("  renderMode:", result.aeoSignals?.renderMode);
  console.log("  internalLinks:", result.internalLinks.length);
}

// ============================================================================
// TEST 8: crawlSite with sitemap-index expansion
// ============================================================================
async function testSitemapIndexExpansion() {
  const originalFetch = global.fetch;

  const PAGES: MockPages = {
    "https://shop.example.com/": {
      html: `<html><head><title>Shop Home - Welcome to Our Great Store</title>
        <meta name="description" content="Welcome to our great online store with many products available for purchase today.">
      </head><body><h1>Home</h1>
        <a href="/products/a">Product A</a>
        <a href="/products/b">Product B</a>
      </body></html>`
    },
    "https://shop.example.com/products/a": {
      html: `<html><head><title>Product A - High Quality Widget</title>
        <meta name="description" content="Product A is a high quality widget made from the finest materials available for our customers.">
      </head><body><h1>Product A</h1></body></html>`
    },
    "https://shop.example.com/products/b": {
      html: `<html><head><title>Product B - Premium Widget</title>
        <meta name="description" content="Product B is a premium widget designed for professional use in demanding environments.">
      </head><body><h1>Product B</h1></body></html>`
    },
    "https://shop.example.com/sitemap-discovered": {
      html: `<html><head><title>Sitemap Page - Additional Content</title>
        <meta name="description" content="This page was discovered through the sitemap and contains additional content for visitors.">
      </head><body><h1>Sitemap Page</h1></body></html>`
    },
  };

  const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://shop.example.com/sub-sitemap.xml</loc></sitemap>
    </sitemapindex>`;

  const SUB_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://shop.example.com/sitemap-discovered</loc></url>
    </urlset>`;

  mockGlobalFetch(createMockFetch(PAGES, undefined, SITEMAP_INDEX));
  // Override sitemap handling for the sub-sitemap
  const originalFetchFn = global.fetch;
  mockGlobalFetch(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("sub-sitemap.xml")) {
      return {
        ok: true, status: 200, url, statusText: "OK",
        headers: { get: (n: string) => n.toLowerCase() === "content-type" ? "application/xml" : null },
        text: async () => SUB_SITEMAP,
      } as unknown as Response;
    }
    return originalFetchFn(input, init);
  });

  const result = await crawlSite("https://shop.example.com/", { maxPages: 20 });
  global.fetch = originalFetch;

  assertTrue("sitemap-discovered page is crawled", result.pages.some((p) => p.url.includes("sitemap-discovered")));
  assertTrue("sitemap index was expanded", result.metrics.sitemapIndexFilesExpanded >= 1);
  assertTrue("sitemap URLs counted", result.metrics.sitemapUrlsCount >= 1);
  assertTrue("more than homepage crawled", result.pages.length >= 2);

  console.log("  Pages crawled:", result.pages.map((p) => p.url));
  console.log("  Sitemap expanded:", result.metrics.sitemapIndexFilesExpanded);
  console.log("  Sitemap URLs:", result.metrics.sitemapUrlsCount);
}

// ============================================================================
// TEST 9: Alternative sitemap locations
// ============================================================================
async function testAlternativeSitemapLocations() {
  const originalFetch = global.fetch;

  const PAGES: MockPages = {
    "https://wp-site.example.com/": {
      html: `<html><head><title>WordPress Site Homepage - Latest Blog Posts</title>
        <meta name="description" content="Welcome to our WordPress site featuring the latest blog posts about technology and innovation.">
      </head><body><h1>Home</h1>
        <a href="/blog/post-1">Post 1</a>
      </body></html>`
    },
    "https://wp-site.example.com/blog/post-1": {
      html: `<html><head><title>Blog Post 1 - Technology Trends</title>
        <meta name="description" content="Exploring the latest technology trends that are shaping the future of digital marketing and SEO.">
      </head><body><h1>Post 1</h1></body></html>`
    },
  };

  // /sitemap.xml returns 404, but /wp-sitemap.xml works
  mockGlobalFetch(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/robots.txt")) {
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
    }
    if (url.endsWith("/sitemap.xml")) {
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
    }
    if (url.includes("/wp-sitemap.xml")) {
      return {
        ok: true, status: 200, url, statusText: "OK",
        headers: { get: (n: string) => n.toLowerCase() === "content-type" ? "application/xml" : null },
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://wp-site.example.com/blog/post-1</loc></url>
          </urlset>`,
      } as unknown as Response;
    }
    if (method === "HEAD") {
      return { ok: true, status: 200, url, headers: { get: () => null } } as unknown as Response;
    }
    const page = PAGES[url];
    if (page) {
      return {
        ok: true, status: 200, url, statusText: "OK",
        headers: { get: (n: string) => n.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null },
        text: async () => page.html,
      } as unknown as Response;
    }
    return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
  });

  const result = await crawlSite("https://wp-site.example.com/", { maxPages: 20 });
  global.fetch = originalFetch;

  assertTrue("wp-sitemap.xml discovered pages", result.pages.length >= 2);
  assertTrue("blog post from alternative sitemap crawled",
    result.pages.some((p) => p.url.includes("/blog/post-1")));

  console.log("  Pages:", result.pages.map((p) => p.url));
  console.log("  Sitemap URLs:", result.metrics.sitemapUrlsCount);
}

// ============================================================================
// TEST 10: Shopify-like site structure
// ============================================================================
async function testShopifyLikeSite() {
  const originalFetch = global.fetch;

  // Simulates a Shopify store with collections, products, and CDN images
  const SHOPIFY_PAGES: MockPages = {
    "https://mystore.myshopify.com/": {
      html: `<html><head>
        <base href="https://cdn.shopify.com/s/files/1/0001/0002/">
        <title>My Store - Premium Widgets and Gadgets</title>
        <meta name="description" content="Shop premium widgets and gadgets. Free shipping on orders over fifty dollars. Best quality guaranteed.">
        <link rel="canonical" href="https://mystore.myshopify.com/">
        <link rel="sitemap" href="/sitemap.xml">
        <meta property="og:image" content="https://cdn.shopify.com/s/files/1/0001/0002/files/og-banner.jpg">
        <script type="application/ld+json">{"@type":"WebSite","name":"My Store"}</script>
      </head><body>
        <h1>My Store</h1>
        <nav>
          <a href="/collections/all">All Products</a>
          <a href="/collections/widgets">Widgets</a>
          <a href="/collections/gadgets">Gadgets</a>
          <a href="/pages/about">About Us</a>
          <a href="/pages/contact">Contact</a>
        </nav>
        <img src="files/hero-banner.jpg" alt="Store banner">
        <img src="/files/products/widget-main.webp" alt="Main widget" loading="lazy" data-src="/files/products/widget-main-hd.webp">
        <a href="/products/alpha-widget">Alpha Widget</a>
        <a href="/products/beta-gadget">Beta Gadget</a>
        <p>Welcome to My Store. We sell the finest widgets and gadgets available online with free shipping.</p>
      </body></html>`
    },
    "https://mystore.myshopify.com/collections/all": {
      html: `<html><head>
        <title>All Products - My Store Collection</title>
        <meta name="description" content="Browse our complete collection of premium widgets and gadgets. Every product is backed by our quality guarantee.">
        <link rel="canonical" href="https://mystore.myshopify.com/collections/all">
        <link rel="next" href="/collections/all?page=2">
      </head><body>
        <h1>All Products</h1>
        <a href="/products/alpha-widget">Alpha Widget</a>
        <a href="/products/beta-gadget">Beta Gadget</a>
        <a href="/collections/all?page=2">Next</a>
        <a href="/">Home</a>
      </body></html>`
    },
    "https://mystore.myshopify.com/products/alpha-widget": {
      html: `<html><head>
        <title>Alpha Widget - Premium Quality Widget</title>
        <meta name="description" content="The Alpha Widget is our flagship product. Made from premium materials with a lifetime warranty included.">
        <link rel="canonical" href="https://mystore.myshopify.com/products/alpha-widget">
        <script type="application/ld+json">{"@type":"Product","name":"Alpha Widget"}</script>
      </head><body>
        <h1>Alpha Widget</h1>
        <img src="/files/products/alpha-main.jpg" alt="Alpha Widget main photo">
        <img src="/files/products/alpha-detail.jpg" alt="Alpha Widget detail view">
        <a href="/collections/all">Back to Collection</a>
        <a href="/products/beta-gadget">See Also: Beta Gadget</a>
        <p>The Alpha Widget is our best selling product with over one thousand five star reviews from happy customers.</p>
      </body></html>`
    },
    "https://mystore.myshopify.com/products/beta-gadget": {
      html: `<html><head>
        <title>Beta Gadget - Innovative Gadget Design</title>
        <meta name="description" content="The Beta Gadget features innovative design and cutting edge technology. Perfect for professionals and enthusiasts alike.">
        <link rel="canonical" href="https://mystore.myshopify.com/products/beta-gadget">
      </head><body>
        <h1>Beta Gadget</h1>
        <img src="/files/products/beta-main.jpg" alt="Beta Gadget">
        <a href="/collections/all">Back to Collection</a>
        <p>The Beta Gadget represents the next generation of innovative technology for modern professionals.</p>
      </body></html>`
    },
  };

  const SHOPIFY_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://mystore.myshopify.com/</loc></url>
      <url><loc>https://mystore.myshopify.com/collections/all</loc></url>
      <url><loc>https://mystore.myshopify.com/products/alpha-widget</loc></url>
      <url><loc>https://mystore.myshopify.com/products/beta-gadget</loc></url>
      <url><loc>https://mystore.myshopify.com/pages/about</loc></url>
      <url><loc>https://mystore.myshopify.com/pages/contact</loc></url>
    </urlset>`;

  mockGlobalFetch(createMockFetch(SHOPIFY_PAGES, "User-agent: *\nAllow: /", SHOPIFY_SITEMAP));
  const result = await crawlSite("https://mystore.myshopify.com/", { maxPages: 20, useSitemap: true });
  global.fetch = originalFetch;

  assertTrue("multiple pages crawled (not just 1)", result.pages.length >= 3);
  assertTrue("product pages discovered", result.pages.some((p) => p.url.includes("/products/")));
  assertTrue("collection pages discovered", result.pages.some((p) => p.url.includes("/collections/")));
  assertTrue("images found across pages", result.pages.some((p) => p.ok && p.images.length > 0));
  assertTrue("no low-coverage false positive", !result.lowCoverage.detected || result.pages.length > 3);
  assertTrue("sitemap URLs seeded", result.metrics.sitemapUrlsCount >= 1);

  // Check that images are correctly resolved (not against CDN for internal images)
  const allImages = result.pages.filter((p) => p.ok).flatMap((p) => p.images);
  assertTrue("images found across site", allImages.length >= 3);

  console.log("  Pages:", result.pages.map((p) => `${p.ok ? "ok" : "FAIL"} ${p.url}`));
  console.log("  Total images:", allImages.length);
  console.log("  Internal links found:", result.metrics.internalLinksFoundCount);
  console.log("  Sitemap URLs:", result.metrics.sitemapUrlsCount);
}

// ============================================================================
// TEST 11: WooCommerce-like site structure
// ============================================================================
async function testWooCommerceLikeSite() {
  const originalFetch = global.fetch;

  const WC_PAGES: MockPages = {
    "https://woo.example.com/": {
      html: `<html><head>
        <title>Woo Store - Quality Products Online</title>
        <meta name="description" content="Welcome to our WooCommerce store. Browse quality products with fast shipping and excellent customer service.">
        <link rel="canonical" href="https://woo.example.com/">
      </head><body>
        <h1>Welcome to Woo Store</h1>
        <nav>
          <a href="/product-category/electronics/">Electronics</a>
          <a href="/product-category/clothing/">Clothing</a>
          <a href="/my-account/">My Account</a>
        </nav>
        <a href="/product/gadget-pro/">Gadget Pro</a>
        <a href="/product/smart-watch/">Smart Watch</a>
        <img src="/wp-content/uploads/2024/01/hero-banner.jpg" alt="Store hero banner">
        <p>Our store offers a wide range of quality products including electronics and clothing with free shipping.</p>
      </body></html>`
    },
    "https://woo.example.com/product-category/electronics/": {
      html: `<html><head>
        <title>Electronics Category - Woo Store Products</title>
        <meta name="description" content="Browse our electronics category featuring the latest gadgets and devices at competitive prices with warranty.">
        <link rel="canonical" href="https://woo.example.com/product-category/electronics/">
        <link rel="next" href="https://woo.example.com/product-category/electronics/page/2/">
      </head><body>
        <h1>Electronics</h1>
        <a href="/product/gadget-pro/">Gadget Pro</a>
        <a href="/product/smart-watch/">Smart Watch</a>
        <a href="/product-category/electronics/page/2/">Next Page</a>
        <a href="/">Home</a>
      </body></html>`
    },
    "https://woo.example.com/product/gadget-pro/": {
      html: `<html><head>
        <title>Gadget Pro - Advanced Electronic Device</title>
        <meta name="description" content="Gadget Pro is an advanced electronic device with cutting edge features. Perfect for tech enthusiasts and professionals.">
        <link rel="canonical" href="https://woo.example.com/product/gadget-pro/">
        <script type="application/ld+json">{"@type":"Product","name":"Gadget Pro"}</script>
      </head><body>
        <h1>Gadget Pro</h1>
        <img src="/wp-content/uploads/2024/01/gadget-pro.jpg" alt="Gadget Pro product photo">
        <img src="/wp-content/uploads/2024/01/gadget-pro-box.jpg" alt="Gadget Pro packaging">
        <a href="/product-category/electronics/">Back to Electronics</a>
        <a href="/product/smart-watch/">See Also: Smart Watch</a>
        <p>The Gadget Pro is our flagship electronic device featuring advanced technology and premium build quality.</p>
      </body></html>`
    },
    "https://woo.example.com/product/smart-watch/": {
      html: `<html><head>
        <title>Smart Watch - Wearable Technology</title>
        <meta name="description" content="Our Smart Watch combines style and technology. Features include heart rate monitoring, GPS, and water resistance.">
        <link rel="canonical" href="https://woo.example.com/product/smart-watch/">
      </head><body>
        <h1>Smart Watch</h1>
        <img src="/wp-content/uploads/2024/01/smart-watch.jpg" alt="Smart Watch">
        <a href="/product-category/electronics/">Back to Electronics</a>
        <p>The Smart Watch is a premium wearable device with advanced health monitoring and GPS tracking capabilities.</p>
      </body></html>`
    },
  };

  mockGlobalFetch(createMockFetch(WC_PAGES, "User-agent: *\nDisallow: /wp-admin/\nDisallow: /wp-login.php"));
  const result = await crawlSite("https://woo.example.com/", { maxPages: 20 });
  global.fetch = originalFetch;

  assertTrue("multiple pages crawled", result.pages.length >= 3);
  assertTrue("product pages discovered", result.pages.some((p) => p.url.includes("/product/")));
  assertTrue("category pages discovered", result.pages.some((p) => p.url.includes("/product-category/")));
  assertTrue("images found", result.pages.some((p) => p.ok && p.images.length > 0));
  assertTrue("pagination link discovered via <link rel='next'>",
    result.pages.some((p) => p.ok && p.internalLinks.some((l) => l.includes("page/2"))));
  assertTrue("wp-admin blocked by robots.txt", result.pagesSkippedRobots.some((u) => u.includes("/wp-admin")));
  assertTrue("wp-login blocked by robots.txt", result.pagesSkippedRobots.some((u) => u.includes("/wp-login")));

  const allImages = result.pages.filter((p) => p.ok).flatMap((p) => p.images);
  assertTrue("images found across site", allImages.length >= 3);

  console.log("  Pages:", result.pages.map((p) => `${p.ok ? "ok" : "FAIL"} ${p.url}`));
  console.log("  Total images:", allImages.length);
  console.log("  Robots blocked:", result.pagesSkippedRobots);
}

// ============================================================================
// TEST 12: Mixed valid and broken links
// ============================================================================
async function testMixedLinks() {
  const originalFetch = global.fetch;

  const HTML = `
    <html>
      <head>
        <title>Site with Mixed Links - Good and Broken Pages</title>
        <meta name="description" content="This site has a mix of working and broken links for testing the crawler link checking capabilities.">
      </head>
      <body>
        <h1>Links Page</h1>
        <a href="/valid-page">Valid</a>
        <a href="/also-valid">Also Valid</a>
        <a href="mailto:test@example.com">Email</a>
        <a href="tel:+1234567890">Phone</a>
        <a href="javascript:void(0)">JS Link</a>
        <a href="https://external.example.com/page">External</a>
        <a href="/products#reviews">Fragment</a>
        <img src="/images/photo.jpg" alt="A photo">
      </body>
    </html>
  `;

  mockGlobalFetch(createMockFetch({
    "https://mixed.example.com/": { html: HTML },
    "https://mixed.example.com/valid-page": {
      html: `<html><head><title>Valid Page - Working Correctly</title>
        <meta name="description" content="This page works correctly and contains valid content for testing the crawler.">
      </head><body><h1>Valid</h1></body></html>`
    },
    "https://mixed.example.com/also-valid": {
      html: `<html><head><title>Also Valid - Another Working Page</title>
        <meta name="description" content="This page also works correctly and is another valid page for testing purposes.">
      </head><body><h1>Also Valid</h1></body></html>`
    },
  }));

  const result = await crawlSite("https://mixed.example.com/", { maxPages: 10 });
  global.fetch = originalFetch;

  assertTrue("valid pages crawled", result.pages.length >= 3);
  assertTrue("valid-page found", result.pages.some((p) => p.url.includes("/valid-page")));
  assertTrue("also-valid found", result.pages.some((p) => p.url.includes("/also-valid")));
  assertTrue("mailto links NOT in internal links", !result.pages.some((p) => p.ok && p.internalLinks.some((l) => l.startsWith("mailto:"))));
  assertTrue("tel links NOT in internal links", !result.pages.some((p) => p.ok && p.internalLinks.some((l) => l.startsWith("tel:"))));
  assertTrue("javascript links NOT in internal links", !result.pages.some((p) => p.ok && p.internalLinks.some((l) => l.startsWith("javascript:"))));
  assertTrue("fragment links resolve correctly", result.pages.some((p) => p.ok && p.internalLinks.some((l) => l.includes("/products"))));
  assertTrue("images found on homepage", result.pages.some((p) => p.ok && p.url.endsWith("/") && p.images.length > 0));

  console.log("  Pages:", result.pages.map((p) => p.url));
  console.log("  Internal links:", result.metrics.internalLinksFoundCount);
}

// ============================================================================
// TEST 13: Canonical URL resolution after redirect
// ============================================================================
async function testCanonicalAfterRedirect() {
  const originalFetch = global.fetch;

  mockGlobalFetch(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/robots.txt")) {
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
    }
    if (url.endsWith("/sitemap.xml")) {
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
    }

    // HTTP -> HTTPS redirect
    if (method === "GET" && url === "http://redirect.example.com/" && init?.redirect === "manual") {
      return {
        ok: false, status: 301, statusText: "Moved", url,
        headers: { get: (n: string) => n.toLowerCase() === "location" ? "https://redirect.example.com/" : null },
      } as unknown as Response;
    }

    if (method === "HEAD") {
      return { ok: true, status: 200, url, headers: { get: () => null } } as unknown as Response;
    }

    if (url === "https://redirect.example.com/") {
      return {
        ok: true, status: 200, url, statusText: "OK",
        headers: { get: (n: string) => n.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null },
        text: async () => `<html><head>
          <title>Redirect Site - Secure HTTPS Version</title>
          <meta name="description" content="This is the HTTPS version of the redirect test site with proper canonical setup and security.">
          <link rel="canonical" href="https://redirect.example.com/">
        </head><body>
          <h1>Secure Site</h1>
          <a href="/page1">Page 1</a>
          <a href="/page2">Page 2</a>
        </body></html>`,
      } as unknown as Response;
    }

    return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" } as unknown as Response;
  });

  const result = await crawlPage("http://redirect.example.com/");
  global.fetch = originalFetch;

  assertTrue("page follows redirect to HTTPS", result.ok);
  if (!result.ok) return;
  assertTrue("final URL is HTTPS", result.url.startsWith("https://"));
  assertTrue("redirected flag is true", result.redirected === true);
  assertTrue("canonical is self-referencing post-redirect", result.canonical.isSelfReferencing === true);
  assertTrue("no false canonical_mismatch", !result.flags.includes("canonical_mismatch"));
  assertTrue("internal links resolve to HTTPS domain", result.internalLinks.every((l) => l.startsWith("https://redirect.example.com")));

  console.log("  Final URL:", result.url);
  assertTrue("redirect hop count > 0", (result.redirectHopCount ?? 0) > 0);
}

// ============================================================================
// TEST 14: robots.txt blocking
// ============================================================================
async function testRobotsTxtBlocking() {
  const originalFetch = global.fetch;

  const PAGES: MockPages = {
    "https://blocked.example.com/": {
      html: `<html><head><title>Site with Robots Rules</title>
        <meta name="description" content="This site has robots.txt rules that block certain paths from being crawled by search engines.">
      </head><body><h1>Home</h1>
        <a href="/public">Public</a>
        <a href="/admin">Admin</a>
        <a href="/private">Private</a>
      </body></html>`
    },
    "https://blocked.example.com/public": {
      html: `<html><head><title>Public Page - Accessible to All</title>
        <meta name="description" content="This is a public page accessible to all visitors and search engine crawlers alike.">
      </head><body><h1>Public</h1></body></html>`
    },
  };

  mockGlobalFetch(createMockFetch(PAGES, "User-agent: *\nDisallow: /admin\nDisallow: /private"));

  const result = await crawlSite("https://blocked.example.com/", { maxPages: 10, respectRobotsTxt: true });
  global.fetch = originalFetch;

  assertTrue("public page crawled", result.pages.some((p) => p.url.includes("/public")));
  assertTrue("admin blocked by robots", result.pagesSkippedRobots.some((u) => u.includes("/admin")));
  assertTrue("private blocked by robots", result.pagesSkippedRobots.some((u) => u.includes("/private")));
  assertTrue("blocked URLs NOT in crawled pages", !result.pages.some((p) => p.url.includes("/admin") || p.url.includes("/private")));
  assertTrue("robots audit shows found", result.robotsAudit.status === "found");

  console.log("  Pages skipped by robots:", result.pagesSkippedRobots);
  console.log("  Robots blocked count:", result.metrics.blockedByRobotsCount);
}

// ============================================================================
// TEST 15: Full crawl metrics validation
// ============================================================================
async function testCrawlMetrics() {
  const originalFetch = global.fetch;

  const PAGES: MockPages = {
    "https://metrics.example.com/": {
      html: `<html><head><title>Metrics Test Site - Comprehensive Crawl</title>
        <meta name="description" content="This site tests crawl metrics including pages discovered, crawled, failed, and blocked.">
      </head><body><h1>Home</h1>
        <a href="/page-a">Page A</a>
        <a href="/page-b">Page B</a>
        <img src="/images/test.jpg" alt="Test image">
      </body></html>`
    },
    "https://metrics.example.com/page-a": {
      html: `<html><head><title>Page A - First Test Page</title>
        <meta name="description" content="Page A is the first test page in this metrics validation crawl test.">
      </head><body><h1>A</h1></body></html>`
    },
    "https://metrics.example.com/page-b": {
      html: `<html><head><title>Page B - Second Test Page</title>
        <meta name="description" content="Page B is the second test page in this metrics validation crawl test.">
      </head><body><h1>B</h1></body></html>`
    },
  };

  mockGlobalFetch(createMockFetch(PAGES));
  const result = await crawlSite("https://metrics.example.com/", { maxPages: 10 });
  global.fetch = originalFetch;

  assertTrue("discoveredCount > 0", result.metrics.discoveredCount > 0);
  assertTrue("queuedCount > 0", result.metrics.queuedCount > 0);
  assertTrue("crawledCount > 0", result.metrics.crawledCount > 0);
  assertTrue("succeededCount matches ok pages", result.metrics.succeededCount === result.pages.filter((p) => p.ok).length);
  assertTrue("failedCount matches failed pages", result.metrics.failedCount === result.pages.filter((p) => !p.ok).length);
  assertTrue("internalLinksFoundCount > 0", result.metrics.internalLinksFoundCount > 0);
  assertTrue("httpStatusDistribution has entries", Object.keys(result.metrics.httpStatusDistribution).length > 0);
  assertTrue("terminationReason is crawl_complete", result.terminationReason === "crawl_complete");

  console.log("  Metrics:", JSON.stringify(result.metrics, null, 2));
}

// ============================================================================
// Run all tests
// ============================================================================
export async function run() {
  console.log("=== Crawler Robustness Tests ===\n");

  const tests = [
    testBaseHrefImageResolution,
    testLazyLoadedImages,
    testPictureElementImages,
    testOgTwitterImages,
    testPaginationLinkDiscovery,
    testHtmlSitemapDiscovery,
    testJsShellDetection,
    testSitemapIndexExpansion,
    testAlternativeSitemapLocations,
    testShopifyLikeSite,
    testWooCommerceLikeSite,
    testMixedLinks,
    testCanonicalAfterRedirect,
    testRobotsTxtBlocking,
    testCrawlMetrics,
  ];

  for (const test of tests) {
    const name = test.name.replace(/^test/, "").replace(/([A-Z])/g, " $1").trim();
    console.log(`\n--- ${name} ---`);
    try {
      await test();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      process.exitCode = 1;
    }
  }

  console.log("\n=== Done ===");
  if (process.exitCode) {
    console.log("Some tests FAILED — see above for details.");
  } else {
    console.log("All tests PASSED.");
  }
}

if (require.main === module) {
  run();
}
