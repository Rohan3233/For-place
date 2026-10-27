/**
 * Browser-rendering fallback for JavaScript-heavy pages.
 *
 * When the raw HTTP response is a JS shell (no meaningful links or content
 * in the HTML), this module re-fetches the page with a headless browser,
 * waits for JavaScript to execute, and returns the rendered DOM as HTML.
 * The caller can then re-parse the rendered HTML for link/image discovery.
 *
 * SELECTIVE USE: This is only invoked when:
 * 1. The page appears JS-only (isLikelyJsOnly returns true)
 * 2. The page has no/few internal links from the raw HTML
 * 3. puppeteer-core is available (optional dependency)
 *
 * ARCHITECTURE: A single browser instance is reused across multiple page
 * renders within one crawl to avoid the 2-5s cold-start penalty per page.
 * The caller (crawlSite.ts) manages the browser lifecycle.
 */

const RENDER_TIMEOUT_MS = 15_000;
const VIEWPORT = { width: 1280, height: 800 };

export interface RenderPageResult {
  ok: boolean;
  html: string | null;
  error: string | null;
}

export interface BrowserInstance {
  /** Reusable browser — call close() when the crawl finishes. */
  browser: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  close: () => Promise<void>;
}

/**
 * Lazily loaded puppeteer module reference.
 * null until first successful load — avoids re-resolving on every call.
 */
let puppeteerModule: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
let chromiumModule: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

async function loadPuppeteer(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (puppeteerModule) return puppeteerModule;
  // Dynamic import — keeps this an optional dependency
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const loadModule = (moduleName: string): Promise<any> => // eslint-disable-line @typescript-eslint/no-explicit-any
    Function("moduleName", "return import(moduleName);")(moduleName);
  puppeteerModule = await loadModule("puppeteer-core");
  return puppeteerModule;
}

async function loadChromium(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (chromiumModule) return chromiumModule;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const loadModule = (moduleName: string): Promise<any> => // eslint-disable-line @typescript-eslint/no-explicit-any
    Function("moduleName", "return import(moduleName);")(moduleName);
  chromiumModule = (await loadModule("@sparticuz/chromium")).default;
  return chromiumModule;
}

/**
 * Checks whether browser rendering is available (puppeteer-core installed).
 * Safe to call at startup — does not launch a browser.
 */
export async function isBrowserRenderingAvailable(): Promise<boolean> {
  try {
    await loadPuppeteer();
    const isLocal = !!process.env.CHROME_EXECUTABLE_PATH;
    if (!isLocal) await loadChromium();
    return true;
  } catch {
    return false;
  }
}

/**
 * Launches a reusable browser instance. Returns a handle that can render
 * multiple pages and must be closed when the crawl finishes.
 *
 * The browser stays alive between renders — a single launch (2-5s cold
 * start) serves the entire crawl's browser-rendering needs.
 */
export async function launchBrowser(): Promise<BrowserInstance | null> {
  try {
    const puppeteer = await loadPuppeteer();
    const isLocal = !!process.env.CHROME_EXECUTABLE_PATH;
    let browser: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (isLocal) {
      browser = await puppeteer.launch({
        executablePath: process.env.CHROME_EXECUTABLE_PATH,
        headless: true,
      });
    } else {
      const chromium = await loadChromium();
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    }

    return {
      browser,
      close: async () => {
        try {
          await browser.close();
        } catch {
          // browser already closed or crashed — no-op
        }
      },
    };
  } catch {
    return null; // browser rendering unavailable — caller falls back to raw HTML
  }
}

/**
 * Renders a single page with the headless browser and returns the full
 * rendered HTML. Uses the provided BrowserInstance for reuse across pages.
 *
 * Returns ok: false with an error message on failure — never throws.
 */
export async function renderPageWithBrowser(
  url: string,
  instance: BrowserInstance,
  timeoutMs: number = RENDER_TIMEOUT_MS
): Promise<RenderPageResult> {
  let page: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    page = await instance.browser.newPage();
    await page.setViewport(VIEWPORT);

    // Block unnecessary resources to speed up rendering — we only need
    // the DOM, not pixel-perfect rendering. Images, fonts, and stylesheets
    // are irrelevant for link/image URL extraction.
    await page.setRequestInterception(true);
    page.on("request", (req: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const resourceType = req.resourceType();
      if (["image", "font", "media", "stylesheet"].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Wait a bit more for JS to populate the DOM (SPA routers, lazy components)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const html = await page.content();
    return { ok: true, html, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Browser rendering failed.";
    return { ok: false, html: null, error: message };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // page already closed — no-op
      }
    }
  }
}
