import type { AeoBotAccessResult } from "./aeoTypes";

/**
 * Parses robots.txt for rules scoped to specific named AI-crawler user
 * agents, distinct from robots.ts's existing parseRobotsTxt() which only
 * reads the `User-agent: *` block (correct for the main crawl-permission
 * logic, but not enough to answer "is GPTBot specifically blocked" — a
 * site can allow `*` and still disallow a named bot, or vice versa).
 *
 * Per the standard: a bot MUST use rules from its own named block if one
 * exists; only falls back to `*` if no block names it specifically.
 *
 * Enhanced: now tracks per-bot blocked paths (not just Disallow: /) and
 * detects systemic blocks — a site that blocks a bot's root path or all
 * public content directories is flagged even if a narrow /admin path is
 * also blocked. False-positive control: blocking /admin/, /login/, or
 * similar private paths is NOT a systemic block.
 */
const AI_BOTS: AeoBotAccessResult["bot"][] = ["GPTBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"];

/** Paths that are legitimately private/admin — blocking these does NOT
 * constitute a systemic AI block. Used to filter false positives when
 * determining if a bot is being meaningfully restricted from public
 * content. */
const PRIVATE_PATH_PATTERNS = /^\/(admin|login|wp-admin|wp-login|cart|checkout|account|my-account|cgi-bin|_internal|private|staging|dev|test)(\/|$)/i;

/** Paths that are likely site-wide content directories. Blocking these
 * for an AI bot constitutes a systemic block of public informational
 * content. */
const PUBLIC_CONTENT_PATTERNS = /^\/(blog|docs|help|support|resources|articles|news|products|services|solutions|about|faq|pricing|features)(\/|$)/i;

export function checkAiBotAccess(robotsTxt: string | null): AeoBotAccessResult[] {
  if (robotsTxt === null) {
    // No robots.txt = everything allowed by default (same "fail open" logic as robots.ts).
    return AI_BOTS.map((bot) => ({ bot, status: "allowed" as const, blockedPaths: [], relevantRules: [], systemicBlock: false }));
  }

  const lines = robotsTxt.split(/\r?\n/);
  const blocks: { agents: string[]; disallows: string[]; allows: string[] }[] = [];
  let current: { agents: string[]; disallows: string[]; allows: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      // A new User-agent line right after another User-agent line belongs
      // to the SAME block (multiple agents sharing one rule set) — a
      // User-agent line following a Disallow/Allow starts a new block.
      if (current && current.disallows.length === 0 && current.allows.length === 0 && current.agents.length > 0) {
        current.agents.push(value);
      } else {
        current = { agents: [value], disallows: [], allows: [] };
        blocks.push(current);
      }
    } else if (key === "disallow" && current) {
      if (value) current.disallows.push(value);
    } else if (key === "allow" && current) {
      if (value) current.allows.push(value);
    }
  }

  const results: AeoBotAccessResult[] = AI_BOTS.map((bot) => {
    const namedBlock = blocks.find((b) => b.agents.some((a) => a.toLowerCase() === bot.toLowerCase()));
    const applicable = namedBlock ?? blocks.find((b) => b.agents.includes("*"));
    if (!applicable) return { bot, status: "allowed" as const, blockedPaths: [], relevantRules: [], systemicBlock: false };

    const fullBlocked = applicable.disallows.some((d) => d === "/" || d.trim() === "/");
    const blocked = fullBlocked;

    // Collect all disallowed paths (excluding root which means everything)
    const blockedPaths = applicable.disallows.filter((d) => d && d.trim() !== "/");

    // Build relevant rules list for transparency
    const relevantRules: string[] = [];
    for (const d of applicable.disallows) {
      relevantRules.push(`Disallow: ${d}`);
    }
    for (const a of applicable.allows) {
      relevantRules.push(`Allow: ${a}`);
    }

    // Detect systemic block: root disallow OR blocking all public content
    // directories while only allowing private paths. A single private-path
    // block (e.g. /admin) is NOT systemic.
    let systemicBlock = fullBlocked;
    if (!systemicBlock && blockedPaths.length > 0) {
      const publicBlocked = blockedPaths.filter((p) => PUBLIC_CONTENT_PATTERNS.test(p));
      const privateOnly = blockedPaths.every((p) => PRIVATE_PATH_PATTERNS.test(p));
      // Systemic if: blocking 3+ public content paths, OR blocking root path content (/)
      systemicBlock = publicBlocked.length >= 3 || (publicBlocked.length > 0 && !privateOnly && blockedPaths.some((d) => d === "/" || d.trim() === "/"));
    }

    return {
      bot,
      status: blocked ? ("blocked" as const) : "allowed" as const,
      blockedPaths,
      relevantRules,
      systemicBlock,
    };
  });

  return results;
}

/**
 * Fetches raw robots.txt text. NOTE: runAudit no longer calls this — the
 * audit reuses the robots.txt body crawlSite already fetched
 * (crawl.robotsTxtRaw), so /robots.txt is requested exactly once per
 * audit. This export is kept for backward compatibility (external
 * callers / tests) and for standalone use of checkAiBotAccess.
 */
export async function fetchRawRobotsTxt(origin: string, userAgent: string, timeoutMs = 5000): Promise<string | null> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(new URL("/robots.txt", origin).toString(), {
      cache: "no-store",
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function checkLlmsTxt(
  origin: string,
  userAgent: string,
  timeoutMs = 5000
): Promise<{ present: boolean; url: string }> {
  const url = new URL("/llms.txt", origin).toString();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": userAgent }, signal: controller.signal });
    return { present: res.ok, url };
  } catch {
    return { present: false, url };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
