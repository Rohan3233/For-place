"use client";

/**
 * Agency tier can white-label the PDF — every CSV <Link> inside the PDF
 * itself is gated on !options.whiteLabel (see reportDocument.tsx), so a
 * white-labeled PDF never contains a link back to our domain, on purpose.
 *
 * This button lives in OUR dashboard, not in the PDF the agency forwards
 * to their client, so there's no white-label concern here. Clicking it
 * fires both downloads — the (clean, unbranded) PDF and the CSV of
 * affected URLs — from a single click.
 */
export default function AgencyDownloadButton({
  pdfUrl,
  csvUrl,
}: {
  pdfUrl: string;
  csvUrl: string;
}) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    downloadUrl(pdfUrl);
    // Some browsers silently drop a second file download fired in the
    // exact same tick as the first. A short delay keeps both downloads
    // reliably firing from this one click/user gesture.
    setTimeout(() => downloadUrl(csvUrl), 500);
  }

  return (
    <button onClick={handleClick} className="sa-btn sa-btn-primary">
      Download PDF report
    </button>
  );
}

function downloadUrl(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}