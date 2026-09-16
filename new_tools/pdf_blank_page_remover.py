#!/usr/bin/env python3
"""BLANK PAGE REMOVER — detect and remove blank pages (new tool, additive).

CLI: python pdf_blank_page_remover.py <operation> <args-json> <output-dir>
Ops:
  analyze{pdf, threshold(0-100 ink %), mode[text,render,both]}
    -> info{pages[{page, is_blank, ink_pct, has_text}], blank_pages[], threshold, mode}
  remove{pdf, pages("auto" or explicit spec like "2,5-7"), threshold, mode}
    -> new PDF + info{removed[], kept[]}

Render-based ink coverage uses a fitz pixmap sampled with numpy when
available (pure-Python fallback otherwise). `pages:"auto"` runs the same
analysis internally and removes what it finds; passing an explicit page
spec removes exactly those pages (caller confirms by passing them).
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, parse_pages, progress,
    require_arg, run_tool, unique_path, validate_pdf,
)


def _ink_coverage(page, dpi=72):
    """Return ink coverage % for a page via pixmap sampling.

    Ink = pixels darker than near-white (value < 240 on grayscale).
    Uses numpy when available, else stride-sampled pure Python.
    """
    pix = page.get_pixmap(dpi=dpi, colorspace="gray", alpha=False)
    w, h, n = pix.width, pix.height, pix.n
    samples = bytes(pix.samples)
    total = w * h
    if total <= 0 or not samples:
        return 0.0
    try:
        import numpy as np
        arr = np.frombuffer(samples, dtype=np.uint8)
        # pix.samples for gray is 1 byte/pixel; stride down if padded
        if arr.size > total:
            arr = arr[::n][:total]
        ink = float((arr < 240).sum())
        return round(ink / float(total) * 100.0, 3)
    except ImportError:
        pass
    except Exception as e:
        log(f"numpy ink sampling failed, using fallback: {e}")
    # Pure-Python fallback: stride sample up to ~60k pixels
    stride = max(1, total // 60000)
    ink = 0
    count = 0
    step = n * stride
    for off in range(0, len(samples), step):
        if samples[off] < 240:
            ink += 1
        count += 1
    if count == 0:
        return 0.0
    return round(ink / float(count) * 100.0, 3)


def _analyze_doc(doc, threshold, mode):
    total = len(doc)
    rows = []
    for i, page in enumerate(doc):
        check_cancel()
        text = (page.get_text("text") or "").strip()
        has_text = bool(text)
        ink = _ink_coverage(page) if mode in ("render", "both") else 0.0
        if mode == "text":
            is_blank = not has_text
        elif mode == "render":
            is_blank = ink < threshold
        else:  # both: blank only when no text AND ink below threshold
            is_blank = (not has_text) and (ink < threshold)
        rows.append({"page": i + 1, "is_blank": bool(is_blank),
                     "ink_pct": ink, "has_text": has_text})
        progress(int(((i + 1) / max(total, 1)) * 95))
    progress(100)
    return rows


def op_analyze(args, outdir):
    import fitz
    pdf = validate_pdf(require_arg(args, "pdf"))
    try:
        threshold = float(args.get("threshold", 0.5))
    except Exception:
        raise ValueError("threshold must be a number 0-100")
    if not (0 <= threshold <= 100):
        raise ValueError("threshold must be within 0-100")
    mode = str(args.get("mode", "both")).strip().lower()
    if mode not in ("text", "render", "both"):
        raise ValueError("mode must be text, render or both")
    doc = fitz.open(pdf)
    try:
        rows = _analyze_doc(doc, threshold, mode)
    finally:
        doc.close()
    blank = [r["page"] for r in rows if r["is_blank"]]
    return {"outputs": [], "info": {
        "pages": rows, "blank_pages": blank,
        "threshold": threshold, "mode": mode,
        "note": "Confirm by passing pages explicitly (e.g. '2,5') or pages:'auto' to remove.remove.",
    }}


def op_remove(args, outdir):
    import fitz
    pdf = validate_pdf(require_arg(args, "pdf"))
    pages_arg = args.get("pages", "auto")
    try:
        threshold = float(args.get("threshold", 0.5))
    except Exception:
        raise ValueError("threshold must be a number 0-100")
    if not (0 <= threshold <= 100):
        raise ValueError("threshold must be within 0-100")
    mode = str(args.get("mode", "both")).strip().lower()
    if mode not in ("text", "render", "both"):
        raise ValueError("mode must be text, render or both")

    doc = fitz.open(pdf)
    try:
        total = len(doc)
        if isinstance(pages_arg, str) and pages_arg.strip().lower() == "auto":
            rows = _analyze_doc(doc, threshold, mode)
            remove_1based = [r["page"] for r in rows if r["is_blank"]]
            detected = True
        else:
            idxs = parse_pages(pages_arg, total)
            remove_1based = [i + 1 for i in idxs]
            detected = False
        remove_set = set(remove_1based)
        kept = [p for p in range(1, total + 1) if p not in remove_set]
        if not remove_1based:
            raise ValueError("No pages to remove (blank list is empty)")
        if not kept:
            raise ValueError("Refusing to remove all pages")
        check_cancel()
        out = fitz.open()
        try:
            for k, pno in enumerate(kept):
                check_cancel()
                out.insert_pdf(doc, from_page=pno - 1, to_page=pno - 1)
                progress(int(((k + 1) / max(len(kept), 1)) * 95))
            out_path = unique_path(outdir, "noblank", "pdf")
            out.save(out_path, garbage=3, deflate=True)
        finally:
            out.close()
        progress(100)
        return {"outputs": [out_path], "info": {
            "removed": sorted(remove_1based), "kept": kept,
            "threshold": threshold, "mode": mode,
            "auto_detected": detected,
        }}
    finally:
        doc.close()


OPS = {"analyze": op_analyze, "remove": op_remove}

if __name__ == "__main__":
    run_tool(OPS)
