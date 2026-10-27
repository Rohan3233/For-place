# Dump per-character boxes (get_charbox) so words/lines can be reconstructed
# reliably, with real ink geometry per glyph.
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf = pdfium.PdfDocument(os.path.join(HERE, "landscape-report.pdf"))
p = int(sys.argv[1]) - 1 if len(sys.argv) > 1 else 0
page = pdf[p]
tp = page.get_textpage()
text = tp.get_text_bounded()
n = tp.count_chars()
print(f"PAGE {p+1}: {n} chars, text len {len(text)}")

# Build words from per-char boxes (y grows upward; origin bottom-left)
words = []
for i in range(n):
    ch = text[i] if i < len(text) else "?"
    if ch in "\r\n\t ":
        continue
    r = tp.get_charbox(i)  # (left, bottom, right, top)
    placed = False
    for w in reversed(words):
        # same line: vertical overlap; horizontally adjacent
        if w["top"] - 2 <= r[3] and r[1] - 2 <= w["bottom"] and r[0] <= w["right"] + 4 and r[0] >= w["left"] - 4:
            w["chars"] += ch
            w["left"] = min(w["left"], r[0])
            w["right"] = max(w["right"], r[2])
            w["bottom"] = min(w["bottom"], r[1])
            w["top"] = max(w["top"], r[3])
            placed = True
            break
    if not placed:
        words.append({"chars": ch, "left": r[0], "right": r[2], "bottom": r[1], "top": r[3]})

for w in sorted(words, key=lambda w: (-w["top"], w["left"])):
    h = w["top"] - w["bottom"]
    wd = w["right"] - w["left"]
    flag = "  <<VERT" if (wd > 0 and h > wd * 2.2 and h > 8) else ""
    print(f"  x[{w['left']:6.1f},{w['right']:6.1f}] y[{w['bottom']:6.1f},{w['top']:6.1f}] {w['chars']!r}{flag}")
tp.close()
