#!/usr/bin/env python3
"""PDF SNAPSHOT — page/region raster capture (new tool, additive).

CLI: python pdf_snapshot.py <operation> <args-json> <output-dir>
Ops:
  capture{pdf,page,rect{x0,y0,x1,y1} (null = full page),dpi,fmt[png,jpg],make_pdf(bool)}
    -> image output (+ single-page PDF if make_pdf), rendered via fitz clip.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, progress, require_arg, run_tool,
    unique_path, validate_pdf,
)
import fitz


def op_capture(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    page_no = int(args.get("page", 1))
    dpi = float(args.get("dpi", 200))
    dpi = max(36.0, min(600.0, dpi))
    fmt = str(args.get("fmt", "png")).strip().lower()
    if fmt not in ("png", "jpg", "jpeg"):
        raise ValueError("fmt must be one of png,jpg")
    if fmt == "jpeg":
        fmt = "jpg"
    make_pdf = bool(args.get("make_pdf", False))
    rect_raw = args.get("rect", None)
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        if page_no < 1 or page_no > total:
            raise ValueError(f"Page out of bounds: {page_no} (document has {total} pages)")
        check_cancel()
        page = doc[page_no - 1]
        clip = None
        if rect_raw is not None:
            try:
                clip = fitz.Rect(float(rect_raw["x0"]), float(rect_raw["y0"]),
                                 float(rect_raw["x1"]), float(rect_raw["y1"]))
            except Exception:
                raise ValueError("rect must be {x0,y0,x1,y1} numbers or null")
            clip = clip & page.rect
            if clip.width <= 1 or clip.height <= 1:
                raise ValueError("rect is empty or outside the page")
        zoom = dpi / 72.0
        progress(20)
        if clip is not None:
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip)
        else:
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        progress(60)
        ext = "png" if fmt == "png" else "jpg"
        img_out = unique_path(outdir, f"snapshot_p{page_no}_{int(dpi)}dpi", ext)
        pix.save(img_out)
        outputs = [img_out]
        info = {"page": page_no, "pages": total, "dpi": dpi, "fmt": ext,
                "w_px": pix.width, "h_px": pix.height,
                "rect": ({k: rect_raw[k] for k in ("x0", "y0", "x1", "y1")} if rect_raw else None)}
        progress(80)
        if make_pdf:
            check_cancel()
            doc2 = fitz.open()
            try:
                w_pt = pix.width * 72.0 / dpi
                h_pt = pix.height * 72.0 / dpi
                pg = doc2.new_page(width=w_pt, height=h_pt)
                pg.insert_image(pg.rect, filename=img_out)
                pdf_out = unique_path(outdir, f"snapshot_p{page_no}_{int(dpi)}dpi", "pdf")
                doc2.save(pdf_out, garbage=4, deflate=True)
                outputs.append(pdf_out)
                info["pdf"] = os.path.basename(pdf_out)
            finally:
                doc2.close()
        progress(100)
        return {"outputs": outputs, "info": info}
    finally:
        doc.close()


OPS = {"capture": op_capture}

if __name__ == "__main__":
    run_tool(OPS)
