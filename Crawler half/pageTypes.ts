import type { CrawlPageSuccess } from "./types";

/**
 * Page-type classification — the taxonomy the representative Core Web
 * Vitals sample is built from (see selectCwvSamplePages in coreWebVitals.ts).
 *
 * WHY THIS EXISTS: measuring every crawled page with PageSpeed Insights is
 * expensive (20-45s per URL), and measuring 30 pages that all share one
 * template tells you the same thing as measuring 1. Grouping crawled pages
 * into coarse page types lets the audit pick a small, representative sample
 * that still covers the site's real page architectures — a homepage, a
 * product detail, a category listing, a blog post, a contact page — instead
 * of a random slice of URLs.
 *
 * The classification is deliberately a HEURISTIC over URL path structure
 * plus lightweight title/H1 signals — the crawler does not do semantic
 * content classification, and that's fine for sampling purposes: pages that
 * share a URL pattern (e.g. /products/*) almost always share a template and
 * load similarly. It is deterministic: the same page always yields the same
 * type.
 *
 * PAGE_TYPE_ORDER is the deterministic iteration order the sampler uses so
 * the same site always yields the same sample.
 */

export type PageType =
  | "homepage"
  | "product"
  | "category"
  | "blog"
  | "article"
  | "service"
  | "pricing"
  | "about"
  | "contact"
  | "faq"
  | "landing"
  | "search"
  | "account"
  | "other";

/** Deterministic display/iteration order (not importance order — the sampler
 * treats every type equally and fills by internal-link importance). */
export const PAGE_TYPE_ORDER: PageType[] = [
  "homepage",
  "product",
  "category",
  "blog",
  "article",
  "service",
  "pricing",
  "landing",
  "about",
  "contact",
  "faq",
  "search",
  "account",
  "other",
];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  homepage: "Homepage",
  product: "Product",
  category: "Category",
  blog: "Blog",
  article: "Article",
  service: "Service",
  pricing: "Pricing",
  landing: "Landing page",
  about: "About",
  contact: "Contact",
  faq: "FAQ",
  search: "Search",
  account: "Account",
  other: "Other",
};

/** Pathname with the trailing slash stripped (and never "/"). */
function cleanPath(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  } catch {
    return "";
  }
}

/** First path segment sets — a section root is the strongest signal a URL
 * gives (e.g. /products/ vs /products/widget-a vs /blog/2024/...). */
const ACCOUNT_FIRST = new Set(["account", "accounts", "login", "signin", "sign-in", "signup", "sign-up", "register", "registration", "cart", "checkout", "check-out", "wishlist", "auth", "logout", "log-out", "my-account", "orders", "order"]);
const COMMERCE_LISTING_FIRST = new Set(["products", "shop", "store", "catalog", "catalogue", "collections", "collection"]);
const CATEGORY_FIRST = new Set(["category", "categories", "brand", "brands", "tag", "tags", "taxonomy", "type", "group", "groups"]);
const BLOG_FIRST = new Set(["blog", "news", "journal", "magazine", "insights", "insight", "updates", "update"]);
const ARTICLE_FIRST = new Set(["article", "articles", "post", "posts", "story", "stories"]);
const PRICING_FIRST = new Set(["pricing", "price", "prices", "plans", "plan", "packages", "package", "rates", "rate", "subscriptions", "subscription"]);
const SERVICE_FIRST = new Set(["service", "services", "solution", "solutions", "capabilities", "capability", "offerings", "offering", "what-we-do"]);
const FAQ_FIRST = new Set(["faq", "faqs", "help", "help-center", "knowledge-base", "kb", "questions", "question", "q-and-a", "q-a"]);
const ABOUT_FIRST = new Set(["about", "about-us", "aboutus", "company", "team", "our-team", "who-we-are", "mission", "our-story"]);
const CONTACT_FIRST = new Set(["contact", "contact-us", "contactus", "get-in-touch", "reach-us", "support"]);
const LANDING_FIRST = new Set(["landing", "lp", "offer", "offers", "campaign", "promo", "promotions", "promotion", "thank-you", "thanks", "download", "demo"]);

/**
 * Deterministic heuristic classification of one crawled page. The primary
 * signal is the URL's path structure: the first segment names the section
 * (/products/, /blog/, /about/), and deeper segments usually mean a detail
 * page within that section (/products/widget-a = a product page, while a
 * bare /products/ is the listing/category page). Title/H1 text is used as a
 * fallback for sites whose URLs don't expose the pattern. Pages that match
 * nothing become "other" — the sampler treats "other" as just another
 * bucket, so unrecognized architectures are still represented.
 */
