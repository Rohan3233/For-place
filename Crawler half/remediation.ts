/**
 * Centralized Issue Remediation Knowledge Base
 *
 * Every issue that can appear in a FixFirst report maps to a structured
 * RemediationEntry here. The audit engine determines WHETHER an issue
 * exists; this module determines HOW that issue is explained and fixed.
 *
 * The PDF renderer, CSV export, Quick Wins, and 30-Day Action Plan all
 * consume this data — never duplicating explanation/fix text inline.
 */

export interface PlatformInstructions {
  wordpress: string;
  shopify: string;
  rawHtml: string;
}

export interface RemediationEntry {
  /** Machine-readable issue flag (matches templates.ts keys). */
  issueId: string;
  /** Human-readable issue name. */
  issueName: string;
  /** High-level category for grouping. */
  category:
    | "technical_seo"
    | "on_page_seo"
    | "content"
    | "crawlability"
    | "indexability"
    | "internal_linking"
    | "images"
    | "structured_data"
    | "performance"
    | "mobile"
    | "accessibility"
    | "aeo"
    | "geo"
    | "url_structure"
    | "security";

  /** Plain-English explanation — assumes the reader knows nothing about SEO. */
  whatItMeans: string;

  /** Practical business/SEO consequences — only what is relevant to this issue. */
  whyItMatters: string;

  /** Concrete implementation instructions. */
  howToFix: string;

  /** Numbered step-by-step implementation steps. */
  stepByStepFix: string[];

  /** ❌ Bad example (where applicable). */
  exampleBad: string | null;

  /** ✅ Good example (where applicable). */
  exampleGood: string | null;

  /** How to confirm the fix landed. */
  verificationMethod: string;

  /** Measurable condition that means the issue is resolved. */
  successCondition: string;

  /** Technical difficulty rating. */
  technicalDifficulty: "Easy" | "Moderate" | "Advanced";

  /** Estimated effort classification. */
  estimatedEffort: "<15 minutes" | "15–30 minutes" | "30–60 minutes" | "1–2 hours" | "2+ hours" | "Varies";

  /** Concise developer-focused instructions (only when they add value). */
  developerInstructions: string | null;

  /** Platform-specific instructions (only when relevant and platform is known). */
  platformInstructions: PlatformInstructions | null;
}

/**
 * The centralized remediation knowledge base. Every issue flag that can
 * appear in a report MUST have an entry here. The PDF renderer and CSV
 * export consume this data — never writing explanation/fix text inline.
 *
 * Entries that only need basic remediation data (no step-by-step, no
 * platform instructions) still have ALL fields present — the renderer
 * simply omits empty sections, keeping the card compact.
 */
