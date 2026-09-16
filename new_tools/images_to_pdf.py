#!/usr/bin/env python3
"""IMAGES TO PDF - build a PDF from image files (new tool, additive).

CLI: python images_to_pdf.py <operation> <args-json> <output-dir>
Ops:
  convert(images[], page_size, custom_w_mm, custom_h_mm,
          orientation, margin_mm, fit)

One image per page, in the given order, via reportlab canvas.
page_size: A4 | Letter | Custom (custom_*_mm required for Custom).
orientation: portrait | landscape. fit: fit | fill | stretch.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from _common import (
    check_cancel, log, progress, require_arg,
    run_tool, unique_path, validate_image,
)

MM_TO_PT = 72.0 / 25.4
PAGE_SIZES_MM = {
    "A4": (210.0, 297.0),
    "Letter": (215.9, 279.4),
}


def _page_size_pt(args):
    page_size = str(args.get("page_size", "A4"))
    orientation = str(args.get("orientation", "portrait")).lower()
    if orientation not in ("portrait", "landscape"):
        raise ValueError("orientation must be one of [portrait, landscape]")
    if page_size == "Custom":
        try:
            w_mm = float(require_arg(args, "custom_w_mm"))
            h_mm = float(require_arg(args, "custom_h_mm"))
        except ValueError:
            raise ValueError("custom_w_mm/custom_h_mm must be numbers for Custom page size")
        if w_mm <= 0 or h_mm <= 0 or w_mm > 2000 or h_mm > 2000:
            raise ValueError("Custom page dimensions out of range")
    elif page_size in PAGE_SIZES_MM:
        w_mm, h_mm = PAGE_SIZES_MM[page_size]
    else:
        raise ValueError("page_size must be one of [A4, Letter, Custom]")
    pw, ph = w_mm * MM_TO_PT, h_mm * MM_TO_PT
    if orientation == "landscape" and pw < ph:
        pw, ph = ph, pw
    elif orientation == "portrait" and pw > ph:
        pw, ph = ph, pw
    return pw, ph, page_size, orientation


def _draw_fit(c, reader, iw, ih, x, y, uw, uh, mode):
    if mode == "stretch":
        c.drawImage(reader, x, y, width=uw, height=uh,
                    preserveAspectRatio=False, anchor="c")
    elif mode == "fill":
        scale = max(uw / iw, uh / ih)
        dw, dh = iw * scale, ih * scale
        dx = x + (uw - dw) / 2.0
        dy = y + (uh - dh) / 2.0
        c.saveState()
        path = c.beginPath()
        path.rect(x, y, uw, uh)
        c.clipPath(path, stroke=0, fill=0)
        c.drawImage(reader, dx, dy, width=dw, height=dh,
                    preserveAspectRatio=False, anchor="c")
        c.restoreState()
    else:  # fit
        scale = min(uw / iw, uh / ih)
        dw, dh = iw * scale, ih * scale
        dx = x + (uw - dw) / 2.0
        dy = y + (uh - dh) / 2.0
        c.drawImage(reader, dx, dy, width=dw, height=dh,
                    preserveAspectRatio=False, anchor="c")


def op_convert(args, outdir):
    images = require_arg(args, "images")
    if not isinstance(images, list) or not images:
        raise ValueError("'images' must be a non-empty list of image paths")
    paths = [validate_image(p) for p in images]
    pw, ph, page_size, orientation = _page_size_pt(args)
    margin_mm = float(args.get("margin_mm", 10))
    if margin_mm < 0 or margin_mm * 2 >= min(pw, ph) / MM_TO_PT:
        raise ValueError("margin_mm out of range for this page size")
    fit = str(args.get("fit", "fit")).lower()
    if fit not in ("fit", "fill", "stretch"):
        raise ValueError("fit must be one of [fit, fill, stretch]")
    margin = margin_mm * MM_TO_PT
    ux, uy = margin, margin
    uw, uh = pw - 2 * margin, ph - 2 * margin

    out = unique_path(outdir, "images_to_pdf", "pdf")
    c = canvas.Canvas(out, pagesize=(pw, ph))
    try:
        for k, path in enumerate(paths):
            check_cancel()
            try:
                with Image.open(path) as im:
                    iw, ih = im.size
            except Exception as e:
                raise ValueError("Cannot read image %s: %s" % (path, e))
            if iw <= 0 or ih <= 0:
                raise ValueError("Invalid image dimensions for %s" % path)
            c.setPageSize((pw, ph))
            try:
                reader = ImageReader(path)
            except Exception as e:
                raise ValueError("Unsupported image for PDF embedding %s: %s" % (path, e))
            _draw_fit(c, reader, float(iw), float(ih), ux, uy, uw, uh, fit)
            c.showPage()
            progress(int(((k + 1) / len(paths)) * 95))
    finally:
        c.save()
    progress(100)
    return {"outputs": [out], "info": {
        "images": len(paths), "page_size": page_size, "orientation": orientation,
        "margin_mm": margin_mm, "fit": fit,
        "page_w_pt": round(pw, 2), "page_h_pt": round(ph, 2),
    }}


OPS = {"convert": op_convert}

if __name__ == "__main__":
    run_tool(OPS)
