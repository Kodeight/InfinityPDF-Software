#!/usr/bin/env python3
"""PDF REPAIR — tolerant analyze + rebuild (new tool, additive).

CLI: python pdf_repair.py <operation> <args-json> <output-dir>
Ops:
  analyze{pdf} -> tolerant check {header_ok, xref_ok/can_rebuild,
    page_count_or_error, text_extractable, error}
  repair{pdf} -> new PDF via fitz rebuild save (garbage=4, deflate, clean);
    falls back to page-by-page copy skipping unreadable pages, reporting
    skipped_pages. Never touches the source; meaningful error if unrecoverable.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress, require_arg, run_tool,
    unique_path, validate_pdf,
)
import fitz


def _header_ok(path):
    try:
        with open(path, "rb") as f:
            return f.read(5).startswith(b"%PDF")
    except Exception:
        return False


def op_analyze(args, outdir):
    raw = require_arg(args, "pdf")
    header = _header_ok(raw) if raw and os.path.exists(raw) else False
    if not raw or not os.path.exists(raw):
        progress(100)
        return {"outputs": [], "info": {"header_ok": False, "xref_ok": False,
                                        "can_rebuild": False, "page_count_or_error": "input not found",
                                        "text_extractable": False, "error": f"Input file not found: {raw}"}}
    try:
        check_cancel()
        doc = fitz.open(raw)
    except Exception as e:
        progress(100)
        return {"outputs": [], "info": {"header_ok": header, "xref_ok": False,
                                        "can_rebuild": False, "page_count_or_error": f"cannot open: {e}",
                                        "text_extractable": False, "error": str(e)}}
    try:
        total = len(doc)
        progress(40)
        xref_ok = True
        text_ok = False
        err = None
        try:
            if total > 0:
                t = doc[0].get_text("text")
                text_ok = bool((t or "").strip())
            else:
                err = "document has 0 pages"
                xref_ok = False
        except Exception as e:
            err = str(e)
            xref_ok = False
        progress(100)
        return {"outputs": [], "info": {"header_ok": header, "xref_ok": xref_ok,
                                        "can_rebuild": xref_ok, "page_count_or_error": total,
                                        "text_extractable": text_ok, "error": err}}
    finally:
        try:
            doc.close()
        except Exception:
            pass


def op_repair(args, outdir):
    raw = require_arg(args, "pdf")
    if not raw or not os.path.exists(raw):
        raise FileNotFoundError(f"Input file not found: {raw}")
    try:
        doc = fitz.open(raw)
    except Exception as e:
        raise ValueError(f"Unrecoverable: cannot open PDF ({e})")
    try:
        total = len(doc)
        # Attempt 1: full rebuild save.
        out = unique_path(outdir, "repaired", "pdf")
        try:
            progress(30)
            doc.save(out, garbage=4, deflate=True, clean=True)
            progress(100)
            return {"outputs": [out], "info": {"method": "rebuild (garbage=4, deflate, clean)",
                                               "pages": len(doc), "pages_before": total,
                                               "skipped_pages": []}}
        except Exception as e:
            log(f"full rebuild failed, trying page-by-page: {e}")
        # Attempt 2: page-by-page copy.
        check_cancel()
        new = fitz.open()
        skipped = []
        try:
            for pno in range(total):
                check_cancel()
                try:
                    new.insert_pdf(doc, from_page=pno, to_page=pno)
                except Exception as e:
                    log(f"page {pno + 1} skipped: {e}")
                    skipped.append(pno + 1)
                progress(int(((pno + 1) / max(total, 1)) * 90))
            if len(new) == 0:
                new.close()
                raise ValueError("Unrecoverable: no pages could be copied (all pages unreadable)")
            new.save(out, garbage=4, deflate=True, clean=True)
            progress(100)
            kept = len(new)
            new.close()
            return {"outputs": [out], "info": {"method": "page-by-page copy (skipped unreadable pages)",
                                               "pages": kept, "pages_before": total,
                                               "skipped_pages": skipped}}
        except Exception:
            try:
                new.close()
            except Exception:
                pass
            raise
    finally:
        try:
            doc.close()
        except Exception:
            pass


OPS = {"analyze": op_analyze, "repair": op_repair}

if __name__ == "__main__":
    run_tool(OPS)