export function classifyPageType(page: CrawlPageSuccess): PageType {
  const path = cleanPath(page.url);
  const lowerUrl = page.url.toLowerCase();
  const title = (page.title.content ?? "").toLowerCase();
  const h1 = page.h1.join(" ").toLowerCase();
  const text = `${path} ${title} ${h1}`;

  // Homepage — the root path.
  if (path === "" || path === "/") return "homepage";

  const segments = path.split("/").filter(Boolean).map((s) => s.toLowerCase());
  const first = segments[0] ?? "";

  // Utility/account pages — typically noindex, usually outside the site's
  // content templates; measurable, but never representative of the main
  // page architectures.
  if (ACCOUNT_FIRST.has(first) || /\b(login|log ?in|sign ?in|sign ?up|register|checkout|cart|wishlist|account|auth|logout)\b/.test(text)) {
    return "account";
  }
  if (first === "search" || lowerUrl.includes("?q=")) return "search";

  // Commerce: a bare listing path is a category page; a deeper path is a
  // product detail page.
  if (COMMERCE_LISTING_FIRST.has(first)) {
    return segments.length > 1 ? "product" : "category";
  }
  if (CATEGORY_FIRST.has(first)) return "category";

  // Product detail patterns that appear deeper in the path even when the
  // first segment is something else (e.g. /de/p/123, /catalog/items/xyz).
  if (/(\/(product|item|sku|detail|listing)\/)/.test(lowerUrl) || /\/p\/[a-z0-9-]+\/?$/.test(lowerUrl)) {
    return "product";
  }

  if (BLOG_FIRST.has(first)) return "blog";
  if (ARTICLE_FIRST.has(first)) return "article";
  // Dated URLs (e.g. /2024/05/hello-world) are almost always article posts.
  if (/\/(19|20)\d{2}\/\d{1,2}(\/\d{1,2})?\//.test(lowerUrl)) return "article";
  if (PRICING_FIRST.has(first) || /\bpricing\b/.test(text)) return "pricing";
  if (SERVICE_FIRST.has(first)) return "service";
  if (FAQ_FIRST.has(first) || /\bfaq\b|\bfrequently asked\b/.test(text)) return "faq";
  if (ABOUT_FIRST.has(first) || /\babout us\b/.test(text)) return "about";
  if (CONTACT_FIRST.has(first)) return "contact";
  if (LANDING_FIRST.has(first) || /\blanding page\b/.test(text)) return "landing";

  // Commerce-ish titles that slipped past the URL patterns (stores whose
  // product URLs don't carry /product/ in the path).
  if (/\b(buy|shop now|add to cart|product|order now)\b/.test(text)) return "product";

  return "other";
}

/** One page-type bucket in a sample, with how many sampled pages it holds. */
export interface PageTypeCount {
  type: PageType;
  label: string;
  pages: number;
}

/**
 * Groups the given pages by type and returns the counts in deterministic
 * PAGE_TYPE_ORDER (types with zero pages are omitted). Used to describe the
 * performance sample ("Templates represented: 8") and to explain to the
 * client why the sample is representative rather than exhaustive.
 */
export function countPageTypes(pages: CrawlPageSuccess[]): PageTypeCount[] {
  const counts = new Map<PageType, number>();
  for (const p of pages) {
    const type = classifyPageType(p);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return PAGE_TYPE_ORDER.filter((t) => counts.has(t)).map((t) => ({
    type: t,
    label: PAGE_TYPE_LABELS[t],
    pages: counts.get(t)!,
  }));
}

/** "Product" -> "Product" is the label; used only for tests/logging clarity. */
export function pageTypeLabel(type: PageType): string {
  return PAGE_TYPE_LABELS[type];
}

/** True when the URL is a plausible PageSpeed Insights target — HTTP(S),
 * HTML, no obvious static asset. The crawl already guarantees sampled pages
 * are successful HTML pages; this is a cheap defense-in-depth filter so a
 * stray non-HTML URL never burns an expensive PSI request. */
export function isPageSpeedEligible(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (/\.(jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|mjs|woff2?|ttf|otf|eot|pdf|zip|gz|tar|mp4|webm|mp3|wav|json|xml|txt)$/i.test(u.pathname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
