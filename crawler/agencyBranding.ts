import type { AgencyBranding } from "./types";

/**
 * Request-scoped Agency-tier white-label branding.
 *
 * The branding object exists ONLY for the duration of a single
 * report-generation request: the web UI holds it in React state, sends it in
 * the PDF request body, and the PDF worker renders it — nothing is written
 * to a database, user profile, workspace, audit row, or storage. Every new
 * report requires the agency to enter/upload the branding again.
 *
 * All helpers here are shared between the API routes (server-side
 * sanitization/enforcement) and the PDF renderer (logo geometry), so the
 * two can never disagree about what a valid branding payload looks like.
 */

/** Original-upload size cap — matches the UI guidance ("Maximum file size: 2 MB"). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * base64 data-URL length cap for the server. A 2 MB file base64-encodes to
 * ~2.8 MB; this gives small headroom while refusing anything absurd.
 */
export const LOGO_MAX_BASE64_LENGTH = 4_000_000;

/** Allowed logo encodings. The UI normalizes WebP -> PNG before upload, so
 * only PNG/JPEG should ever arrive at the server. */
export const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Recommended upload dimensions (3:1) — used for client-side guidance copy. */
export const LOGO_RECOMMENDED = { width: 1200, height: 400 };
export const LOGO_MIN = { width: 600, height: 200 };
export const LOGO_MAX = { width: 2400, height: 800 };

const AGENCY_NAME_MAX = 80;
const CLIENT_NAME_MAX = 80;
const CLIENT_WEBSITE_MAX = 200;
const REPORT_DATE_MAX = 40;
const LOGO_DIM_MAX = 20000; // sanity ceiling on a single pixel dimension

/**
 * Validates and sanitizes an unknown payload into a clean AgencyBranding
 * object. Returns null when nothing usable was supplied. Rejects:
 *  - non-object input
 *  - logo data URLs that aren't PNG/JPEG base64 (or are oversized)
 *  - logo records without sane positive integer dimensions
 * Strings are trimmed and length-capped.
 */
export function sanitizeAgencyBranding(raw: unknown): AgencyBranding | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: AgencyBranding = {};

  if (typeof obj.agencyName === "string") {
    const v = obj.agencyName.trim().slice(0, AGENCY_NAME_MAX);
    if (v) out.agencyName = v;
  }
  if (typeof obj.clientName === "string") {
    const v = obj.clientName.trim().slice(0, CLIENT_NAME_MAX);
    if (v) out.clientName = v;
  }
  if (typeof obj.clientWebsite === "string") {
    const v = obj.clientWebsite.trim().slice(0, CLIENT_WEBSITE_MAX);
    if (v) out.clientWebsite = v;
  }
  if (typeof obj.reportDate === "string") {
    const v = obj.reportDate.trim().slice(0, REPORT_DATE_MAX);
    if (v) out.reportDate = v;
  }

  const logo = obj.logo;
  if (logo && typeof logo === "object") {
    const l = logo as Record<string, unknown>;
    if (typeof l.dataUrl === "string" && isValidLogoDataUrl(l.dataUrl)) {
      const width = Math.round(Number(l.width));
      const height = Math.round(Number(l.height));
      if (
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0 &&
        width <= LOGO_DIM_MAX &&
        height <= LOGO_DIM_MAX
      ) {
        out.logo = { dataUrl: l.dataUrl, width, height };
      }
    }
  }

  return out.agencyName || out.clientName || out.clientWebsite || out.reportDate || out.logo ? out : null;
}

export function isValidLogoDataUrl(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= LOGO_MAX_BASE64_LENGTH && LOGO_DATA_URL_RE.test(value);
}

/**
 * Contain-fit a logo (natural width/height) into a bounding box, preserving
 * the aspect ratio exactly — never stretches or squashes, never crops.
 * Returns display dimensions in PDF points.
 */
export function fitLogoWithin(width: number, height: number, maxW: number, maxH: number): { w: number; h: number } {
  const safeW = Math.max(Number(width) || 1, 1);
  const safeH = Math.max(Number(height) || 1, 1);
  const scale = Math.min(maxW / safeW, maxH / safeH);
  return {
    w: Math.round(safeW * scale * 100) / 100,
    h: Math.round(safeH * scale * 100) / 100,
  };
}

/** A bound for a logo is valid if it fits (contain) within the box at any scale. */
export function fitsLogoBox(width: number, height: number, maxW: number, maxH: number): boolean {
  return width > 0 && height > 0 && width <= maxW && height <= maxH;
}

/**
 * Display label for the cover page ("clientwebsite.com") — strips protocol,
 * leading www, and trailing slashes.
 */
export function displayHost(url: string): string {
  if (!url) return "";
  try {
    const withScheme = url.includes("://") ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}
