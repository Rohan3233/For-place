import type { RunAuditResult } from "./types";

/**
 * Schema applicability — ONE shared decision used everywhere a conditional
 * schema type is prioritized or recommended (AI Structured Data cards,
 * Recommended Implementation Order, Quick Wins, and the AI readiness
 * score).
 *
 * The goal is NOT a business-type classifier. It is a lightweight,
 * evidence-based check: if the crawl contains clear signals that a schema
 * type applies (product URLs, location pages, editorial content, Q&A
 * content, people), it's applicable. If the crawl contains NONE of those
 * signals across a reasonably complete crawl, the recommendation is
 * presented as "Not applicable — [evidence-based reason]" instead of a
 * high-priority task. If the crawl is too small to be confident (fewer
 * than MIN_PAGES_FOR_CONFIDENCE), the status is "unknown" and the existing
 * recommendation + priority are kept, with the "Valid for" note shown.
 */

export type SchemaApplicabilityStatus = "applicable" | "not_applicable" | "unknown";

export interface SchemaApplicabilityResult {
  status: SchemaApplicabilityStatus;
  /** Client-facing reason, shown where the recommendation would otherwise
   * appear ("Not applicable — <reason>"). */
  reason: string;
}

/** Below this many ok pages the crawl is too thin to safely conclude
 * "not applicable" from the absence of signals. */
const MIN_PAGES_FOR_CONFIDENCE = 3;

const PRODUCT_URL_PATTERNS = [
  /\/(product|products|shop|store|stores|catalog|cart|checkout|buy|item)\b/i,
  /\/p\/[^/]+\/?$/i, // common /p/<slug> product URL shape
  /[?&](add-to-cart|product_id|sku)=/i,
];

const LOCAL_URL_PATTERNS = [
  /\/(location|locations|store|stores|visit|directions|find-us|hours)\b/i,
];

const ARTICLE_URL_PATTERNS = [
  /\/(blog|articles?|news|insights?|journal|resources?|posts?|stories?|magazine|updates?)\b/i,
  /\/(19|20)\d{2}\/(0[1-9]|1[0-2])\//i, // /2024/07/... date-based article URLs
];

const PERSON_URL_PATTERNS = [
  /\/(author|authors|team|staff|contributors|people|experts?|founders?)\b/i,
];

interface OkPageLike {
  url: string;
  structuredData: { present: boolean; types: string[] };
  aeoSignals?: {
    authorName?: string | null;
    hasAuthorProfilePage?: boolean;
    faqSchemaPresent?: boolean;
    questionHeadingCount?: number;
  };
}

function urlPatternMatch(pages: OkPageLike[], patterns: RegExp[]): boolean {
  return pages.some((p) => patterns.some((re) => re.test(p.url)));
}

function schemaTypePresent(pages: OkPageLike[], types: string[]): boolean {
  const wanted = new Set(types.map((t) => t.toLowerCase()));
  return pages.some(
    (p) => p.structuredData.present && p.structuredData.types.some((t) => wanted.has(t.toLowerCase()))
  );
}

export function detectSchemaApplicability(audit: RunAuditResult): Record<string, SchemaApplicabilityResult> {
  const okPages: OkPageLike[] = audit.crawl.pages.filter((p) => p.ok);
  const pageCount = okPages.length;
  const tooSmallForConfidence = pageCount < MIN_PAGES_FOR_CONFIDENCE;

  const confident = (applicable: boolean, reason: string): SchemaApplicabilityResult =>
    tooSmallForConfidence
      ? { status: "unknown", reason: "Too few pages crawled to determine applicability with confidence." }
      : { status: applicable ? "applicable" : "not_applicable", reason };

  // --- Product schema ---
  const productSignal = urlPatternMatch(okPages, PRODUCT_URL_PATTERNS) || schemaTypePresent(okPages, ["product", "offer"]);
  const product = productSignal
    ? { status: "applicable" as const, reason: "Product/ecommerce pages detected in the crawl." }
    : confident(false, "No product or ecommerce pages detected in the crawl (e.g. /products/, /shop/, /cart/, /checkout/). Product schema is primarily relevant to ecommerce/product-based websites.");

  // --- LocalBusiness schema ---
  const localSignal =
    urlPatternMatch(okPages, LOCAL_URL_PATTERNS) ||
    schemaTypePresent(okPages, ["localbusiness", "store", "foodestablishment", "restaurant", "dentist", "physician", "attorney", "realestateagent"]);
  const localBusiness = localSignal
    ? { status: "applicable" as const, reason: "Physical-location or service-area pages detected in the crawl." }
    : confident(false, "No physical-location or service-area pages detected (e.g. /locations/, /visit/, /directions/). LocalBusiness schema is relevant only to businesses serving customers at a physical location or service area.");

  // --- Article / BlogPosting schema ---
  const articleSignal = urlPatternMatch(okPages, ARTICLE_URL_PATTERNS) || schemaTypePresent(okPages, ["article", "blogposting", "newsarticle"]);
  const article = articleSignal
    ? { status: "applicable" as const, reason: "Article/blog/editorial content detected in the crawl." }
    : confident(false, "No article, blog, or editorial content detected in the crawl (e.g. /blog/, /news/, /insights/). Article schema is relevant only to websites publishing article/editorial content.");

  // --- FAQPage schema ---
  const faqSignal = okPages.some(
    (p) => p.aeoSignals?.faqSchemaPresent || (p.aeoSignals?.questionHeadingCount ?? 0) > 0
  );
  const faq = faqSignal
    ? { status: "applicable" as const, reason: "Genuine question-and-answer content detected in the crawl." }
    : confident(false, "No question-and-answer content detected in the crawl. FAQPage schema is relevant only where qualifying FAQ content exists.");

  // --- Person / Author schema ---
  const personSignal =
    urlPatternMatch(okPages, PERSON_URL_PATTERNS) ||
    schemaTypePresent(okPages, ["person"]) ||
    okPages.some((p) => !!p.aeoSignals?.authorName || !!p.aeoSignals?.hasAuthorProfilePage);
  const person = personSignal
    ? { status: "applicable" as const, reason: "Identifiable people (authors, team, experts) detected in the crawl." }
    : confident(false, "No identifiable people (authors, team, experts) detected in the crawl. Person schema is relevant only where people/authors are actually represented.");

  // --- Organization schema ---
  // Applies to essentially every entity behind a website — always
  // applicable. Its SCOPE (sitewide, added once) is handled by the check
  // itself, not by applicability.
  const organization = {
    status: "applicable" as const,
    reason: "Applies to every organization, business, or entity behind a website.",
  };

  return {
    schema_product: product,
    schema_localbusiness: localBusiness,
    schema_article: article,
    schema_faq: faq,
    schema_person: person,
    schema_organization: organization,
  };
}
