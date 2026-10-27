/**
 * Per-page signal extraction for the AI Search Optimization (AEO/GEO)
 * section. Pure, synchronous, and cheerio-based — designed to be called
 * from INSIDE crawlPage.ts's existing `cheerio.load(html)` block (see
 * PATCH_NOTES_AEO.md), reusing the same `$` and `finalUrl` crawlPage.ts
 * already has in scope rather than re-fetching or re-parsing the page.
 *
 * HONEST LIMITATIONS (heuristics, not certainties — same spirit as
 * noindexClassification.ts's confidence field):
 *  - "Direct answer follows a question heading" only checks the next
 *    couple of sibling elements for a substantive <p> — it can't verify
 *    the paragraph actually ANSWERS the question, just that something
 *    text-like immediately follows.
 *  - Render-mode detection (server_rendered vs likely_js_only) is a
 *    heuristic based on visible word count vs. script-tag density, not a
 *    real headless-browser comparison. A page that's genuinely
 *    server-rendered but very short (e.g. a coming-soon page) can read
 *    as "likely_js_only" — treat this as a prompt to check manually, not
 *    a certainty, and say so in the copy shown to the user.
 *  - "Contact info present" / "About page linked" are pattern matches
 *    against link hrefs and visible text, not a real understanding of
 *    page content.
 */

const QUESTION_HEADING_PATTERN =
  /^(what|how|why|when|where|who|which|can|does|do|is|are|should|will|best|top|cost|how much|how many)\b/i;

const CONTACT_PATTERNS = [/tel:/i, /mailto:/i, /\/contact/i];
const ABOUT_PATTERNS = [/\/about/i];
// --- Citation-readiness patterns (item: AI Citation Readiness) ---
const PRIVACY_PATTERNS = [/\/privacy/i, /privacy-policy/i];
const TERMS_PATTERNS = [/\/terms/i, /terms-of-(service|use|conditions)/i, /\/legal\/terms/i];
const EDITORIAL_POLICY_PATTERNS = [/\/editorial/i, /editorial-policy/i, /\/ethics/i, /publishing-standards/i];
const SOURCES_PATTERNS = [/\/sources/i, /\/references/i, /\/citations/i, /\/bibliography/i];
const AUTHOR_PROFILE_PATTERNS = [/\/author/i, /\/authors/i, /\/team/i, /\/staff/i, /\/contributors/i, /\/profile\//i];
const REFERENCES_HEADING_PATTERN = /\b(references|sources|citations?|bibliography|further reading|works cited)\b/i;
const TLDR_HEADING_PATTERN = /\b(tl;?dr|summary|key takeaways?|quick answer)\b/i;

const REQUIRED_OG_TAGS = ["og:title", "og:description", "og:image", "og:url", "og:type"];
const REQUIRED_TWITTER_TAGS = ["twitter:card", "twitter:title", "twitter:description", "twitter:image"];

// --- Semantic-density patterns (item: Semantic Density & Entity Alignment) ---
// Opening markers that read as definitive statement structures (the doc's
// "What is" / "How to" semantic markers). Deliberately restricted to the
// strong question/statement openers — bare "is/are" is excluded so a
// marketing-style "Is your site ready…?" headline isn't counted as a
// definitional statement.
const DEFINITIONAL_OPENING_PATTERN =
  /^(what is|what are|what does|what do|what's|how to|how does|how do|how's|why|who is|who are|when|where|which)\b/i;
// Explicit entity-definition constructions ("X is a…", "X refers to…").
// Only checked in the opening ~120 chars of a paragraph, so a throwaway
// "there is a" later in the text can't inflate the count.
const EXPLICIT_DEFINITION_PATTERN = /\b(?:refers to|is defined as|is a|is an|are a|are an)\b/i;

export interface AeoPageSignals {
  ogTags: { present: boolean; missing: string[] };
  twitterCardTags: { present: boolean; missing: string[] };
  questionHeadingCount: number;
  questionHeadingsWithDirectAnswer: number;
  /** Real question/answer pairs captured from the page (question heading +
   * the substantive paragraph that follows it), used to generate a
   * site-specific FAQPage JSON-LD example — never fabricated. */
  questionHeadings: { question: string; answer: string }[];
  hasOrderedList: boolean;
  hasUnorderedList: boolean;
  hasTable: boolean;
  headingHierarchyValid: boolean;
  authorName: string | null;
  lastUpdatedDate: string | null;
  hasContactInfo: boolean;
  linksToAboutPage: boolean;
  numericDataDensityPct: number; // 0-100, share of "words" that look numeric/stat-like
  /** Semantic-density signals (Semantic Density & Entity Alignment check):
   * how much of the page's opening content reads as clear, definitive
   * statements ("What is…", "How to…", "X is a…") rather than vague prose —
   * the structure AI systems parse into entities. Heuristic, not certainty. */
  definitionalStatementCount: number;
  hasDefinitionalOpening: boolean;
  faqSchemaPresent: boolean;
  tldrPresent: boolean;
  sameAsLinks: string[];
  externalAuthorityLinkCount: number;
  /** Citation-readiness signals (AI Citation Readiness section) — each is a
   * best-effort pattern match, same heuristic spirit as hasContactInfo. */
  hasAuthorProfilePage: boolean;
  linksToPrivacyPage: boolean;
  linksToTermsPage: boolean;
  linksToEditorialPolicyPage: boolean;
  linksToSourcesPage: boolean;
  hasReferencesSection: boolean;
  reviewSchemaPresent: boolean;
  renderMode: "server_rendered" | "likely_js_only" | "unknown";
  /** Simple exact-match content fingerprint for site-level duplicate detection (see aeoContentQuality.ts). */
  contentFingerprint: string;
  // --- Semantic markup signals (Semantic Markup & Text Extraction check) ---
  /** Visible text bytes / raw HTML bytes * 100. Higher ratio means content is more parseable by automated systems. */
  textToHtmlRatio: number;
  /** Number of <section> semantic containers found on the page. */
  sectionCount: number;
  // --- Trust & attribution signals (Source Attribution & Author Trust check) ---
  /** Date the content was originally published (datePublished from JSON-LD or meta). */
  datePublished: string | null;
  /** Whether a visible author byline (text containing "By" near a name) appears on the page. */
  visibleAuthor: boolean;
  /** Author profile URL (from rel=author, href on author link, or JSON-LD author.url). */
  authorUrl: string | null;
}

function countWords(text: string): number {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0).length;
}

