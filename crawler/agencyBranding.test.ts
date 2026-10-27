/**
 * Unit tests for the request-scoped Agency white-label branding helpers.
 * Run with: npm run test:agencybranding
 *
 * These tests pin the sanitization and geometry rules that keep the API
 * routes and the PDF renderer in agreement — and make sure branding data is
 * treated as a throwaway request payload (nothing here touches a database).
 */
import {
  sanitizeAgencyBranding,
  isValidLogoDataUrl,
  fitLogoWithin,
  displayHost,
  LOGO_MAX_BASE64_LENGTH,
} from "./agencyBranding";

// A real 1×1 transparent PNG (valid base64 data URL) — usable as a stand-in
// logo in sanitization tests.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function assertTrue(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

export function run() {
  // --- sanitizeAgencyBranding: valid payload passes through cleanly ---
  const clean = sanitizeAgencyBranding({
    agencyName: "  Acme Agency  ",
    clientName: "Example Co",
    clientWebsite: "https://www.example.com/",
    reportDate: "August 11, 2026",
    logo: { dataUrl: TINY_PNG, width: 600, height: 200 },
  });
  assertTrue("valid branding: strings trimmed and kept", clean?.agencyName === "Acme Agency" && clean?.clientName === "Example Co");
  assertTrue("valid branding: logo kept with dims", clean?.logo?.width === 600 && clean?.logo?.height === 200 && clean?.logo?.dataUrl === TINY_PNG);

  // --- sanitizeAgencyBranding: garbage rejected ---
  assertTrue("non-object input -> null", sanitizeAgencyBranding(null) === null);
  assertTrue("string input -> null", sanitizeAgencyBranding("Acme") === null);
  assertTrue("empty object -> null", sanitizeAgencyBranding({}) === null);
  assertTrue("non-string fields dropped", sanitizeAgencyBranding({ agencyName: 123, clientName: null }) === null);

  // --- logo data URL validation ---
  assertTrue("valid PNG data URL accepted", isValidLogoDataUrl(TINY_PNG));
  assertTrue("JPEG data URL accepted", isValidLogoDataUrl("data:image/jpeg;base64,/9j/4AAQSkZJRg=="));
  assertTrue("WebP data URL rejected (PDF engine cannot embed it)", !isValidLogoDataUrl("data:image/webp;base64,UklGRg=="));
  assertTrue("non-image data URL rejected", !isValidLogoDataUrl("data:text/plain;base64,aGVsbG8="));
  assertTrue("plain string rejected", !isValidLogoDataUrl("https://example.com/logo.png"));
  assertTrue("absurdly long data URL rejected", !isValidLogoDataUrl(`data:image/png;base64,${"A".repeat(LOGO_MAX_BASE64_LENGTH + 10)}`));

  // --- logo records with bad dims rejected ---
  const badDims = sanitizeAgencyBranding({
    agencyName: "Acme",
    logo: { dataUrl: TINY_PNG, width: NaN, height: 200 },
  });
  assertTrue("logo with NaN width dropped, rest kept", badDims?.agencyName === "Acme" && badDims?.logo === undefined);
  const zeroDims = sanitizeAgencyBranding({ agencyName: "Acme", logo: { dataUrl: TINY_PNG, width: 0, height: 0 } });
  assertTrue("logo with zero dims dropped", zeroDims?.logo === undefined);

  // --- strings capped at sane lengths ---
  const longStrings = sanitizeAgencyBranding({ agencyName: "A".repeat(300), clientName: "B".repeat(300) });
  assertTrue("agency name capped at 80 chars", longStrings?.agencyName?.length === 80);
  assertTrue("client name capped at 80 chars", longStrings?.clientName?.length === 80);

  // --- fitLogoWithin: contain-fit never stretches or crops ---
  const wide = fitLogoWithin(1200, 400, 520, 190);
  assertTrue("3:1 logo fits the 520x190 box at 520 wide", Math.abs(wide.w - 520) < 0.01 && Math.abs(wide.h - 173.33) < 0.1);
  const ratioWide = wide.w / wide.h;
  assertTrue("fitted 3:1 logo keeps 3:1 ratio", Math.abs(ratioWide - 3) < 0.01);
  const tall = fitLogoWithin(600, 600, 150, 26);
  assertTrue("square logo fits the footer box by height", Math.abs(tall.h - 26) < 0.01 && Math.abs(tall.w - 26) < 0.01);
  assertTrue("square logo stays square", Math.abs(tall.w / tall.h - 1) < 0.01);
  const tiny = fitLogoWithin(1, 1, 520, 190);
  assertTrue("1px logo never blows up beyond the box", tiny.w <= 520 && tiny.h <= 190);
  assertTrue("degenerate dims guarded", fitLogoWithin(0, 0, 520, 190).w > 0);

  // --- displayHost: cover page website label ---
  assertTrue("protocol stripped", displayHost("https://www.example.com/") === "example.com");
  assertTrue("www stripped", displayHost("http://www.example.com") === "example.com");
  assertTrue("no-scheme input handled", displayHost("example.com/path") === "example.com");
  assertTrue("empty input", displayHost("") === "");

  console.log("\nDone. If all lines above say PASS, agency branding helpers are sound.");
}

if (require.main === module) {
  run();
}
