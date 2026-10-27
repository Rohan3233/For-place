import { getIssueTemplate } from "./templates";
import { detectPrimaryLanguage, buildLanguageInstruction, type DetectedLanguage } from "./languageDetect";
import { extractBrandContext, buildBrandContextInstruction, type BrandContext } from "./brandContext";
import type {
  CrawlPageSuccess,
  CrawlSiteResult,
  LLMProvider,
  IssueExplanation,
  PageExplanationResult,
  AiFieldKey,
} from "./types";

/**
 * Turns one crawled page's flags into client-ready explanations.
 *
 * COST STRATEGY (matches business doc Section 13-I & IV directly):
 *  - Every flag gets its "why it matters" / "recommended fix" text from a
 *    hardcoded template — zero AI calls for that part, always.
 *  - Only flags that need genuinely generated content (a suggested title,
 *    meta description, or H1) trigger an AI call — and even then, ALL of
 *    a page's AI-eligible flags are batched into ONE request, not one
 *    request per flag.
 *  - If the AI call fails for any reason, this still returns full
 *    template-based explanations for every issue — suggestedText is just
 *    null for the AI-eligible ones, with the failure reason surfaced in
 *    `aiError`.
 *
 * AUDITOR-NOT-COPYWRITER: this layer only ever generates the specific,
 * narrow fields listed in AiFieldKey (a title tag, a meta description, an
 * H1) — short, structural, on-page metadata that genuinely needs
 * generation because a template can't hardcode business-specific text.
 * It deliberately does NOT generate replacement body copy for thin
 * content, sample paragraphs, or any other "content creation" — thin
 * content gets a template-only diagnostic explanation (why it's thin, why
 * that hurts SEO, how to fix it) with no AI-authored draft text. If your
 * product previously offered an AI-drafted thin-content expansion for
 * Pro/Agency, that capability is intentionally removed here per the
 * "auditor, not content creator" requirement — flag if you want it kept
 * as an explicit, clearly-labeled opt-in feature instead of default
 * behavior.
 */
