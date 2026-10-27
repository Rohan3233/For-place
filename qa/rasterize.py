# Rasterize every page of the QA PDF to a PNG for visual inspection.
# Uses pypdfium2 installed into the project-local .pdfqa directory.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf_path = os.path.join(HERE, "landscape-report.pdf")
out_dir = os.path.join(HERE, "pages")
os.makedirs(out_dir, exist_ok=True)

pdf = pdfium.PdfDocument(pdf_path)
print("pages:", len(pdf))
for i, page in enumerate(pdf):
    # ~144 DPI (scale 2.0 of 72pt base) — crisp enough to read text
    bitmap = page.render(scale=2.0)
    img = bitmap.to_pil()
    out = os.path.join(out_dir, f"page-{i + 1:02d}.png")
    img.save(out)
    print(f"wrote {out} ({img.width}x{img.height})")