/**
 * What the raw HTML response actually contains, independent of any
 * JavaScript execution. The crawler fetches with plain HTTP (no headless
 * browser), so this is exactly what a raw-HTTP-only crawler — including
 * many AI crawlers — would see.
 *
 * The MAIN-CONTAINER signal is the key improvement over the old
 * body-wide word count: a client-side-rendered page (React/Next CSR,
 * Vue, etc.) serves a shell whose nav/footer can easily exceed 50 words
 * while the actual article sits in an empty mount <div> waiting for JS.
 * A body-word-count heuristic reads that shell as "server-rendered" and
 * lets the render-mode check pass on pages whose primary content is
 * genuinely NOT in the raw HTML.
 */
export interface RawContentSignal {
  hasMainContainer: boolean; // <main>, <article>, or [role="main"] present
  mainWords: number; // words inside the main-content region
  scriptTagCount: number;
  bodyChildCount: number; // direct children of <body> (apps often render ~1 mount div)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cheerio's root type varies by version import style
export function rawContentSignal($: any): RawContentSignal {
  const mainEls = $("main, article, [role='main']");
  const mainWords = mainEls.length ? countWords(mainEls.text()) : 0;
  return {
    hasMainContainer: mainEls.length > 0,
    mainWords,
    scriptTagCount: $("script").length,
    bodyChildCount: $("body").children().length,
  };
}

/**
 * Conservative render-mode classification shared by crawlPage (to avoid
 * reporting content-presence findings that are false positives on a
 * pre-hydration shell) and extractAeoSignals (for the "Primary content
 * available in raw HTML" AEO check).
 *
 * Deliberately biased toward "server_rendered"/"unknown" over
 * "likely_js_only": mislabeling a real server-rendered page as JS-only
 * would hide genuine findings, which is worse than occasionally missing a
 * client-rendered page (the report copy always says "verify manually").
 */
export function classifyRenderMode(
  wordCount: number,
  sig: RawContentSignal
): AeoPageSignals["renderMode"] {
  if (sig.hasMainContainer) {
    // A populated main-content region is the strongest evidence the real
    // content is in the raw HTML — regardless of how much chrome surrounds it.
    if (sig.mainWords >= 30) return "server_rendered";
    // A main region with essentially no words is an empty mount container
    // (React/Vue/etc. hydrate into it) — the article is injected by JS.
    if (sig.mainWords <= 2) return "likely_js_only";
    // Sparse main + a real script bundle: likely an app shell.
    if (sig.mainWords < 10 && sig.scriptTagCount >= 3) return "likely_js_only";
    // Short but ambiguous (e.g. a coming-soon page) — don't over-flag.
    return "unknown";
  }
  // No semantic main container — fall back to the body-wide heuristic.
  if (wordCount >= 50) return "server_rendered";
  if (wordCount < 20 && (sig.scriptTagCount >= 5 || sig.bodyChildCount <= 2)) return "likely_js_only";
  return "unknown";
}

/**
 * Whether the main-content region of the raw HTML is empty enough that
 * content-presence checks (H1, H2, word count / thin content) would be
 * reading a pre-hydration shell rather than the page's real content.
 * Used by crawlPage to avoid emitting false-positive findings on
 * client-rendered templates. Requires a main container AND either an
 * effectively empty mount div or a sparse main with a real script
 * bundle — deliberately conservative (see classifyRenderMode).
 */
export function isLikelyJsOnly(sig: RawContentSignal): boolean {
  if (!sig.hasMainContainer) return false;
  if (sig.mainWords <= 2) return true;
  return sig.mainWords < 10 && sig.scriptTagCount >= 3;
}

// ---------------------------------------------------------------------------
// Framework detection + H1 verification render heuristic
// ---------------------------------------------------------------------------

/**
 * Detects framework/hydration evidence in the raw HTML that suggests
 * structural content (including H1) may be generated client-side.
 * Framework-agnostic: checks markers for React, Next.js, Vue, Angular,
 * Gatsby, Remix, Svelte, and generic SPA patterns.
 */
export function detectFrameworkSignals($: any): {
  hasReactRoot: boolean;
  hasNextJsData: boolean;
  hasVueApp: boolean;
  hasAngularApp: boolean;
  hasFrameworkMarkers: boolean;
  hasEmptyAppRoot: boolean;
  hasSignificantScriptBundle: boolean;
} {
  const html = $.html() ?? "";
  const lowerHtml = html.toLowerCase();

  // React: id="root" or id="__next" or data-reactroot or data-reactid
  const hasReactRoot =
    !!$('#root, #__next, [data-reactroot], [data-reactid]').length ||
    /__next/.test(html);

  // Next.js: __NEXT_DATA__ script, _next/ paths, next/data, next/script
  const hasNextJsData =
    /__NEXT_DATA__/.test(html) ||
    /_next\//.test(html) ||
    /next\/data/.test(html) ||
    /next\/script/.test(html);

  // Vue: id="app" (with sparse content), data-v- attributes, __vue__, __VUE__
  const hasVueApp =
    /data-v-[a-f0-9]+/.test(html) ||
    /__(?:vue|VUE)__(?:_dev)?/.test(html);

  // Angular: ng-version, ng-app, [ng], _nghost, _ngcontent
  const hasAngularApp =
    /ng-version/.test(html) ||
    /ng-app/.test(html) ||
    /_nghost-[a-z\d]+/.test(html) ||
    /_ngcontent-[a-z\d]+/.test(html);

  // Gatsby: ___gatsby, gatsby
  // Remix: __remixContext, __remixManifest
  // Svelte: __svelte
  const hasFrameworkMarkers =
    hasReactRoot || hasNextJsData || hasVueApp || hasAngularApp ||
    /___gatsby/.test(html) ||
    /__remix(?:Context|Manifest)/.test(html) ||
    /__svelte/.test(html);

  // Empty application root containers: <div id="root"></div>,
  // <div id="app"></div>, <div id="__next"></div>, etc.
  const hasEmptyAppRoot = (() => {
    const appRoots = $("#root, #app, #__next, #__nuxt");
    for (let i = 0; i < appRoots.length; i++) {
      const words = countWords($(appRoots[i]).text());
      if (words <= 5) return true;
    }
    return false;
  })();

  // Significant script bundle: many script tags with substantial JS
  // (heuristic: total script content > 5KB suggests a real app bundle,
  // not just analytics/tracking)
  const hasSignificantScriptBundle = (() => {
    let totalScriptChars = 0;
    $("script").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      totalScriptChars += ($(el).html() ?? "").length;
    });
    // Also count external script src tags (each is typically a bundle)
    const externalScriptCount = $("script[src]").length;
    return totalScriptChars > 5000 || externalScriptCount >= 3;
  })();

  return {
    hasReactRoot,
    hasNextJsData,
    hasVueApp,
    hasAngularApp,
    hasFrameworkMarkers,
    hasEmptyAppRoot,
    hasSignificantScriptBundle,
  };
}