export async function explainPage(
  page: CrawlPageSuccess,
  llm: LLMProvider | null,
  context?: { language: DetectedLanguage; brand: BrandContext }
): Promise<PageExplanationResult> {
  const issues: IssueExplanation[] = [];
  const neededFields = new Set<AiFieldKey>();

  for (const flag of page.flags) {
    const template = getIssueTemplate(flag);
    if (!template) continue; // unrecognized flag — skip rather than guess

    issues.push({
      flag,
      issueLabel: template.issueLabel,
      whyItMatters: template.whyItMatters,
      businessImpact: template.businessImpact,
      recommendedFix: template.recommendedFix,
      suggestedText: null, // filled in below if AI succeeds
      aiGenerated: false,
    });

    if (template.needsAiSuggestion && template.aiFieldKey) {
      neededFields.add(template.aiFieldKey);
    }
    // NOTE: thin_content intentionally does NOT add
    // "suggestedThinContentExpansion" to neededFields anymore — see the
    // AUDITOR-NOT-COPYWRITER note above. The template's own
    // whyItMatters/recommendedFix text (diagnostic, not generative) is
    // what ships for this flag now.
  }

  if (neededFields.size === 0 || !llm) {
    return { url: page.url, issues, aiCallMade: false, aiError: null };
  }

  try {
    const suggestions = await requestAiSuggestions(page, Array.from(neededFields), llm, context, issues);

    for (const issue of issues) {
      const template = getIssueTemplate(issue.flag);
      if (template?.needsAiSuggestion && template.aiFieldKey) {
        const value = suggestions[template.aiFieldKey];
        if (typeof value === "string" && value.trim()) {
          issue.suggestedText = value.trim();
          issue.aiGenerated = true;
        }
      }
    }

    return { url: page.url, issues, aiCallMade: true, aiError: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown AI generation error.";
    return { url: page.url, issues, aiCallMade: true, aiError: message };
  }
}

async function requestAiSuggestions(
  page: CrawlPageSuccess,
  neededFields: AiFieldKey[],
  llm: LLMProvider,
  context?: { language: DetectedLanguage; brand: BrandContext },
  issues?: IssueExplanation[]
): Promise<Partial<Record<AiFieldKey, string>>> {
  const systemInstruction = buildSystemInstruction(context);
  const userPrompt = buildPrompt(page, neededFields, context, issues ?? []);
  const rawText = await llm.generateJSON(systemInstruction, userPrompt);
  return parseJsonSafely(rawText, neededFields);
}

/**
 * System instruction covering the behavioral rules that apply to every
 * call, not just prompt content: role framing, anti-fabrication, and tone.
 * Kept separate from buildPrompt() (which carries the page-specific facts)
 * so these rules stay identical across every request regardless of which
 * fields are being generated.
 */
/** Sentinel the model returns for a field it cannot ground in real page or
 * site context — instead of emitting generic copy that would be identical
 * for any company (rule: no placeholders). The caller treats it as "no
 * suggestion" so the report shows the template diagnostic without a
 * fabricated value. */
const NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW";

/** Severity of the AI-eligible issues, surfaced in the prompt so the model
 * knows how critical the fix is. Mirrors priorityIssues.ts's severity map
 * for the flags that can trigger generation. */
const SEVERITY_BY_FLAG: Record<string, string> = {
  missing_title: "critical",
  missing_h1: "critical",
  missing_meta_description: "moderate",
  meta_description_length_out_of_range: "moderate",
  title_length_out_of_range: "moderate",
  multiple_h1: "moderate",
};

function buildSystemInstruction(context?: { language: DetectedLanguage; brand: BrandContext }): string {
  const lines = [
    "You are a senior technical SEO and AI-search (AEO/GEO) consultant writing client-facing recommendations for a specific client website — not a copywriter and not a generic marketing assistant.",
    "You generate ONLY short, structural on-page metadata (a title tag, a meta description, or an H1) when asked — never body copy, sample paragraphs, or placeholder content of any kind.",
    "Ground every suggestion in the specific page's actual content and this site's own context (URL path, existing title/meta/H1, detected brand language, inferred industry). Never write a suggestion that could apply to any website interchangeably. If you don't have enough context to be specific, say what is missing rather than defaulting to generic corporate phrasing.",
    "Write suggested copy the way a strategist who actually read the page would write it. Avoid vague filler words such as \"Insights\", \"Solutions\", \"Excellence\", or \"Best-in-class\" unless the site's own language already uses them — they read as templated. Include a concrete differentiator, outcome, or specific offering wherever possible.",
    "Never invent facts you weren't given: no fabricated statistics, traffic numbers, competitor claims, customer counts, or business details. If you frame a competitive or opportunity-cost gap, base it only on facts present in the prompt — never invent what competitors do.",
    "No filler, no restating the issue name, no hedge words (\"could potentially possibly help\"). Each field must be specific enough that a visitor can tell what the page covers without reading the URL.",
    `If your output for a field would be identical regardless of which company this audit is for, do NOT emit generic copy — return exactly the value ${NEEDS_MANUAL_REVIEW} for that field instead.`,
    "Output raw JSON only — no markdown code fences, no commentary, just the JSON object.",
  ];
  if (context) {
    lines.push(buildLanguageInstruction(context.language));
    const brandInstruction = buildBrandContextInstruction(context.brand);
    if (brandInstruction) lines.push(brandInstruction);
  }
  return lines.join(" ");
}

/**
 * Builds the prompt using whatever real signals this crawl actually has —
 * URL path, existing (possibly flagged) title/H1/meta content, word count.
 *
 * HONEST LIMITATION: this crawler doesn't extract full page body text, only
 * structured fields. AI suggestions are grounded in the URL and existing
 * metadata, not full article content — good enough to fix "missing title"
 * on a page whose URL is /emergency-plumber-chicago, not deeply
 * content-aware. If suggestion quality isn't good enough, the fix is
 * extracting more page text in the crawler, not tuning this prompt further.
 */
function buildPrompt(
  page: CrawlPageSuccess,
  neededFields: AiFieldKey[],
  context?: { language: DetectedLanguage; brand: BrandContext },
  issues: IssueExplanation[] = []
): string {
  let urlPath = safeUrlPath(page.url);
  let domain = "";
  try {
    const u = new URL(page.url);
    domain = u.hostname;
    urlPath = u.pathname || "/";
  } catch {
    // fall back to the raw string below
  }

  // issue_type + severity context, mapped from the AI-eligible flags on
  // this page (a single call can batch several — e.g. missing title AND
  // missing H1 on the same page).
  const issueTypes = issues
    .filter((i) => i.flag in SEVERITY_BY_FLAG)
    .map((i) => `${i.issueLabel} (${SEVERITY_BY_FLAG[i.flag]})`);
  const siteContextParts: string[] = [`domain: ${domain}`];
  if (context?.brand.signals.length) {
    siteContextParts.push(`detected brand/positioning language: ${context.brand.signals.join(", ")}`);
  }

  const lines: string[] = [
    `issue_type: ${issueTypes.length > 0 ? issueTypes.join(", ") : "on-page metadata"}`,
    `affected_page: ${page.url}`,
    ...(page.title.content ? [`current title tag: "${page.title.content}"`] : []),
    ...(page.metaDescription.content
      ? [`current meta description: "${page.metaDescription.content}"`]
      : []),
    ...(page.h1.length > 0 ? [`current H1: "${page.h1[0]}"`] : []),
    `approximate page length: ${page.wordCount} words`,
    `site_context: ${siteContextParts.join("; ")}`,
  ];

  lines.push(
    "",
    "Generate the following fields for THIS page, inferring the page's likely topic and any local/service context from the URL path and existing metadata above. Ground each field in this page and this site — never generic copy that could be pasted into any company's report.",
    `For H1 headings especially, never fall back to a generic template phrase (e.g. "Professional X Services", "X Services", "About X", "Welcome to X") or vague words like "Insights" / "Solutions" / "Excellence" unless the site itself uses them. The H1 must name something concrete about THIS page — the service, product, location, or question the URL and metadata describe — and headings across different pages must not all share the same sentence structure.`,
    `If any field cannot be grounded in the page or site context above, return exactly ${NEEDS_MANUAL_REVIEW} as that field's value instead of writing generic copy.`
  );

  const fieldInstructions: Record<AiFieldKey, string> = {
    suggestedTitle: '- "suggestedTitle": a title tag, 50-60 characters, no surrounding quotes in the value.',
    suggestedMetaDescription:
      '- "suggestedMetaDescription": a meta description, 120-160 characters, written to earn a click, no surrounding quotes in the value.',
    suggestedH1:
      '- "suggestedH1": an H1 heading (40–70 characters) that names the specific topic of this page — the service, product, question, or location the URL path and existing metadata actually describe. It must be specific to the page and NOT a generic template such as "Professional [Topic] Services", "Learn more about [Topic]", or a company name alone. Vary the phrasing from page to page: a blog post may be phrased as a question, a location page should name the city, a product page should name the product. A visitor should be able to tell what the page covers without reading the URL.',
  };

  for (const field of neededFields) {
    if (fieldInstructions[field]) lines.push(fieldInstructions[field]);
  }

  lines.push(
    "",
    `Return ONLY a JSON object with exactly these keys: ${neededFields.map((f) => `"${f}"`).join(", ")}.`
  );

  return lines.join("\n");
}

function safeUrlPath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/**
 * Defensively strips markdown code fences before parsing, in case the
 * model ignores the responseMimeType hint and wraps the JSON anyway.
 * Parses with standard JSON.parse over the raw UTF-8 string — Node's
 * fetch/JSON pipeline preserves multi-byte characters correctly by
 * default, so no re-encoding happens here. The corruption risk in a
 * pipeline like this is almost always downstream (a font with no glyph
 * coverage for the script, a non-UTF-8 DB column, a CSV writer that
 * doesn't declare its charset) rather than in this parsing step — see
 * the multilingual rendering notes for the PDF/CSV layers.
 */
function parseJsonSafely(
  rawText: string,
  expectedFields: AiFieldKey[]
): Partial<Record<AiFieldKey, string>> {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  // The model may legitimately answer the whole request with the
  // NEEDS_MANUAL_REVIEW sentinel (not JSON) when it can't ground anything.
  // Treat that as "no suggestions" rather than a hard error.
  if (cleaned.startsWith(NEEDS_MANUAL_REVIEW)) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI response was not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI response JSON was not an object.");
  }

  const result: Partial<Record<AiFieldKey, string>> = {};
  const record = parsed as Record<string, unknown>;
  for (const field of expectedFields) {
    const value = record[field];
    // A field marked NEEDS_MANUAL_REVIEW is deliberately dropped — the
    // report shows the template diagnostic with no fabricated suggestion
    // instead of shipping generic copy.
    if (typeof value === "string" && !value.trim().startsWith(NEEDS_MANUAL_REVIEW)) {
      result[field] = value.trim();
    }
  }
  return result;
}

const EXPLAIN_CONCURRENCY = 4;

/**
 * Runs explainPage() across every successfully-crawled page in a site.
 * Detects the site's primary language and brand-context signals ONCE per
 * crawl (not per page) and passes them into every explainPage() call, so
 * every generated field across the whole report is consistent — not one
 * page in Spanish and the next in English because of per-page noise.
 */
export async function explainCrawl(
  crawl: CrawlSiteResult,
  llm: LLMProvider | null
): Promise<PageExplanationResult[]> {
  const okPages = crawl.pages.filter((p) => p.ok);
  const results: PageExplanationResult[] = new Array(okPages.length);

  const language = detectPrimaryLanguage(okPages as CrawlPageSuccess[]);
  const brand = extractBrandContext(okPages as CrawlPageSuccess[]);
  const context = { language, brand };

  let index = 0;
  async function worker() {
    while (true) {
      const current = index;
      index++;
      if (current >= okPages.length) return;
      results[current] = await explainPage(okPages[current], llm, context);
    }
  }

  const workerCount = Math.max(1, Math.min(EXPLAIN_CONCURRENCY, okPages.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
