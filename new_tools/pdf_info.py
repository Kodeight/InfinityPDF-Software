#!/usr/bin/env python3
"""PDF INFORMATION — read-only PDF inspector (new tool, additive).

CLI: python pdf_info.py <operation> <args-json> <output-dir>
Ops:
  info(pdf) -> full report in RESULT info (no output file)

Uses the new_tools/_common.py protocol. Never modifies the input.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fitz
from _common import (
    Cancelled, check_cancel, ensure_outdir, log, parse_pages, progress,
    require_arg, run_tool, validate_pdf,
)


def op_info(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        check_cancel()
        sizes = []
        orientations = []
        text_pages = 0
        scanned_pages = 0
        image_count = 0
        fonts = set()
        for i, page in enumerate(doc):
            r = page.rect
            sizes.append({"page": i + 1, "width_pt": round(r.width, 1),
                          "height_pt": round(r.height, 1),
                          "orientation": "landscape" if r.width > r.height else "portrait"})
            orientations.append(sizes[-1]["orientation"])
            txt = page.get_text("text").strip()
            if txt:
                text_pages += 1
            else:
                scanned_pages += 1
            image_count += len(page.get_images(full=True))
            for f in page.get_fonts(full=False):
                if f and len(f) > 3 and f[3]:
                    fonts.add(str(f[3]))
            progress(int(((i + 1) / max(total, 1)) * 90))
        meta = doc.metadata or {}
        info = {
            "file_name": os.path.basename(pdf),
            "file_size_bytes": os.path.getsize(pdf),
            "pages": total,
            "pdf_version": doc.pdf_version() if hasattr(doc, "pdf_version") else "",
            "is_encrypted": bool(doc.needs_pass),
            "has_text_layer": text_pages > 0,
            "text_pages": text_pages,
            "scanned_pages": scanned_pages,
            "image_count": image_count,
            "fonts": sorted(fonts)[:50],
            "font_count": len(fonts),
            "page_sizes": sizes,
            "metadata": {k: (v or "") for k, v in meta.items()},
            "permissions": {"note": "Detailed permission flags are managed by the existing PDF Security tool; this inspector reports encryption status only."},
        }
        progress(100)
        return {"outputs": [], "info": info}
    finally:
        doc.close()


OPS = {"info": op_info}

if __name__ == "__main__":
    run_tool(OPS)
