import type { CrawlPageSuccess } from "./types";

export interface BrandContext {
  /** Raw signal phrases detected on the site — kept short and literal, not interpreted, so the AI prompt sees exactly what was found. */
  signals: string[];
}

/**
 * A deliberately small, literal keyword set. This is NOT trying to
 * classify the business — it's surfacing phrases actually present on the
 * site so the AI prompt can factor them in, rather than guessing tone
 * from nothing. Case-insensitive whole-word/phrase match against title,
 * meta description, and H1s from the pages already crawled — no extra
 * network calls, no extra page fetches.
 */
const SIGNAL_PHRASES = [
  "luxury", "premium", "enterprise", "developer", "developers", "medical",
  "legal", "law firm", "attorney", "b2b", "wholesale", "artisan",
  "handmade", "eco-friendly", "sustainable", "nonprofit", "non-profit",
  "family-owned", "boutique", "no ai", "ai-free",
];

function extractPageText(page: CrawlPageSuccess): string {
  return [page.title.content, page.metaDescription.content, ...(page.h1 ?? [])].filter(Boolean).join(" ");
}

/**
 * Scans up to the first 15 crawled pages (homepage-weighted by crawl
 * order in practice) for literal brand/positioning signal phrases. Returns
 * only phrases actually found — never invents a brand read that isn't
 * textually present, in keeping with the "never fabricate" rule this
 * feeds into.
 */
export function extractBrandContext(pages: CrawlPageSuccess[]): BrandContext {
  const found = new Set<string>();
  const combinedText = pages
    .slice(0, 15)
    .map(extractPageText)
    .join(" \n ")
    .toLowerCase();

  for (const phrase of SIGNAL_PHRASES) {
    if (combinedText.includes(phrase)) found.add(phrase);
  }

  return { signals: Array.from(found) };
}

export function buildBrandContextInstruction(brand: BrandContext): string {
  if (brand.signals.length === 0) return "";
  return (
    `The site itself uses language suggesting: ${brand.signals.join(", ")}. Let this inform tone and word choice ` +
    `where relevant (e.g. don't suggest casual, discount-oriented phrasing for a site positioning itself as ` +
    `premium/enterprise/medical/legal) — but only where you have an actual page to write for; don't force these ` +
    `terms into unrelated suggestions.`
  );
}
