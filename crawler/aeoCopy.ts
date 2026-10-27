import type { AeoCategory, AeoMeta } from "./aeoTypes";

/**
 * Hardcoded "why it matters" / "recommended fix" copy for every AEO check —
 * same cost-saving reasoning as templates.ts: none of this needs an AI
 * call, it's identical every time a given check applies.
 *
 * IMPORTANT: this copy is written to be COMPLEMENTARY to, not
 * contradictory with, the existing traditional-SEO copy in templates.ts
 * and the other section-specific copy files (auxiliaryIssueCopy.ts, etc).
 * Where a check reframes something already explained elsewhere (e.g.
 * canonicals, alt text), the AEO angle is deliberately the ADDITIONAL
 * reason ("...and AI systems...") rather than a restatement, so a reader
 * seeing both sections never gets two different explanations for the
 * same fact.
 */
interface AeoCopyEntry {
  whyItMatters: string;
  recommendedFix: string;
  /** Concrete example shown under the fix. Omit entirely when a snippet wouldn't add anything beyond the prose fix. */
  codeSnippet?: { label: string; code: string };

  // --- Actionability fields (WHAT/WHY/WHERE/WHAT/HOW/VERIFY) ---
  /** Where this fix should be applied — derived from crawl data, not generic. */
  implementationScope?: string;
  /** Why this matters for AI search visibility — technically defensible wording. */
  whyItMattersAi?: string;
  /** What specifically needs to be implemented. */
  whatToImplement?: string;
  /** Where exactly to add the implementation. */
  whereToImplement?: string;
  /** Step-by-step implementation guidance. */
  implementationGuidance?: string;
  /** How to verify the fix was applied correctly. */
  verificationSteps?: string;
}

const AI_BOT_SNIPPET = (bot: string) =>
  `# Remove any block like this from robots.txt:
User-agent: ${bot}
Disallow: /

# Or explicitly allow it:
User-agent: ${bot}
Allow: /`;

