import type { CrawlPageSuccess } from "./types";

export interface DetectedLanguage {
  code: string; // e.g. "zh", "ja", "ko", "ar", "hi", "ne", "en"
  name: string; // human-readable, e.g. "Chinese"
  script: "latin" | "cjk-han" | "japanese" | "korean" | "arabic" | "devanagari" | "other";
  confidence: "high" | "medium" | "low";
  source: "html-lang" | "character-heuristic" | "default";
}

const LANG_NAME: Record<string, string> = {
  en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic",
  hi: "Hindi", ne: "Nepali", es: "Spanish", fr: "French", de: "German",
  pt: "Portuguese", ru: "Russian", it: "Italian", th: "Thai", vi: "Vietnamese",
  id: "Indonesian", tr: "Turkish", pl: "Polish", nl: "Dutch",
};

// Unicode-range fallback used only when <html lang> is missing or clearly
// wrong (extremely common on real small-business sites — copy/pasted
// templates frequently leave lang="en" on a non-English site). This is a
// heuristic, not a language-ID model — good enough to route to the right
// font/prompt language, not meant to be linguistically precise.
const SCRIPT_RANGES: { script: DetectedLanguage["script"]; code: string; regex: RegExp }[] = [
  { script: "japanese", code: "ja", regex: /[\u3040-\u30FF]/ }, // hiragana/katakana => Japanese even though it also uses Han
  { script: "korean", code: "ko", regex: /[\uAC00-\uD7A3]/ },
  { script: "cjk-han", code: "zh", regex: /[\u4E00-\u9FFF]/ },
  { script: "arabic", code: "ar", regex: /[\u0600-\u06FF]/ },
  { script: "devanagari", code: "hi", regex: /[\u0900-\u097F]/ }, // covers Hindi; Nepali disambiguated below
];

// Devanagari alone can't distinguish Hindi from Nepali reliably; this is a
// low-confidence nudge only, not a claim of certainty.
const NEPALI_HINTS = /\u0930\u094D\u0938|\u0928\u0947\u092A\u093E\u0932/;

function normalizeHtmlLang(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const primary = raw.trim().toLowerCase().split(/[-_]/)[0];
  return primary || null;
}

function scriptForCode(code: string): DetectedLanguage["script"] {
  if (code === "ja") return "japanese";
  if (code === "ko") return "korean";
  if (code === "zh") return "cjk-han";
  if (code === "ar") return "arabic";
  if (code === "hi" || code === "ne") return "devanagari";
  return "latin";
}

/**
 * Best-effort primary-language detection for a crawled site. Drives two
 * things downstream: (a) the language the AI layer is instructed to
 * respond in, and (b) which PDF font family gets used so the output
 * actually renders instead of showing tofu boxes or mojibake.
 *
 * Requires CrawlPageSuccess to carry `htmlLang` (the page's <html lang>
 * attribute) — see the crawlPage.ts patch note shipped alongside this
 * file. Falls back gracefully (character-range heuristic, then "en") if
 * that field isn't present on older cached crawl results.
 */
export function detectPrimaryLanguage(
  pages: (CrawlPageSuccess & { htmlLang?: string | null })[]
): DetectedLanguage {
  const sample = pages.slice(0, 20);

  // 1) <html lang>, majority vote across sampled pages.
  const langVotes = new Map<string, number>();
  for (const p of sample) {
    const code = normalizeHtmlLang(p.htmlLang);
    if (code) langVotes.set(code, (langVotes.get(code) ?? 0) + 1);
  }
  const topVote = Array.from(langVotes.entries()).sort((a, b) => b[1] - a[1])[0];

  // 2) Character-range heuristic over visible title/meta/H1 text.
  const sampleText = sample
    .map((p) => [p.title.content, p.metaDescription.content, ...(p.h1 ?? [])].filter(Boolean).join(" "))
    .join(" ");

  let scriptMatch: { script: DetectedLanguage["script"]; code: string } | null = null;
  for (const range of SCRIPT_RANGES) {
    if (range.regex.test(sampleText)) {
      scriptMatch = { script: range.script, code: range.code };
      break;
    }
  }
  if (scriptMatch?.script === "devanagari" && NEPALI_HINTS.test(sampleText)) {
    scriptMatch = { script: "devanagari", code: "ne" };
  }

  if (topVote && topVote[0] !== "en") {
    const code = topVote[0];
    return { code, name: LANG_NAME[code] ?? code, script: scriptForCode(code), confidence: "high", source: "html-lang" };
  }
  if (scriptMatch) {
    return {
      code: scriptMatch.code,
      name: LANG_NAME[scriptMatch.code] ?? scriptMatch.code,
      script: scriptMatch.script,
      confidence: "medium",
      source: "character-heuristic",
    };
  }
  if (topVote) {
    return { code: topVote[0], name: LANG_NAME[topVote[0]] ?? topVote[0], script: "latin", confidence: "high", source: "html-lang" };
  }
  return { code: "en", name: "English", script: "latin", confidence: "low", source: "default" };
}

/**
 * Instruction fragment inserted into the AI prompt. Explicitly tells the
 * model to preserve quoted existing on-page text verbatim (e.g. a "Current
 * title tag" value shown for context) even when generated text should be
 * in the site's language — those are different things and shouldn't both
 * get translated or both get left in English by accident.
 */
export function buildLanguageInstruction(lang: DetectedLanguage): string {
  if (lang.code === "en") return "Write all generated text in English.";
  const confidenceNote =
    lang.confidence === "low"
      ? " (Detection confidence is low — if the actual page content given to you looks like a different language, follow the content, not this label.)"
      : "";
  return (
    `This website's primary language is ${lang.name} (${lang.code}). Write all generated text ` +
    `(titles, meta descriptions, H1s) naturally in ${lang.name}, using correct native spelling, ` +
    `grammar, and punctuation — never transliterated or romanized text, never placeholder ` +
    `characters.${confidenceNote} Any existing on-page text quoted to you for context (e.g. a ` +
    `"Current title tag" value) must be repeated exactly as given, in its original language.`
  );
}
