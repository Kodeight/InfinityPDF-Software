#!/usr/bin/env python3
"""PDF CROP — non-destructive cropbox editor (new tool, additive).

CLI: python pdf_crop.py <operation> <args-json> <output-dir>
Ops:
  render{pdf,page,dpi} -> PNG preview + info{w_pt,h_pt}
  crop{pdf,boxes[{pages,rect{x0,y0,x1,y1} top-left points}]} -> new PDF (set_cropbox per page)
  reset{pdf} -> copy with default cropboxes (cropbox = mediabox)

Content is preserved; only the cropbox changes. Source file is never modified.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress, require_arg, run_tool,
    unique_path, validate_pdf,
)
import fitz


def op_render(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    page_no = int(args.get("page", 1))
    dpi = float(args.get("dpi", 150))
    dpi = max(36.0, min(400.0, dpi))
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        if page_no < 1 or page_no > total:
            raise ValueError(f"Page out of bounds: {page_no} (document has {total} pages)")
        page = doc[page_no - 1]
        r = page.rect
        zoom = dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        out = unique_path(outdir, f"crop_p{page_no}_{int(dpi)}dpi", "png")
        pix.save(out)
        progress(100)
        return {"outputs": [out], "info": {"page": page_no, "pages": total,
                                           "w_pt": round(r.width, 2), "h_pt": round(r.height, 2),
                                           "dpi": dpi}}
    finally:
        doc.close()


def _resolve_pages(spec, total):
    if spec is None or (isinstance(spec, str) and spec.strip().lower() in ("", "all")):
        return list(range(total))
    if isinstance(spec, (list, tuple)):
        out = set()
        for n in spec:
            n = int(n)
            if n < 1 or n > total:
                raise ValueError(f"Page out of bounds: {n} (document has {total} pages)")
            out.add(n - 1)
        if not out:
            raise ValueError("No pages selected")
        return sorted(out)
    from _common import parse_pages
    return parse_pages(str(spec), total)


def op_crop(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    boxes = args.get("boxes", None)
    if boxes is None:
        raise ValueError("Missing required argument: boxes")
    if not isinstance(boxes, list) or not boxes:
        raise ValueError("'boxes' must be a non-empty array")
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        touched = set()
        for i, b in enumerate(boxes):
            check_cancel()
            if not isinstance(b, dict):
                raise ValueError(f"boxes[{i}] must be an object")
            rect_raw = b.get("rect", None)
            if rect_raw is None:
                raise ValueError(f"boxes[{i}].rect is required")
            try:
                nr = fitz.Rect(float(rect_raw["x0"]), float(rect_raw["y0"]),
                               float(rect_raw["x1"]), float(rect_raw["y1"]))
            except Exception:
                raise ValueError(f"boxes[{i}].rect must be {{x0,y0,x1,y1}} numbers")
            if nr.width <= 1 or nr.height <= 1:
                raise ValueError(f"boxes[{i}].rect is empty")
            pages = _resolve_pages(b.get("pages", "all"), total)
            for pno in pages:
                check_cancel()
                doc[pno].set_cropbox(nr)
                touched.add(pno + 1)
            progress(int(((i + 1) / len(boxes)) * 90))
        out = unique_path(outdir, "cropped", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {"pages_touched": sorted(touched),
                                           "box_count": len(boxes), "pages": len(doc)}}
    finally:
        doc.close()


def op_reset(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        for i, page in enumerate(doc):
            check_cancel()
            try:
                page.set_cropbox(page.mediabox)
            except Exception as e:
                log(f"reset page {i + 1} skipped: {e}")
            progress(int(((i + 1) / max(total, 1)) * 90))
        out = unique_path(outdir, "crop_reset", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {"pages": total, "reset": True}}
    finally:
        doc.close()


OPS = {"render": op_render, "crop": op_crop, "reset": op_reset}

if __name__ == "__main__":
    run_tool(OPS)
