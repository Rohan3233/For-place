/**
 * Content-font helpers for the PDF report.
 *
 * The report renders scraped page content (titles, meta descriptions, H1s,
 * AI suggestions) whose script is unknown at build time. @react-pdf has NO
 * automatic per-glyph fallback beyond a fixed font stack, and when a
 * character is missing from every font in the stack it substitutes a wrong
 * glyph with a broken advance width — characters pile up on top of each
 * other (the "overlapping text" bug seen on Arabic-locale pages like
 * hp.com/sa-ar).
 *
 * Two-part defense:
 *   1. CONTENT_FONT_STACK — every content style uses `fontFamily: [...]`,
 *      which react-pdf resolves per code point (first font in the stack
 *      that has the glyph wins). NotoSansThai covers Latin + Thai +
 *      punctuation; NotoSansArabic covers Arabic + Latin + punctuation.
 *   2. fitContentText — any character still outside BOTH fonts' real cmap
 *      coverage (Cyrillic, CJK, emoji, …) is collapsed to a single "…",
 *      so it can never render as stacked garbage. Coverage is parsed from
 *      the embedded font files themselves, so it stays exact if the fonts
 *      change.
 */
import fs from "node:fs";
import path from "node:path";

export const CONTENT_FONT_THAI = "NotoSansThai";
export const CONTENT_FONT_ARABIC = "NotoSansArabic";
export const CONTENT_FONT_DEVANAGARI = "NotoSansDevanagari";
/** Order matters: the first font that has a glyph for a code point wins. */
export const CONTENT_FONT_STACK: string[] = [CONTENT_FONT_THAI, CONTENT_FONT_ARABIC, CONTENT_FONT_DEVANAGARI];

// "…" is present in NotoSansThai (and NotoSansArabic), so a replacement
// character never re-enters the missing-glyph path.
const REPLACEMENT = "\u2026";

// ---------------------------------------------------------------------------
// Minimal TrueType/OpenType cmap parser — enough to know exactly which code
// points an embedded font can render. Fonts are parsed once at module load
// and the result is cached. If a font file is missing the sanitizer degrades
// to a no-op (the report still renders; the missing-glyph path just stays
// possible for that font).
// ---------------------------------------------------------------------------

function parseCmapCoverage(filePath: string): Set<number> | null {
  let data: Buffer;
  try {
    data = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (data.length < 12) return null;
  const numTables = data.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + 16 * i;
    if (data.toString("latin1", rec, rec + 4) === "cmap") {
      cmapOffset = data.readUInt32BE(rec + 8);
      break;
    }
  }
  if (cmapOffset < 0) return null;
  const numSubtables = data.readUInt16BE(cmapOffset + 2);
  const covered = new Set<number>();
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + 8 * i;
    const subOffset = cmapOffset + data.readUInt32BE(rec + 4);
    // Skip variation-selector subtables (format 14) and symbol encodings we
    // do not rely on; parse everything else.
    const format = data.readUInt16BE(subOffset);
    if (format === 4) {
      parseFormat4(data, subOffset, covered);
    } else if (format === 12) {
      parseFormat12(data, subOffset, covered);
    } else if (format === 6) {
      parseFormat6(data, subOffset, covered);
    } else if (format === 0) {
      parseFormat0(data, subOffset, covered);
    }
  }
  return covered;
}

function parseFormat4(data: Buffer, off: number, out: Set<number>): void {
  const segCountX2 = data.readUInt16BE(off + 6);
  const segCount = segCountX2 / 2;
  const endCodes = new Array<number>(segCount);
  for (let s = 0; s < segCount; s++) endCodes[s] = data.readUInt16BE(off + 14 + 2 * s);
  const startCodes = new Array<number>(segCount);
  for (let s = 0; s < segCount; s++) startCodes[s] = data.readUInt16BE(off + 16 + segCountX2 + 2 * s);
  const idDeltas = new Array<number>(segCount);
  for (let s = 0; s < segCount; s++) idDeltas[s] = data.readInt16BE(off + 16 + 2 * segCountX2 + 2 * s);
  const idRangeOffsets = new Array<number>(segCount);
  for (let s = 0; s < segCount; s++) idRangeOffsets[s] = data.readUInt16BE(off + 16 + 3 * segCountX2 + 2 * s);
  const idRangeOffsetBase = off + 16 + 4 * segCountX2;
  for (let s = 0; s < segCount; s++) {
    const start = startCodes[s];
    const end = Math.min(endCodes[s], 0xffff);
    for (let cp = start; cp <= end; cp++) {
      if (cp === 0xffff) continue;
      let gid: number;
      if (idRangeOffsets[s] === 0) {
        gid = (cp + idDeltas[s]) & 0xffff;
      } else {
        const glyphAddr = idRangeOffsetBase + 2 * idRangeOffsets[s] + 2 * (cp - start);
        if (glyphAddr + 2 > data.length) continue;
        gid = data.readUInt16BE(glyphAddr);
        if (gid !== 0) gid = (gid + idDeltas[s]) & 0xffff;
      }
      if (gid !== 0) out.add(cp);
    }
  }
}