/**
 * Determines whether an H1 verification render is warranted for a page
 * that has no H1 in the raw HTML. Combines multiple signals to avoid
 * both false negatives (missing a JS-rendered H1) and unnecessary renders.
 *
 * The heuristic triggers a render when the page shows evidence that
 * structural content may be generated client-side, even if the page
 * was classified as "server_rendered" (which only means the body has
 * enough words — it doesn't guarantee the H1 is server-rendered).
 *
 * Key insight: a page can be "server_rendered" (substantial body text)
 * AND still have a JS-rendered H1. The renderMode heuristic measures
 * overall content presence, not H1-specific rendering.
 */
export function needsH1VerificationRender(
  hasH1: boolean,
  rawContentSig: RawContentSignal,
  frameworkSignals: {
    hasFrameworkMarkers: boolean;
    hasEmptyAppRoot: boolean;
    hasSignificantScriptBundle: boolean;
  }
): boolean {
  // If H1 exists in raw HTML, no verification needed
  if (hasH1) return false;

  // Signal 1: Empty app root container — strongest indicator that the
  // page is a JS app shell where content is injected by hydration
  if (frameworkSignals.hasEmptyAppRoot) return true;

  // Signal 2: Framework markers present (React/Next/Vue/Angular/etc.)
  // AND the page has a significant script bundle (real app, not just
  // a tracking snippet)
  if (frameworkSignals.hasFrameworkMarkers && frameworkSignals.hasSignificantScriptBundle) return true;

  // Signal 3: Framework markers present AND the main content region
  // has very few words (sparse content despite having a main container)
  if (frameworkSignals.hasFrameworkMarkers && rawContentSig.hasMainContainer && rawContentSig.mainWords < 20) return true;

  // Signal 4: Many script tags (>5) with sparse body content — indicates
  // a JS-heavy page where content is likely generated client-side
  if (rawContentSig.scriptTagCount >= 5 && rawContentSig.bodyChildCount <= 3) return true;

  // Signal 5: Empty main container (main container exists but has <= 5 words)
  // — this is the classic React/Vue mount point pattern
  if (rawContentSig.hasMainContainer && rawContentSig.mainWords <= 5) return true;

  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cheerio's root type varies by version import style
export function extractAeoSignals(
  $: any,
  finalUrl: URL,
  visibleText: string,
  wordCount: number,
  jsonLdBlocks: string[]
): AeoPageSignals {
  // --- Open Graph / Twitter Card ---
  const ogPresentTags = new Set<string>();
  $('meta[property^="og:"]').each((_: number, el: any) => {
    const prop = $(el).attr("property");
    if (prop) ogPresentTags.add(prop.toLowerCase());
  });
  const ogMissing = REQUIRED_OG_TAGS.filter((t) => !ogPresentTags.has(t));

  const twitterPresentTags = new Set<string>();
  $('meta[name^="twitter:"]').each((_: number, el: any) => {
    const name = $(el).attr("name");
    if (name) twitterPresentTags.add(name.toLowerCase());
  });
  const twitterMissing = REQUIRED_TWITTER_TAGS.filter((t) => !twitterPresentTags.has(t));

  // --- Question-based headings + direct-answer check ---
  let questionHeadingCount = 0;
  let questionHeadingsWithDirectAnswer = 0;
  // Real Q&A pairs (question heading + following substantive paragraph),
  // capped so a single page can never bloat the audit record. Only pairs
  // with a detected direct answer are kept — a question with no answer
  // text would produce a fabricated FAQ entry.
  const questionHeadings: { question: string; answer: string }[] = [];
  $("h2, h3").each((_: number, el: any) => {
    const text = $(el).text().trim();
    if (!QUESTION_HEADING_PATTERN.test(text) && !text.includes("?")) return;
    questionHeadingCount++;

    // Look at up to the next 2 sibling elements for a substantive paragraph.
    let sib = $(el).next();
    let found = false;
    let answerText = "";
    for (let i = 0; i < 2 && sib.length; i++) {
      if (sib.is("p") && sib.text().trim().length >= 40) {
        found = true;
        answerText = sib.text().trim().replace(/\s+/g, " ").slice(0, 240);
        break;
      }
      sib = sib.next();
    }
    if (found) {
      questionHeadingsWithDirectAnswer++;
      if (questionHeadings.length < 6) {
        questionHeadings.push({
          question: text.replace(/\s+/g, " ").slice(0, 160),
          answer: answerText,
        });
      }
    }
  });

  // --- Lists / tables ---
  const hasOrderedList = $("ol").length > 0;
  const hasUnorderedList = $("ul").length > 0;
  const hasTable = $("table").length > 0;

  // --- Heading hierarchy (H1 -> H2 -> H3, no level skipped on the way down) ---
  const levels: number[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_: number, el: any) => {
    levels.push(parseInt(el.tagName?.slice(1) ?? el.name?.slice(1) ?? "0", 10));
  });
  let headingHierarchyValid = true;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      headingHierarchyValid = false;
      break;
    }
  }

  // --- Author / last updated / contact / about ---
  const authorName =
    $('meta[name="author"]').first().attr("content")?.trim() ||
    $('[rel="author"]').first().text().trim() ||
    $('[itemprop="author"]').first().text().trim() ||
    null;

  const lastUpdatedDate =
    $('meta[property="article:modified_time"]').first().attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    $('[itemprop="dateModified"]').first().attr("content") ||
    null;

  let hasContactInfo = false;
  let linksToAboutPage = false;
  let hasAuthorProfilePage = false;
  let linksToPrivacyPage = false;
  let linksToTermsPage = false;
  let linksToEditorialPolicyPage = false;
  let linksToSourcesPage = false;
  let externalAuthorityLinkCount = 0;
  $("a[href]").each((_: number, el: any) => {
    const href = $(el).attr("href") ?? "";
    if (CONTACT_PATTERNS.some((p) => p.test(href))) hasContactInfo = true;
    if (ABOUT_PATTERNS.some((p) => p.test(href))) linksToAboutPage = true;
    if (AUTHOR_PROFILE_PATTERNS.some((p) => p.test(href))) hasAuthorProfilePage = true;
    if (PRIVACY_PATTERNS.some((p) => p.test(href))) linksToPrivacyPage = true;
    if (TERMS_PATTERNS.some((p) => p.test(href))) linksToTermsPage = true;
    if (EDITORIAL_POLICY_PATTERNS.some((p) => p.test(href))) linksToEditorialPolicyPage = true;
    if (SOURCES_PATTERNS.some((p) => p.test(href))) linksToSourcesPage = true;
    try {
      const resolved = new URL(href, finalUrl);
      if (
        (resolved.protocol === "http:" || resolved.protocol === "https:") &&
        resolved.hostname !== finalUrl.hostname
      ) {
        externalAuthorityLinkCount++;
      }
    } catch {
      // not a resolvable URL — ignore
    }
  });

  // --- Numeric data density ---
  const words = visibleText.split(/\s+/).filter(Boolean);
  const numericWords = words.filter((w) => /\d/.test(w));
  const numericDataDensityPct = words.length > 0 ? Math.round((numericWords.length / words.length) * 1000) / 10 : 0;

  // --- Semantic density & entity alignment (definitional structure) ---
  // AI systems parse content into entities; pages whose opening blocks read
  // as clear, definitive statements ("What is…", "How to…", "X is a…") are
  // far easier to contextualize than vague prose. Scan the first content
  // paragraphs and the first heading — the places an AI (or a human) looks
  // first. Same heuristic spirit as numericDataDensityPct: a pattern match,
  // not a real understanding of the prose.
  let definitionalStatementCount = 0;
  let hasDefinitionalOpening = false;
  const contentParagraphs = $("p").slice(0, 10);
  contentParagraphs.each((_: number, el: any) => {
    const text = $(el).text().trim();
    if (!text) return;
    if (DEFINITIONAL_OPENING_PATTERN.test(text) || EXPLICIT_DEFINITION_PATTERN.test(text.slice(0, 120))) {
      definitionalStatementCount++;
    }
  });
  const firstHeadingText = $("h1, h2").first().text().trim();
  const firstParagraphText = contentParagraphs.first().text().trim();
  hasDefinitionalOpening =
    DEFINITIONAL_OPENING_PATTERN.test(firstHeadingText) || DEFINITIONAL_OPENING_PATTERN.test(firstParagraphText);

  // --- FAQ schema + TL;DR heading ---
  let faqSchemaPresent = false;
  let reviewSchemaPresent = false;
  const sameAsLinks: string[] = [];
  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        const graph = Array.isArray(entry?.["@graph"]) ? entry["@graph"] : [entry];
        for (const node of graph) {
          const type = node?.["@type"];
          const types = Array.isArray(type) ? type : [type];
          if (types.includes("FAQPage")) faqSchemaPresent = true;
          if (types.includes("Review") || types.includes("Product") || types.includes("LocalBusiness")) {
            if (node?.aggregateRating || node?.review) reviewSchemaPresent = true;
          }
          const sameAs = node?.sameAs;
          if (Array.isArray(sameAs)) sameAsLinks.push(...sameAs.filter((s: unknown) => typeof s === "string"));
          else if (typeof sameAs === "string") sameAsLinks.push(sameAs);
        }
      }
    } catch {
      // malformed JSON-LD — already flagged elsewhere (invalid_schema_markup), skip here
    }
  }

  let tldrPresent = false;
  let hasReferencesSection = false;
  $("h1, h2, h3, h4").each((_: number, el: any) => {
    const headingText = $(el).text();
    if (TLDR_HEADING_PATTERN.test(headingText)) tldrPresent = true;
    if (REFERENCES_HEADING_PATTERN.test(headingText)) hasReferencesSection = true;
  });

  // --- Render-mode heuristic (main-content-region aware — see
  // classifyRenderMode above for why body-wide word count alone is not
  // enough) ---
  const renderMode = classifyRenderMode(wordCount, rawContentSignal($));

  // --- Content fingerprint (exact-match duplicate detection only) ---
  const normalized = visibleText.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 2000);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  const contentFingerprint = normalized.length < 200 ? "" : String(hash); // too short to fingerprint meaningfully

  // --- Semantic Markup & Text Extraction signals ---
  // Text-to-HTML ratio: visible text bytes / raw HTML bytes * 100.
  // This measures how much of the HTML payload is actual content vs.
  // markup/scripts — a key signal for AI parser efficiency.
  const htmlBytes = Buffer.byteLength($.html() || "", "utf8");
  const textBytes = Buffer.byteLength(visibleText, "utf8");
  const textToHtmlRatio = htmlBytes > 0 ? Math.round((textBytes / htmlBytes) * 10000) / 100 : 0;

  // <section> tag count — semantic containers that indicate structured
  // content organization (alongside <main> and <article>).
  const sectionCount = $("section").length;

  // --- Source Attribution & Author Trust signals ---
  // datePublished: from JSON-LD, meta article:published_time, or itemprop.
  let datePublished =
    $("meta[property='article:published_time']").first().attr("content") ||
    $('[itemprop="datePublished"]').first().attr("content") || null;
  // Also check JSON-LD blocks for datePublished
  if (!datePublished) {
    for (const block of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(block);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          const graph = Array.isArray(entry?.["@graph"]) ? entry["@graph"] : [entry];
          for (const node of graph) {
            if (node?.datePublished && typeof node.datePublished === "string") {
              datePublished = node.datePublished;
              break;
            }
          }
          if (datePublished) break;
        }
      } catch {
        // malformed JSON-LD — skip
      }
      if (datePublished) break;
    }
  }

  // visibleAuthor: heuristic — look for a visible text pattern like
  // "By [Name]" near the top of the content, or a byline container.
  const BYLINE_PATTERN = /\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/;
  const firstParagraphs = $("p").slice(0, 5);
  let visibleAuthor = false;
  firstParagraphs.each((_: number, el: any) => {
    const text = $(el).text().trim();
    if (BYLINE_PATTERN.test(text)) visibleAuthor = true;
  });
  // Also check for a dedicated byline element
  if (!visibleAuthor) {
    const bylineEl = $(".byline, .author-name, [class*='author']").first();
    if (bylineEl.length > 0 && bylineEl.text().trim().length > 2) visibleAuthor = true;
  }

  // authorUrl: extract from rel=author link, or JSON-LD author.url
  let authorUrl = $("a[rel='author']").first().attr("href") || null;
  if (!authorUrl) {
    const authorEl = $("[itemprop='author']").first();
    if (authorEl.is("a")) authorUrl = authorEl.attr("href") || null;
  }
  if (!authorUrl) {
    for (const block of jsonLdBlocks) {
      try {
        const parsed = JSON.parse(block);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          const graph = Array.isArray(entry?.["@graph"]) ? entry["@graph"] : [entry];
          for (const node of graph) {
            const author = node?.author;
            if (author && typeof author === "object" && author.url && typeof author.url === "string") {
              authorUrl = author.url;
              break;
            }
          }
          if (authorUrl) break;
        }
      } catch {
        // malformed JSON-LD — skip
      }
      if (authorUrl) break;
    }
  }

  return {
    ogTags: { present: ogMissing.length === 0, missing: ogMissing },
    twitterCardTags: { present: twitterMissing.length === 0, missing: twitterMissing },
    questionHeadingCount,
    questionHeadingsWithDirectAnswer,
    questionHeadings,
    hasOrderedList,
    hasUnorderedList,
    hasTable,
    headingHierarchyValid,
    authorName,
    lastUpdatedDate,
    hasContactInfo,
    linksToAboutPage,
    numericDataDensityPct,
    definitionalStatementCount,
    hasDefinitionalOpening,
    faqSchemaPresent,
    tldrPresent,
    sameAsLinks,
    externalAuthorityLinkCount,
    hasAuthorProfilePage,
    linksToPrivacyPage,
    linksToTermsPage,
    linksToEditorialPolicyPage,
    linksToSourcesPage,
    hasReferencesSection,
    reviewSchemaPresent,
    renderMode,
    contentFingerprint,
    textToHtmlRatio,
    sectionCount,
    datePublished,
    visibleAuthor,
    authorUrl,
  };
}

