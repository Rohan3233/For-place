# Detailed geometry QA:
#  - chars taller than wide (vertical-text symptom)
#  - char pairs overlapping significantly (column collision)
#  - content clipped below/right of page bounds
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf = pdfium.PdfDocument(os.path.join(HERE, "landscape-report.pdf"))
PAGE_W, PAGE_H = 841.89, 595.28
PAD = 40

pages = [int(a) - 1 for a in sys.argv[1:]] if len(sys.argv) > 1 else list(range(len(pdf)))

for p in pages:
    page = pdf[p]
    tp = page.get_textpage()
    n = tp.count_rects()
    chars = []
    text = tp.get_text_bounded()
    for j in range(n):
        r = tp.get_rect(j)
        chars.append(r)
    # group chars into "words" by proximity
    words = []
    for c in chars:
        placed = False
        for w in words:
            # same line (vertical overlap) and horizontally close
            if w["y0"] - 1 <= c[1] and c[3] - 1 <= w["y1"] and c[0] <= w["x1"] + 3 and c[0] >= w["x0"] - 3:
                w["x0"] = min(w["x0"], c[0])
                w["x1"] = max(w["x1"], c[2])
                w["y0"] = min(w["y0"], c[1])
                w["y1"] = max(w["y1"], c[3])
                placed = True
                break
        if not placed:
            words.append({"x0": c[0], "x1": c[2], "y0": c[1], "y1": c[3]})
    issues = []
    # vertical text: word taller than wide and not a single tall glyph
    for w in words:
        h, wd = w["y1"] - w["y0"], w["x1"] - w["x0"]
        if wd > 0 and h > wd * 2.2 and h > 8:
            issues.append(f"VERTICAL-TEXT word at x={w['x0']:.0f} y={w['y0']:.0f} ({wd:.0f}x{h:.0f})")
    # clipped below bottom edge
    below = [c for c in chars if c[1] < -0.5]
    if below:
        issues.append(f"CLIPPED-BELOW: {len(below)} chars, min y={min(c[1] for c in below):.0f}")
    # clipped right of page
    right = [c for c in chars if c[2] > PAGE_W + 0.5]
    if right:
        issues.append(f"CLIPPED-RIGHT: {len(right)} chars, max x={max(c[2] for c in right):.0f}")
    # chars extending past right padding
    rpad = [c for c in chars if c[2] > PAGE_W - PAD + 1]
    if rpad:
        issues.append(f"PAST-RPAD: max x={max(c[2] for c in rpad):.0f}")
    if issues:
        print(f"PAGE {p+1}: " + " | ".join(issues[:6]))
    tp.close()
