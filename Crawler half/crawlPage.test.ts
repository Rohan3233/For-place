/**
 * Quick sanity tests for the redirect + canonical normalization fix.
 * Run with: npx ts-node -e "require('./src/crawlPage.test').run()"
 * (or wire into your preferred test runner — jest/vitest — later)
 */
import { crawlPage } from "./crawlPage";

const HTML_WITH_SELF_CANONICAL = `
<html>
  <head>
    <title>Joe's Plumbing - Emergency Plumber</title>
    <meta name="description" content="Fast, reliable emergency plumbing services available 24/7 in the Chicago area for all your needs.">
    <link rel="canonical" href="https://www.example.com/">
  </head>
  <body>
    <h1>Emergency Plumber Chicago</h1>
    <a href="/services">Services</a>
    <img src="/hero.jpg" alt="Plumber at work">
  </body>
</html>
`;

async function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
}

/**
 * Simulates the redirect scenario: caller requests the bare/http domain,
 * server redirects to https/www. Without the finalUrl fix, this would
 * previously report a false canonical_mismatch and undercount internal
 * links, since everything was compared against the *requested* URL, not
 * the URL the page actually resolved to.
 */
export async function run() {
  const originalFetch = global.fetch;

  // @ts-expect-error - test mock, simplified fetch signature
  global.fetch = async (input: string, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    // The crawler now walks redirects manually (redirect: "manual"): the
    // first GET returns the 301 + Location, the second GET lands on the
    // final URL. Hop count comes from that same walk — no separate HEAD
    // chain exists anymore.
    if (method === "GET" && url === "http://example.com/" && init?.redirect === "manual") {
      return {
        ok: false,
        status: 301,
        statusText: "Moved Permanently",
        url,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "location" ? "https://www.example.com/" : null,
        },
      };
    }

    if (method === "GET" && url === "https://www.example.com/") {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        url: "https://www.example.com/",
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null,
        },
        text: async () => HTML_WITH_SELF_CANONICAL,
      };
    }

    throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
  };

  const result = await crawlPage("http://example.com");

  if (!result.ok) {
    console.error("FAIL - expected successful crawl, got error:", result.error);
    global.fetch = originalFetch;
    return;
  }

  await assertTrue("final url reflects redirect target", result.url === "https://www.example.com/");
  await assertTrue("requestedUrl preserves original input", result.requestedUrl === "http://example.com/");
  await assertTrue("redirected flag is true", result.redirected === true);
  await assertTrue(
    "redirect hop count correctly detected from the manual redirect walk (1 hop)",
    result.redirectHopCount === 1
  );
  await assertTrue(
    "redirect hop URLs recorded for broken-link reuse",
    result.ok && Array.isArray(result.redirectHopUrls) && result.redirectHopUrls.includes("https://www.example.com/")
  );
  await assertTrue(
    "canonical is correctly treated as self-referencing post-redirect",
    result.canonical.isSelfReferencing === true
  );
  await assertTrue(
    "no false canonical_mismatch flag after redirect",
    !result.flags.includes("canonical_mismatch")
  );
  await assertTrue(
    "internal link resolved against post-redirect hostname",
    result.internalLinks.includes("https://www.example.com/services")
  );

  global.fetch = originalFetch;
  console.log("\nDone. If all lines above say PASS, the redirect fix (and the new hop-count reuse) is working.");
}

/**
 * Second scenario: a page with NO redirect should cost exactly ONE fetch
 * call (just the GET), not two. This is the actual fix for the cost
 * regression flagged in review — the HEAD chain must only fire when a
 * redirect is actually detected, never unconditionally.
 */
export async function runNoRedirectCostTest() {
  const originalFetch = global.fetch;
  let fetchCallCount = 0;

  // @ts-expect-error - test mock, simplified fetch signature
  global.fetch = async (input: string, init?: RequestInit) => {
    fetchCallCount++;
    const url = input.toString();
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      throw new Error("HEAD should never be called for a page with no redirect.");
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      url,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null,
      },
      text: async () => HTML_WITH_SELF_CANONICAL.replace(
        '<link rel="canonical" href="https://www.example.com/">',
        '<link rel="canonical" href="https://example.com/">'
      ),
    };
  };

  const result = await crawlPage("https://example.com/");
  global.fetch = originalFetch;

  if (!result.ok) {
    console.error("FAIL - expected successful crawl, got error:", result.error);
    return;
  }
  await assertTrue("no-redirect page makes exactly 1 fetch call (not 2)", fetchCallCount === 1);
  await assertTrue("redirectHopCount is 0, not null, for a non-redirecting page", result.redirectHopCount === 0);
  console.log("\nDone. If both lines above say PASS, the HEAD-chain cost fix is confirmed.");
}