// ---------------------------------------------------------------------------
// Author presence — ONE shared definition used by every author-related
// check in the report (Trust & Entity Signals AND AI Citation Readiness).
//
// Before this helper existed, the two sections each rolled their own
// "author" test: Trust & Entity counted `authorName` (meta author /
// rel=author / itemprop=author) while Citation Readiness counted
// `hasAuthorProfilePage || authorName` — so one section could truthfully
// report "0 of 149 pages show a named author" while the other reported
// "author bylines present on 149 of 149 pages" (every page links to a
// /team/ page in its nav). Same page set, opposite answers, both
// technically "about authors".
//
// The three signals are deliberately kept SEPARATE — a visible byline, a
// profile-page link, and Person schema are different things and the report
// must count them independently.
// ---------------------------------------------------------------------------
export interface AuthorPresence {
  /** Machine-readable author name (meta name="author", rel=author,
   * itemprop=author). NOT a visible-text "By …" scan — those aren't
   * reliably machine-detectable, and the report says so explicitly. */
  byline: string | null;
  /** Whether the page links to an author/profile page (/author, /team,
   * /staff, /contributors, …). A sitewide nav link counts here — this
   * measures the LINK, not per-page authorship. */
  profileLink: boolean;
  /** Whether the page carries Person (author) structured data. */
  schema: boolean;
}

/** Minimal structural page shape this helper needs — both aeoReport.ts
 * call sites pass the full CrawlPageSuccess & { aeoSignals? } pages. */
interface AuthorPageInput {
  structuredData: { present: boolean; types: string[] };
  aeoSignals?: { authorName?: string | null; hasAuthorProfilePage?: boolean };
}

export function checkAuthorPresence(page: AuthorPageInput): AuthorPresence {
  const sig = page.aeoSignals;
  return {
    byline: sig?.authorName && sig.authorName.trim() ? sig.authorName : null,
    profileLink: sig?.hasAuthorProfilePage ?? false,
    schema: page.structuredData.present && page.structuredData.types.some((t) => t.toLowerCase() === "person"),
  };
}
