# ASCII visualization via block-averaged ink fraction (threshold first, then
# downsample by averaging the binarized image, so thin text survives).
import os
import sys

from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
pages_dir = os.path.join(HERE, "pages")


def ascii_art(png_path, cols=120):
    img = Image.open(png_path).convert("L")
    w, h = img.size
    bw = np.array(img) < 140  # ink mask
    aspect = h / w
    rows = max(20, int(cols * aspect * 0.5))
    ys = np.linspace(0, h, rows + 1).astype(int)
    xs = np.linspace(0, w, cols + 1).astype(int)
    out = []
    for r in range(rows):
        line = []
        for c in range(cols):
            block = bw[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
            frac = block.mean() if block.size else 0.0
            if frac > 0.18:
                line.append("#")
            elif frac > 0.07:
                line.append("+")
            elif frac > 0.02:
                line.append(".")
            else:
                line.append(" ")
        out.append("".join(line).rstrip())
    return "\n".join(out)


if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    print(f"--- page-{p:02d}.png ---")
    print(ascii_art(os.path.join(pages_dir, f"page-{p:02d}.png")))