export const AEO_COPY: Record<string, AeoCopyEntry> = {
  gptbot: {
    whyItMatters:
      "GPTBot is OpenAI's crawler. If it's blocked, content on this site cannot be used to inform ChatGPT's answers or be cited by it.",
    recommendedFix: "Remove the Disallow rule blocking GPTBot in robots.txt, unless excluding OpenAI's crawler is a deliberate content-licensing decision.",
    codeSnippet: { label: "robots.txt", code: AI_BOT_SNIPPET("GPTBot") },
  },
  "chatgpt-user": {
    whyItMatters:
      "ChatGPT-User is the browsing-mode crawler OpenAI uses when ChatGPT fetches live web pages to answer user questions. If blocked, ChatGPT cannot retrieve current information from this site.",
    recommendedFix: "Remove the Disallow rule blocking ChatGPT-User in robots.txt, unless excluding OpenAI's browsing crawler is a deliberate content-licensing decision.",
    codeSnippet: { label: "robots.txt", code: AI_BOT_SNIPPET("ChatGPT-User") },
  },
  claudebot: {
    whyItMatters:
      "ClaudeBot is Anthropic's crawler. If it's blocked, this site's content can't be referenced by Claude when answering questions.",
    recommendedFix: "Remove the Disallow rule blocking ClaudeBot in robots.txt, unless excluding it is a deliberate content-licensing decision.",
    codeSnippet: { label: "robots.txt", code: AI_BOT_SNIPPET("ClaudeBot") },
  },
  perplexitybot: {
    whyItMatters:
      "PerplexityBot powers Perplexity AI's real-time answer engine, which cites live sources directly in its responses.",
    recommendedFix: "Remove the Disallow rule blocking PerplexityBot in robots.txt, unless excluding it is a deliberate content-licensing decision.",
    codeSnippet: { label: "robots.txt", code: AI_BOT_SNIPPET("PerplexityBot") },
  },
  "google-extended": {
    whyItMatters:
      "Google-Extended controls whether this content can be used to train and ground Google's Gemini models and AI Overviews — separate from normal Googlebot indexing.",
    recommendedFix: "Remove the Disallow rule blocking Google-Extended in robots.txt, unless opting out of Google's AI training/grounding use is intentional.",
    codeSnippet: { label: "robots.txt", code: AI_BOT_SNIPPET("Google-Extended") },
  },
  llms_txt: {
    whyItMatters:
      "llms.txt is an emerging convention (not yet a formal standard) that gives AI systems a concise, curated map of a site's most important content — similar in spirit to sitemap.xml, but written for language models rather than search crawlers.",
    recommendedFix: "Publish a llms.txt file at the domain root summarizing the site's purpose and linking to its most important pages, in the emerging llms.txt format.",
    codeSnippet: {
      label: "/llms.txt",
      code: `# Company Name

> One or two sentences describing what this site/company does.

## Key pages
- [Product overview](/product): what it does and who it's for
- [Pricing](/pricing): current plans and pricing
- [Documentation](/docs): setup and usage guides`,
    },
  },
  render_mode: {
    whyItMatters:
      "Not every AI crawler executes JavaScript. If a page's primary content only appears after client-side rendering, some AI systems may see an empty or near-empty page — the same content a search engine would also struggle to index.",
    recommendedFix: "Server-render or pre-render the primary content so it's present in the initial HTML response, not only injected client-side after JavaScript runs.",
  },

  // --- Structured data (AEO framing) ---
  schema_organization: {
    whyItMatters: "Organization schema is a primary signal AI systems use to identify and disambiguate the entity behind a website in their knowledge graph.",
    recommendedFix: "Add Organization JSON-LD with name, url, logo, and sameAs links to your official social/profile pages.",
    codeSnippet: {
      label: "JSON-LD (add inside <head>)",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Company Name",
  "url": "https://www.yoursite.com",
  "logo": "https://www.yoursite.com/logo.png",
  "sameAs": [
    "https://www.linkedin.com/company/yourcompany",
    "https://twitter.com/yourcompany"
  ]
}
</script>`,
    },
    implementationScope: "Sitewide — Organization markup describes the entity behind the entire website. Implemented once, typically on the homepage or in a global template.",
    whyItMattersAi: "Machine-readable Organization markup improves entity understanding for AI retrieval systems, providing clearer attribution signals about who operates the site.",
    whatToImplement: "Add Organization JSON-LD containing name, url, logo, and sameAs links to verified official profiles (LinkedIn, Twitter/X, Wikipedia if available).",
    whereToImplement: "Add inside the <head> of the homepage or in a global site template so it appears on all pages.",
    implementationGuidance: '1. Open your homepage or site template. 2. Add a <script type="application/ld+json"> block inside <head>. 3. Set @type to "Organization". 4. Fill in name, url, and logo. 5. Add sameAs links to verified official profiles.',
    verificationSteps: "1. Recrawl the affected URLs. 2. Verify valid Organization JSON-LD exists using Google Rich Results Test or Schema Markup Validator. 3. Confirm the name matches the visible brand name.",
  },
  schema_localbusiness: {
    whyItMatters: "For a business with a physical presence, LocalBusiness schema gives AI systems structured location, hours, and contact data to answer local queries accurately.",
    recommendedFix: "Add LocalBusiness JSON-LD (or a more specific subtype) with address, hours, and contact details.",
    codeSnippet: {
      label: "JSON-LD (add inside <head>)",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Your Business Name",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "Your City",
    "addressRegion": "ST",
    "postalCode": "00000"
  },
  "telephone": "+1-555-000-0000",
  "openingHours": "Mo-Fr 09:00-17:00"
}
</script>`,
    },
  },
  schema_person: {
    whyItMatters: "Person schema helps AI systems attribute content to a real, identifiable author — a factor in how much weight some AI answer engines give a source.",
    recommendedFix: "Add Person JSON-LD for content authors, including name and a sameAs link to their professional profile.",
    codeSnippet: {
      label: "JSON-LD (add inside <head>)",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Author Name",
  "sameAs": ["https://www.linkedin.com/in/authorname"]
}
</script>`,
    },
    implementationScope: "Individual article/blog pages with identifiable authors. Prefer the article template so the fix applies automatically to all applicable articles.",
    whyItMattersAi: "Machine-readable author attribution provides clearer entity signals for AI retrieval systems, improving content accessibility for automated source verification.",
    whatToImplement: "Add Person JSON-LD containing name, url, and sameAs properties for each identified author. Link to verified professional profiles (LinkedIn, personal site).",
    whereToImplement: "Add inside the <head> of article/blog templates, or in a shared article layout so it applies to all authored content.",
    implementationGuidance: '1. Identify the author byline on your article pages. 2. Add a <script type="application/ld+json"> block inside <head> of the article template. 3. Set @type to "Person". 4. Fill in name (matching the visible byline). 5. Add sameAs links to the author\'s verified professional profiles.',
    verificationSteps: "1. Recrawl affected article URLs. 2. Verify valid Person JSON-LD exists using Google Rich Results Test. 3. Confirm the Person name matches the visible author byline.",
  },
  schema_article: {
    whyItMatters: "Article/BlogPosting schema gives AI systems structured signals about headline, author, and publish/update dates for editorial content.",
    recommendedFix: "Add Article or BlogPosting JSON-LD with headline, author, datePublished, and dateModified.",
    codeSnippet: {
      label: "JSON-LD (add inside <head>)",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Page Title Here",
  "author": { "@type": "Person", "name": "Author Name" },
  "datePublished": "2026-01-15",
  "dateModified": "2026-06-01"
}
</script>`,
    },
  },
  schema_faq: {
    whyItMatters: "FAQPage schema is one of the most directly reusable formats for AI answer engines — question/answer pairs map almost one-to-one onto how these systems generate responses.",
    recommendedFix: "Add FAQPage JSON-LD for genuine Q&A content already on the page — don't fabricate questions that aren't actually answered.",
    codeSnippet: {
      label: "JSON-LD (add inside <head>)",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "Actual question already answered on this page",
    "acceptedAnswer": { "@type": "Answer", "text": "The existing answer text." }
  }]
}
</script>`,
    },
    implementationScope: "Pages containing genuine question-and-answer content. Apply to the specific pages with Q&A, not sitewide.",
    whyItMattersAi: "Structured Q&A markup improves content accessibility for automated retrieval systems, providing clearer question-answer pairing signals.",
    whatToImplement: "Add FAQPage JSON-LD containing only genuine question/answer pairs that already exist as visible content on the page.",
    whereToImplement: "Add inside the <head> of pages with genuine Q&A content, or in a page template for FAQ sections.",
    implementationGuidance: '1. Identify pages with question headings and answers. 2. Add a <script type="application/ld+json"> block inside <head>. 3. Set @type to "FAQPage". 4. For each Q&A pair on the page, add a Question entity with name and acceptedAnswer. 5. Only include questions that are genuinely answered on the page.',
    verificationSteps: "1. Recrawl affected URLs. 2. Verify valid FAQPage JSON-LD using Google Rich Results Test. 3. Confirm the schema matches the visible Q&A content on the page.",
  },
  schema_breadcrumb: {
    whyItMatters: "Breadcrumb schema helps AI systems understand where a page sits within the site's topical hierarchy, reinforcing what the content is actually about.",
    recommendedFix: "Add BreadcrumbList JSON-LD reflecting the page's actual navigation path.",
    codeSnippet: {
      label: "JSON-LD (add inside <head>)",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.yoursite.com/" },
    { "@type": "ListItem", "position": 2, "name": "Category", "item": "https://www.yoursite.com/category" }
  ]
}
</script>`,
    },
  },
  schema_product: {
    whyItMatters: "For e-commerce pages, Product schema gives AI shopping assistants structured price, availability, and review data to reference directly.",
    recommendedFix: "Add Product JSON-LD with name, price, availability, and (if present) aggregateRating.",
    codeSnippet: {
      label: "JSON-LD (add inside <head>)",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "offers": { "@type": "Offer", "price": "49.99", "priceCurrency": "USD", "availability": "https://schema.org/InStock" }
}
</script>`,
    },
  },
  schema_sameas: {
    whyItMatters: "sameAs links tie this entity to its verified profiles elsewhere (social platforms, Wikipedia, Wikidata, official registries, Crunchbase, etc.) — the cross-references AI knowledge graphs use to confirm identity, reduce ambiguity, and establish the trust baseline before recommending you.",
    recommendedFix: "Add a sameAs array to your Organization or Person schema, listing links to verified official profiles and cross-referenced entity records (social platforms, Wikipedia/Wikidata, official registries, business directories).",
    codeSnippet: {
      label: "Add to existing Organization/Person JSON-LD",
      code: `"sameAs": [
  "https://www.linkedin.com/company/yourcompany",
  "https://twitter.com/yourcompany",
  "https://www.crunchbase.com/organization/yourcompany"
]`,
    },
    implementationScope: "Sitewide — add sameAs links to the Organization or Person schema that describes the entity behind the website.",
    whyItMattersAi: "Verified cross-entity links improve machine-readable entity understanding, helping AI retrieval systems confirm identity and reduce ambiguity.",
    whatToImplement: "Add a sameAs array to your Organization or Person JSON-LD containing links to verified official profiles.",
    whereToImplement: "Add to the existing Organization/Person JSON-LD block in the homepage or global site template.",
    implementationGuidance: "1. Open the existing Organization or Person JSON-LD block. 2. Add a sameAs array. 3. Add links to verified profiles: LinkedIn, Twitter/X, Wikipedia (if available), Crunchbase, and other authoritative directories. 4. Only use URLs the entity actually owns or is verified on.",
    verificationSteps: "1. Recrawl the homepage or template. 2. Verify sameAs links are present in the JSON-LD using Google Rich Results Test. 3. Confirm each linked profile actually represents the same entity.",
  },

  // --- Answer readiness ---
  question_headings: {
    whyItMatters: "AI answer engines favor content structured as direct questions with clear answers — it maps closely to how they compose responses and pull citable snippets.",
    recommendedFix: "Rephrase key subheadings as the actual questions users ask (What is..., How to..., Why does...), each followed by a direct answer in the first sentence or two.",
    codeSnippet: {
      label: "Example",
      code: `<h2>How long does shipping take?</h2>
<p>Orders ship within 1-2 business days and arrive in 3-5 days via standard shipping.</p>`,
    },
    implementationScope: "Informational pages where question-based search intent is relevant. Apply to key content sections, not every heading on every page.",
    whyItMattersAi: "Question-based headings with direct answers improve content accessibility for automated retrieval systems, making it easier for AI to extract and cite relevant information.",
    whatToImplement: "Rephrase key subheadings as questions users actually ask (What is..., How to..., Why does...). Follow each with a direct answer in the first sentence or two.",
    whereToImplement: "Apply to H2/H3 headings in the main content area of informational pages. Do not change navigation headings or page titles.",
    implementationGuidance: '1. Identify the key questions your audience asks. 2. Rephrase relevant H2/H3 headings as those questions. 3. Ensure the first paragraph after each heading directly answers the question. 4. Keep answers concise (45 words or fewer for best results).',
    verificationSteps: "1. Recrawl affected pages. 2. Verify question headings are present and followed by direct answers. 3. Check that the answer text is concise and immediately follows the heading.",
  },
  lists_tables: {
    whyItMatters: "Ordered lists, unordered lists, and tables are far easier for AI systems to parse into structured answers (steps, comparisons, rankings) than the same information buried in prose paragraphs.",
    recommendedFix: "Where content is naturally a sequence, set of options, or comparison, format it as a proper <ol>, <ul>, or <table> rather than a paragraph.",
  },
  heading_hierarchy: {
    whyItMatters: "A clean H1 → H2 → H3 hierarchy (no skipped levels) helps AI systems correctly parse a page's outline and extract the right section for a given question.",
    recommendedFix: "Fix heading levels so they descend one level at a time — don't jump from an H2 straight to an H4.",
  },

  // --- Trust & entity ---
  author_name: {
    whyItMatters: "A named, identifiable author is a trust signal AI systems increasingly weigh when deciding which sources to cite, particularly for informational or advice content.",
    recommendedFix: "Add a visible author byline, and back it with Person schema (see AI Structured Data above).",
    implementationScope: "Article, blog, and editorial content pages with identifiable authors. Apply to the article template for consistent attribution across all authored content.",
    whyItMattersAi: "Named author attribution provides clearer entity and trust signals for AI retrieval systems, improving content accessibility for automated source verification.",
    whatToImplement: "Add a visible author byline to each article page, and back it with Person schema containing the author's name and verified professional profiles.",
    whereToImplement: "Apply to article/blog page templates. Add the visible byline in the article header area, and Person JSON-LD in the <head>.",
    implementationGuidance: '1. Add a visible "By [Author Name]" byline near the article title. 2. Add Person JSON-LD with the same author name. 3. If the author has a professional profile (LinkedIn, personal site), include it as a sameAs link.',
    verificationSteps: "1. Recrawl affected article URLs. 2. Verify the visible byline is present on each page. 3. Check for valid Person JSON-LD using Google Rich Results Test.",
  },
  last_updated: {
    whyItMatters: "AI systems weigh recency for time-sensitive queries — a visible, machine-readable last-updated date signals the content is current.",
    recommendedFix: "Show a clear \"last updated\" date on the page, and expose it via article:modified_time or dateModified.",
    codeSnippet: {
      label: "HTML",
      code: `<meta property="article:modified_time" content="2026-06-01T00:00:00Z">
<time datetime="2026-06-01">Last updated June 1, 2026</time>`,
    },
    implementationScope: "Content pages that are updated or revised (articles, blog posts, documentation). Apply to the page template or CMS content type.",
    whyItMattersAi: "Machine-readable last-updated dates improve content accessibility for automated retrieval systems, providing clearer freshness signals.",
    whatToImplement: "Show a visible 'Last updated' date on the page. Expose the same date via article:modified_time meta tag or dateModified in JSON-LD.",
    whereToImplement: "Apply to article/blog templates or CMS content types that support date metadata.",
    implementationGuidance: '1. Add a visible "Last updated: [date]" element near the article date. 2. Add <meta property="article:modified_time" content="YYYY-MM-DD"> in the <head>. 3. Optionally add dateModified to your Article/BlogPosting JSON-LD.',
    verificationSteps: "1. Recrawl affected URLs. 2. Verify the visible date is present. 3. Check for article:modified_time meta tag. 4. Confirm dates are accurate and current.",
  },
  contact_info: {
    whyItMatters: "Findable contact information is a baseline trust/legitimacy signal for both traditional E-E-A-T evaluation and AI answer-engine source vetting.",
    recommendedFix: "Add a visible phone number, email, or link to a contact page.",
  },
  about_page: {
    whyItMatters: "An About page gives both users and AI systems a clear, structured explanation of who is behind the content — reinforcing entity identity.",
    recommendedFix: "Add an About page describing the organization or author, and link to it from this page.",
  },
  entity_consistency: {
    whyItMatters: "When the organization/brand name is inconsistent across the title tag, Organization schema, and Open Graph tags, AI systems have a harder time confirming this is a single, coherent entity.",
    recommendedFix: "Use the exact same organization/brand name across the title tag, Organization schema's name field, and og:site_name.",
    implementationScope: "Sitewide — ensure the organization/brand name is consistent across all pages' title tags, schema markup, and Open Graph metadata.",
    whyItMattersAi: "Consistent entity naming improves machine-readable entity understanding, helping AI retrieval systems confirm identity and reduce ambiguity.",
    whatToImplement: "Standardize the organization/brand name across title tags, Organization JSON-LD name field, and og:site_name meta tag.",
    whereToImplement: "Apply to site templates or CMS settings that control title tags, schema markup, and Open Graph metadata.",
    implementationGuidance: '1. Audit the organization name across title tags, Organization JSON-LD, and Open Graph tags. 2. Standardize to one canonical name. 3. Update templates or CMS settings to use the standardized name consistently.',
    verificationSteps: "1. Recrawl affected URLs. 2. Verify the organization name is consistent across title tags, JSON-LD, and Open Graph tags. 3. Confirm the name matches the visible brand name.",
  },
  numeric_density: {
    whyItMatters: "Concrete statistics, dates, and prices are exactly the kind of specific, citable facts AI answer engines look to extract and quote directly.",
    recommendedFix: "Where relevant, back claims with specific numbers (dates, percentages, prices) rather than vague qualitative language.",
  },

  // --- Content quality ---
  duplicate_content_aeo: {
    whyItMatters: "Beyond the traditional-SEO duplicate-content concern, near-identical pages give AI systems no reason to prefer citing one over another — diluting which version (if any) gets referenced.",
    recommendedFix: "Consolidate near-duplicate pages into one canonical version, or meaningfully differentiate their content.",
  },
  missing_faq_opportunity: {
    whyItMatters: "Pages that already answer common follow-up questions in prose, but don't format them as an explicit FAQ, are missing an easy, high-value AEO structure.",
    recommendedFix: "Add a dedicated FAQ section (with FAQPage schema) covering the questions this page's content already answers.",
  },
  missing_tldr: {
    whyItMatters: "A short summary/TL;DR near the top gives AI systems (and skimming readers) a concise, extractable answer without having to parse the entire page.",
    recommendedFix: "Add a brief summary or \"Key takeaways\" section near the top of long-form content.",
    codeSnippet: {
      label: "Example",
      code: `<h2>Key takeaways</h2>
<ul>
  <li>Point one summarizing the main conclusion</li>
  <li>Point two summarizing a key data point</li>
</ul>`,
    },
  },
  internal_links_related: {
    whyItMatters: "Internal links to related content help AI systems understand topical depth and relationships between pages on the site — similar to how they help human readers and search engines.",
    recommendedFix: "Add a few contextual internal links to genuinely related content elsewhere on the site.",
  },
  external_authority_links: {
    whyItMatters: "For informational content, links out to authoritative external sources signal the content is well-researched — a factor in how AI systems assess trustworthiness.",
    recommendedFix: "Where claims reference outside facts or data, link to the original authoritative source.",
  },
  semantic_density: {
    whyItMatters:
      "Generative AI engines don't read text like an old search crawler looking for exact keyword repetitions — they parse content into entities (verifiable concepts, nouns, and structural relationships) and cross-reference them against their training models. Pages built on vague corporate jargon instead of clear, direct entity definitions give AI models nothing to contextualize.",
    recommendedFix:
      "Restructure introduction paragraphs and content blocks into definitive statement structures — open with explicit \"What is…\" or \"How to…\" markers and define the page's core entities in plain terms. Keep the heading hierarchy (H1 → H2 → H3) as a logical, unbroken outline that maps the page's primary entity relationships.",
  },

  // --- Technical readiness (AEO framing of existing checks) ---
  indexability_aeo: {
    whyItMatters: "AI systems that respect noindex directives (many do) simply cannot discover or cite a blocked page, regardless of content quality.",
    recommendedFix: "Remove unintended noindex directives — see the Indexability Checks section above for details.",
    implementationScope: "Pages with unintended noindex directives. Each affected page must be reviewed individually — some noindex directives may be intentional.",
    whyItMattersAi: "Removing unintended noindex directives improves content accessibility for AI retrieval systems, making pages available for automated discovery and citation.",
    whatToImplement: "Remove the noindex meta tag or X-Robots-Tag header from pages that should be discoverable.",
    whereToImplement: "Apply to individual page templates or CMS settings that control the robots meta tag.",
    implementationGuidance: '1. Identify pages with unintended noindex. 2. Remove the <meta name="robots" content="noindex"> tag or the X-Robots-Tag: noindex header. 3. Confirm the page should be indexable.',
    verificationSteps: "1. Recrawl affected URLs. 2. Verify no noindex directive is present. 3. Confirm the page appears in search engine indexes.",
  },
  canonicals_aeo: {
    whyItMatters: "A missing or mismatched canonical can leave AI systems uncertain which URL is the authoritative version to cite, the same ambiguity it creates for search engines.",
    recommendedFix: "Ensure every page has a correct, self-referencing canonical tag — see the on-page issues above for specifics.",
    implementationScope: "Pages with missing or mismatched canonical tags. Each affected page must be reviewed individually.",
    whyItMattersAi: "Correct canonical tags improve machine-readable URL attribution, helping AI retrieval systems identify the authoritative version of each page.",
    whatToImplement: "Add a self-referencing canonical tag (a link element with rel=canonical pointing to the page's own URL) to each affected page.",
    whereToImplement: "Apply to page templates or CMS settings that control the canonical tag.",
    implementationGuidance: "1. Identify pages with missing or mismatched canonicals. 2. Add a link element with rel=canonical and href set to the page's own URL. 3. Ensure the canonical URL is absolute and self-referencing.",
    verificationSteps: "1. Recrawl affected URLs. 2. Verify each page has a self-referencing canonical tag. 3. Confirm the canonical URL matches the page URL.",
  },
  robots_sitemap_aeo: {
    whyItMatters: "robots.txt and sitemap.xml are also how many AI crawlers discover what exists on a site, not just traditional search engines.",
    recommendedFix: "See the Robots.txt and Sitemap sections above for the specific fix needed.",
    implementationScope: "Sitewide — robots.txt at the site root and sitemap.xml in the domain root.",
    whyItMattersAi: "Accessible robots.txt and sitemap.xml improve content discoverability for AI retrieval systems, providing structured navigation signals.",
    whatToImplement: "Ensure robots.txt is reachable and sitemap.xml is present and properly formatted.",
    whereToImplement: "Apply to the site root: robots.txt and sitemap.xml files.",
    implementationGuidance: '1. Verify robots.txt is accessible at /robots.txt. 2. Verify sitemap.xml is present and referenced in robots.txt. 3. Ensure both files are properly formatted and accessible.',
    verificationSteps: "1. Recrawl the site root. 2. Verify robots.txt is reachable. 3. Verify sitemap.xml is present and properly formatted.",
  },
  redirect_chains_aeo: {
    whyItMatters: "Long redirect chains cost AI crawlers the same crawl-budget penalty they cost search engines, and increase the chance a crawler gives up before reaching the real content.",
    recommendedFix: "Collapse redirect chains to a single hop — see the Redirect Chain section above.",
    implementationScope: "Pages with excessive redirect chains (3+ hops). Each chain must be collapsed to a single hop.",
    whyItMattersAi: "Collapsing redirect chains improves content accessibility for AI retrieval systems, reducing the chance crawlers abandon the request before reaching the content.",
    whatToImplement: "Update the initial redirect to point directly to the final destination URL, eliminating intermediate hops.",
    whereToImplement: "Apply to the server configuration, CMS redirects, or .htaccess rules that control the redirect chain.",
    implementationGuidance: '1. Identify the redirect chain path. 2. Update the first redirect to point directly to the final URL. 3. Remove intermediate redirects. 4. Test the redirect path.',
    verificationSteps: "1. Recrawl affected URLs. 2. Verify the redirect chain is collapsed to a single hop. 3. Confirm the final URL loads correctly.",
  },
  broken_links_aeo: {
    whyItMatters: "Following a broken link costs an AI crawler the same wasted fetch it costs a human visitor or a search engine, and a URL that returns an error can't be cited from that path — the destination may still be reachable through other routes.",
    recommendedFix: "Fix or remove broken links — see the Broken Links section above.",
    implementationScope: "Pages with broken outbound or internal links. Each affected link must be fixed or removed individually.",
    whyItMattersAi: "Fixing broken links improves content accessibility for AI retrieval systems, ensuring all referenced resources are reachable.",
    whatToImplement: "Update broken links to point to the correct destination, or remove the link if the destination no longer exists.",
    whereToImplement: "Apply to the specific pages containing broken links.",
    implementationGuidance: '1. Identify each broken link and its source page. 2. Update the link to the correct URL, or remove the link if the destination is gone. 3. Test the updated link.',
    verificationSteps: "1. Recrawl affected URLs. 2. Verify no broken links remain. 3. Confirm all updated links resolve to valid pages.",
  },
  core_web_vitals_aeo: {
    whyItMatters: "Slow or unstable pages are more likely to be skipped or timed out by automated crawlers, including AI crawlers operating under their own fetch budgets.",
    recommendedFix: "Improve Core Web Vitals — see the Performance section above for specifics.",
    implementationScope: "Pages with poor Core Web Vitals scores (LCP, INP, CLS, TTFB). Each metric must be improved individually.",
    whyItMattersAi: "Improved Core Web Vitals reduces the chance automated crawlers skip or time out on your pages, improving content accessibility.",
    whatToImplement: "Optimize page load performance: compress images, minify CSS/JS, improve server response times, and reduce layout shifts.",
    whereToImplement: "Apply to the specific pages with poor Core Web Vitals scores, focusing on the highest-impact metrics first.",
    implementationGuidance: '1. Identify the specific Core Web Vitals issue (LCP, INP, CLS, TTFB). 2. Follow the recommended fixes for that metric. 3. Test with PageSpeed Insights after changes.',
    verificationSteps: "1. Recrawl affected URLs. 2. Verify Core Web Vitals scores have improved. 3. Confirm all metrics are in the 'good' range.",
  },
  alt_text_aeo: {
    whyItMatters: "Alt text is one of the primary text signals an AI system has for understanding what an image shows — most AI systems don't process images the way they process text, so missing alt text removes a key signal.",
    recommendedFix: "Add descriptive alt text to meaningful images — see the Image SEO section above.",
  },
  meta_title_aeo: {
    whyItMatters: "The title tag is frequently what AI systems display as a page's label when citing or linking to it in a generated answer.",
    recommendedFix: "Add or fix the title tag — see the Metadata issues above for specifics.",
  },
  meta_description_aeo: {
    whyItMatters: "Some AI systems use the meta description as a fallback summary when generating a citation, similar to how search engines use it for snippets.",
    recommendedFix: "Add or fix the meta description — see the Metadata issues above for specifics.",
  },
  og_tags: {
    whyItMatters: "Open Graph tags give AI systems and any tool that previews or shares this page a clean, structured title/description/image, instead of having to guess by scraping the page.",
    recommendedFix: "Add the standard Open Graph tags: og:title, og:description, og:image, og:url, and og:type.",
    codeSnippet: {
      label: "HTML (add inside <head>)",
      code: `<meta property="og:title" content="Page Title">
<meta property="og:description" content="Page description, 1-2 sentences.">
<meta property="og:image" content="https://www.yoursite.com/share-image.png">
<meta property="og:url" content="https://www.yoursite.com/this-page">
<meta property="og:type" content="website">`,
    },
  },
  twitter_card_tags: {
    whyItMatters: "Twitter/X Card tags serve the same structured-preview purpose as Open Graph, specifically for X and tools that follow its card format.",
    recommendedFix: "Add Twitter Card meta tags: twitter:card, twitter:title, twitter:description, and twitter:image.",
    codeSnippet: {
      label: "HTML (add inside <head>)",
      code: `<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Page Title">
<meta name="twitter:description" content="Page description, 1-2 sentences.">
<meta name="twitter:image" content="https://www.yoursite.com/share-image.png">`,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Consulting metadata for every AI check — priority, difficulty, estimated
// time, expected impact, and a business-outcome framing. These power the
// "recommendation card" presentation of the AEO pages (badges, priority and
// impact bars, implementation order, quick wins). Purely static: identical
// every time a given check fails, no AI call needed.
// ---------------------------------------------------------------------------

const AEO_META: Partial<Record<string, AeoMeta>> = {
  // ===== AI Crawlability =====
  gptbot: {
    priority: "critical",
    difficulty: "easy",
    timeLabel: "10 minutes",
    expectedImpact: "very_high",
    businessImpact:
      "While your site still ranks in traditional search, ChatGPT and OpenAI's other products cannot read or cite it — content from this site is inaccessible to these systems.",
  },
  "chatgpt-user": {
    priority: "critical",
    difficulty: "easy",
    timeLabel: "10 minutes",
    expectedImpact: "very_high",
    businessImpact:
      "When users ask ChatGPT to browse the web for current information, it cannot retrieve content from this site — content from this domain is inaccessible to live-web browsing.",
  },
  claudebot: {
    priority: "critical",
    difficulty: "easy",
    timeLabel: "10 minutes",
    expectedImpact: "very_high",
    businessImpact:
      "Anthropic's Claude cannot read or cite this site, so AI users asking about your products or services will be answered from other sources.",
  },
  perplexitybot: {
    priority: "critical",
    difficulty: "easy",
    timeLabel: "10 minutes",
    expectedImpact: "very_high",
    businessImpact:
      "Perplexity's answer engine cites live sources directly in its responses — being blocked cuts you out of a fast-growing referral channel.",
  },
  "google-extended": {
    priority: "critical",
    difficulty: "easy",
    timeLabel: "10 minutes",
    expectedImpact: "very_high",
    businessImpact:
      "This opts your content out of grounding Google's AI Overviews and Gemini answers — the AI results Google increasingly shows above normal links.",
  },
  llms_txt: {
    priority: "high",
    difficulty: "easy",
    timeLabel: "30 minutes",
    expectedImpact: "high",
    businessImpact:
      "An llms.txt file gives AI systems a curated map of your most important pages — without one, AI engines have to guess what matters most on your site.",
  },
  render_mode: {
    priority: "medium",
    difficulty: "advanced",
    timeLabel: "2-4 hours",
    expectedImpact: "medium",
    businessImpact:
      "If key content only appears after JavaScript runs, some AI crawlers see near-empty pages and skip you — the same way search engines struggle with those pages.",
  },

  // ===== AI Structured Data =====
  schema_organization: {
    priority: "high",
    difficulty: "easy",
    timeLabel: "30 minutes",
    expectedImpact: "high",
    businessImpact:
      "Without Organization schema, AI systems can't confidently confirm who you are — weakening your entity's identity in knowledge graphs and AI answers.",
  },
  schema_localbusiness: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "high",
    businessImpact:
      "Without LocalBusiness schema, AI assistants cannot reliably extract structured location, hours, or contact data — providing clearer signals for local entity understanding.",
  },
  schema_person: {
    priority: "low",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Named author attribution improves machine-readable trust signals — missing it leaves editorial authority unclaimed in entity systems.",
  },
  schema_article: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "Article markup gives AI systems clean headline, author, and date signals — making editorial content easier to cite and less likely to be misattributed.",
  },
  schema_faq: {
    priority: "high",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "very_high",
    businessImpact:
      "FAQPage schema provides a structured format for question-answer pairs — without it, Q&A content is less accessible for automated retrieval systems.",
  },
  schema_breadcrumb: {
    priority: "best_practice",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Breadcrumb markup helps AI systems place each page in your site's structure, reinforcing what the page is about and improving entity relationship signals.",
  },
  schema_product: {
    priority: "high",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "very_high",
    businessImpact:
      "AI shopping assistants can't reliably read your product price, availability, or ratings without Product schema — reducing your appearance in AI-driven shopping recommendations.",
  },
  schema_sameas: {
    priority: "low",
    difficulty: "easy",
    timeLabel: "15 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Verified profile links (sameAs) help AI knowledge graphs confirm your identity across the web, reducing confusion with similarly named businesses.",
  },

  // ===== AI Answer Readiness =====
  question_headings: {
    priority: "high",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "very_high",
    businessImpact:
      "Pages that frame headings as real customer questions are far more likely to be pulled into AI answers verbatim — this is how your content gets quoted.",
  },
  lists_tables: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "Lists and tables let AI engines extract steps, comparisons, and rankings directly; prose-only content is harder to parse and quote.",
  },
  heading_hierarchy: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Clean heading structure helps AI systems find the exact section that answers a question — broken hierarchy hides answers inside the page.",
  },

  // ===== Trust & Entity Signals =====
  author_name: {
    priority: "medium",
    difficulty: "easy",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "A visible author is a credibility signal AI systems use to assess source trustworthiness — missing it weakens author attribution signals.",
  },
  last_updated: {
    priority: "medium",
    difficulty: "easy",
    timeLabel: "15 minutes",
    expectedImpact: "medium",
    businessImpact:
      "AI systems favor fresh, dated content for time-sensitive queries — an undated page looks stale and is less likely to be cited.",
  },
  contact_info: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Findable contact details are a basic trust signal for both E-E-A-T evaluation and AI source vetting — missing them undermines credibility.",
  },
  about_page: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "An About page gives AI systems a clear statement of who is behind the content — a missing one weakens entity identity and trust.",
  },
  numeric_density: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "Specific stats, dates, and prices are exactly what AI engines quote — content without concrete numbers is rarely cited for data-driven answers.",
  },
  entity_consistency: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "Inconsistent brand naming across your site makes AI knowledge graphs unsure they're looking at one company, diluting your entity's authority.",
  },

  // ===== Content Quality Signals =====
  thin_content_aeo: {
    priority: "medium",
    difficulty: "advanced",
    timeLabel: "2-4 hours",
    expectedImpact: "medium",
    businessImpact:
      "Very thin pages give AI systems nothing substantive to draw from, so they're rarely cited for answers — and they dilute your site's topical authority.",
  },
  duplicate_content_aeo: {
    priority: "medium",
    difficulty: "advanced",
    timeLabel: "2-4 hours",
    expectedImpact: "high",
    businessImpact:
      "Near-identical pages give AI engines no reason to prefer one version, splitting citations and weakening which page gets referenced.",
  },
  missing_faq_opportunity: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "Pages that already answer common questions in prose but lack FAQ markup are missing an easy, high-value AI visibility upgrade.",
  },
  missing_tldr: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "high",
    businessImpact:
      "A short summary near the top gives AI engines a ready-to-quote answer and helps skimming customers get the point in seconds.",
  },
  internal_links_related: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Internal links to related content help AI systems understand topical depth and surface more of your site in answers.",
  },
  external_authority_links: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "Linking out to authoritative sources signals well-researched content — a factor in how AI systems and customers judge trust.",
  },
  semantic_density: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "2-3 hours",
    expectedImpact: "high",
    businessImpact:
      "Low semantic density makes pages less accessible for automated entity extraction — clear, direct statements improve content retrievability.",
  },

  // ===== AI Technical Readiness =====
  indexability_aeo: {
    priority: "high",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "very_high",
    businessImpact:
      "AI systems that respect noindex simply cannot discover or cite blocked pages — blocking removes you from AI answers entirely.",
  },
  canonicals_aeo: {
    priority: "high",
    difficulty: "medium",
    timeLabel: "30 minutes",
    expectedImpact: "high",
    businessImpact:
      "Missing or mismatched canonicals make AI systems unsure which URL to cite, diluting your presence in AI answers.",
  },
  robots_sitemap_aeo: {
    priority: "medium",
    difficulty: "easy",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "robots.txt and sitemap.xml are how many AI crawlers discover your site — issues here can make parts of it invisible to AI.",
  },
  redirect_chains_aeo: {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "2-4 hours",
    expectedImpact: "medium",
    businessImpact:
      "Long redirect chains waste AI crawler budget and can cause crawlers to give up before reaching your content.",
  },
  broken_links_aeo: {
    priority: "high",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "high",
    businessImpact:
      "Broken links waste AI crawler budget: following a dead link gets an AI assistant nothing, and the exact URL can't be cited from that path. The destination may still be reachable through other links, but every dead link weakens crawl efficiency.",
  },
  core_web_vitals_aeo: {
    priority: "medium",
    difficulty: "advanced",
    timeLabel: "2-4 hours",
    expectedImpact: "medium",
    businessImpact:
      "Slow or unstable pages get skipped by automated crawlers operating under their own time budgets — performance protects visibility.",
  },
  alt_text_aeo: {
    priority: "medium",
    difficulty: "easy",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact:
      "Alt text is one of the main text signals AI systems use to understand what your images show — without it, much of an image's meaning is invisible to AI.",
  },
  meta_title_aeo: {
    priority: "medium",
    difficulty: "easy",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "The title tag is what AI systems display when referencing your page — a missing or weak title reduces clarity for automated retrieval.",
  },
  meta_description_aeo: {
    priority: "medium",
    difficulty: "easy",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Some AI systems use the meta description as a fallback summary — missing it reduces available structured metadata.",
  },
  og_tags: {
    priority: "medium",
    difficulty: "easy",
    timeLabel: "30 minutes",
    expectedImpact: "medium",
    businessImpact:
      "Open Graph tags give AI systems and link previews a clean structured title, description, and image for your pages instead of a scraped guess.",
  },
  twitter_card_tags: {
    priority: "best_practice",
    difficulty: "easy",
    timeLabel: "15 minutes",
    expectedImpact: "low",
    businessImpact:
      "Twitter/X card tags ensure your pages render cleanly when shared — a polish item that keeps your brand presentation consistent.",
  },
};

/** Category-aware fallback so an unrecognized future check key still gets
 * sensible consulting metadata instead of a hard-coded default alone. */
// ---------------------------------------------------------------------------
// Applicability ("Valid for") notes for schema checks that only make sense
// for certain business/site types. Shown inside the check's card so a client
// can immediately tell whether the recommendation applies to THEIR website.
// The check's priority is deliberately left unchanged — the meaning is
// "High priority IF applicable" — and the client decides applicability from
// the clearly stated guidance, not from any guess about their business type.
// Each note is written specifically for its schema type — never copy-pasted.
// ---------------------------------------------------------------------------

export const SCHEMA_APPLICABILITY: Partial<Record<string, string>> = {
  schema_product:
    "Valid for: Ecommerce websites and pages representing purchasable products. If your website does not sell products online, you can ignore this recommendation.",
  schema_localbusiness:
    "Valid for: Businesses with a physical location or defined service area. If your organization does not operate from a physical/service location, you can ignore this recommendation.",
  schema_article:
    "Valid for: Websites publishing articles, blog posts, news, or other editorial content. If your website does not publish this type of content, you can ignore this recommendation.",
  schema_faq:
    "Valid for: Pages containing genuine question-and-answer content that meets the requirements for FAQ structured data. If your page does not contain qualifying FAQ content, you can ignore this recommendation.",
  schema_person:
    "Valid for: Websites representing identifiable people, authors, experts, or contributors. If this does not apply to your website, you can ignore this recommendation.",
  // Organization applies to essentially every entity behind a website, so it
  // intentionally has NO "you can ignore this" clause — it stays a normal
  // prioritized recommendation for all organizations.
  schema_organization:
    "Valid for: Organizations, businesses, companies, institutions, nonprofits, and similar entities.",
};

const CATEGORY_META: Record<AeoCategory, Omit<AeoMeta, "businessImpact"> & { businessImpact: string }> = {
  "AI Crawlability": {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact: "Addressing this improves how AI systems discover and read this site.",
  },
  "AI Structured Data": {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "high",
    businessImpact: "Machine-readable markup makes it easier for AI systems to understand and cite your content.",
  },
  "AI Answer Readiness": {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact: "Structuring content for direct answers raises the chance AI engines quote your site.",
  },
  "Trust & Entity Signals": {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact: "Strengthening trust signals makes AI systems more likely to choose your site as a source.",
  },
  "Content Quality Signals": {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact: "Improving content quality increases the likelihood your pages are cited in AI answers.",
  },
  "AI Technical Readiness": {
    priority: "medium",
    difficulty: "medium",
    timeLabel: "1 hour",
    expectedImpact: "medium",
    businessImpact: "Technical fixes ensure AI crawlers can reach and process your pages reliably.",
  },
};

const DEFAULT_META: AeoMeta = {
  priority: "medium",
  difficulty: "medium",
  timeLabel: "1 hour",
  expectedImpact: "medium",
  businessImpact: "Addressing this improves the site's AI visibility and its chances of being cited in AI-generated answers.",
};

/** Merges the static metadata for a check key (falling back to category
 * defaults, then a neutral default) — every AEO check gets a full set of
 * consulting fields regardless of whether it has a curated entry. */
export function metaForAeoCheck(key: string, category: AeoCategory): AeoMeta {
  return { ...DEFAULT_META, ...CATEGORY_META[category], ...(AEO_META[key] ?? {}) };
}
