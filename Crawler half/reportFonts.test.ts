/**
 * Unit tests for the PDF content-font helpers.
 * Run with: npm run test:reportfonts
 *
 * These tests pin the two rules that keep scraped (possibly non-Latin)
 * page text readable in the PDF: the font stack must resolve Arabic to the
 * Arabic-capable font, and any character outside both embedded fonts must
 * collapse to "…" instead of becoming stacked/overlapping garbage glyphs.
 */
import {
  CONTENT_FONT_STACK,
  fitContentText,
} from "./reportFonts";

function assertTrue(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

export function run() {
  // --- font stack shape ---
  assertTrue("stack is Thai-first so Latin keeps its current look", CONTENT_FONT_STACK[0] === "NotoSansThai");
  assertTrue("Arabic is the second fallback in the stack", CONTENT_FONT_STACK[1] === "NotoSansArabic");

  // --- fitContentText: covered scripts pass through untouched ---
  assertTrue(
    "plain ASCII unchanged",
    fitContentText("High-quality production inkjet presses here.") === "High-quality production inkjet presses here."
  );
  assertTrue(
    "Latin punctuation (curly quotes, em dash, ®) unchanged",
    fitContentText("“Learn about HP® laptops — printers & more”") === "“Learn about HP® laptops — printers & more”"
  );
  assertTrue(
    "Thai text unchanged",
    fitContentText("ยินดีต้อนรับสู่เว็บไซต์ HP") === "ยินดีต้อนรับสู่เว็บไซต์ HP"
  );
  assertTrue(
    "Arabic text unchanged (the original overlapping-glyph repro)",
    fitContentText("تعرف على أجهزة HP المحمولة في موقع HP الرسمي") === "تعرف على أجهزة HP المحمولة في موقع HP الرسمي"
  );

  // --- fitContentText: uncovered scripts collapse to "…" ---
  assertTrue(
    "Cyrillic run collapses to an ellipsis (spaces survive)",
    fitContentText("Русский текст") === "… …"
  );
  assertTrue(
    "CJK run collapses to a single ellipsis",
    fitContentText("中文内容") === "…"
  );
  assertTrue(
    "mixed covered + uncovered keeps covered text and collapses the rest",
    fitContentText("HP 中文 Official") === "HP … Official"
  );
  assertTrue(
    "Hebrew collapses",
    fitContentText("עברית") === "…"
  );
  assertTrue(
    "replacement char itself never re-enters the missing-glyph path",
    fitContentText("…") === "…"
  );
  assertTrue(
    "empty string stays empty",
    fitContentText("") === ""
  );

  console.log("\nDone. If all lines above say PASS, the content-font stack and sanitizer are sound.");
}

if (require.main === module) {
  run();
}
