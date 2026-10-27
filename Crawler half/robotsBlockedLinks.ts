import type { BrokenLinkResult } from "./types";

export interface RobotsBlockedLinksSummary {
  count: number;
  links: BrokenLinkResult[];
  healthyMessage: string;
}

/**
 * Links discovered during the crawl but never actually checked because
 * robots.txt disallows them (see brokenLinks.ts's isDisallowedByRobots).
 * Surfaced as their own section, separate from genuine broken links — a
 * robots.txt block isn't evidence a link is dead, just that this crawler
 * declined to check it. Lumping these into "broken links" overstates how
 * much is actually wrong with the site (e.g. 100 links blocked by
 * robots.txt is not the same finding as 100 genuine 404s).
 */
export function buildRobotsBlockedLinks(brokenLinks: BrokenLinkResult[]): RobotsBlockedLinksSummary {
  const links = brokenLinks.filter((l) => l.failureCategory === "blocked_by_robots");
  return {
    count: links.length,
    links,
    healthyMessage: "No links were blocked by robots.txt during this audit — nothing to address here.",
  };
}