# Build a lightweight HTML viewer referencing PNGs by relative path (the
# preview server serves the whole workspace, so qa/pages/*.png resolves).
import os

HERE = os.path.dirname(os.path.abspath(__file__))
pages_dir = os.path.join(HERE, "pages")
files = sorted(f for f in os.listdir(pages_dir) if f.endswith(".png"))

parts = ["<!DOCTYPE html><html><head><meta charset='utf-8'><title>Landscape QA</title>",
         "<style>body{margin:0;background:#222;font-family:sans-serif} "
         ".pg{margin:0 auto 24px;background:#fff;max-width:1200px} "
         "img{display:block;width:100%;height:auto} "
         ".cap{padding:6px 12px;color:#ccc;font-size:13px;background:#333;text-align:center}</style></head><body>"]

for f in files:
    parts.append(f"<div class='pg'><img src='pages/{f}'><div class='cap'>{f}</div></div>")

parts.append("</body></html>")
out = os.path.join(HERE, "viewer.html")
with open(out, "w", encoding="utf-8") as fh:
    fh.write("".join(parts))
print(f"wrote {out} ({os.path.getsize(out)/1e3:.0f} KB)")
