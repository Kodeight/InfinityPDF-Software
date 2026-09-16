#!/usr/bin/env python3
"""PDF REDACTION — TRUE redaction (content removal), never overlays (new tool, additive).

CLI: python pdf_redaction.py <operation> <args-json> <output-dir>
Ops:
  render{pdf,page,dpi} -> PNG preview + info{w_pt,h_pt}
  apply{pdf,redactions[{page,rect{x0,y0,x1,y1}}]} -> new PDF via
    add_redact_annot + apply_redactions(images=PDF_REDACT_IMAGE_REMOVE) + garbage save.
    Reports per-redaction success. Never paints black rectangles.
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
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72.0, dpi / 72.0))
        out = unique_path(outdir, f"redact_p{page_no}_{int(dpi)}dpi", "png")
        pix.save(out)
        progress(100)
        return {"outputs": [out], "info": {"page": page_no, "pages": total,
                                           "w_pt": round(r.width, 2), "h_pt": round(r.height, 2),
                                           "dpi": dpi}}
    finally:
        doc.close()


def op_apply(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    redactions = args.get("redactions", None)
    if redactions is None:
        raise ValueError("Missing required argument: redactions")
    if not isinstance(redactions, list) or not redactions:
        raise ValueError("'redactions' must be a non-empty array")
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        by_page = {}
        for i, rd in enumerate(redactions):
            if not isinstance(rd, dict):
                raise ValueError(f"redactions[{i}] must be an object")
            pno = int(rd.get("page", 0))
            if pno < 1 or pno > total:
                raise ValueError(f"redactions[{i}].page out of bounds: {rd.get('page')}")
            rr = rd.get("rect", None)
            if rr is None:
                raise ValueError(f"redactions[{i}].rect is required")
            try:
                rect = fitz.Rect(float(rr["x0"]), float(rr["y0"]),
                                 float(rr["x1"]), float(rr["y1"]))
            except Exception:
                raise ValueError(f"redactions[{i}].rect must be {{x0,y0,x1,y1}} numbers")
            if rect.width <= 0 or rect.height <= 0:
                raise ValueError(f"redactions[{i}].rect is empty")
            by_page.setdefault(pno - 1, []).append((i, rect))
        per = [{"index": i, "page": None, "ok": False, "error": "not applied"} for i in range(len(redactions))]
        try:
            img_mode = fitz.PDF_REDACT_IMAGE_REMOVE
        except Exception:
            img_mode = 2
        denom = max(len(by_page), 1)
        done = 0
        for pno, items in sorted(by_page.items()):
            check_cancel()
            page = doc[pno]
            for i, rect in items:
                try:
                    clipped = rect & page.rect
                    if clipped.width <= 0 or clipped.height <= 0:
                        raise ValueError("rect outside page")
                    page.add_redact_annot(clipped, fill=(0, 0, 0))
                    per[i] = {"index": i, "page": pno + 1, "ok": True, "error": None,
                              "rect": [rect.x0, rect.y0, rect.x1, rect.y1]}
                except Exception as e:
                    log(f"redaction {i} add skipped: {e}")
                    per[i] = {"index": i, "page": pno + 1, "ok": False, "error": str(e)}
            try:
                page.apply_redactions(images=img_mode)
            except TypeError:
                page.apply_redactions()
            except Exception as e:
                log(f"apply_redactions page {pno + 1} failed: {e}")
                for i, _ in items:
                    if per[i].get("ok"):
                        per[i] = {"index": i, "page": pno + 1, "ok": False,
                                  "error": f"apply_redactions failed: {e}"}
            done += 1
            progress(int((done / denom) * 90))
        ok_count = sum(1 for r in per if r.get("ok"))
        out = unique_path(outdir, "redacted", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {"results": per, "applied": ok_count,
                                           "requested": len(redactions),
                                           "method": "true-redaction (add_redact_annot + apply_redactions, images removed)"}}
    finally:
        doc.close()


OPS = {"render": op_render, "apply": op_apply}

if __name__ == "__main__":
    run_tool(OPS)
