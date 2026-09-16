#!/usr/bin/env python3
"""PDF TO IMAGES - rasterize PDF pages to image files (new tool, additive).

CLI: python pdf_to_images.py <operation> <args-json> <output-dir>
Ops:
  convert(pdf, pages, dpi, fmt, quality, zip_output)

Outputs are named document_001.<ext> ... If zip_output is true, a .zip
of the images is also produced and included in outputs.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import io
import zipfile
import fitz
from PIL import Image

from _common import (
    check_cancel, parse_pages, progress, require_arg,
    run_tool, unique_path, validate_pdf,
)

FORMATS = {
    "png": ("PNG", "png"),
    "jpg": ("JPEG", "jpg"),
    "webp": ("WEBP", "webp"),
    "tiff": ("TIFF", "tiff"),
}


def op_convert(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    dpi = float(args.get("dpi", 150))
    if dpi < 36 or dpi > 600:
        raise ValueError("dpi must be between 36 and 600")
    fmt = str(args.get("fmt", "png")).lower()
    if fmt == "jpeg":
        fmt = "jpg"
    if fmt not in FORMATS:
        raise ValueError("fmt must be one of [png, jpg, webp, tiff]")
    pil_format, ext = FORMATS[fmt]
    quality = int(args.get("quality", 85))
    if quality < 1 or quality > 100:
        raise ValueError("quality must be between 1 and 100")
    zip_output = bool(args.get("zip_output", False))

    doc = fitz.open(pdf)
    try:
        total = len(doc)
        sel = parse_pages(args.get("pages", "all"), total)
        outputs = []
        for k, pno in enumerate(sel):
            check_cancel()
            page = doc[pno]
            pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72.0, dpi / 72.0),
                                  alpha=(fmt == "png"))
            mode = "RGBA" if pix.alpha else "RGB"
            img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
            if fmt == "png" and mode == "RGBA":
                pass
            elif mode == "RGBA":
                flat = Image.new("RGB", img.size, (255, 255, 255))
                flat.paste(img, mask=img.split()[-1])
                img = flat
            out = unique_path(outdir, "document_%03d" % (k + 1), ext)
            if pil_format == "PNG":
                img.save(out, "PNG")
            elif pil_format == "TIFF":
                img.save(out, "TIFF", compression="tiff_lzw")
            else:
                img.save(out, pil_format, quality=quality)
            outputs.append(out)
            progress(int(((k + 1) / len(sel)) * 90))
        info = {"pages": [p + 1 for p in sel], "count": len(sel), "dpi": dpi, "fmt": fmt}
        if zip_output and outputs:
            check_cancel()
            zip_path = unique_path(outdir, "document_images", "zip")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for p in outputs:
                    zf.write(p, os.path.basename(p))
            outputs.append(zip_path)
            info["zip"] = zip_path
        progress(100)
        return {"outputs": outputs, "info": info}
    finally:
        doc.close()


OPS = {"convert": op_convert}

if __name__ == "__main__":
    run_tool(OPS)