/**
 * Third scenario: a page deliberately crafted to trigger all four new
 * Stage 1 flags at once — short title, no H2s, thin content, and no
 * internal links. Confirms the flags actually fire on realistic HTML,
 * not just that the code compiles.
 */
export async function runStage1FlagsTest() {
  const originalFetch = global.fetch;

  const THIN_PAGE_HTML = `
    <html>
      <head>
        <title>Home</title>
      </head>
      <body>
        <h1>Welcome</h1>
        <p>This is a very short page with barely any content on it at all.</p>
      </body>
    </html>
  `;

  // @ts-expect-error - test mock, simplified fetch signature
  global.fetch = async (input: string) => {
    const url = input.toString();
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      url,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null,
      },
      text: async () => THIN_PAGE_HTML,
    };
  };

  const result = await crawlPage("https://example.com/thin-page");
  global.fetch = originalFetch;

  if (!result.ok) {
    console.error("FAIL - expected successful crawl, got error:", result.error);
    return;
  }

  await assertTrue("title_length_out_of_range flag fires for a short title", result.flags.includes("title_length_out_of_range"));
  await assertTrue("missing_h2 flag fires when there are no H2s", result.flags.includes("missing_h2"));
  await assertTrue("thin_content flag fires under the word threshold", result.flags.includes("thin_content"));
  await assertTrue("no_internal_links flag fires when there are no internal links", result.flags.includes("no_internal_links"));
  await assertTrue("word count is genuinely low (sanity check on the fixture itself)", result.wordCount < 300);

  console.log("\nDone. If all lines above say PASS, the Stage 1 flags are firing correctly on real HTML.");
}

/**
 * Fourth scenario: images served through a Next.js image-optimizer proxy
 * (/_next/image?url=...) must be judged by their REAL filename. The old
 * extraction read the last path segment of the proxy URL ("image"), so
 * non-descriptive filenames behind the proxy were never flagged.
 */
export async function runProxiedImageFilenameTest() {
  const originalFetch = global.fetch;

  const PROXIED_IMAGES_HTML = `
    <html>
      <head>
        <title>Careers at Example Corp</title>
        <meta name="description" content="Join Example Corp — open roles across engineering, product, and design.">
      </head>
      <body>
        <h1>Careers</h1>
        <img src="/_next/image?url=%2Fimages%2Fcareers-carousel%2Fcareers_carousel_4.webp&w=3840&q=75" alt="Careers carousel">
        <img src="/images/genai_home_earth.png" alt="Generative AI home">
        <p>We are hiring across multiple teams. Our careers page lists current openings and what to expect from the interview process.</p>
      </body>
    </html>
  `;

  // @ts-expect-error - test mock, simplified fetch signature
  global.fetch = async (input: string) => {
    const url = input.toString();
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      url,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null,
      },
      text: async () => PROXIED_IMAGES_HTML,
    };
  };

  const result = await crawlPage("https://www.example.com/careers");
  global.fetch = originalFetch;

  if (!result.ok) {
    console.error("FAIL - expected successful crawl, got error:", result.error);
    return;
  }

  await assertTrue(
    "poor_image_filenames fires for a non-descriptive filename served through the Next.js image proxy",
    result.flags.includes("poor_image_filenames")
  );
  await assertTrue(
    "the proxied image's filenameQuality is 'generic' (real filename decoded, not 'image')",
    result.images.some((img) => img.src.includes("/_next/image") && img.filenameQuality === "generic")
  );
  await assertTrue(
    "descriptive direct image (genai_home_earth.png) stays 'good'",
    result.images.some((img) => img.src.includes("genai_home_earth.png") && img.filenameQuality === "good")
  );

  console.log("\nDone. If all lines above say PASS, the proxied-image filename check is fixed.");
}

// Allow running directly: npx ts-node src/crawlPage.test.ts
if (require.main === module) {
  run()
    .then(() => runNoRedirectCostTest())
    .then(() => runStage1FlagsTest())
    .then(() => runProxiedImageFilenameTest());
}