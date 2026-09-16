#!/usr/bin/env python3
"""PDF COMPRESSOR - size reducer via image downsampling (new tool, additive).

CLI: python pdf_compressor.py <operation> <args-json> <output-dir>
Ops:
  info(pdf) -> sizes, image/font inventory (no output file)
  compress(pdf, level, image_dpi, jpeg_quality, remove_metadata)

Levels default (image_dpi / jpeg_quality):
  low 150/80, balanced 120/70, high 96/60, maximum 72/50.
Images are downscaled with PIL and re-encoded as JPEG via fitz,
then the file is saved with garbage=4 + deflate. Vectors untouched.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import io
import fitz
from PIL import Image

from _common import (
    check_cancel, log, progress, require_arg,
    run_tool, unique_path, validate_pdf,
)

LEVELS = {
    "low": (150, 80),
    "balanced": (120, 70),
    "high": (96, 60),
    "maximum": (72, 50),
}


def _stem(pdf_path, suffix):
    base = os.path.splitext(os.path.basename(pdf_path))[0].strip() or "document"
    return "%s_%s" % (base, suffix)


def _inventory(doc):
    """Collect per-page image/font stats. Returns (images, fonts, pages_info)."""
    images = []
    fonts = set()
    pages_info = []
    total = len(doc)
    for i, page in enumerate(doc):
        lst = page.get_images(full=True)
        pages_info.append({"page": i + 1, "images": len(lst)})
        for item in lst:
            images.append({"page": i + 1, "xref": item[0], "width": item[2],
                           "height": item[3], "bpc": item[4],
                           "colorspace": str(item[5])})
        for f in page.get_fonts(full=False):
            if f and len(f) > 3 and f[3]:
                fonts.add(str(f[3]))
    return images, sorted(fonts), pages_info


def op_info(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        images, fonts, pages_info = _inventory(doc)
        for k in range(len(pages_info)):
            check_cancel()
            progress(int(((k + 1) / max(len(pages_info), 1)) * 90))
        info = {
            "file_name": os.path.basename(pdf),
            "file_size_bytes": os.path.getsize(pdf),
            "pages": len(doc),
            "image_count": len(images),
            "images": images[:500],
            "images_truncated": max(0, len(images) - 500),
            "fonts": fonts[:50],
            "font_count": len(fonts),
            "pages_info": pages_info,
            "metadata": {k: (v or "") for k, v in (doc.metadata or {}).items()},
        }
        progress(100)
        return {"outputs": [], "info": info}
    finally:
        doc.close()


def _recompress_xref(doc, xref, max_dim, quality):
    """Downscale + JPEG re-encode one image xref. Returns (replaced, old_bytes, new_bytes)."""
    try:
        info = doc.extract_image(xref)
    except Exception as e:
        log("skip xref %s: extract failed (%s)" % (xref, e))
        return False, 0, 0
    raw = info.get("image", b"")
    old_len = len(raw)
    if old_len < 4096:
        return False, old_len, old_len
    if info.get("smask") or info.get("mask"):
        return False, old_len, old_len  # keep transparency masks intact
    if str(info.get("ext", "")).lower() in ("jb2", "jbig2", "ccitt", "fax"):
        return False, old_len, old_len  # already tiny bilevel formats
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception as e:
        log("skip xref %s: PIL open failed (%s)" % (xref, e))
        return False, old_len, old_len
    try:
        if img.mode in ("RGBA", "LA", "PA"):
            flat = Image.new("RGB", img.size, (255, 255, 255))
            flat.paste(img, mask=img.split()[-1])
            img = flat
        elif img.mode == "P":
            img = img.convert("RGB")
        gray = (img.mode == "L")
        if img.mode == "CMYK":
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        scale = min(1.0, float(max_dim) / float(max(w, h)))
        if scale < 1.0:
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=int(quality), optimize=True)
        new_bytes = buf.getvalue()
        if len(new_bytes) >= old_len:
            return False, old_len, old_len
        doc.update_stream(xref, new_bytes)
        nw, nh = img.size
        doc.xref_set_key(xref, "Width", str(nw))
        doc.xref_set_key(xref, "Height", str(nh))
        doc.xref_set_key(xref, "ColorSpace", "/DeviceGray" if gray else "/DeviceRGB")
        doc.xref_set_key(xref, "BitsPerComponent", "8")
        doc.xref_set_key(xref, "Filter", "/DCTDecode")
        try:
            doc.xref_set_key(xref, "DecodeParms", "null")
        except Exception:
            pass
        return True, old_len, len(new_bytes)
    except Exception as e:
        log("skip xref %s: recompress failed (%s)" % (xref, e))
        return False, old_len, old_len


def op_compress(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    level = str(args.get("level", "balanced"))
    if level not in LEVELS:
        raise ValueError("level must be one of %s" % sorted(LEVELS))
    default_dpi, default_q = LEVELS[level]
    image_dpi = int(args.get("image_dpi", default_dpi))
    quality = int(args.get("jpeg_quality", default_q))
    if image_dpi < 36 or image_dpi > 300:
        raise ValueError("image_dpi must be between 36 and 300")
    if quality < 10 or quality > 95:
        raise ValueError("jpeg_quality must be between 10 and 95")
    remove_metadata = bool(args.get("remove_metadata", False))
    max_dim = int(image_dpi * 11)

    original_bytes = os.path.getsize(pdf)
    doc = fitz.open(pdf)
    try:
        xrefs = []
        seen = set()
        for page in doc:
            for item in page.get_images(full=True):
                if item[0] not in seen:
                    seen.add(item[0])
                    xrefs.append(item[0])
        processed = 0
        recompressed = 0
        for k, xref in enumerate(xrefs):
            check_cancel()
            ok, _o, _n = _recompress_xref(doc, xref, max_dim, quality)
            processed += 1
            if ok:
                recompressed += 1
            progress(int(((k + 1) / max(len(xrefs), 1)) * 85))
        if remove_metadata:
            doc.set_metadata({})
        out = unique_path(outdir, _stem(pdf, "compressed"), "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        output_bytes = os.path.getsize(out)
        reduction = (round((1.0 - output_bytes / original_bytes) * 100.0, 2)
                     if original_bytes > 0 else 0.0)
        return {"outputs": [out], "info": {
            "original_bytes": original_bytes,
            "output_bytes": output_bytes,
            "reduction_pct": reduction,
            "level": level,
            "image_dpi": image_dpi,
            "jpeg_quality": quality,
            "remove_metadata": remove_metadata,
            "images_processed": processed,
            "images_recompressed": recompressed,
        }}
    finally:
        doc.close()


OPS = {"info": op_info, "compress": op_compress}

if __name__ == "__main__":
    run_tool(OPS)
