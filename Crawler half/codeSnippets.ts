import type { CrawlPageSuccess } from "./types";

/**
 * Maps an issue flag to a small, copy-pasteable example fix — the thing a
 * developer handed this report actually needs, on top of the existing
 * plain-English "why it matters" / "recommended fix" copy.
 *
 * Deliberately narrow scope, matching the same "auditor, not content
 * creator" principle explainPage.ts already follows: these are generic,
 * structurally-correct EXAMPLES showing the right shape of the fix, using
 * the page's own real URL/current values where we have them and a
 * clearly-marked placeholder otherwise. This never invents real body
 * content, business facts, or claims to be a verified drop-in fix — it's
 * a pattern to adapt. Every place this renders MUST show the
 * IMPLEMENTATION_NOTE line above the snippet, so it never reads as
 * "paste this exact code into your site."
 */

export type CodeSnippetLanguage = "html" | "http" | "json";

export interface CodeSnippet {
  language: CodeSnippetLanguage;
  label: string;
  code: string;
}

/**
 * Fixed disclaimer line every renderer (PDF and web) must show directly
 * above a code snippet box — makes explicit that this is a pattern to
 * adapt, not a guaranteed fix for the reader's specific CMS/framework.
 */
export const IMPLEMENTATION_NOTE =
  "Implementation example (adjust for your CMS/framework) — deploying this change is what turns the fix above into visible search and AI gains.";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param flag The issue flag (e.g. "missing_canonical").
 * @param page The affected page, if available — used to fill in a real
 *   URL rather than a placeholder wherever possible.
 * @param suggestedText Any AI-generated or template suggestion already
 *   computed for this issue (e.g. a suggested title) — reused here rather
 *   than inventing a second, different placeholder value.
 */
export function getCodeSnippet(
  flag: string,
  page?: Pick<CrawlPageSuccess, "url"> | null,
  suggestedText?: string | null
): CodeSnippet | null {
  const pageUrl = page?.url ?? "https://www.example.com/correct-page-url";

  switch (flag) {
    case "missing_canonical":
    case "canonical_mismatch":
      return {
        language: "html",
        label: "Suggested Canonical Fix",
        code: `<!-- Add inside <head>, pointing at this page's own preferred URL -->\n<link rel="canonical" href="${pageUrl}" />`,
      };

    case "missing_title":
    case "title_length_out_of_range":
      return {
        language: "html",
        label: "Suggested Title Tag",
        code: `<title>${escapeHtml(suggestedText ?? "Your Page Title Here (aim for 50–60 characters)")}</title>`,
      };

    case "missing_meta_description":
    case "meta_description_length_out_of_range":
      return {
        language: "html",
        label: "Suggested Meta Description",
        code: `<meta name="description" content="${escapeHtml(
          suggestedText ?? "A compelling 120–160 character summary of this page."
        )}" />`,
      };

    case "missing_h1":
      return {
        language: "html",
        label: "Suggested H1",
        code: `<h1>${escapeHtml(suggestedText ?? "Your Main Page Heading")}</h1>`,
      };

    case "multiple_h1":
      return {
        language: "html",
        label: "Fix — Keep One H1, Demote the Rest",
        code: `<!-- Keep exactly one <h1> per page. Change any additional ones to: -->\n<h2>Secondary Heading</h2>`,
      };

    case "missing_alt_text":
      return {
        language: "html",
        label: "Alt Text Pattern",
        code: `<img src="product-photo.jpg" alt="Describe what this specific image shows" />\n\n<!-- Purely decorative image? Use an empty alt, not a missing one: -->\n<img src="divider.svg" alt="" />`,
      };

    case "duplicate_alt_text":
      return {
        language: "html",
        label: "Fix — Unique Alt Text Per Image",
        code: `<!-- Instead of the same alt on every image: -->\n<img src="shoe-red.jpg" alt="Running shoe" />\n<img src="shoe-blue.jpg" alt="Running shoe" />\n\n<!-- Describe what's actually different: -->\n<img src="shoe-red.jpg" alt="Red running shoe, side view" />\n<img src="shoe-blue.jpg" alt="Blue running shoe, side view" />`,
      };

    case "missing_image_dimensions":
      return {
        language: "html",
        label: "Add Explicit Width/Height",
        code: `<img src="photo.jpg" alt="..." width="800" height="600" />`,
      };

    case "missing_lazy_loading":
      return {
        language: "html",
        label: "Add Lazy Loading (below-the-fold images)",
        code: `<img src="photo.jpg" alt="..." loading="lazy" />`,
      };

    case "missing_responsive_images":
      return {
        language: "html",
        label: "Add a Responsive srcset",
        code: `<img\n  src="photo-800.jpg"\n  srcset="photo-400.jpg 400w, photo-800.jpg 800w, photo-1200.jpg 1200w"\n  sizes="(max-width: 600px) 400px, 800px"\n  alt="..."\n/>`,
      };

    case "noindex_meta_tag":
      return {
        language: "html",
        label: "Remove Noindex (if unintentional)",
        code: `<!-- Currently: -->\n<meta name="robots" content="noindex" />\n\n<!-- Change to: -->\n<meta name="robots" content="index, follow" />`,
      };

    case "noindex_x_robots_tag":
      return {
        language: "http",
        label: "Remove Noindex Response Header (server/CDN config)",
        code: `# Currently sending:\nX-Robots-Tag: noindex\n\n# Change your server/CDN config to send:\nX-Robots-Tag: index, follow`,
      };

    case "missing_schema_markup":
      return {
        language: "json",
        label: "Starter Schema.org JSON-LD",
        code: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Your Business Name",\n  "url": "${pageUrl}"\n}\n</script>\n\n<!-- Swap "@type" for Article, Product, FAQPage, etc. to match this page's actual content. -->`,
      };

    case "invalid_schema_markup":
      return {
        language: "json",
        label: "Fix — Minimal Valid JSON-LD Shape",
        code: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebPage",\n  "name": "Page Title Here"\n}\n</script>\n\n<!-- Validate with Google's Rich Results Test before publishing. -->`,
      };

    case "url_has_underscores":
      return {
        language: "html",
        label: "Use Hyphens, Not Underscores",
        code: `<!-- Instead of: -->\n/blue_widgets\n\n<!-- Use, with a 301 redirect from the old URL: -->\n/blue-widgets`,
      };

    case "url_has_uppercase":
      return {
        language: "html",
        label: "Lowercase the URL, Redirect the Old One",
        code: `<!-- Instead of: -->\n/Blue-Widgets\n\n<!-- Use, with a 301 redirect from the old URL: -->\n/blue-widgets`,
      };

    case "url_has_parameters":
      return {
        language: "html",
        label: "Canonicalize the Parameterized URL",
        code: `<!-- On the parameterized version (e.g. /widgets?ref=nav), point the canonical at the clean URL: -->\n<link rel="canonical" href="${pageUrl}" />`,
      };

    default:
      return null; // no generic snippet makes sense for this flag — omit the box entirely rather than force one
  }
}
