#!/usr/bin/env python3
"""Render selected pages of the walkthrough PDF to PNGs for visual inspection."""
import pypdfium2 as pdfium
import sys

pdf = pdfium.PdfDocument('/home/z/my-project/download/land-ledger-demo-walkthrough.pdf')
pages = [int(x) for x in sys.argv[1:]] if len(sys.argv) > 1 else [1, 2, 3, 4, 5, 74]
for p in pages:
    page = pdf[p - 1]
    bmp = page.render(scale=1.1)
    img = bmp.to_pil()
    out = f'/home/z/my-project/scripts/preview/page-{p:02d}.png'
    img.save(out)
    print(out, img.size)