export const REMEDIATION_KB: Record<string, RemediationEntry> = {
  // =========================================================================
  // MISSING TITLE
  // =========================================================================
  missing_title: {
    issueId: "missing_title",
    issueName: "Missing title tag",
    category: "on_page_seo",
    whatItMeans:
      "This page has no <title> tag in its HTML. The title tag is the blue clickable headline you see in Google search results. Without one, search engines generate their own title — and it's rarely what you'd choose.",
    whyItMatters:
      "The title tag is the single most important on-page SEO signal. It tells search engines what the page is about and directly influences whether someone clicks your result. Without a title, you lose control over how your page appears in search — and most users won't click a result with a vague, auto-generated headline.",
    howToFix:
      "Open each affected page in your CMS, locate the SEO or Search Appearance section, and write a unique title tag between 50–60 characters. The title should accurately describe the page's main topic and include the primary keyword the page targets.",
    stepByStepFix: [
      "Open the affected page in your CMS editor.",
      "Locate the SEO settings section (often labeled 'SEO', 'Search Appearance', or 'Page Title').",
      "Write a unique, descriptive title between 50–60 characters.",
      "Include the primary keyword or topic the page addresses.",
      "Save the page and publish the change.",
    ],
    exampleBad: "Welcome to Our Website",
    exampleGood: "Technical SEO Audit Services | FixFirst",
    verificationMethod:
      "View the page source (right-click → View Page Source) and search for <title>. Confirm a descriptive title between 50–60 characters is present.",
    successCondition:
      "Every indexable page has one unique, descriptive title tag between 50–60 characters.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Add a self-referencing <title> tag inside the <head> of each affected page.\n\nExample:\n<title>Primary Keyword – Supporting Context | Brand Name</title>",
    platformInstructions: {
      wordpress:
        "Edit the page → open the Yoast/Rank Math SEO plugin section → update the 'SEO Title' field → save the page.",
      shopify:
        "Products/Online Store → select the page → Search engine listing → Edit title → save.",
      rawHtml:
        "Add inside <head>:\n<title>Your Page Title Here (50–60 chars)</title>",
    },
  },

  // =========================================================================
  // TITLE LENGTH OUT OF RANGE
  // =========================================================================
  title_length_out_of_range: {
    issueId: "title_length_out_of_range",
    issueName: "Title tag length issue",
    category: "on_page_seo",
    whatItMeans:
      "This page has a title tag, but it's either too short (under 50 characters) or too long (over 60 characters). Google typically displays the first 50–60 characters of a title in search results — shorter titles waste that space, and longer ones get cut off mid-word.",
    whyItMatters:
      "A title that's too short wastes valuable space that could earn a click. A title that's too long gets truncated in search results, often cutting off the part that was supposed to earn the click. Both reduce your click-through rate.",
    howToFix:
      "Rewrite the title to be between 50–60 characters. For short titles, add your primary keyword or a compelling descriptor. For long titles, trim redundant words or move the brand name to the end (where it can be safely truncated).",
    stepByStepFix: [
      "Open the affected page in your CMS.",
      "Locate the SEO settings section.",
      "Review the current title length.",
      "If too short: add the primary keyword or a compelling descriptor.",
      "If too long: trim redundant words, move the brand name to the end.",
      "Save and publish.",
    ],
    exampleBad: "Products (too short, 9 characters)",
    exampleGood: "Technical SEO Audit Services – FixFirst (54 characters)",
    verificationMethod:
      "View page source and count the characters in the <title> tag. Aim for 50–60 characters.",
    successCondition: "Every title tag is between 50 and 60 characters.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Ensure the <title> tag content is between 50 and 60 characters.\n\nFormat: Primary Keyword – Supporting Context | Brand",
    platformInstructions: {
      wordpress:
        "Edit the page → Yoast/Rank Math SEO section → adjust the SEO Title field → check the character counter → save.",
      shopify:
        "Products/Online Store → select the page → Search engine listing → Edit title → check length → save.",
      rawHtml:
        "Edit the <title> tag content to be between 50 and 60 characters.",
    },
  },

  // =========================================================================
  // MISSING META DESCRIPTION
  // =========================================================================
  missing_meta_description: {
    issueId: "missing_meta_description",
    issueName: "Missing meta description",
    category: "on_page_seo",
    whatItMeans:
      "This page has no meta description — the short paragraph that appears below your title in Google search results. Without one, Google generates its own snippet by pulling random text from the page, which rarely reads well.",
    whyItMatters:
      "The meta description is your elevator pitch in search results. It's your chance to tell searchers exactly why they should click YOUR result instead of the nine others on the page. Without one, Google picks the snippet for you — and it's usually a random sentence that doesn't sell the click.",
    howToFix:
      "Write a unique meta description between 120–160 characters for each affected page. The description should summarize the page's content and include a reason to click — a benefit, a key fact, or a call to action.",
    stepByStepFix: [
      "Open the affected page in your CMS.",
      "Locate the SEO settings section (often labeled 'Meta Description' or 'Search Appearance').",
      "Write a compelling description between 120–160 characters.",
      "Include what the page offers and why someone should click.",
      "Save and publish.",
    ],
    exampleBad: null,
    exampleGood:
      "Get a comprehensive SEO audit with actionable fixes. FixFirst identifies critical issues and provides step-by-step remediation guidance.",
    verificationMethod:
      "View the page source and search for meta name=\"description\". Confirm a unique, descriptive paragraph between 120–160 characters is present.",
    successCondition:
      "Every indexable page has one unique, compelling meta description between 120–160 characters.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Add inside <head>:\n<meta name=\"description\" content=\"A compelling 120–160 character summary of this page.\" />",
    platformInstructions: {
      wordpress:
        "Edit the page → Yoast/Rank Math SEO section → update the 'Meta Description' field → save.",
      shopify:
        "Products/Online Store → select the page → Search engine listing → Edit description → save.",
      rawHtml:
        'Add inside <head>:\n<meta name="description" content="Your 120–160 character description here." />',
    },
  },

  // =========================================================================
  // META DESCRIPTION LENGTH OUT OF RANGE
  // =========================================================================
  meta_description_length_out_of_range: {
    issueId: "meta_description_length_out_of_range",
    issueName: "Meta description length issue",
    category: "on_page_seo",
    whatItMeans:
      "This page has a meta description, but it's either too short (under 120 characters) or too long (over 160 characters). Google typically displays about 155–160 characters of a meta description in search results.",
    whyItMatters:
      "A description that's too short wastes an opportunity to pitch the page. Too long, and search engines truncate it mid-sentence — often cutting off the call to action or the key benefit.",
    howToFix:
      "Rewrite the description to be between 120–160 characters. Make it compelling and include the page's primary value proposition.",
    stepByStepFix: [
      "Open the affected page in your CMS.",
      "Locate the SEO settings section.",
      "Review the current meta description length.",
      "Rewrite to be between 120–160 characters.",
      "Ensure it includes the page's primary value proposition.",
      "Save and publish.",
    ],
    exampleBad: "We offer SEO services. (30 characters — too short)",
    exampleGood:
      "Comprehensive SEO audits with actionable fixes. FixFirst identifies issues and provides step-by-step guidance for every page. (127 characters)",
    verificationMethod:
      "View page source and count the characters in the meta description. Aim for 120–160 characters.",
    successCondition:
      "Every meta description is between 120 and 160 characters.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      'Ensure the meta description content is between 120 and 160 characters.\n\n<meta name="description" content="Your 120–160 character description." />',
    platformInstructions: {
      wordpress:
        "Edit the page → Yoast/Rank Math SEO section → adjust the Meta Description field → check the character counter → save.",
      shopify:
        "Products/Online Store → select the page → Search engine listing → Edit description → check length → save.",
      rawHtml:
        'Adjust the content attribute of the meta description tag to be between 120–160 characters.',
    },
  },

  // =========================================================================
  // MISSING H1
  // =========================================================================
  missing_h1: {
    issueId: "missing_h1",
    issueName: "Missing H1 heading",
    category: "on_page_seo",
    whatItMeans:
      "This page has no H1 heading — the main heading tag (<h1>) that tells search engines and readers what the page is primarily about. The H1 is like the title of a book chapter: it should clearly describe the content that follows.",
    whyItMatters:
      "The H1 is one of the strongest signals to search engines about a page's topic. Pages without an H1 tend to rank for vaguer terms because search engines have to guess what the page is really about.",
    howToFix:
      "Add a single, clear H1 heading that accurately describes the page's main topic. The H1 should be visible on the page (not hidden) and should naturally include the primary keyword or topic.",
    stepByStepFix: [
      "Open the affected page in your CMS.",
      "Look for the main heading at the top of the page content.",
      "If no H1 exists, add one that clearly describes the page's main topic.",
      "Ensure it's the only H1 on the page.",
      "Save and publish.",
    ],
    exampleBad: "(no heading at the top of the page)",
    exampleGood: "How to Run a Technical SEO Audit in 2026",
    verificationMethod:
      "View the page source and search for <h1>. Confirm exactly one H1 tag exists with descriptive content.",
    successCondition:
      "Every indexable page has exactly one H1 heading that clearly describes the page's main topic.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Add a single <h1> tag near the top of the page's main content area:\n\n<h1>Your Main Page Heading</h1>",
    platformInstructions: {
      wordpress:
        "Edit the page → ensure the main title block is set to Heading 1 (H1) → save.",
      shopify:
        "Products/Online Store → select the page → ensure the main heading is wrapped in an <h1> tag → save.",
      rawHtml:
        "Add a single <h1> tag near the top of the page's main content:\n<h1>Your Main Page Heading</h1>",
    },
  },

  // =========================================================================
  // MULTIPLE H1
  // =========================================================================
  multiple_h1: {
    issueId: "multiple_h1",
    issueName: "Multiple H1 headings",
    category: "on_page_seo",
    whatItMeans:
      "This page has more than one H1 heading. Each page should have exactly one H1 — the primary heading that defines the page's main topic. Additional headings should use H2, H3, or lower tags.",
    whyItMatters:
      "Multiple H1s dilute the page's topical focus and confuse search engines about what the page is primarily about. It's like a book with five different titles on the cover — none of them stands out.",
    howToFix:
      "Keep the single most important H1 that describes the page's main topic. Change all other H1 tags to H2 (for major sections) or H3 (for subsections).",
    stepByStepFix: [
      "View the page source and search for all <h1> tags.",
      "Identify which H1 best describes the page's main topic.",
      "Change all other H1 tags to <h2> or <h3> as appropriate.",
      "Save and publish.",
    ],
    exampleBad: "<h1>About Us</h1>\n<h1>Our Services</h1>",
    exampleGood: "<h1>About FixFirst</h1>\n<h2>Our Services</h2>",
    verificationMethod:
      "View the page source and confirm exactly one <h1> tag exists.",
    successCondition: "Every page has exactly one H1 heading.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Change all <h1> tags except the primary one to <h2>:\n\n<h1>Primary Heading</h1>\n<h2>Secondary Section</h2>",
    platformInstructions: {
      wordpress:
        "Edit the page → in the block editor, select each extra H1 heading → change it to H2 in the block settings → save.",
      shopify:
        "Products/Online Store → select the page → edit the HTML → change extra <h1> tags to <h2> → save.",
      rawHtml:
        "Change all <h1> tags except the primary one to <h2> or <h3>.",
    },
  },

  // =========================================================================
  // MISSING H2
  // =========================================================================
  missing_h2: {
    issueId: "missing_h2",
    issueName: "No H2 subheadings",
    category: "on_page_seo",
    whatItMeans:
      "This page has no H2 subheadings to organize its content. H2s break the page into scannable sections — like chapter headings in a book. Without them, the page reads as one unbroken wall of text.",
    whyItMatters:
      "H2s help both readers and search engines understand the page's structure and subtopics. A page with only an H1 and no structure underneath often reads as thin or unorganized, reducing topical depth signals.",
    howToFix:
      "Break the page's content into logical sections, each introduced by an H2 heading. Each H2 should describe a distinct subtopic that supports the main H1.",
    stepByStepFix: [
      "Read through the page content and identify 3–5 distinct sections or topics.",
      "Add an H2 heading at the start of each section.",
      "Make each H2 descriptive of the section it introduces.",
      "Save and publish.",
    ],
    exampleBad: "(long unbroken paragraphs with no headings)",
    exampleGood:
      "<h2>What Is Technical SEO?</h2>\n<p>Content about technical SEO...</p>\n<h2>Why It Matters</h2>\n<p>Content about importance...</p>",
    verificationMethod:
      "View the page source and confirm at least one <h2> tag exists with descriptive content.",
    successCondition:
      "Every content page has H2 subheadings that organize its content into logical sections.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "30–60 minutes",
    developerInstructions:
      "Add <h2> tags at the start of each major content section:\n\n<h2>Subtopic Name</h2>\n<p>Content...</p>",
    platformInstructions: {
      wordpress:
        "Edit the page → add Heading blocks set to H2 at each section break → save.",
      shopify:
        "Products/Online Store → select the page → add <h2> tags in the HTML editor → save.",
      rawHtml:
        "Add <h2> tags at the start of each major content section.",
    },
  },

  // =========================================================================
  // THIN CONTENT
  // =========================================================================
  thin_content: {
    issueId: "thin_content",
    issueName: "Thin content",
    category: "content",
    whatItMeans:
      "This page has very little text content — fewer than about 300 words. Search engines need enough content to understand what the page is about and whether it's a useful answer to a search query.",
    whyItMatters:
      "Pages with very little text rarely rank because there's simply not enough for search engines to understand the page is a thorough, useful answer to a search query. Users also tend to leave thin pages quickly, which sends negative engagement signals.",
    howToFix:
      "Expand the page with more substantive, relevant content. Aim for at least 300–500 words of unique, useful content that thoroughly addresses the page's topic. Alternatively, if the page doesn't warrant its own content, consolidate it into a more complete page.",
    stepByStepFix: [
      "Read the page and identify what information is missing or incomplete.",
      "Research what top-ranking competitors cover on the same topic.",
      "Add substantive, original content that addresses the topic thoroughly.",
      "Aim for at least 300–500 words of unique, useful content.",
      "If the page doesn't warrant standalone content, consider consolidating it.",
      "Save and publish.",
    ],
    exampleBad: "(a page with only 50 words and no substantive information)",
    exampleGood:
      "A comprehensive page covering the topic with 800+ words of original, useful content organized with H2 headings.",
    verificationMethod:
      "Use a word count tool to confirm the page has at least 300–500 words of unique, substantive content.",
    successCondition:
      "Every indexable page has at least 300–500 words of unique, substantive content that thoroughly addresses its topic.",
    technicalDifficulty: "Advanced",
    estimatedEffort: "2+ hours",
    developerInstructions: null,
    platformInstructions: null,
  },

  // =========================================================================
  // MISSING CANONICAL
  // =========================================================================
  missing_canonical: {
    issueId: "missing_canonical",
    issueName: "Missing canonical tag",
    category: "technical_seo",
    whatItMeans:
      "This page has no canonical tag. A canonical tag tells search engines which version of a page is the 'real' one when multiple URLs can access the same content (with/without trailing slashes, with tracking parameters, etc.).",
    whyItMatters:
      "Without a canonical tag, search engines have to guess which version of the page to index. This can split ranking signals across duplicate URLs, weakening the page's overall search performance.",
    howToFix:
      "Add a self-referencing canonical tag that points to this page's preferred URL. The canonical URL should be the absolute HTTPS version of the page with a trailing slash (if your site uses them).",
    stepByStepFix: [
      "Open the affected page's HTML source.",
      "Inside the <head> section, add a canonical tag pointing to the page's preferred URL.",
      "Use the absolute HTTPS URL (e.g., https://example.com/page/).",
      "Save and publish.",
    ],
    exampleBad: "(no canonical tag present)",
    exampleGood:
      '<link rel="canonical" href="https://example.com/page/" />',
    verificationMethod:
      "View the page source and confirm a <link rel=\"canonical\"> tag exists pointing to the correct preferred URL.",
    successCondition:
      "Every indexable page has a self-referencing canonical tag pointing to its preferred HTTPS URL.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Add inside <head>:\n<link rel=\"canonical\" href=\"https://example.com/preferred-page-url/\" />",
    platformInstructions: {
      wordpress:
        "Edit the page → Yoast/Rank Math SEO section → ensure the Canonical URL field is set to the page's own URL → save.",
      shopify:
        "Products/Online Store → select the page → Search engine listing → verify the canonical URL → save.",
      rawHtml:
        'Add inside <head>:\n<link rel="canonical" href="https://example.com/page/" />',
    },
  },

  // =========================================================================
  // CANONICAL MISMATCH
  // =========================================================================
  canonical_mismatch: {
    issueId: "canonical_mismatch",
    issueName: "Canonical tag mismatch",
    category: "technical_seo",
    whatItMeans:
      "This page's canonical tag points to a different URL than the page itself. If this is unintentional, search engines may not index this page — they'll treat the other URL as the authoritative version.",
    whyItMatters:
      "If the canonical points to the wrong URL, this page may not appear in search results at all. Search engines will treat the canonical target as the 'real' page and may ignore this one entirely.",
    howToFix:
      "Verify whether the canonical target is correct. If this page should be indexed on its own, change the canonical to point to itself (self-referencing). If the canonical target is intentionally different, confirm that's the desired behavior.",
    stepByStepFix: [
      "View the page source and note the current canonical URL.",
      "Determine whether the canonical target is the correct page.",
      "If incorrect: update the canonical to point to this page's own preferred URL.",
      "If intentional: verify the canonical target is accessible and indexable.",
      "Save and publish.",
    ],
    exampleBad:
      '<link rel="canonical" href="https://example.com/wrong-page/" /> (on https://example.com/correct-page/)',
    exampleGood:
      '<link rel="canonical" href="https://example.com/correct-page/" />',
    verificationMethod:
      "View the page source and confirm the canonical URL matches the page's own preferred URL.",
    successCondition:
      "Every page's canonical tag points to the correct preferred URL.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Ensure the canonical tag matches the page's preferred URL:\n<link rel=\"canonical\" href=\"https://example.com/this-page/\" />",
    platformInstructions: {
      wordpress:
        "Edit the page → Yoast/Rank Math SEO section → correct the Canonical URL field → save.",
      shopify:
        "Products/Online Store → select the page → Search engine listing → correct the canonical URL → save.",
      rawHtml:
        "Correct the href attribute of the canonical tag to point to the page's own preferred URL.",
    },
  },

  // =========================================================================
  // NOINDEX META TAG
  // =========================================================================
  noindex_meta_tag: {
    issueId: "noindex_meta_tag",
    issueName: "Page blocked from indexing (noindex meta tag)",
    category: "indexability",
    whatItMeans:
      "This page has a meta robots tag with 'noindex', which tells search engines NOT to include this page in search results. The page exists and loads fine for visitors, but it's invisible to Google and other search engines.",
    whyItMatters:
      "This page cannot appear in search results until the noindex tag is removed. Any content value it holds is currently wasted — it's effectively invisible to organic search traffic.",
    howToFix:
      "Remove the noindex directive from the page's meta robots tag, unless this page is intentionally excluded (e.g., staging, admin, or thank-you pages).",
    stepByStepFix: [
      "Open the page's HTML source.",
      "Find the <meta name=\"robots\" content=\"noindex\" /> tag.",
      "Remove the noindex directive (change to 'index, follow' or remove the tag entirely).",
      "Save and publish.",
      "Request re-indexing in Google Search Console.",
    ],
    exampleBad:
      '<meta name="robots" content="noindex" />',
    exampleGood:
      '<meta name="robots" content="index, follow" />',
    verificationMethod:
      "View the page source and confirm the noindex directive is gone. Request re-indexing in Google Search Console.",
    successCondition:
      "All pages that should be in search results have no noindex directive.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Remove or change the noindex meta tag:\n<meta name=\"robots\" content=\"index, follow\" />",
    platformInstructions: {
      wordpress:
        "Edit the page → Yoast/Rank Math SEO section → ensure 'Allow search engines to show this page' is enabled → save.",
      shopify:
        "Products/Online Store → select the page → ensure 'Search engine listing' is not hidden → save.",
      rawHtml:
        "Remove or change the noindex meta tag to 'index, follow'.",
    },
  },

  // =========================================================================
  // NOINDEX X-ROBOTS-TAG
  // =========================================================================
  noindex_x_robots_tag: {
    issueId: "noindex_x_robots_tag",
    issueName: "Page blocked from indexing (X-Robots-Tag header)",
    category: "indexability",
    whatItMeans:
      "This page is blocked from indexing by an X-Robots-Tag HTTP response header — the server is telling search engines not to index this page. This is harder to spot than a meta tag because it doesn't show up when viewing page source.",
    whyItMatters:
      "Same effect as a noindex meta tag: total exclusion from search results. But because it's in the HTTP header rather than the HTML, it's often overlooked by content teams.",
    howToFix:
      "Check your server, CDN, or .htaccess/nginx configuration and remove the noindex directive from the X-Robots-Tag response header.",
    stepByStepFix: [
      "Use a header-checking tool (e.g., curl -I) to inspect the response headers.",
      "Find the X-Robots-Tag header with the noindex directive.",
      "Remove the noindex directive from your server/CDN configuration.",
      "Save the configuration and restart the server if needed.",
      "Re-check the headers to confirm the noindex is gone.",
    ],
    exampleBad: "X-Robots-Tag: noindex",
    exampleGood: "(header removed entirely, or changed to 'index, follow')",
    verificationMethod:
      "Use curl -I to check the response headers and confirm the X-Robots-Tag noindex directive is gone.",
    successCondition:
      "The X-Robots-Tag header no longer contains a noindex directive on pages that should be indexed.",
    technicalDifficulty: "Advanced",
    estimatedEffort: "30–60 minutes",
    developerInstructions:
      "Remove the X-Robots-Tag: noindex header from server configuration:\n\n# Apache (.htaccess):\nHeader unset X-Robots-Tag\n\n# Nginx:\n# Remove the 'add_header X-Robots-Tag \"noindex\"' directive",
    platformInstructions: {
      wordpress:
        "Check your .htaccess file or server configuration for X-Robots-Tag headers. Also check SEO plugin settings for header-level noindex options.",
      shopify:
        "Contact Shopify support — X-Robots-Tag headers are typically set at the platform level.",
      rawHtml:
        "Remove the X-Robots-Tag: noindex header from your server configuration (.htaccess, nginx.conf, or CDN settings).",
    },
  },

  // =========================================================================
  // MISSING ALT TEXT
  // =========================================================================
  missing_alt_text: {
    issueId: "missing_alt_text",
    issueName: "Images missing alt text",
    category: "images",
    whatItMeans:
      "One or more images on this page are missing alt text — the text description that appears when the image can't load and that screen readers read aloud for visually impaired visitors.",
    whyItMatters:
      "Alt text helps search engines understand image content (useful for image search traffic) and is essential for visually impaired visitors using screen readers. Without it, the page is less accessible and misses image-search traffic.",
    howToFix:
      "Add descriptive alt text to every image that conveys meaning. Describe what the image shows in a concise phrase. Skip purely decorative images (use alt=\"\" for those).",
    stepByStepFix: [
      "Identify every image on the page that conveys meaningful content.",
      "For each image, write a concise alt text describing what it shows.",
      "For purely decorative images, use alt=\"\" (empty alt).",
      "Update the HTML or CMS image settings.",
      "Save and publish.",
    ],
    exampleBad: '<img src="photo.jpg" alt="">',
    exampleGood:
      '<img src="photo.jpg" alt="Team collaborating on an SEO audit report">',
    verificationMethod:
      "View the page source and confirm every meaningful image has descriptive alt text.",
    successCondition:
      "Every meaningful image has descriptive alt text. Decorative images use alt=\"\".",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Add descriptive alt text to each <img> tag:\n<img src=\"photo.jpg\" alt=\"Describe what this image shows\" />\n\nFor decorative images:\n<img src=\"divider.svg\" alt=\"\" />",
    platformInstructions: {
      wordpress:
        "Edit the page → select each image → in the block settings, add Alt Text → save.",
      shopify:
        "Products/Online Store → select the product/page → edit each image → add Alt Text → save.",
      rawHtml:
        "Add an alt attribute to each <img> tag describing the image content.",
    },
  },

  // =========================================================================
  // MISSING SCHEMA MARKUP
  // =========================================================================
  missing_schema_markup: {
    issueId: "missing_schema_markup",
    issueName: "Missing schema markup (structured data)",
    category: "structured_data",
    whatItMeans:
      "This page has no structured data (Schema.org JSON-LD). Structured data is a standardized format that tells search engines exactly what a page represents — a product, article, FAQ, local business, etc. — in a machine-readable way.",
    whyItMatters:
      "Without structured data, the page misses out on rich results (star ratings, FAQ dropdowns, breadcrumbs, product details) in search. It also makes it harder for AI answer engines to extract and cite the page's facts with confidence.",
    howToFix:
      "Add relevant JSON-LD structured data that matches the page's actual content. Common types include Organization, Article, Product, FAQPage, and LocalBusiness.",
    stepByStepFix: [
      "Determine the page's primary content type (article, product, FAQ, local business, etc.).",
      "Choose the appropriate Schema.org type (Article, Product, FAQPage, etc.).",
      "Create a JSON-LD script block with the required and recommended properties.",
      "Add the script block inside the <head> section of the page.",
      "Validate using Google's Rich Results Test.",
      "Save and publish.",
    ],
    exampleBad: "(no structured data present)",
    exampleGood:
      '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "FixFirst",\n  "url": "https://fixfirst.com"\n}\n</script>',
    verificationMethod:
      "Use Google's Rich Results Test (search.google.com/test/rich-results) to confirm structured data is valid and detected.",
    successCondition:
      "Relevant pages have valid JSON-LD structured data matching their content type.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "30–60 minutes",
    developerInstructions:
      "Add a JSON-LD script block inside <head>:\n\n<script type=\"application/ld+json\">\n{\n  \"@context\": \"https://schema.org\",\n  \"@type\": \"Organization\",\n  \"name\": \"Your Business Name\",\n  \"url\": \"https://example.com\"\n}\n</script>",
    platformInstructions: {
      wordpress:
        "Use a schema plugin (Schema Pro, Yoast) or add a custom code block in the page's <head> section.",
      shopify:
        "Use a schema app from the Shopify App Store, or add JSON-LD in the theme's layout file.",
      rawHtml:
        "Add a <script type=\"application/ld+json\"> block inside the <head> section.",
    },
  },

  // =========================================================================
  // INVALID SCHEMA MARKUP
  // =========================================================================
  invalid_schema_markup: {
    issueId: "invalid_schema_markup",
    issueName: "Invalid structured data",
    category: "structured_data",
    whatItMeans:
      "This page has structured data, but it contains invalid JSON or a missing/incorrect @type field. Search engines will most likely ignore it entirely.",
    whyItMatters:
      "Any rich-result benefit from this markup is currently being lost to a syntax error. The structured data exists but is not being recognized.",
    howToFix:
      "Validate the JSON-LD with Google's Rich Results Test, identify the syntax or @type error, and fix it.",
    stepByStepFix: [
      "Open the page's HTML source and find the JSON-LD script block.",
      "Copy the JSON content and paste it into a JSON validator.",
      "Fix any syntax errors (missing commas, unclosed brackets, etc.).",
      "Ensure the @type field is present and valid.",
      "Validate with Google's Rich Results Test.",
      "Save and publish.",
    ],
    exampleBad:
      '{\n  "@context": "https://schema.org"\n  "name": "Page Name"\n} (missing comma)',
    exampleGood:
      '{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "Page Name"\n}',
    verificationMethod:
      "Validate with Google's Rich Results Test. Confirm the markup is valid and the schema type is detected.",
    successCondition:
      "All structured data validates successfully with no syntax or @type errors.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Fix the JSON syntax and ensure @type is present:\n\n<script type=\"application/ld+json\">\n{\n  \"@context\": \"https://schema.org\",\n  \"@type\": \"WebPage\",\n  \"name\": \"Page Title\"\n}\n</script>",
    platformInstructions: {
      wordpress:
        "Edit the page or theme template → find the JSON-LD block → fix the syntax → validate with Rich Results Test → save.",
      shopify:
        "Edit the theme's layout or page template → find the JSON-LD block → fix the syntax → validate.",
      rawHtml:
        "Fix the JSON syntax in the script type=\"application/ld+json\"> block and validate.",
    },
  },

  // =========================================================================
  // BROKEN LINKS
  // =========================================================================
  broken_links: {
    issueId: "broken_links",
    issueName: "Broken links",
    category: "technical_seo",
    whatItMeans:
      "One or more internal links on the site point to pages that return an error (typically 404 Not Found) or fail to load. These are links your own site is sending visitors and search engines to — and the destination doesn't exist.",
    whyItMatters:
      "Broken links waste crawl budget (search engines spend time requesting dead URLs instead of discovering real content), create dead ends for visitors, and leak link equity that should flow to working pages.",
    howToFix:
      "For each broken link: if the destination page was moved, update the link to the new URL or add a redirect. If the page was removed intentionally, update or remove the link. If the page should exist but doesn't, restore or recreate it.",
    stepByStepFix: [
      "Review the list of broken links in the CSV export.",
      "For each broken URL, determine: was the page moved, removed, or does it need to be recreated?",
      "If moved: update the internal link to point to the new URL, or add a 301 redirect.",
      "If removed: update or remove the internal link from the source page.",
      "If it should exist: recreate the page at the expected URL.",
      "Save all changes and re-crawl to verify.",
    ],
    exampleBad: "Link to /old-page/ that returns 404",
    exampleGood: "Link updated to /new-page/ (or redirect added from /old-page/ to /new-page/)",
    verificationMethod:
      "Re-run the audit or use a link checker to confirm the previously broken links now resolve to working pages.",
    successCondition:
      "All internal links point to pages that return HTTP 200.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "1–2 hours",
    developerInstructions:
      "Fix each broken internal link by either:\n1. Updating the href to the correct new URL\n2. Adding a 301 redirect from the old URL to the new one\n3. Restoring the missing page",
    platformInstructions: {
      wordpress:
        "Use a broken link checker plugin (Broken Link Checker) or manually update links in the editor.",
      shopify:
        "Search for the broken URL in your pages/products → update the link or add a redirect in Online Store → Navigation.",
      rawHtml:
        "Update the href attribute of each broken link, or add a 301 redirect in .htaccess/nginx.",
    },
  },

  // =========================================================================
  // REDIRECT CHAINS
  // =========================================================================
  excessive_redirects: {
    issueId: "excessive_redirects",
    issueName: "Excessive redirects",
    category: "technical_seo",
    whatItMeans:
      "Some URLs on the site go through 4 or more redirects before reaching the final destination. Each redirect adds a delay (typically 50–150ms per hop) and can confuse search engines about which URL to index.",
    whyItMatters:
      "Excessive redirect chains waste crawl budget, slow down page loads (each hop adds latency), and can leak link equity — the ranking value that flows through redirects gets diluted with each hop.",
    howToFix:
      "Update internal links and redirects to point directly to the final destination URL, eliminating unnecessary intermediate hops.",
    stepByStepFix: [
      "Review the redirect chains in the report.",
      "Identify the final destination URL for each chain.",
      "Update all internal links to point directly to the final URL.",
      "Update redirects to go directly from the original URL to the final URL (eliminating intermediate hops).",
      "Save and publish.",
    ],
    exampleBad:
      "/old-page → /moved-page → /final-page (3 hops)",
    exampleGood:
      "/old-page → /final-page (1 hop, direct)",
    verificationMethod:
      "Use a redirect checker tool to trace each URL and confirm it resolves in 1–2 hops maximum.",
    successCondition:
      "All redirect chains are collapsed to 2 or fewer hops.",
    technicalDifficulty: "Advanced",
    estimatedEffort: "1–2 hours",
    developerInstructions:
      "Collapse multi-hop chains by updating redirects to point directly to the final destination:\n\n# Apache (.htaccess):\nRedirect 301 /old-page /final-page\n\n# Nginx:\nrewrite ^/old-page$ /final-page permanent;",
    platformInstructions: {
      wordpress:
        "Use a redirect plugin (Redirection, Rank Math) → add a direct 301 redirect from the original URL to the final destination → remove intermediate redirects.",
      shopify:
        "Online Store → Navigation → URL Redirects → add direct redirect from original to final URL.",
      rawHtml:
        "Update .htaccess or nginx.conf to redirect directly to the final destination.",
    },
  },

  // =========================================================================
  // MISSING SITEMAP
  // =========================================================================
  missing_sitemap: {
    issueId: "missing_sitemap",
    issueName: "No sitemap.xml found",
    category: "crawlability",
    whatItMeans:
      "The site doesn't have a sitemap.xml file. A sitemap is a direct index of every URL you want search engines to know about — it's like a table of contents for your website.",
    whyItMatters:
      "Without a sitemap, search engines rely entirely on discovering pages by following links. New, deep, or isolated pages can take much longer to get crawled and indexed — or may never be found at all.",
    howToFix:
      "Generate a sitemap.xml listing your site's important URLs and host it at yourdomain.com/sitemap.xml. Most CMS platforms generate this automatically.",
    stepByStepFix: [
      "Generate a sitemap.xml using your CMS, an SEO plugin, or a sitemap generator tool.",
      "Host the sitemap at yourdomain.com/sitemap.xml.",
      "Submit the sitemap URL in Google Search Console (Settings → Sitemaps).",
      "Verify the sitemap parses without errors.",
    ],
    exampleBad: "(no sitemap.xml found at /sitemap.xml)",
    exampleGood:
      "A sitemap.xml at /sitemap.xml listing all important pages with lastmod dates.",
    verificationMethod:
      "Open yourdomain.com/sitemap.xml in a browser. Submit it in Google Search Console and confirm it parses without errors.",
    successCondition:
      "A valid sitemap.xml exists and is submitted in Google Search Console.",
    technicalDifficulty: "Easy",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Generate and host a sitemap.xml at the site root. For large sites, create a sitemap index pointing to multiple sitemaps.",
    platformInstructions: {
      wordpress:
        "Install Yoast or Rank Math → enable XML sitemaps in the plugin settings → verify at /sitemap.xml.",
      shopify:
        "Shopify auto-generates a sitemap at /sitemap.xml. Submit this URL in Google Search Console.",
      rawHtml:
        "Generate a sitemap.xml using a tool like XML-Sitemaps.com, upload it to the site root, and submit in Google Search Console.",
    },
  },

  // =========================================================================
  // MISSING LAZY LOADING
  // =========================================================================
  missing_lazy_loading: {
    issueId: "missing_lazy_loading",
    issueName: "Images missing lazy loading",
    category: "performance",
    whatItMeans:
      "Below-the-fold images on this page load eagerly (immediately) instead of lazily. This means the browser tries to download every image at once, even images the visitor hasn't scrolled to yet.",
    whyItMatters:
      "Eager loading wastes bandwidth and slows the initial page render, especially on image-heavy pages. This directly affects Core Web Vitals metrics like LCP and can hurt both user experience and search rankings.",
    howToFix:
      "Add loading=\"lazy\" to images that appear below the fold. Keep above-the-fold images (hero images, logos) loading eagerly for fastest display.",
    stepByStepFix: [
      "Identify images that appear below the fold (not visible on initial page load).",
      "Add loading=\"lazy\" to each below-the-fold image tag.",
      "Keep above-the-fold images (hero, logo) without lazy loading.",
      "Save and publish.",
    ],
    exampleBad:
      '<img src="photo.jpg" alt="...">',
    exampleGood:
      '<img src="photo.jpg" alt="..." loading="lazy">',
    verificationMethod:
      "View the page source and confirm below-the-fold images have loading=\"lazy\". Re-run PageSpeed Insights to check performance improvement.",
    successCondition:
      "All below-the-fold images have loading=\"lazy\". Above-the-fold images load eagerly.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      'Add loading="lazy" to below-the-fold images:\n<img src="photo.jpg" alt="..." loading="lazy" />',
    platformInstructions: {
      wordpress:
        "Most modern themes add lazy loading automatically. If not, install a lazy loading plugin or add loading=\"lazy\" manually in the editor's HTML mode.",
      shopify:
        "Shopify themes typically add lazy loading by default. Verify in the theme code that images below the fold have loading=\"lazy\".",
      rawHtml:
        'Add loading="lazy" to below-the-fold images in the HTML.',
    },
  },

  // =========================================================================
  // ORPHAN PAGES
  // =========================================================================
  orphan_page: {
    issueId: "orphan_page",
    issueName: "Orphan page (no internal links point to it)",
    category: "internal_linking",
    whatItMeans:
      "This page has no internal links pointing to it from other pages on the site. It can only be found through the sitemap or an external link — visitors and search engines can't discover it through normal site navigation.",
    whyItMatters:
      "Internal links are one of the main ways search engines discover pages and flow ranking authority. An orphan page gets zero internal link equity, making it much harder to rank.",
    howToFix:
      "Add at least one relevant internal link to this page from another page on the site — from a related blog post, a hub page, or the site navigation.",
    stepByStepFix: [
      "Identify the orphan page and its topic.",
      "Find a relevant existing page that could naturally link to it.",
      "Add a contextual internal link from the existing page to the orphan page.",
      "Consider adding it to the site navigation or a hub page if it's important.",
      "Save and publish.",
    ],
    exampleBad:
      "(no page links to this URL)",
    exampleGood:
      "A contextual link from a related blog post: 'Learn more about <a href=\"/orphan-page/\">our technical audit process</a>.'",
    verificationMethod:
      "Re-crawl the site and confirm the page now has at least one inbound internal link.",
    successCondition:
      "Every important page has at least one internal link pointing to it.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Add an internal link from a relevant page:\n<a href=\"/orphan-page/\">Descriptive link text</a>",
    platformInstructions: {
      wordpress:
        "Edit a related page → add a hyperlink to the orphan page within the content → save.",
      shopify:
        "Edit a related product/page → add a link in the content or navigation → save.",
      rawHtml:
        "Add <a> tags linking to the orphan page from relevant existing pages.",
    },
  },

  // =========================================================================
  // OVERSIZED IMAGES
  // =========================================================================
  oversized_images: {
    issueId: "oversized_images",
    issueName: "Oversized images",
    category: "performance",
    whatItMeans:
      "One or more images on the site exceed 200KB in file size — significantly larger than necessary for web display. Large images slow down page load times, especially on mobile connections.",
    whyItMatters:
      "Images over 200KB meaningfully slow down page load, especially on mobile connections. This directly hurts Core Web Vitals (particularly LCP), increases bounce rate, and can lower both search rankings and conversion rates.",
    howToFix:
      "Compress images to reduce their file size without visible quality loss. Convert to modern formats (WebP/AVIF) where possible, and resize images to the dimensions they're actually displayed at.",
    stepByStepFix: [
      "Identify the oversized images in the report.",
      "Use an image compression tool (TinyPNG, Squoosh, or ImageOptim).",
      "Convert to WebP or AVIF format where possible.",
      "Resize to the dimensions the image is actually displayed at.",
      "Replace the original images with the optimized versions.",
      "Save and publish.",
    ],
    exampleBad:
      "(a 2.4MB JPEG hero image displayed at 800×600 pixels)",
    exampleGood:
      "A 45KB WebP image at the same visual quality, sized for actual display dimensions.",
    verificationMethod:
      "Re-run the image size check or use browser DevTools (Network tab) to confirm image file sizes are under 200KB.",
    successCondition:
      "All images are under 200KB, use modern formats where possible, and are sized for their display dimensions.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "30–60 minutes",
    developerInstructions:
      "Compress and resize images:\n1. Use tools like Sharp (Node.js) or ImageMagick to resize and compress\n2. Convert to WebP/AVIF format\n3. Serve appropriately sized images via srcset",
    platformInstructions: {
      wordpress:
        "Install ShortPixel or Imagify plugin → bulk compress existing images → configure auto-optimization for new uploads.",
      shopify:
        "Use Shopify's built-in image optimization, or install an image optimizer app from the App Store.",
      rawHtml:
        "Replace large images with compressed, properly sized versions. Use WebP/AVIF formats.",
    },
  },

  // =========================================================================
  // MISSING IMAGE DIMENSIONS
  // =========================================================================
  missing_image_dimensions: {
    issueId: "missing_image_dimensions",
    issueName: "Images missing width/height attributes",
    category: "performance",
    whatItMeans:
      "Images on this page don't have explicit width and height attributes. Without these, the browser doesn't know how much space an image needs until it loads — causing the page content to shift around as images pop in.",
    whyItMatters:
      "This contributes to Cumulative Layout Shift (CLS), a Core Web Vital that measures visual stability. Pages with high CLS scores provide a poor user experience and may be penalized in search rankings.",
    howToFix:
      "Add explicit width and height attributes to every <img> tag. Use the image's actual dimensions or the dimensions it's displayed at.",
    stepByStepFix: [
      "Identify images without width/height attributes.",
      "Determine each image's display dimensions.",
      "Add width=\"W\" height=\"H\" attributes to each <img> tag.",
      "Save and publish.",
    ],
    exampleBad: '<img src="photo.jpg" alt="...">',
    exampleGood:
      '<img src="photo.jpg" alt="..." width="800" height="600">',
    verificationMethod:
      "View the page source and confirm every <img> tag has width and height attributes. Re-run PageSpeed Insights to check CLS improvement.",
    successCondition:
      "Every image has explicit width and height attributes matching its display dimensions.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      'Add width and height attributes to each <img> tag:\n<img src="photo.jpg" alt="..." width="800" height="600" />',
    platformInstructions: {
      wordpress:
        "Edit the page → select each image → ensure width and height are set in the block settings → save.",
      shopify:
        "Edit the theme's image snippet or page HTML to include width and height attributes.",
      rawHtml:
        "Add width and height attributes to each <img> tag.",
    },
  },

  // =========================================================================
  // URL TOO LONG
  // =========================================================================
  url_too_long: {
    issueId: "url_too_long",
    issueName: "URL is too long",
    category: "url_structure",
    whatItMeans:
      "This page has a URL that's longer than about 75 characters. Very long URLs are harder for users to read, share, and trust, and search engines may truncate them in results.",
    whyItMatters:
      "Long, unwieldy URLs can reduce click-through rate and look less trustworthy when shared or displayed in search results. They also waste crawl budget on unnecessary URL segments.",
    howToFix:
      "Shorten the URL by removing unnecessary words, folders, or parameters. Keep only what's needed to describe the page. Redirect the old URL to the new one.",
    stepByStepFix: [
      "Identify the affected page and its current URL.",
      "Determine the shortest URL that still describes the page.",
      "Create the new, shorter URL.",
      "Set up a 301 redirect from the old URL to the new one.",
      "Update internal links to use the new URL.",
      "Save and publish.",
    ],
    exampleBad:
      "/products/category/shoes/mens-running-shoes/nike-air-max-2026-blue-size-10",
    exampleGood: "/products/nike-air-max-2026",
    verificationMethod:
      "Confirm the old URL redirects to the new, shorter URL. Update internal links.",
    successCondition:
      "All page URLs are under 75 characters and describe the page content.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Shorten the URL and add a 301 redirect from the old URL:\n\n# Apache:\nRedirect 301 /old-long-url /new-short-url\n\n# Nginx:\nrewrite ^/old-long-url$ /new-short-url permanent;",
    platformInstructions: {
      wordpress:
        "Edit the page → change the permalink/slug to a shorter version → WordPress auto-redirects the old URL.",
      shopify:
        "Products/Online Store → select the page → edit the URL handle → Shopify auto-redirects.",
      rawHtml:
        "Shorten the URL slug and add a 301 redirect in your server configuration.",
    },
  },

  // =========================================================================
  // NON OPTIMIZED IMAGE FORMAT
  // =========================================================================
  non_optimized_image_format: {
    issueId: "non_optimized_image_format",
    issueName: "Non-optimized image formats",
    category: "performance",
    whatItMeans:
      "Some images use older formats (JPG, PNG, GIF) instead of modern formats like WebP or AVIF. Modern formats produce smaller file sizes at the same visual quality.",
    whyItMatters:
      "Older formats produce larger file sizes than WebP or AVIF for the same visual quality. Larger images mean slower page loads, which hurt Core Web Vitals and user experience.",
    howToFix:
      "Convert images to WebP or AVIF format, which offer similar quality at a fraction of the file size.",
    stepByStepFix: [
      "Identify images using JPG, PNG, or GIF formats.",
      "Convert each image to WebP or AVIF using an image conversion tool.",
      "Replace the original images with the converted versions.",
      "Save and publish.",
    ],
    exampleBad: "hero-image.png (2.1MB)",
    exampleGood: "hero-image.webp (340KB, same visual quality)",
    verificationMethod:
      "Check image file types in browser DevTools (Network tab) and confirm modern formats are being served.",
    successCondition:
      "All images use WebP or AVIF format, or are served through a CDN that auto-converts to modern formats.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "30–60 minutes",
    developerInstructions:
      "Convert images to WebP/AVIF:\n\n# Using cwebp (WebP encoder):\ncwebp -q 80 input.jpg -o output.webp\n\n# Or configure your CDN to auto-convert (Cloudflare Polish, Cloudinary, etc.)",
    platformInstructions: {
      wordpress:
        "Install a WebP plugin (ShortPixel, Imagify) that auto-converts uploads and serves WebP to compatible browsers.",
      shopify:
        "Shopify auto-converts images to WebP for supported browsers. Verify in the theme's image settings.",
      rawHtml:
        "Convert images to WebP/AVIF and update the src attributes, or configure a CDN to auto-convert.",
    },
  },

  // =========================================================================
  // MISSING RESPONSIVE IMAGES
  // =========================================================================
  missing_responsive_images: {
    issueId: "missing_responsive_images",
    issueName: "Images without responsive srcset",
    category: "performance",
    whatItMeans:
      "Images on this page don't have a srcset attribute, meaning every device downloads the same full-size image regardless of screen size. A phone pays the same bandwidth cost as a desktop monitor.",
    whyItMatters:
      "This wastes mobile bandwidth and slows load times for the majority of visitors who are on phones. Serving appropriately sized images improves Core Web Vitals and user experience.",
    howToFix:
      "Add a srcset (and sizes) attribute so browsers can request an appropriately-sized image per device.",
    stepByStepFix: [
      "Generate multiple sizes of each image (400w, 800w, 1200w, etc.).",
      "Add a srcset attribute listing each size and its width descriptor.",
      "Add a sizes attribute describing how the image is displayed at different viewports.",
      "Save and publish.",
    ],
    exampleBad:
      '<img src="hero-1200.jpg" alt="...">',
    exampleGood:
      '<img src="hero-800.jpg" srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w" sizes="(max-width: 600px) 400px, 800px" alt="...">',
    verificationMethod:
      "View the page source and confirm <img> tags have srcset and sizes attributes.",
    successCondition:
      "All content images have srcset and sizes attributes serving appropriately sized images.",
    technicalDifficulty: "Advanced",
    estimatedEffort: "30–60 minutes",
    developerInstructions:
      "Add srcset and sizes to <img> tags:\n<img src=\"hero-800.jpg\" srcset=\"hero-400.jpg 400w, hero-800.jpg 800w\" sizes=\"(max-width: 600px) 400px, 800px\" alt=\"...\" />",
    platformInstructions: {
      wordpress:
        "WordPress core adds srcset automatically for images uploaded through the Media Library. Verify in the block settings.",
      shopify:
        "Shopify's theme system typically handles responsive images. Verify the theme's image snippet includes srcset.",
      rawHtml:
        "Add srcset and sizes attributes to <img> tags with multiple image sizes.",
    },
  },

  // =========================================================================
  // POOR IMAGE FILENAMES
  // =========================================================================
  poor_image_filenames: {
    issueId: "poor_image_filenames",
    issueName: "Non-descriptive image filenames",
    category: "images",
    whatItMeans:
      "Images on the site have generic or auto-generated filenames like 'IMG_0234.jpg' or 'DSC_001.png'. These filenames give search engines nothing to work with for image search.",
    whyItMatters:
      "Descriptive filenames are a small but free ranking signal for image search. A filename like 'red-velvet-cake.jpg' tells search engines what the image is about, while 'IMG_0234.jpg' tells them nothing.",
    howToFix:
      "Rename image files to short, descriptive, hyphenated names that reflect what the image shows.",
    stepByStepFix: [
      "Identify images with generic or auto-generated filenames.",
      "Rename each file to a short, descriptive, hyphenated name.",
      "Upload the renamed files and update the src attributes in the HTML.",
      "Save and publish.",
    ],
    exampleBad: "IMG_0234.jpg",
    exampleGood: "red-velvet-cake.jpg",
    verificationMethod:
      "Check image filenames in the page source and confirm they are descriptive and hyphenated.",
    successCondition:
      "All image files have short, descriptive, hyphenated filenames.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Rename image files to descriptive, hyphenated names:\n\n# Instead of:\n<img src=\"IMG_0234.jpg\" />\n\n# Use:\n<img src=\"red-velvet-cake.jpg\" />",
    platformInstructions: {
      wordpress:
        "Upload renamed images through the Media Library. Update any hardcoded references in posts/pages.",
      shopify:
        "Upload renamed images through the file uploader. Update references in product/page content.",
      rawHtml:
        "Rename image files on the server and update the src attributes in the HTML.",
    },
  },

  // =========================================================================
  // MISSING LAZY LOADING (duplicate key - skip)
  // =========================================================================

  // =========================================================================
  // URL HAS UPPERCASE
  // =========================================================================
  url_has_uppercase: {
    issueId: "url_has_uppercase",
    issueName: "URL contains uppercase characters",
    category: "url_structure",
    whatItMeans:
      "This page's URL contains uppercase letters (e.g., /About-Us instead of /about-us). URLs are technically case-sensitive, so 'Page' and 'page' can be treated as two different URLs.",
    whyItMatters:
      "Inconsistent casing can create duplicate content issues and broken links if the URL is referenced differently elsewhere.",
    howToFix:
      "Use all-lowercase letters in URLs, and redirect any uppercase variants to the lowercase version.",
    stepByStepFix: [
      "Identify URLs with uppercase characters.",
      "Create the lowercase version of the URL.",
      "Set up a 301 redirect from the uppercase to the lowercase URL.",
      "Update internal links to use the lowercase version.",
      "Save and publish.",
    ],
    exampleBad: "/About-Us/Our-Services",
    exampleGood: "/about-us/our-services",
    verificationMethod:
      "Confirm the old uppercase URL redirects to the lowercase version.",
    successCondition: "All URLs use lowercase characters only.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Ensure all URLs are lowercase. Add a server rule to redirect uppercase URLs:\n\n# Apache:\nRewriteEngine On\nRewriteMap lowercase int:tolower\nRewriteCond %{REQUEST_URI} [A-Z]\nRewriteRule ^(.*)$ ${lowercase:$1} [R=301,L]",
    platformInstructions: {
      wordpress:
        "WordPress handles URL case automatically. Update page slugs to lowercase in the editor.",
      shopify:
        "Shopify URLs are case-insensitive. Update the URL handle to lowercase in the page settings.",
      rawHtml:
        "Update URLs to lowercase and add a server-side redirect rule.",
    },
  },

  // =========================================================================
  // URL HAS UNDERSCORES
  // =========================================================================
  url_has_underscores: {
    issueId: "url_has_underscores",
    issueName: "URL uses underscores instead of hyphens",
    category: "url_structure",
    whatItMeans:
      "This page's URL uses underscores (_) instead of hyphens (-) as word separators. Google treats hyphens as word separators but generally does not treat underscores the same way.",
    whyItMatters:
      "Using underscores can weaken how well individual keywords in the URL are recognized, slightly reducing topical relevance signals.",
    howToFix:
      "Replace underscores with hyphens in the URL, and redirect the old underscore version to the new one.",
    stepByStepFix: [
      "Identify URLs with underscores.",
      "Create the hyphenated version of the URL.",
      "Set up a 301 redirect from the underscore to the hyphen version.",
      "Update internal links.",
      "Save and publish.",
    ],
    exampleBad: "/blue_widgets",
    exampleGood: "/blue-widgets",
    verificationMethod:
      "Confirm the old underscore URL redirects to the new hyphen URL.",
    successCondition: "All URLs use hyphens as word separators.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Replace underscores with hyphens and redirect:\n\n# Apache:\nRedirect 301 /blue_widgets /blue-widgets",
    platformInstructions: {
      wordpress:
        "Edit the page → change the permalink to use hyphens → WordPress auto-redirects.",
      shopify:
        "Products/Online Store → select the page → edit the URL handle to use hyphens → Shopify auto-redirects.",
      rawHtml:
        "Update URLs to use hyphens and add a 301 redirect from the old URL.",
    },
  },

  // =========================================================================
  // URL HAS PARAMETERS
  // =========================================================================
  url_has_parameters: {
    issueId: "url_has_parameters",
    issueName: "URL contains query parameters",
    category: "url_structure",
    whatItMeans:
      "This page's URL contains query parameters (e.g., ?id=123&ref=nav). These can create multiple URL variants for the same page, splitting ranking signals.",
    whyItMatters:
      "Query parameters create URL variants that can dilute ranking signals and lead to duplicate content across all the variants.",
    howToFix:
      "Use clean, static-looking URLs where possible, or set a canonical tag pointing to the preferred parameter-free version.",
    stepByStepFix: [
      "Identify URLs with query parameters.",
      "Create a clean, parameter-free version of the URL.",
      "Set up a 301 redirect or canonical tag pointing to the clean URL.",
      "Update internal links to use the clean URL.",
      "Save and publish.",
    ],
    exampleBad: "/products?category=shoes&color=blue",
    exampleGood: "/products/blue-shoes",
    verificationMethod:
      "Confirm the parameterized URL has a canonical pointing to the clean version, or redirects to it.",
    successCondition:
      "Crawlable URLs are clean and parameter-free, or have canonicals pointing to clean versions.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Add a canonical tag on the parameterized URL pointing to the clean version:\n<link rel=\"canonical\" href=\"https://example.com/clean-url/\" />",
    platformInstructions: {
      wordpress:
        "Use Yoast/Rank Math to set the canonical URL. For faceted navigation, consider a URL structure plugin.",
      shopify:
        "Shopify handles most parameter canonicalization automatically. Verify in the page's SEO settings.",
      rawHtml:
        "Add a canonical tag pointing to the clean URL, or set up a 301 redirect.",
    },
  },

  // =========================================================================
  // URL POOR READABILITY
  // =========================================================================
  url_poor_readability: {
    issueId: "url_poor_readability",
    issueName: "URL is not human-readable",
    category: "url_structure",
    whatItMeans:
      "This page's URL is built from opaque IDs or hashes (e.g., /p/8f3ac21e9) rather than descriptive words. It tells users and search engines nothing about the page's topic.",
    whyItMatters:
      "Opaque URLs miss an easy opportunity to reinforce the page's topic in search results and when the link is shared.",
    howToFix:
      "Use a descriptive, hyphen-separated slug that reflects the page's actual topic instead of an ID or hash.",
    stepByStepFix: [
      "Identify URLs with opaque IDs or hashes.",
      "Create a descriptive, hyphenated slug for each page.",
      "Set up a 301 redirect from the old URL to the new one.",
      "Update internal links.",
      "Save and publish.",
    ],
    exampleBad: "/p/8f3ac21e9",
    exampleGood: "/running-shoes/nike-air-max-2026",
    verificationMethod:
      "Confirm the old URL redirects to the new, descriptive URL.",
    successCondition:
      "All page URLs use descriptive, human-readable slugs.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Replace opaque IDs with descriptive slugs and redirect the old URLs.",
    platformInstructions: {
      wordpress:
        "Edit the page → change the permalink/slug to a descriptive version → WordPress auto-redirects.",
      shopify:
        "Products/Online Store → select the page → edit the URL handle → Shopify auto-redirects.",
      rawHtml:
        "Update URLs to use descriptive slugs and add 301 redirects.",
    },
  },

  // =========================================================================
  // URL HAS ENCODED CHARACTERS
  // =========================================================================
  url_has_encoded_characters: {
    issueId: "url_has_encoded_characters",
    issueName: "URL contains percent-encoded characters",
    category: "url_structure",
    whatItMeans:
      "This page's URL contains percent-encoded characters (%20 for space, %C3%A9 for é). These make URLs hard to read, hard to share, and look machine-generated.",
    whyItMatters:
      "Encoded URLs look unprofessional and can suppress clicks when users compare them against cleaner competitor links.",
    howToFix:
      "Replace percent-encoded characters with readable text in the URL slug, and redirect the old encoded version to the clean one.",
    stepByStepFix: [
      "Identify URLs with percent-encoded characters.",
      "Create a clean, readable version of the URL.",
      "Set up a 301 redirect from the encoded URL to the clean version.",
      "Update internal links.",
      "Save and publish.",
    ],
    exampleBad: "/café%20menu",
    exampleGood: "/cafe-menu",
    verificationMethod:
      "Confirm the encoded URL redirects to the clean version.",
    successCondition:
      "All URLs use readable text without percent-encoding.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Replace encoded characters with readable text and redirect:\n\n# Apache:\nRedirect 301 /caf%C3%A9%20menu /cafe-menu",
    platformInstructions: {
      wordpress:
        "Edit the page → change the permalink to remove encoded characters → WordPress auto-redirects.",
      shopify:
        "Products/Online Store → select the page → edit the URL handle to use readable text → Shopify auto-redirects.",
      rawHtml:
        "Update URLs to use readable text and add 301 redirects from the encoded versions.",
    },
  },

  // =========================================================================
  // URL HAS TRACKING PARAMETERS
  // =========================================================================
  url_has_tracking_parameters: {
    issueId: "url_has_tracking_parameters",
    issueName: "URL contains tracking parameters",
    category: "url_structure",
    whatItMeans:
      "This page's URL contains tracking parameters (utm_source, gclid, fbclid). These create multiple URL variants for the same page, which can split ranking signals.",
    whyItMatters:
      "Every parameterized variant wastes crawl budget and dilutes the page's link equity, while shared links look like tracking links rather than clean page addresses.",
    howToFix:
      "Remove tracking parameters from canonical, crawlable URLs and keep them only on campaign-specific links.",
    stepByStepFix: [
      "Identify URLs with tracking parameters that are being crawled.",
      "Set a canonical tag on the parameterized URL pointing to the clean version.",
      "Ensure campaign links use tracking parameters but the canonical URL is clean.",
      "Save and publish.",
    ],
    exampleBad: "https://example.com/page?utm_source=google&utm_medium=cpc",
    exampleGood: "https://example.com/page (with tracking on ad links only)",
    verificationMethod:
      "View the page source and confirm the canonical points to the clean URL without tracking parameters.",
    successCondition:
      "The canonical URL is clean and free of tracking parameters.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Ensure the canonical tag points to the URL without tracking parameters:\n<link rel=\"canonical\" href=\"https://example.com/page/\" />",
    platformInstructions: {
      wordpress:
        "Use Yoast/Rank Math to set the canonical URL without tracking parameters.",
      shopify:
        "Shopify handles canonical URLs automatically. Verify the canonical is clean.",
      rawHtml:
        "Add a canonical tag pointing to the clean URL without tracking parameters.",
    },
  },

  // =========================================================================
  // URL USES IMAGE PROXY
  // =========================================================================
  url_uses_image_proxy: {
    issueId: "url_uses_image_proxy",
    issueName: "Image proxy / CDN URL used as a page URL",
    category: "url_structure",
    whatItMeans:
      "A URL in the site's internal links points to an image-optimizer or CDN endpoint (e.g., /_next/image?url=...) instead of a real page. These serve images, not pages.",
    whyItMatters:
      "This wastes crawl budget on asset endpoints instead of real pages, and surfaces ugly, unshareable URLs that erode trust when they appear in navigation or reports.",
    howToFix:
      "Link to the real page URL instead of the image-optimizer endpoint, and exclude image-proxy paths from sitemaps and internal navigation.",
    stepByStepFix: [
      "Identify links pointing to image-proxy or CDN endpoints.",
      "Replace each proxy URL with the real page URL.",
      "Remove image-proxy paths from sitemaps and navigation.",
      "Save and publish.",
    ],
    exampleBad: "/_next/image?url=/photo.jpg&w=800",
    exampleGood: "/photo.jpg",
    verificationMethod:
      "Confirm internal links point to real page URLs, not image-proxy endpoints.",
    successCondition:
      "All internal links point to real page URLs.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Replace image-proxy URLs with direct page URLs in all internal links.",
    platformInstructions: {
      wordpress:
        "Check theme templates and widgets for image-proxy URLs. Replace with direct image paths.",
      shopify:
        "Verify product images and content links use direct URLs, not CDN proxy endpoints.",
      rawHtml:
        "Replace image-proxy URLs with direct page URLs in the HTML.",
    },
  },

  // =========================================================================
  // URL TOO DEEP
  // =========================================================================
  url_too_deep: {
    issueId: "url_too_deep",
    issueName: "URL path is too deep",
    category: "url_structure",
    whatItMeans:
      "This page's URL is nested 5 or more directories deep (e.g., /a/b/c/d/e). Deep URLs are harder for users to parse and can be truncated in search results.",
    whyItMatters:
      "Deep URLs can reduce click-through rate and make the site's information architecture feel cluttered to both users and search engines.",
    howToFix:
      "Review whether the deep nesting is necessary. If the path contains redundant segments, shorten it and redirect the old URL.",
    stepByStepFix: [
      "Review the deep URL path for redundant segments.",
      "Create a shorter URL if segments can be removed.",
      "Set up a 301 redirect from the deep URL to the shorter one.",
      "Update internal links.",
      "Save and publish.",
    ],
    exampleBad: "/category/shoes/running/mens/nike/air-max",
    exampleGood: "/mens-running-shoes/nike-air-max",
    verificationMethod:
      "Confirm the deep URL redirects to the shorter version.",
    successCondition:
      "URLs are concise and don't contain unnecessary nesting.",
    technicalDifficulty: "Moderate",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Shorten the URL path and add a 301 redirect from the deep URL.",
    platformInstructions: {
      wordpress:
        "Edit the page → simplify the permalink → WordPress auto-redirects.",
      shopify:
        "Products/Online Store → select the page → edit the URL handle to be shorter → Shopify auto-redirects.",
      rawHtml:
        "Shorten the URL path and add a 301 redirect.",
    },
  },

  // =========================================================================
  // URL HAS FILE EXTENSION
  // =========================================================================
  url_has_file_extension: {
    issueId: "url_has_file_extension",
    issueName: "URL uses a legacy file extension",
    category: "url_structure",
    whatItMeans:
      "This page's URL ends with a file extension like .html, .php, or .aspx. These extensions add no value and reveal the site's underlying technology stack.",
    whyItMatters:
      "Extension-based URLs look dated and can be truncated or read oddly in search results and shared messages.",
    howToFix:
      "Remove file extensions from URLs with clean slugs and redirect old extension URLs to the new format.",
    stepByStepFix: [
      "Identify URLs with file extensions.",
      "Create clean, extension-free versions of the URLs.",
      "Set up 301 redirects from the old extension URLs to the new ones.",
      "Update internal links.",
      "Save and publish.",
    ],
    exampleBad: "/about.html",
    exampleGood: "/about",
    verificationMethod:
      "Confirm the old extension URL redirects to the clean, extension-free URL.",
    successCondition: "All URLs are extension-free.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Remove file extensions and redirect:\n\n# Apache:\nRedirect 301 /about.html /about",
    platformInstructions: {
      wordpress:
        "WordPress handles URL extensions automatically. Update page slugs to not include extensions.",
      shopify:
        "Shopify URLs don't include file extensions by default.",
      rawHtml:
        "Update URLs to remove file extensions and add 301 redirects.",
    },
  },

  // =========================================================================
  // MISSING LAZY LOADING (duplicate)
  // =========================================================================

  // =========================================================================
  // DUPLICATE TITLES
  // =========================================================================
  duplicate_titles: {
    issueId: "duplicate_titles",
    issueName: "Duplicate title tags",
    category: "on_page_seo",
    whatItMeans:
      "Multiple pages on the site share the same title tag. When several pages have identical titles, search engines can't tell which page is most relevant for a given search query.",
    whyItMatters:
      "Duplicate titles confuse search engines about which page to rank for a query, diluting ranking signals across multiple pages instead of consolidating them.",
    howToFix:
      "Write a unique, descriptive title for each affected page that accurately reflects its specific content.",
    stepByStepFix: [
      "Review the list of pages sharing the same title.",
      "For each page, write a unique title that reflects its specific content.",
      "Include the primary keyword for each page.",
      "Keep each title between 50–60 characters.",
      "Save and publish.",
    ],
    exampleBad: "Our Services | Company Name (on 5 different pages)",
    exampleGood:
      "SEO Audit Services | Company Name\nTechnical Consulting | Company Name\nContent Strategy | Company Name",
    verificationMethod:
      "View the page source of each affected page and confirm each has a unique title.",
    successCondition:
      "Every indexable page has a unique title tag.",
    technicalDifficulty: "Easy",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Ensure each page has a unique <title> tag reflecting its specific content.",
    platformInstructions: {
      wordpress:
        "Edit each affected page → update the SEO title in Yoast/Rank Math → save.",
      shopify:
        "Products/Online Store → select each page → update the SEO title → save.",
      rawHtml:
        "Update the <title> tag on each affected page to be unique.",
    },
  },

  // =========================================================================
  // DUPLICATE META DESCRIPTIONS
  // =========================================================================
  duplicate_meta_descriptions: {
    issueId: "duplicate_meta_descriptions",
    issueName: "Duplicate meta descriptions",
    category: "on_page_seo",
    whatItMeans:
      "Multiple pages share the same meta description. When several pages have identical descriptions, search engines generate their own snippets, and you lose control over how each page is pitched in search results.",
    whyItMatters:
      "Duplicate descriptions miss the opportunity to pitch each page's unique value, leading to generic or auto-generated snippets that reduce click-through rate.",
    howToFix:
      "Write a unique meta description for each affected page that highlights its specific content and value proposition.",
    stepByStepFix: [
      "Review the list of pages sharing the same meta description.",
      "For each page, write a unique description between 120–160 characters.",
      "Highlight the specific value proposition of each page.",
      "Save and publish.",
    ],
    exampleBad:
      "Welcome to our website. We offer great services. (same on 8 pages)",
    exampleGood:
      "Comprehensive technical SEO audits with actionable fixes.\nContent strategy consulting for B2B SaaS companies.",
    verificationMethod:
      "View the page source of each affected page and confirm each has a unique meta description.",
    successCondition:
      "Every indexable page has a unique meta description.",
    technicalDifficulty: "Easy",
    estimatedEffort: "15–30 minutes",
    developerInstructions:
      "Ensure each page has a unique meta description:\n<meta name=\"description\" content=\"Unique 120–160 char description for this specific page.\" />",
    platformInstructions: {
      wordpress:
        "Edit each affected page → update the meta description in Yoast/Rank Math → save.",
      shopify:
        "Products/Online Store → select each page → update the search engine listing description → save.",
      rawHtml:
        "Update the meta description on each affected page to be unique.",
    },
  },

  // =========================================================================
  // DUPLICATE ALT TEXT
  // =========================================================================
  duplicate_alt_text: {
    issueId: "duplicate_alt_text",
    issueName: "Duplicate alt text",
    category: "images",
    whatItMeans:
      "Multiple images share the same alt text description. When different images have identical alt text, search engines can't distinguish between them, and screen reader users hear the same description repeated.",
    whyItMatters:
      "Weakens the SEO value of image search traffic and creates a confusing experience for screen reader users who hear identical descriptions for different images.",
    howToFix:
      "Write unique, specific alt text for each image that describes what that particular image shows.",
    stepByStepFix: [
      "Identify images with duplicate alt text.",
      "For each image, write a unique alt text describing what it specifically shows.",
      "Update the alt attribute in the HTML.",
      "Save and publish.",
    ],
    exampleBad:
      '<img src="shoe1.jpg" alt="Shoe">\n<img src="shoe2.jpg" alt="Shoe">',
    exampleGood:
      '<img src="shoe1.jpg" alt="Red running shoe, side view">\n<img src="shoe2.jpg" alt="Blue running shoe, front view">',
    verificationMethod:
      "View the page source and confirm every image has unique, descriptive alt text.",
    successCondition:
      "Every image has unique alt text that describes what it shows.",
    technicalDifficulty: "Easy",
    estimatedEffort: "<15 minutes",
    developerInstructions:
      "Update each image's alt attribute with a unique, descriptive text.",
    platformInstructions: {
      wordpress:
        "Edit the page → select each image → update the Alt Text in the block settings → save.",
      shopify:
        "Products/Online Store → select the page/product → update the Alt Text for each image → save.",
      rawHtml:
        "Update the alt attribute of each <img> tag with unique, descriptive text.",
    },
  },
};

/**
 * Get remediation data for an issue flag. Returns null if no entry exists
 * (shouldn't happen for well-maintained issue types).
 */
export function getRemediation(issueId: string): RemediationEntry | null {
  return REMEDIATION_KB[issueId] ?? null;
}

/**
 * All issue IDs that have remediation entries, for iteration or validation.
 */
export function allRemediationIssueIds(): string[] {
  return Object.keys(REMEDIATION_KB);
}
