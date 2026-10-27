# Programmatic layout QA for the landscape report.
# Reports per-page content bounds, fill ratio, out-of-bounds text, and
# flags pages that are suspiciously empty or overflowing.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf_path = os.path.join(HERE, "landscape-report.pdf")
pdf = pdfium.PdfDocument(pdf_path)

PAGE_W, PAGE_H = 841.89, 595.28  # A4 landscape pt
PAD = 40  # page padding

print(f"total pages: {len(pdf)}\n")
for i, page in enumerate(pdf):
    tp = page.get_textpage()
    n = tp.count_rects()
    chars = []
    for j in range(n):
        r = tp.get_rect(j)  # (left, top, right, bottom)
        chars.append(r)
    if not chars:
        print(f"PAGE {i+1:02d}: EMPTY (no text)")
        tp.close()
        continue
    xs0 = min(c[0] for c in chars)
    ys0 = min(c[1] for c in chars)
    xs1 = max(c[2] for c in chars)
    ys1 = max(c[3] for c in chars)
    fill_h = (ys1 - ys0) / PAGE_H * 100
    over_r = max(0, xs1 - PAGE_W)
    over_b = max(0, ys1 - PAGE_H)
    gutter_l = max(0, PAD - xs0)
    gutter_r = max(0, xs1 - (PAGE_W - PAD))
    flags = []
    if over_r > 1 or over_b > 1:
        flags.append(f"OVERFLOW r={over_r:.0f} b={over_b:.0f}")
    if gutter_l > 1:
        flags.append(f"GUTTER-L={gutter_l:.0f}")
    if gutter_r > 2:
        flags.append(f"GUTTER-R={gutter_r:.0f}")
    if fill_h < 30:
        flags.append("LOW-FILL")
    if fill_h > 96:
        flags.append("VERY-FULL")
    tag = " ".join(flags) if flags else "ok"
    print(f"PAGE {i+1:02d}: fill_h={fill_h:5.1f}%  x[{xs0:6.1f},{xs1:6.1f}] y[{ys0:6.1f},{ys1:6.1f}]  {tag}")
    tp.close()
