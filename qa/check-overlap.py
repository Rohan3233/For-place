# Detect vertically-overlapping text words in a PDF page — the "stacked lines"
# symptom of the robots.txt directives glitch.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "seoaudit-web", ".pdfqa") if os.path.isdir(os.path.join(HERE, "..", "seoaudit-web", ".pdfqa")) else os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "mini.pdf")
pdf = pdfium.PdfDocument(pdf_path)

for pno in range(len(pdf)):
    page = pdf[pno]
    tp = page.get_textpage()
    text = tp.get_text_bounded()
    n = tp.count_rects()
    chars = []
    for i in range(n):
        chars.append((tp.get_rect(i), text[i] if i < len(text) else "?"))
    # group into words by horizontal adjacency on the same line
    words = []
    for r, ch in chars:
        if not ch.strip():
            continue
        placed = False
        for w in reversed(words):
            if w["y0"] - 2 <= r[1] and r[3] - 2 <= w["y1"] and r[0] <= w["x1"] + 4:
                w["chars"] += ch
                w["x0"] = min(w["x0"], r[0])
                w["x1"] = max(w["x1"], r[2])
                w["y0"] = min(w["y0"], r[1])
                w["y1"] = max(w["y1"], r[3])
                placed = True
                break
        if not placed:
            words.append({"chars": ch, "x0": r[0], "x1": r[2], "y0": r[1], "y1": r[3]})
    # find overlapping pairs: distinct words whose y-intervals overlap >55%
    overlaps = []
    ws = sorted(words, key=lambda w: (w["y0"], w["x0"]))
    for i in range(len(ws)):
        for j in range(i + 1, len(ws)):
            a, b = ws[i], ws[j]
            if b["y0"] > a["y1"]:
                break
            yov = min(a["y1"], b["y1"]) - max(a["y0"], b["y0"])
            h = min(a["y1"] - a["y0"], b["y1"] - b["y0"])
            if h <= 0:
                continue
            xov = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
            if yov > 0.55 * h and xov > 2:
                overlaps.append((a, b, yov, h))
    print(f"page {pno+1}: {len(words)} words, {len(overlaps)} overlapping pairs")
    for a, b, yov, h in overlaps[:25]:
        print(f"  y[{a['y0']:.1f},{a['y1']:.1f}] {a['chars']!r}  <>  y[{b['y0']:.1f},{b['y1']:.1f}] {b['chars']!r}  (yov {yov:.1f}/{h:.1f})")
    tp.close()
