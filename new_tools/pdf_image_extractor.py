#!/usr/bin/env python3
"""PDF IMAGE EXTRACTOR - list and save embedded raster images (new tool, additive).

CLI: python pdf_image_extractor.py <operation> <args-json> <output-dir>
Ops:
  list(pdf, pages) -> per image: page, index, width, height,
                      colorspace, size_bytes (no output files)
  extract(pdf, pages, zip_output) -> save original bytes with the
                      correct extension as image_p{page}_{i}.{ext};
                      optional .zip included in outputs.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import zipfile
import fitz

from _common import (
    check_cancel, log, parse_pages, progress, require_arg,
    run_tool, unique_path, validate_pdf,
)

EXT_FIX = {"jpeg": "jpg", "tif": "tiff"}


def _iter_images(doc, sel):
    """Yield dicts for each image occurrence on selected pages."""
    for k, pno in enumerate(sel):
        page = doc[pno]
        for i, item in enumerate(page.get_images(full=True)):
            xref = item[0]
            try:
                data = doc.extract_image(xref)
            except Exception as e:
                log("skip p%s image %s xref %s: %s" % (pno + 1, i, xref, e))
                continue
            raw = data.get("image", b"")
            ext = str(data.get("ext", "bin")).lower() or "bin"
            ext = EXT_FIX.get(ext, ext)
            cs = item[5]
            try:
                colorspace = cs.decode() if isinstance(cs, bytes) else str(cs)
            except Exception:
                colorspace = str(cs)
            yield {"page": pno + 1, "index": i, "xref": xref,
                   "width": data.get("width", item[2]),
                   "height": data.get("height", item[3]),
                   "colorspace": colorspace or str(data.get("colorspace", "")),
                   "ext": ext, "size_bytes": len(raw), "_raw": raw}


def op_list(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        sel = parse_pages(args.get("pages", "all"), total)
        images = []
        for entry in _iter_images(doc, sel):
            check_cancel()
            entry = dict(entry)
            entry.pop("_raw", None)
            images.append(entry)
            progress(int((len(images) / max(len(sel), 1)) * 10) % 100)
        progress(100)
        return {"outputs": [], "info": {
            "images_found": len(images),
            "images": images,
        }}
    finally:
        doc.close()


def op_extract(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    zip_output = bool(args.get("zip_output", False))
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        sel = parse_pages(args.get("pages", "all"), total)
        entries = list(_iter_images(doc, sel))
        outputs = []
        saved = []
        for k, entry in enumerate(entries):
            check_cancel()
            out = unique_path(outdir, "image_p%s_%s" % (entry["page"], entry["index"]),
                              entry["ext"])
            with open(out, "wb") as f:
                f.write(entry["_raw"])
            outputs.append(out)
            saved.append({"page": entry["page"], "index": entry["index"],
                          "file": out, "size_bytes": entry["size_bytes"]})
            progress(int(((k + 1) / max(len(entries), 1)) * 90))
        info = {"images_found": len(entries), "saved": saved}
        if zip_output and outputs:
            check_cancel()
            zip_path = unique_path(outdir, "extracted_images", "zip")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for p in outputs:
                    zf.write(p, os.path.basename(p))
            outputs.append(zip_path)
            info["zip"] = zip_path
        progress(100)
        return {"outputs": outputs, "info": info}
    finally:
        doc.close()


OPS = {"list": op_list, "extract": op_extract}

if __name__ == "__main__":
    run_tool(OPS)
