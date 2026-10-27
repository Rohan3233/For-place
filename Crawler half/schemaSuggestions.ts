import type { CrawlPageSuccess } from "./types";

/**
 * Structured-data specialist: recommends schema.org JSON-LD types for pages
 * missing structured data. Classifies the page's primary entity first (URL +
 * content signals), then picks the type that matches what the page *is*.
 */
export function suggestSchemaType(page: CrawlPageSuccess): string {
  return classifyPage(page).primaryType;
}

export interface SchemaSuggestion {
  type: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

interface PageClassification {
  pageType: string;
  primaryType: string;
  secondaryTypes: string[];
  reason: string;
  confidence: "high" | "medium" | "low";
}

function classifyPage(page: CrawlPageSuccess): PageClassification {
  const url = page.url.toLowerCase();
  const title = (page.title.content ?? "").toLowerCase();
  const h1Text = page.h1.join(" ").toLowerCase();
  const metaDesc = (page as any).metaDescription?.content?.toLowerCase() ?? "";
  const wordCount = page.wordCount ?? 0;
  const headings = page.headings;
  const aeo = page.aeoSignals;
  const totalH2Plus = headings.h2 + headings.h3 + headings.h4 + headings.h5 + headings.h6;
  const combined = `${title} ${h1Text} ${metaDesc}`;

  const hasDeepPath = (() => {
    try {
      const segments = new URL(page.url).pathname.split("/").filter((s) => s.length > 0);
      return segments.length >= 2;
    } catch { return false; }
  })();
  const breadcrumbSecondary = hasDeepPath ? ["BreadcrumbList"] : [];

  // Homepage
  try {
    if (new URL(page.url).pathname === "/") {
      return { pageType: "homepage", primaryType: "Organization / WebSite", secondaryTypes: [], reason: "This is the homepage \u2014 the site-wide entity markup (Organization + WebSite) belongs here, giving search engines and AI systems the canonical identity for the whole site.", confidence: "high" };
    }
  } catch { /* ignore */ }

  // Person bio / team / leadership
  if (/\/(team|people|leadership|board|advisory|management|founders?|staff|about\/[^/]+)\/?/.test(url) || /\b(team|board of directors|advisory board|leadership|founder|CEO|CTO|VP|director|head of)\b/.test(combined)) {
    const personName = extractPersonName(page);
    return { pageType: "person profile", primaryType: "Person", secondaryTypes: breadcrumbSecondary, reason: personName ? `The page profiles a specific individual (${personName}) \u2014 Person schema makes their name, title, and role machine-readable.` : "The page profiles a specific individual (team member, founder, or executive) \u2014 Person schema makes their name, title, and role machine-readable.", confidence: "high" };
  }

  // Case study / customer story
  if (/(case[- ]?studies?|customers?\/stories?|success[- ]?stories?|clients?)\//i.test(url) || /\b(case study|customer story|success story|client results?|how .* grew|how .* increased)\b/i.test(combined)) {
    return { pageType: "case study", primaryType: "Article", secondaryTypes: breadcrumbSecondary, reason: "The URL and content indicate a customer success story or case study \u2014 Article schema describes this long-form editorial content.", confidence: "high" };
  }

  // Interview / founder story
  if (/(stories?|interviews?|conversations?|science-of-scaling|podcasts?)\//i.test(url) || /\b(interview with|conversation with|founded by|started by|story of)\b/i.test(combined)) {
    const personName = extractPersonName(page);
    return { pageType: "interview / story", primaryType: personName ? "Person" : "Article", secondaryTypes: breadcrumbSecondary, reason: personName ? `The page is a story or interview centered on a specific person (${personName}) \u2014 Person schema captures their identity.` : "The page is an interview or founder story \u2014 Article schema describes this editorial content.", confidence: "medium" };
  }

  // Partner / vendor page
  if (/(partners?|vendors?|integrations?|companies?)\/[^/]+/i.test(url) && !/(blog|articles?|resources?|guides?)\//i.test(url)) {
    return { pageType: "partner page", primaryType: "Organization", secondaryTypes: breadcrumbSecondary, reason: "The URL indicates a partner or vendor profile page \u2014 Organization schema identifies the featured company as a distinct entity.", confidence: "high" };
  }

  // Comparison page
  if (/(comparisons?|vs|versus)\//i.test(url) || /\b(vs\.?|versus|compared to|comparison)\b/i.test(combined)) {
    return { pageType: "comparison page", primaryType: "Article", secondaryTypes: breadcrumbSecondary, reason: "The URL or content indicates a product/tool comparison \u2014 Article schema describes this analytical content.", confidence: "medium" };
  }

  // Calculator / interactive tool
  if (/(calculators?|tools?|generators?|builders?|estimators?|roi|grading?)\//i.test(url) || /\b(calculator|tool|generator|interactive|estimate your|check your)\b/i.test(combined)) {
    return { pageType: "tool / calculator", primaryType: "WebApplication", secondaryTypes: [], reason: "The page is an interactive tool or calculator \u2014 WebApplication schema identifies it as a software utility rather than static content.", confidence: "medium" };
  }

  // Product / pricing page
  if (/(products?|shop|store|pricing|plans?|buy|order|catalogs?)\//i.test(url) || /\b(price|pricing|buy now|add to cart|starting at|\$|EUR|GBP)\b/i.test(combined)) {
    return { pageType: "product / pricing", primaryType: "Product", secondaryTypes: [...breadcrumbSecondary, "Offer"], reason: "The URL and content indicate a product or pricing page \u2014 Product schema makes names, prices, and availability machine-readable. Offer is included because pricing data is present.", confidence: "high" };
  }

  // Blog / article / guide / resource
  if (/(blog|articles?|resources?|guides?|web-guides?|news|posts?|learn|insights?|tips?)\//i.test(url) || /\/\d{4}\/\d{2}\//.test(url)) {
    return { pageType: "article / guide", primaryType: "Article", secondaryTypes: breadcrumbSecondary, reason: "The URL follows a content path pattern (blog, article, guide, resource) \u2014 Article schema describes this informational content and enables author/date attribution.", confidence: "high" };
  }

  // FAQ page (only genuine Q&A content)
  if (/\/faq/.test(url) || /\/faqs?\//i.test(url)) {
    const hasQuestionHeadings = aeo && aeo.questionHeadingCount >= 3;
    if (hasQuestionHeadings) {
      return { pageType: "FAQ page", primaryType: "FAQPage", secondaryTypes: breadcrumbSecondary, reason: `The page contains ${aeo.questionHeadingCount} question-style headings and its URL indicates FAQ content \u2014 FAQPage schema makes the Q&A pairs eligible for rich FAQ snippets.`, confidence: "high" };
    }
    return { pageType: "FAQ page", primaryType: "FAQPage", secondaryTypes: breadcrumbSecondary, reason: "The URL indicates FAQ content, though few question-style headings were detected. Verify the page contains genuine question-and-answer pairs before implementing FAQPage schema.", confidence: "medium" };
  }

  // Content-based FAQ detection
  if (aeo && aeo.questionHeadingCount >= 3 && totalH2Plus >= 3) {
    return { pageType: "FAQ content", primaryType: "FAQPage", secondaryTypes: breadcrumbSecondary, reason: `The page contains ${aeo.questionHeadingCount} question-style headings \u2014 this Q&A structure is exactly what FAQPage schema describes.`, confidence: "medium" };
  }

  // Contact page
  if (/\/contact/.test(url)) {
    if (aeo?.hasContactInfo) {
      return { pageType: "contact page", primaryType: "LocalBusiness", secondaryTypes: breadcrumbSecondary, reason: "This is a contact page with detectable contact information (address, phone, or email) \u2014 LocalBusiness schema ties the site's NAP (name, address, phone) to a real entity for local search visibility.", confidence: "high" };
    }
    return { pageType: "contact page", primaryType: "Organization", secondaryTypes: breadcrumbSecondary, reason: "This is a contact page \u2014 Organization schema identifies the site's primary point of contact.", confidence: "medium" };
  }

  // About page
  if (/\/about/.test(url)) {
    return { pageType: "about page", primaryType: "AboutPage / Organization", secondaryTypes: breadcrumbSecondary, reason: "This is an About page \u2014 it describes the organization itself, so it's the natural place for AboutPage markup paired with the site-wide Organization entity.", confidence: "high" };
  }

  // Article signals (author, date, long-form content)
  if (aeo?.authorName && aeo?.lastUpdatedDate && wordCount > 300) {
    return { pageType: "article (byline detected)", primaryType: "Article", secondaryTypes: breadcrumbSecondary, reason: `The page has an author byline (\"${aeo.authorName}\"), a publication date, and ${wordCount} words of content \u2014 these are the hallmarks of an article or blog post.`, confidence: "medium" };
  }

  // How-to / tutorial
  if (/\b(how\s+to|guide|tutorial|step[\s-]by[\s-]step|instructions?)\b/i.test(combined)) {
    if (aeo?.hasOrderedList || totalH2Plus >= 3) {
      return { pageType: "how-to / tutorial", primaryType: "HowTo", secondaryTypes: breadcrumbSecondary, reason: "The page's title and structure suggest step-by-step instructional content \u2014 HowTo schema makes the steps machine-readable and eligible for rich how-to snippets.", confidence: "medium" };
    }
  }

  // Physical business location (must have address/hours/map)
  if (aeo?.hasContactInfo && /\b(address|street|suite|floor|hours|open\s+(mon|tue|wed|thu|fri|sat|sun)|map|directions?|location)\b/i.test(combined)) {
    return { pageType: "business location", primaryType: "LocalBusiness", secondaryTypes: breadcrumbSecondary, reason: "The page contains a physical address and business hours \u2014 LocalBusiness schema makes this location discoverable in local search results and Google Maps.", confidence: "high" };
  }

  // Pricing-like content with images
  if (aeo?.numericDataDensityPct && aeo.numericDataDensityPct > 20 && page.images.length > 0) {
    const hasPriceLikeContent = /\b(price|cost|\$|EUR|GBP|INR|USD)\b/i.test(combined);
    if (hasPriceLikeContent) {
      return { pageType: "product (pricing signals)", primaryType: "Product", secondaryTypes: [...breadcrumbSecondary, "Offer"], reason: "The page contains pricing-related content and product images \u2014 Product schema makes prices, availability, and ratings machine-readable for shopping results.", confidence: "medium" };
    }
  }

  // General content with author
  if (aeo?.authorName && wordCount > 200) {
    return { pageType: "content with author", primaryType: "Article", secondaryTypes: breadcrumbSecondary, reason: `The page has an author byline and substantial content (${wordCount} words) \u2014 Article schema adds author attribution and date metadata.`, confidence: "medium" };
  }

  // Fallback: WebPage (safe generic default)
  return { pageType: "general page", primaryType: "WebPage", secondaryTypes: breadcrumbSecondary, reason: "No strong signal from the URL, title, headings, or content structure was sufficient to recommend a specific type. WebPage is a safe generic default \u2014 review the page's primary content purpose and consider adding a more specific type.", confidence: "low" };
}

function extractPersonName(page: CrawlPageSuccess): string | null {
  const h1 = page.h1.join(" ").trim();
  const title = (page.title.content ?? "").trim();
  if (/^[A-Z][a-z]+ [A-Z][a-z]+( [A-Z][a-z]+){0,2}$/.test(h1)) return h1;
  const nameMatch = title.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[-|]/);
  if (nameMatch) return nameMatch[1];
  try {
    const segments = new URL(page.url).pathname.split("/").filter((s) => s.length > 0);
    const last = segments[segments.length - 1] ?? "";
    if (/^[a-z]+-[a-z]+(-[a-z]+)?$/.test(last)) {
      return last.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  } catch { /* ignore */ }
  return null;
}

export function suggestSchemaTypeWithReason(page: CrawlPageSuccess): SchemaSuggestion {
  const cls = classifyPage(page);
  return { type: cls.primaryType, reason: cls.reason, confidence: cls.confidence };
}

export function buildSchemaRecommendation(page: CrawlPageSuccess): string {
  const cls = classifyPage(page);
  const allTypes = [cls.primaryType, ...cls.secondaryTypes];
  const seen = new Set<string>();
  return allTypes.filter((t) => { if (seen.has(t)) return false; seen.add(t); return true; }).join("; ");
}
