import type { RunAuditResult, ReportOptions } from "./types";

/**
 * Resolves the CLIENT ORGANIZATION NAME for the report, from existing
 * client/site data only — never invented, never a hardcoded brand.
 *
 * Priority:
 *  1. The agency-supplied client name (Agency-tier white-label branding),
 *     when the report request provided one — the most authoritative "who is
 *     this report for" signal available.
 *  2. The entity name detected from the site's own homepage title (first
 *     segment before a | / - / — separator) — the same derivation the
 *     entity-consistency check and the Organization JSON-LD generator use,
 *     so every surface of the report agrees on the organization identity.
 *  3. The audited domain's hostname (with "www." stripped) as a neutral
 *     fallback — a real, factual identifier, never a placeholder.
 *
 * The report renders this value under an "Organization" label/context
 * (never a separate "client name" label) and keeps the audited domain
 * separately wherever the report displays it.
 */
export function resolveOrganizationName(audit: RunAuditResult, options: ReportOptions): string {
  const brandedClientName = options.agencyBranding?.clientName;
  if (brandedClientName) return brandedClientName;
  return deriveOrganizationName(audit) ?? "";
}

/**
 * Derives an organization name from the site's own crawl data: the first
 * segment of the homepage title before a | / - / — separator (matching the
 * entity-consistency check's derivation), with the hostname as fallback.
 * Returns null only when nothing usable exists (no homepage, no title) —
 * callers fall back to the domain.
 */
export function deriveOrganizationName(audit: RunAuditResult): string | null {
  const homepage = audit.crawl.pages.find((p) => {
    if (!p.ok) return false;
    try {
      return new URL(p.url).pathname === "/";
    } catch {
      return false;
    }
  });
  const rawTitle = homepage && homepage.ok ? homepage.title.content : "";
  if (rawTitle) {
    const firstSegment = rawTitle.split(/[|\-–—]/)[0].trim();
    if (firstSegment.length >= 2 && firstSegment.toLowerCase() !== "home") {
      return firstSegment;
    }
  }
  try {
    const host = new URL(audit.crawl.rootUrl).hostname.replace(/^www\./, "");
    if (host) return host;
  } catch {
    // fall through to null
  }
  return null;
}