function parseFormat12(data: Buffer, off: number, out: Set<number>): void {
  const nGroups = data.readUInt32BE(off + 12);
  for (let g = 0; g < nGroups; g++) {
    const rec = off + 16 + 12 * g;
    const start = data.readUInt32BE(rec);
    const end = data.readUInt32BE(rec + 4);
    const startGlyph = data.readUInt32BE(rec + 8);
    if (startGlyph !== 0) {
      for (let cp = start; cp <= end; cp++) out.add(cp);
    }
  }
}

function parseFormat6(data: Buffer, off: number, out: Set<number>): void {
  const firstCode = data.readUInt16BE(off + 6);
  const entryCount = data.readUInt16BE(off + 8);
  for (let i = 0; i < entryCount; i++) {
    const gid = data.readUInt16BE(off + 10 + 2 * i);
    if (gid !== 0) out.add(firstCode + i);
  }
}

function parseFormat0(data: Buffer, off: number, out: Set<number>): void {
  const length = data.readUInt16BE(off + 2);
  for (let cp = 0; cp < length - 6 && cp <= 0xff; cp++) {
    if (data[off + 6 + cp] !== 0) out.add(cp);
  }
}

let thaiCoverage: Set<number> | null | undefined;
let arabicCoverage: Set<number> | null | undefined;
let devanagariCoverage: Set<number> | null | undefined;
let unionCoverage: Set<number> | null | undefined;

function contentCoverage(): Set<number> | null {
  if (thaiCoverage === undefined) {
    thaiCoverage = parseCmapCoverage(path.join(__dirname, "fonts", "NotoSansThai.ttf"));
  }
  if (arabicCoverage === undefined) {
    arabicCoverage = parseCmapCoverage(path.join(__dirname, "fonts", "NotoSansArabic.ttf"));
  }
  if (devanagariCoverage === undefined) {
    devanagariCoverage = parseCmapCoverage(path.join(__dirname, "fonts", "NotoSansDevanagari-Regular.ttf"));
  }
  if (unionCoverage !== undefined) return unionCoverage;
  // Union is what the font stack can actually render. If one font file is
  // missing, the others still provide real coverage — only when ALL are
  // unavailable do we disable the sanitizer entirely (report still renders).
  unionCoverage = null;
  if (thaiCoverage !== null) {
    unionCoverage = new Set<number>(thaiCoverage);
  }
  if (arabicCoverage !== null) {
    if (unionCoverage === null) unionCoverage = new Set<number>();
    for (const cp of arabicCoverage) unionCoverage.add(cp);
  }
  if (devanagariCoverage !== null) {
    if (unionCoverage === null) unionCoverage = new Set<number>();
    for (const cp of devanagariCoverage) unionCoverage.add(cp);
  }
  return unionCoverage;
}

/**
 * Replaces every character outside the embedded fonts' combined coverage
 * with a single "…" (consecutive uncovered characters collapse into one),
 * so react-pdf can never substitute a broken glyph again. No-op when the
 * coverage sets are unavailable.
 */
export function fitContentText(text: string): string {
  const covered = contentCoverage();
  if (!covered) return text;
  let out = "";
  let runUncovered = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && covered.has(cp)) {
      out += ch;
      runUncovered = false;
    } else if (!runUncovered) {
      out += REPLACEMENT;
      runUncovered = true;
    }
  }
  return out;
}
