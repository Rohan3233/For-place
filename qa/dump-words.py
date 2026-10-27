# Dump words with coordinates for one page, to identify vertical text.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf = pdfium.PdfDocument(os.path.join(HERE, "landscape-report.pdf"))
p = int(sys.argv[1]) - 1 if len(sys.argv) > 1 else 9
page = pdf[p]
tp = page.get_textpage()
text = tp.get_text_bounded()
n = tp.count_rects()
# Build char list with text
objs = []
for i in range(n):
    objs.append((tp.get_rect(i), text[i] if i < len(text) else "?"))

# group consecutive chars on same line into words
words = []
for i, (r, ch) in enumerate(objs):
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

print(f"PAGE {p+1} words: {len(words)}")
for w in sorted(words, key=lambda w: (-w['y1'], w['x0'])):
    h = w["y1"] - w["y0"]
    wd = w["x1"] - w["x0"]
    flag = "  <<VERTICAL" if (wd > 0 and h > wd * 2.2 and h > 8) else ""
    print(f"  x[{w['x0']:6.1f},{w['x1']:6.1f}] y[{w['y0']:6.1f},{w['y1']:6.1f}] {w['chars']!r}{flag}")
tp.close()
