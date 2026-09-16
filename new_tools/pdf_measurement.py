#!/usr/bin/env python3
"""PDF MEASUREMENT — page geometry primitives for UI-side measuring (new tool, additive).

CLI: python pdf_measurement.py <operation> <args-json> <output-dir>
Ops:
  page_info{pdf,page} -> info{w_pt,h_pt}
  render{pdf,page,dpi} -> PNG + info scale.

Scale calibration + distance/area/perimeter/angle math is done in the UI
from these primitives (page size in points + rendered scale).
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, progress, require_arg, run_tool,
    unique_path, validate_pdf,
)
import fitz


def op_page_info(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    page_no = int(args.get("page", 1))
    doc = fitz.open(pdf)
    try:
        check_cancel()
        total = len(doc)
        if page_no < 1 or page_no > total:
            raise ValueError(f"Page out of bounds: {page_no} (document has {total} pages)")
        r = doc[page_no - 1].rect
        progress(100)
        return {"outputs": [], "info": {"page": page_no, "pages": total,
                                        "w_pt": round(r.width, 3), "h_pt": round(r.height, 3)}}
    finally:
        doc.close()


def op_render(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    page_no = int(args.get("page", 1))
    dpi = float(args.get("dpi", 150))
    dpi = max(36.0, min(600.0, dpi))
    doc = fitz.open(pdf)
    try:
        check_cancel()
        total = len(doc)
        if page_no < 1 or page_no > total:
            raise ValueError(f"Page out of bounds: {page_no} (document has {total} pages)")
        page = doc[page_no - 1]
        r = page.rect
        zoom = dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        out = unique_path(outdir, f"measure_p{page_no}_{int(dpi)}dpi", "png")
        pix.save(out)
        progress(100)
        return {"outputs": [out], "info": {"page": page_no, "pages": total,
                                           "w_pt": round(r.width, 3), "h_pt": round(r.height, 3),
                                           "dpi": dpi, "px_per_pt": round(zoom, 6),
                                           "pt_per_px": round(72.0 / dpi, 6),
                                           "w_px": pix.width, "h_px": pix.height,
                                           "scale": {"dpi": dpi, "px_per_pt": round(zoom, 6)}}}
    finally:
        doc.close()


OPS = {"page_info": op_page_info, "render": op_render}

if __name__ == "__main__":
    run_tool(OPS)
