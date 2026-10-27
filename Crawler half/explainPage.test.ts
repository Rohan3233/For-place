/**
 * Sanity tests for explainPage / explainCrawl.
 * Run with: npm run test:explain
 */
import { explainPage } from "./explainPage";
import type { CrawlPageSuccess, LLMProvider } from "./types";

function fakePage(flags: string[], overrides: Partial<CrawlPageSuccess> = {}): CrawlPageSuccess {
  return {
    ok: true,
    url: "https://example.com/emergency-plumber-chicago",
    requestedUrl: "https://example.com/emergency-plumber-chicago",
    redirected: false,
    redirectHopCount: 0,
    fetchedAt: new Date().toISOString(),
    statusCode: 200,
    contentType: "text/html",
    title: { content: null, length: 0 },
    metaDescription: { content: null, length: 0 },
    h1: [],
    headings: { h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    canonical: { url: null, isSelfReferencing: null },
    internalLinks: [],
    isOrphan: false,
    wordCount: 400,
    flags,
    structuredData: { present: false, types: [], format: null },
    robotsMeta: { noindex: false, nofollow: false },
    xRobotsTag: { noindex: false, raw: null },
    redirectHopStatusCodes: [],
    htmlLang: null,
    aeoSignals: {} as any,
    ...overrides,
  };
}

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

export async function run() {
  // --- Test 1: a flag with no AI need (missing_alt_text) never calls the LLM ---
  let callCount = 0;
  const countingLlm: LLMProvider = {
    generateJSON: async () => {
      callCount++;
      return "{}";
    },
  };
  const templateOnlyResult = await explainPage(fakePage(["missing_alt_text"]), countingLlm);
  assertTrue("template-only flag makes zero AI calls", callCount === 0);
  assertTrue("aiCallMade is false when nothing needs AI", templateOnlyResult.aiCallMade === false);
  assertTrue(
    "template text is still populated without AI",
    templateOnlyResult.issues[0]?.whyItMatters.length > 0
  );

  // --- Test 2: multiple AI-eligible flags on one page = exactly ONE call, not two ---
  callCount = 0;
  let lastPromptFieldsRequested: string[] = [];
  const batchingLlm: LLMProvider = {
    generateJSON: async (_system, prompt) => {
      callCount++;
      lastPromptFieldsRequested = ["suggestedTitle", "suggestedMetaDescription"].filter((f) =>
        prompt.includes(f)
      );
      return JSON.stringify({
        suggestedTitle: "24/7 Emergency Plumber in Chicago | FastFix Plumbing",
        suggestedMetaDescription:
          "Need a plumber fast? FastFix offers 24/7 emergency plumbing repairs across Chicago. Call now for same-day service.",
      });
    },
  };
  const batchedResult = await explainPage(
    fakePage(["missing_title", "missing_meta_description"]),
    batchingLlm
  );
  assertTrue("two AI-eligible flags trigger exactly ONE LLM call, not two", callCount === 1);
  assertTrue(
    "the single call asked for both needed fields",
    lastPromptFieldsRequested.includes("suggestedTitle") &&
      lastPromptFieldsRequested.includes("suggestedMetaDescription")
  );
  const titleIssue = batchedResult.issues.find((i) => i.flag === "missing_title");
  const descIssue = batchedResult.issues.find((i) => i.flag === "missing_meta_description");
  assertTrue("suggested title was filled in from the batched response", !!titleIssue?.suggestedText);
  assertTrue("suggested description was filled in from the same response", !!descIssue?.suggestedText);
  assertTrue("aiGenerated flag set correctly", titleIssue?.aiGenerated === true);

  // --- Test 3: AI call fails entirely -> graceful degradation, not a thrown error ---
  const failingLlm: LLMProvider = {
    generateJSON: async () => {
      throw new Error("simulated API outage");
    },
  };
  let threw = false;
  let degradedResult;
  try {
    degradedResult = await explainPage(fakePage(["missing_h1"]), failingLlm);
  } catch {
    threw = true;
  }
  assertTrue("a failing AI call does not throw out of explainPage", threw === false);
  assertTrue(
    "template explanation is still present despite AI failure",
    degradedResult !== undefined && degradedResult.issues[0]?.whyItMatters.length > 0
  );
  assertTrue(
    "suggestedText is null when AI failed, not a crash",
    degradedResult !== undefined && degradedResult.issues[0]?.suggestedText === null
  );
  assertTrue(
    "aiError is populated with the failure reason",
    degradedResult !== undefined && !!degradedResult.aiError
  );

  // --- Test 4: model wraps JSON in markdown fences anyway -> still parsed ---
  const fencedLlm: LLMProvider = {
    generateJSON: async () =>
      '```json\n{"suggestedH1": "24/7 Emergency Plumbing Services in Chicago"}\n```',
  };
  const fencedResult = await explainPage(fakePage(["missing_h1"]), fencedLlm);
  assertTrue(
    "markdown-fenced JSON response is still parsed correctly",
    fencedResult.issues[0]?.suggestedText === "24/7 Emergency Plumbing Services in Chicago"
  );

  // --- Test 5: no LLM provider at all (e.g. free tier) -> template-only, no crash ---
  const noProviderResult = await explainPage(fakePage(["missing_title"]), null);
  assertTrue("null provider produces template-only result, no crash", noProviderResult.aiCallMade === false);
  assertTrue(
    "suggestedText stays null with no provider",
    noProviderResult.issues[0]?.suggestedText === null
  );

  // --- Test 6: model marks a field NEEDS_MANUAL_REVIEW -> no generic copy
  // ships; the field is left null (template diagnostic only), not a crash ---
  const sentinelLlm: LLMProvider = {
    generateJSON: async (_system, prompt) => {
      assertTrue(
        "prompt instructs the model about the NEEDS_MANUAL_REVIEW sentinel",
        prompt.includes("NEEDS_MANUAL_REVIEW")
      );
      assertTrue(
        "prompt carries issue_type + severity context",
        prompt.includes("Missing title tag (critical)") || prompt.includes("critical")
      );
      assertTrue(
        "prompt grounds suggestions in the specific page URL",
        prompt.includes("emergency-plumber-chicago")
      );
      return JSON.stringify({
        suggestedTitle: "NEEDS_MANUAL_REVIEW",
        suggestedMetaDescription:
          "24/7 emergency plumbing repairs across Chicago with same-day response.",
      });
    },
  };
  const sentinelResult = await explainPage(
    fakePage(["missing_title", "missing_meta_description"]),
    sentinelLlm
  );
  const sentinelTitle = sentinelResult.issues.find((i) => i.flag === "missing_title");
  const sentinelDesc = sentinelResult.issues.find((i) => i.flag === "missing_meta_description");
  assertTrue(
    "NEEDS_MANUAL_REVIEW field is dropped (suggestedText null), not shipped as copy",
    sentinelTitle?.suggestedText === null && sentinelTitle?.aiGenerated === false
  );
  assertTrue(
    "other fields in the same response are still accepted",
    !!sentinelDesc?.suggestedText && sentinelDesc?.aiGenerated === true
  );

  // --- Test 7: model returns the bare sentinel (not JSON) -> graceful, no
  // suggestions, no crash ---
  const bareSentinelLlm: LLMProvider = {
    generateJSON: async () => "NEEDS_MANUAL_REVIEW",
  };
  let bareThrew = false;
  let bareResult;
  try {
    bareResult = await explainPage(fakePage(["missing_h1"]), bareSentinelLlm);
  } catch {
    bareThrew = true;
  }
  assertTrue("bare sentinel response does not throw", bareThrew === false);
  assertTrue(
    "bare sentinel response leaves suggestedText null",
    bareResult !== undefined && bareResult.issues[0]?.suggestedText === null
  );

  console.log("\nDone. If all lines above say PASS, the hybrid AI explanation layer is working.");
}

if (require.main === module) {
  run();
}
