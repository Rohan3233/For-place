import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".pdfqa"))

import pypdfium2 as pdfium  # noqa: E402

pdf_path = sys.argv[1]
needles = sys.argv[2:]
pdf = pdfium.PdfDocument(pdf_path)
full = ""
for page in pdf:
    tp = page.get_textpage()
    full += tp.get_text_bounded() + "\n"
    tp.close()
for n in needles:
    print(f"{'FOUND' if n in full else 'MISSING'}|{n}")
