"use client";

/**
 * Agency-tier white-label branding panel.
 *
 * The branding entered/uploaded here is STRICTLY request-scoped: it lives in
 * React state for this page, is sent in the body of the PDF/zip download
 * request, and is discarded the moment generation finishes. Nothing is
 * written to a database, user profile, workspace, or audit record — the
 * agency must enter it again for every report. Server-side, the routes
 * re-validate the payload and refuse it for any non-Agency tier.
 */
import { useState } from "react";

interface ProcessedLogo {
  dataUrl: string;
  width: number;
  height: number;
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MIN_W = 600;
const MIN_H = 200;
const MAX_W = 2400;
const MAX_H = 800;

export default function AgencyBrandingPanel({
  auditId,
  defaultWebsite,
}: {
  auditId: string;
  defaultWebsite: string;
}) {
  const [logo, setLogo] = useState<ProcessedLogo | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoWarning, setLogoWarning] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientWebsite, setClientWebsite] = useState(defaultWebsite);
  const [reportDate, setReportDate] = useState(() =>
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  );
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleFile(file: File | null) {
    setLogoError(null);
    setLogoWarning(null);
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLogoError("Unsupported file type. Upload a PNG, JPG/JPEG, or WebP image.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("File is larger than 2 MB. Please upload a smaller logo.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadImage(dataUrl);

      if (img.naturalWidth < MIN_W || img.naturalHeight < MIN_H) {
        setLogoError(
          `Logo is too small (${img.naturalWidth}×${img.naturalHeight} px). Minimum is ${MIN_W}×${MIN_H} px.`
        );
        return;
      }

      const ratio = img.naturalWidth / img.naturalHeight;
      // Excessively wide/tall — genuinely unsuitable for a header/cover logo.
      if (ratio < 0.75 || ratio > 8) {
        setLogoError(
          "This image is too wide or tall to work as a logo. Please upload a more suitable image (recommended 1200×400, 3:1)."
        );
        return;
      }
      // Outside the recommended 3:1 — non-blocking warning; contain-scaling
      // preserves the original aspect ratio (never stretched, never cropped).
      if (ratio < 2.2 || ratio > 4.2) {
        setLogoWarning(
          `This logo is ${ratio.toFixed(1)}:1, not the recommended 3:1. It will be scaled to fit without cropping or stretching.`
        );
      }

      // Downscale proportionally when over the max dimensions; WebP is
      // converted to PNG (the PDF engine accepts PNG/JPEG only). Both
      // preserve transparency.
      const scale = Math.min(MAX_W / img.naturalWidth, MAX_H / img.naturalHeight, 1);
      let outDataUrl = dataUrl;
      let outW = img.naturalWidth;
      let outH = img.naturalHeight;
      if (scale < 1 || file.type === "image/webp") {
        outW = Math.round(img.naturalWidth * scale);
        outH = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setLogoError("Could not process this image in your browser. Try a different file.");
          return;
        }
        ctx.drawImage(img, 0, 0, outW, outH);
        outDataUrl = canvas.toDataURL("image/png");
      }

      setLogo({ dataUrl: outDataUrl, width: outW, height: outH });
      setLogoPreview(outDataUrl);
    } catch {
      setLogoError("Could not read this image. Try a different file.");
    }
  }

  async function handleDownload() {
    setError(null);
    if (!agencyName.trim()) {
      setError("Enter your agency name — it appears on the cover page and in the report footer.");
      return;
    }
    setDownloading(true);
    try {
      const branding = {
        agencyName: agencyName.trim(),
        clientName: clientName.trim(),
        clientWebsite: clientWebsite.trim() || defaultWebsite,
        reportDate,
        ...(logo ? { logo } : {}),
      };
      const res = await fetch(`/api/audits/${auditId}/zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyBranding: branding }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not generate the branded report.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "seo-audit-report.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the branded report.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="sa-branding">
      <div className="sa-branding-head">
        <h3 className="sa-branding-title">White-Label Branding</h3>
        <span className="sa-branding-tier">Agency plan</span>
      </div>
      <p className="sa-branding-sub">
        Branding is applied to this report only and is never stored — you&rsquo;ll enter it again for each new
        report.
      </p>

      <label className="sa-branding-label">
        Agency Logo
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="sa-branding-file"
        />
      </label>
      <p className="sa-branding-guide">
        Recommended: 1200 × 400 px (3:1) · PNG with transparent background preferred · Maximum file size: 2 MB
      </p>
      {logoPreview && (
        <div className="sa-branding-preview">
          <img src={logoPreview} alt="Agency logo preview" />
          {logo && (
            <span className="sa-branding-preview-meta">
              {logo.width}×{logo.height} px
            </span>
          )}
        </div>
      )}
      {logoWarning && <p className="sa-branding-warn">{logoWarning}</p>}
      {logoError && <p className="sa-branding-error">{logoError}</p>}

      <label className="sa-branding-label">
        Agency Name
        <input
          type="text"
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
          placeholder="Your Agency Co."
          maxLength={80}
          className="sa-branding-input"
        />
      </label>

      <label className="sa-branding-label">
        Client Name
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Client Company"
          maxLength={80}
          className="sa-branding-input"
        />
      </label>

      <label className="sa-branding-label">
        Client Website
        <input
          type="text"
          value={clientWebsite}
          onChange={(e) => setClientWebsite(e.target.value)}
          className="sa-branding-input"
        />
      </label>

      <label className="sa-branding-label">
        Report Date
        <input
          type="text"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          className="sa-branding-input"
        />
      </label>

      {error && <p className="sa-branding-error">{error}</p>}

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="sa-btn sa-btn-primary"
      >
        {downloading ? "Generating…" : "Generate branded report (PDF + CSV)"}
      </button>
      <p className="sa-branding-skip">
        <a href={`/api/audits/${auditId}/zip`}>Download without branding</a>
      </p>

      <style>{`
        .sa-branding { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; margin-top: 14px; }
        .sa-branding-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .sa-branding-title { margin: 0; font-size: 16px; }
        .sa-branding-tier { font-family: var(--font-mono), monospace; font-size: 10.5px; font-weight: 600; color: var(--signal); background: var(--signal-soft); padding: 3px 9px; border-radius: 999px; }
        .sa-branding-sub { font-size: 12.5px; color: var(--ink-soft); margin: 6px 0 14px; line-height: 1.5; }
        .sa-branding-label { display: block; font-size: 13px; font-weight: 500; color: var(--ink-soft); margin: 12px 0 0; }
        .sa-branding-file { display: block; margin-top: 6px; font-size: 12.5px; }
        .sa-branding-input { display: block; width: 100%; margin-top: 6px; padding: 9px 11px; font-size: 14px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); }
        .sa-branding-input:focus { outline: none; border-color: var(--signal); }
        .sa-branding-guide { font-size: 11.5px; color: var(--ink-soft); margin: 5px 0 0; line-height: 1.5; }
        .sa-branding-preview { margin-top: 12px; display: flex; align-items: center; gap: 10px; }
        .sa-branding-preview img { max-width: 300px; max-height: 100px; object-fit: contain; border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 6px; }
        .sa-branding-preview-meta { font-family: var(--font-mono), monospace; font-size: 11px; color: var(--ink-soft); }
        .sa-branding-warn { font-size: 12.5px; color: var(--warn); margin: 8px 0 0; }
        .sa-branding-error { font-size: 12.5px; color: var(--fail); margin: 8px 0 0; }
        .sa-branding-skip { margin: 10px 0 0; font-size: 12.5px; }
        .sa-branding-skip a { color: var(--ink-soft); text-decoration: underline; }
      `}</style>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}
