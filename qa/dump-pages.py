# Print the first ~90 chars of each page so the page->section mapping is clear.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf = pdfium.PdfDocument(os.path.join(HERE, "landscape-report.pdf"))
for i, page in enumerate(pdf):
    tp = page.get_textpage()
    text = tp.get_text_bounded()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    head = " | ".join(lines[:2])[:110] if lines else "(no text)"
    print(f"PAGE {i+1:02d}: {head}")
    tp.close()
