import type { ImpactLevel } from "./impactLevel";

/**
 * These four sections (Schema, Duplicate Titles, Duplicate Meta
 * Descriptions, Broken Links) were built ad hoc, before groupIssues.ts's
 * whyItMatters/businessImpact/recommendedFix pattern existed — so they
 * never got it, and stood out as noticeably thinner than every other
 * issue section. This gives each of them the same fixed copy block +
 * an impact level, so `impactBadgeText`-style rendering can be applied
 * uniformly everywhere in both reports. The four Schema/Duplicate
 * constants are wired into the PDF and web reports; the Broken Links
 * constant remains available for when that section is next touched.
 */
export interface AuxiliarySectionCopy {
  whyItMatters: string;
  businessImpact: string;
  recommendedFix: string;
  impactLevel: ImpactLevel;
}

export const DUPLICATE_TITLES_COPY: AuxiliarySectionCopy = {
  whyItMatters:
    "The same title tag appears on more than one page. Search engines use the title to understand what a page is about — when two pages share one, it's harder to tell them apart.",
  businessImpact:
    "Instead of two pages each ranking well for their own topic, they end up splitting ranking signal between them — competing with each other instead of with other sites.",
  recommendedFix: "Write a unique, specific title for each page listed below, describing what makes that particular page different.",
  impactLevel: "medium",
};

export const DUPLICATE_META_DESCRIPTIONS_COPY: AuxiliarySectionCopy = {
  whyItMatters:
    "These pages share an identical meta description. Only one of them can stand out with it in search results — the rest are effectively competing against a copy of themselves.",
  businessImpact:
    "A visitor scanning search results sees the same preview text twice and has no way to tell which page actually answers what they're looking for.",
  recommendedFix: "Write a distinct 120–160 character description for each page listed below, focused on what's unique about it.",
  impactLevel: "medium",
};

export const BROKEN_LINKS_SECTION_COPY: AuxiliarySectionCopy = {
  whyItMatters:
    "A broken link sends a visitor to a dead page — and search engines that follow the same link waste crawl budget on something that doesn't resolve.",
  businessImpact:
    "A visitor who hits a 404 mid-journey often just leaves rather than hunting for what they were actually looking for — it's a dead end at exactly the wrong moment.",
  recommendedFix: "Fix or remove each broken link below — either update it to the correct URL or delete it if the destination no longer exists.",
  impactLevel: "high",
};

export const MISSING_SCHEMA_COPY: AuxiliarySectionCopy = {
  whyItMatters:
    "These pages have no Schema.org structured data at all — nothing telling search engines explicitly what kind of content is on the page.",
  businessImpact:
    "Competitors with structured data can win visible extras in search results — star ratings, FAQ dropdowns, breadcrumbs — while these pages show up as a plain link.",
  recommendedFix: "Add JSON-LD structured data matching each page's actual content — see the suggested type listed for each page below.",
  impactLevel: "low",
};

export const PRESENT_SCHEMA_COPY: AuxiliarySectionCopy = {
  whyItMatters:
    "These pages already have Schema.org markup — worth confirming it's still accurate any time the page content changes materially.",
  businessImpact:
    "This is one of the things already working in your favor — it's what makes rich results (star ratings, FAQ dropdowns, etc.) possible on these pages.",
  recommendedFix: "No action needed here — just keep it in sync if you significantly change what's on these pages.",
  impactLevel: "low",
};
