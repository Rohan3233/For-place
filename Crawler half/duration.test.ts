/**
 * Tests for the shared runtime display helpers (duration.ts).
 * Run with: npm run test:duration (or: npx ts-node lib/crawler/duration.test.ts)
 */
import { formatDuration, buildRuntimeBreakdown, totalRuntimeMs } from "./duration";
import type { CrawlTimings } from "./types";

function assertTrue(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} - ${label}`);
  if (!condition) process.exitCode = 1;
}

function timings(overrides: Partial<CrawlTimings> = {}): CrawlTimings {
  return {
    totalMs: 1000,
    crawlMs: 0,
    homepagePageSpeedMs: 0,
    aeoNetworkMs: 0,
    streamedCwvMs: 0,
    streamedImagesMs: 0,
    remainingCwvMs: 0,
    brokenLinksMs: 0,
    scoreAndAeoMs: 0,
    cacheWriteMs: 0,
    pagesCrawled: 0,
    pagesOk: 0,
    pagesFailed: 0,
    pagesSkippedRobots: 0,
    cwvRequests: 0,
    brokenLinksChecked: 0,
    brokenLinksSkippedAsCrawled: 0,
    imagesChecked: 0,
    httpRequests: 0,
    ...overrides,
  };
}

export async function run() {
  // --- formatDuration ------------------------------------------------
  assertTrue('0 -> "0 sec"', formatDuration(0) === "0 sec");
  assertTrue('58s -> "58 sec"', formatDuration(58_000) === "58 sec");
  assertTrue('4min -> "4 min"', formatDuration(240_000) === "4 min");
  assertTrue('4min12s -> "4 min 12 sec"', formatDuration(252_000) === "4 min 12 sec");
  assertTrue('1hr -> "1 hr"', formatDuration(3_600_000) === "1 hr");
  assertTrue('1hr5min -> "1 hr 5 min"', formatDuration(3_900_000) === "1 hr 5 min");
  assertTrue("NaN -> n/a", formatDuration(NaN) === "n/a");
  assertTrue("negative -> n/a", formatDuration(-5) === "n/a");

  // --- buildRuntimeBreakdown ----------------------------------------
  const t = timings({
    totalMs: 1_000_000,
    crawlMs: 250_000,
    homepagePageSpeedMs: 100_000,
    streamedCwvMs: 900_000,
    cwvWallMs: 950_000,
    brokenLinksMs: 40_000,
    streamedImagesMs: 20_000,
    scoreAndAeoMs: 500,
  });
  const stages = buildRuntimeBreakdown(t);
  assertTrue("all 4 major stages present", stages.length === 4);
  assertTrue("crawl first", stages[0].label === "Crawl" && stages[0].ms === 250_000);
  assertTrue(
    "CWV uses the wall-clock span (cwvWallMs) when present",
    stages[1].label === "Core Web Vitals" && stages[1].ms === 950_000
  );
  assertTrue("broken links stage", stages[2].label === "Broken links" && stages[2].ms === 40_000);
  assertTrue("image analysis stage", stages[3].label === "Image analysis" && stages[3].ms === 20_000);

  // The wall-clock span can never exceed the total audit time, even though
  // the parallel phases (homepage 100s + streamed 900s) individually would
  // sum to 1,000,000ms — the old sum model showed a CWV stage LONGER than
  // the whole audit.
  assertTrue(
    "CWV wall span never exceeds totalMs",
    stages[1].ms <= t.totalMs
  );
  assertTrue(
    "CWV wall span is not the sum of parallel phases",
    stages[1].ms < 100_000 + 900_000
  );

  // Legacy cached audits lack cwvWallMs — fall back to the longest single
  // phase, which still can't exceed the total.
  const legacy = timings({
    crawlMs: 250_000,
    homepagePageSpeedMs: 100_000,
    streamedCwvMs: 900_000,
    remainingCwvMs: 0,
    brokenLinksMs: 40_000,
    streamedImagesMs: 20_000,
  });
  const legacyStages = buildRuntimeBreakdown(legacy);
  assertTrue(
    "legacy (no cwvWallMs) falls back to the longest parallel phase",
    legacyStages.find((s) => s.label === "Core Web Vitals")?.ms === 900_000
  );

  // Zero-duration stages (e.g. image checks disabled) are omitted, not "0 sec".
  const t2 = timings({
    crawlMs: 100_000,
    homepagePageSpeedMs: 50_000,
    streamedCwvMs: 200_000,
    brokenLinksMs: 10_000,
    streamedImagesMs: 0,
  });
  const stages2 = buildRuntimeBreakdown(t2);
  assertTrue("image stage omitted when 0ms (disabled)", !stages2.some((s) => s.label === "Image analysis"));
  assertTrue("other stages kept", stages2.length === 3);

  // --- ASCII safety (PDF renders Helvetica/WinAnsi) -------------------
  const allAscii = [0, 1, 999, 1000, 59_000, 60_000, 3_600_000, 3_900_000].every((ms) =>
    /^[A-Za-z0-9 ]+$/.test(formatDuration(ms))
  );
  assertTrue("all formatted durations are plain ASCII", allAscii);

  // --- totalRuntimeMs: true wall-clock span, never a stage sum ---------
  const start = "2026-08-13T10:00:00.000Z";
  const end = "2026-08-13T10:18:00.000Z"; // 18 min
  const summedStages = 25 * 60 * 1000 + 35 * 1000; // 25m35s — the old (wrong) sum
  assertTrue(
    "wall-clock span wins over the summed fallback",
    totalRuntimeMs(start, end, summedStages) === 18 * 60 * 1000
  );
  assertTrue("fallback used when timestamps missing", totalRuntimeMs(null, end, summedStages) === summedStages);
  assertTrue("fallback used when completedAt missing", totalRuntimeMs(start, null, summedStages) === summedStages);
  assertTrue("inverted timestamps fall back", totalRuntimeMs(end, start, summedStages) === summedStages);
  assertTrue("nothing measurable returns null", totalRuntimeMs(null, null, null) === null);
  assertTrue("garbage timestamps fall back", totalRuntimeMs("not-a-date", end, 42) === 42);
}

if (require.main === module) {
  run();
}
