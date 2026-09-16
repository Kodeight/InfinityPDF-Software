#!/usr/bin/env python3
"""SCAN TO PDF — build a PDF from scanned/image files (new tool, additive).

CLI: python scan_to_pdf.py <operation> <args-json> <output-dir>
Ops:
  scanners{} -> {scanners: [], note}
  build{images[{path, rotate, crop{x0,y0,x1,y1}, deskew, skip_if_blank,
         blank_threshold}], page_size[A4,Letter,SameAsImage], orientation,
         margin_mm}

No scanner driver is bundled. Future hardware integration plugs into the
`scan_acquire()` entry point below; `build` already accepts whatever image
files a driver would produce.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress,
    require_arg, run_tool, unique_path, validate_image,
)

import datetime
import tempfile


# ---------------------------------------------------------------------------
# Scanner integration hook (entry point for later driver work)
# ---------------------------------------------------------------------------

def scan_acquire(source="default", dpi=300, outdir=None):
    """Entry point for future scanner-driver integration.

    Currently no WIA/SANE/TWAIN driver is bundled, so this returns an empty
    acquisition list with guidance. A later driver only needs to make this
    function return real image paths; `op_build` already consumes them.

    Returns {"images": [], "note": ...}.
    """
    note = (
        "No scanner driver is bundled with InfinityPDF. "
        "To integrate later: implement acquisition (WIA on Windows, SANE on "
        "Linux, TWAIN/ICA elsewhere) inside scan_acquire() and return the "
        "list of acquired image file paths; then call the 'build' op with "
        "those paths. This stub intentionally performs no I/O beyond "
        "reporting."
    )
    log(note)
    return {"images": [], "note": note}


# ---------------------------------------------------------------------------
# Image helpers (PIL + numpy only)
# ---------------------------------------------------------------------------

def _ink_pct(pil_img):
    """Fraction (0-100) of pixels considered ink (darker than near-white)."""
    import numpy as np
    gray = pil_img.convert("L")
    arr = np.asarray(gray, dtype=np.uint8)
    if arr.size == 0:
        return 0.0
    ink = float((arr < 240).sum())
    return round(ink / float(arr.size) * 100.0, 3)


def _deskew_image(pil_img, max_angle=5.0, step=0.5):
    """Small-angle variance-search deskew. Returns (image, angle_applied)."""
    import numpy as np
    try:
        gray = pil_img.convert("L")
        w, h = gray.size
        scale = 800.0 / max(w, h) if max(w, h) > 800 else 1.0
        small = gray.resize((max(1, int(w * scale)), max(1, int(h * scale))))
        arr0 = np.asarray(small, dtype=np.float32)
        best_angle = 0.0
        best_score = -1.0
        a = -max_angle
        cands = []
        while a <= max_angle + 1e-9:
            cands.append(round(a, 2))
            a += step
        from PIL import Image as _I
        for ang in cands:
            rot = small.rotate(ang, expand=True, resample=_I.BILINEAR, fillcolor=255)
            arr = np.asarray(rot, dtype=np.float32)
            row_means = arr.mean(axis=1)
            score = float(row_means.var())
            if score > best_score:
                best_score = score
                best_angle = ang
        if abs(best_angle) < 1e-9:
            return pil_img, 0.0
        # PIL rotates counter-clockwise; the searched angle is the correction
        # that maximises horizontal-projection variance, so apply it directly.
        from PIL import Image as _Img
        fixed = pil_img.rotate(best_angle, expand=True, resample=_Img.BILINEAR,
                               fillcolor=(255, 255, 255))
        return fixed, best_angle
    except Exception as e:
        log(f"deskew skipped: {e}")
        return pil_img, 0.0


def _process_single(spec, default_blank_threshold=0.5):
    """Apply crop/rotate/deskew/blank-check. Returns (image|None, meta)."""
    from PIL import Image
    path = validate_image(require_arg(spec, "path"))
    rotate = float(spec.get("rotate", 0) or 0)
    crop = spec.get("crop")
    deskew = bool(spec.get("deskew", False))
    skip_if_blank = bool(spec.get("skip_if_blank", False))
    try:
        blank_threshold = float(spec.get("blank_threshold", default_blank_threshold))
    except Exception:
        blank_threshold = float(default_blank_threshold)

    img = Image.open(path)
    try:
        img.load()
    except Exception:
        pass
    if img.mode in ("RGBA", "LA", "PA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        try:
            bg.paste(img, mask=img.split()[-1])
        except Exception:
            bg.paste(img)
        img = bg
    else:
        img = img.convert("RGB")

    if crop:
        try:
            x0 = int(crop.get("x0", 0)); y0 = int(crop.get("y0", 0))
            x1 = int(crop.get("x1", img.width)); y1 = int(crop.get("y1", img.height))
        except Exception:
            raise ValueError(f"Invalid crop box for {path}")
        x0 = max(0, x0); y0 = max(0, y0)
        x1 = min(img.width, x1); y1 = min(img.height, y1)
        if x1 <= x0 or y1 <= y0:
            raise ValueError(f"Crop box is empty/out of bounds for {path}")
        img = img.crop((x0, y0, x1, y1))

    deskew_angle = 0.0
    if deskew:
        img, deskew_angle = _deskew_image(img)

    if rotate:
        img = img.rotate(-rotate, expand=True, fillcolor=(255, 255, 255))

    ink = _ink_pct(img)
    meta = {"source": path, "ink_pct": ink, "deskew_angle": round(float(deskew_angle), 2)}
    if skip_if_blank and ink < blank_threshold:
        meta["skipped_blank"] = True
        return None, meta
    meta["skipped_blank"] = False
    return img, meta


# ---------------------------------------------------------------------------
# Ops
# ---------------------------------------------------------------------------

def op_scanners(args, outdir):
    res = scan_acquire()
    return {"outputs": [], "info": {
        "scanners": [],
        "note": (
            res["note"] + " Frontend note: show an empty scanner list with a "
            "'driver not bundled' hint; route any future device through the "
            "scan_acquire() entry point in this module."
        ),
    }}


def op_build(args, outdir):
    from reportlab.lib.pagesizes import A4, LETTER
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader

    images = require_arg(args, "images")
    if not isinstance(images, list) or not images:
        raise ValueError("images must be a non-empty list")
    page_size = str(args.get("page_size", "SameAsImage")).strip()
    if page_size not in ("A4", "Letter", "SameAsImage"):
        raise ValueError("page_size must be A4, Letter or SameAsImage")
    orientation = str(args.get("orientation", "portrait")).strip().lower()
    if orientation not in ("portrait", "landscape"):
        raise ValueError("orientation must be portrait or landscape")
    try:
        margin_mm = float(args.get("margin_mm", 10))
    except Exception:
        raise ValueError("margin_mm must be a number")
    if margin_mm < 0 or margin_mm > 100:
        raise ValueError("margin_mm out of range (0-100)")

    margin_pt = margin_mm * 2.83465
    processed = []
    skipped_blank = 0
    for i, spec in enumerate(images):
        check_cancel()
        if not isinstance(spec, dict):
            raise ValueError(f"images[{i}] must be an object")
        img, meta = _process_single(spec)
        if img is None:
            skipped_blank += 1
        else:
            processed.append((img, meta))
        progress(int(((i + 1) / max(len(images), 1)) * 60))
    if not processed:
        raise ValueError("All pages were skipped as blank; nothing to build")

    check_cancel()
    out_pdf = unique_path(outdir, "scan", "pdf")
    tmpdir = tempfile.mkdtemp(prefix="ipdf_scan_")
    try:
        c = None
        for j, (img, meta) in enumerate(processed):
            check_cancel()
            if page_size == "A4":
                pw, ph = A4
            elif page_size == "Letter":
                pw, ph = LETTER
            else:  # SameAsImage at 150 dpi
                pw = max(72.0, img.width * 72.0 / 150.0)
                ph = max(72.0, img.height * 72.0 / 150.0)
            if orientation == "landscape" and page_size != "SameAsImage":
                if pw < ph:
                    pw, ph = ph, pw
            elif orientation == "portrait" and page_size != "SameAsImage":
                if pw > ph:
                    pw, ph = ph, pw
            if c is None:
                c = canvas.Canvas(out_pdf, pagesize=(pw, ph))
            else:
                c.setPageSize((pw, ph))
            avail_w = max(36.0, pw - 2 * margin_pt)
            avail_h = max(36.0, ph - 2 * margin_pt)
            iw, ih = float(img.width), float(img.height)
            scale = min(avail_w / iw, avail_h / ih)
            dw, dh = iw * scale, ih * scale
            dx = (pw - dw) / 2.0
            dy = (ph - dh) / 2.0
            tmp_img = os.path.join(tmpdir, f"p{j}.png")
            img.save(tmp_img, "PNG")
            c.drawImage(ImageReader(tmp_img), dx, dy, width=dw, height=dh,
                        preserveAspectRatio=True, mask="auto")
            c.showPage()
            progress(60 + int(((j + 1) / max(len(processed), 1)) * 38))
        c.save()
    finally:
        try:
            import shutil as _sh
            _sh.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass
    progress(100)
    return {"outputs": [out_pdf], "info": {
        "pages_included": len(processed),
        "pages_skipped_blank": skipped_blank,
        "page_size": page_size,
        "orientation": orientation,
        "margin_mm": margin_mm,
        "built_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }}


OPS = {"scanners": op_scanners, "build": op_build}

if __name__ == "__main__":
    run_tool(OPS)
