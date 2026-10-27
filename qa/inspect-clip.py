# Inspect specific pages: print each text line with its y-range so we can see
# exactly which blocks are clipped (negative y = above the top edge).
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf = pdfium.PdfDocument(os.path.join(HERE, "landscape-report.pdf"))

pages = [int(a) - 1 for a in sys.argv[1:]] if len(sys.argv) > 1 else [41, 44, 50]

for p in pages:
    page = pdf[p]
    tp = page.get_textpage()
    text = tp.get_text_bounded()
    print(f"\n{'='*70}\nPAGE {p+1}\n{'='*70}")
    print(text[:3500])
    tp.close()
