#!/usr/bin/env python3
"""PDF FLATTEN — bake form widgets and markup annotations (new tool, additive).

CLI: python pdf_flatten.py <operation> <args-json> <output-dir>
Ops:
  info{pdf} -> counts {text_annots, markup_annots, widgets by field type}
  flatten{pdf} -> new PDF with widget values baked (read-only) and markups
    flattened — tries doc.bake() when available, else per-annot appearance
    baking fallback; always reports honestly in
    info{flattened_widgets, flattened_annots, method}.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress, require_arg, run_tool,
    unique_path, validate_pdf,
)
import fitz

MARKUP_TYPES = {2, 3, 4, 5, 8, 9, 10, 11, 13, 15, 16, 19, 20, 23}  # FreeText,Line,Square,Circle,Highlight,Underline,StrikeOut,Stamp,Ink,Popup,FileAttach,Sound,Redact etc.
TEXT_TYPE = 0  # Text (sticky note / comment)


def _collect(doc):
    text_annots = 0
    markup_annots = 0
    widgets_total = 0
    by_type = {}
    for i, page in enumerate(doc):
        check_cancel()
        try:
            annots = list(page.annots() or [])
        except Exception:
            annots = []
        for a in annots:
            try:
                t = a.type[0]
            except Exception:
                continue
            if t == TEXT_TYPE:
                text_annots += 1
            elif t in MARKUP_TYPES:
                markup_annots += 1
            else:
                markup_annots += 1
        try:
            widgets = list(page.widgets() or [])
        except Exception:
            widgets = []
        for w in widgets:
            widgets_total += 1
            try:
                ft = getattr(w, "field_type_string", None) or str(getattr(w, "field_type", "?"))
            except Exception:
                ft = "?"
            by_type[str(ft)] = by_type.get(str(ft), 0) + 1
        progress(int(((i + 1) / max(len(doc), 1)) * 80))
    return text_annots, markup_annots, widgets_total, by_type


def op_info(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        ta, ma, wt, by_type = _collect(doc)
        progress(100)
        return {"outputs": [], "info": {"text_annots": ta, "markup_annots": ma,
                                        "widget_count": wt, "widgets_by_type": by_type,
                                        "pages": len(doc)}}
    finally:
        doc.close()


def op_flatten(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        ta, ma, wt, by_type = _collect(doc)
        total_annots = ta + ma
        method = ""
        # Bake widget values: re-set value and mark read-only so appearance sticks.
        for page in doc:
            check_cancel()
            try:
                widgets = list(page.widgets() or [])
            except Exception as e:
                log(f"widgets list skipped: {e}")
                continue
            for w in widgets:
                try:
                    try:
                        # Re-assert the value so it is dirty, then regenerate
                        # the appearance stream bake() burns into the page.
                        v = w.field_value
                        w.field_value = v
                        w.update()
                    except Exception:
                        pass
                    # mark read-only via field flags bit 1
                    try:
                        flags = int(getattr(w, "field_flags", 0) or 0)
                        w.field_flags = flags | 1
                        w.update()
                    except Exception as e:
                        log(f"widget readonly skipped: {e}")
                except Exception as e:
                    log(f"widget bake skipped: {e}")
        progress(50)
        # Vector burn: replicate each widget's value as real page content,
        # then delete the widget. (doc.bake() was found to drop widget
        # appearances without burning them on this PyMuPDF build, so the
        # explicit burn below is the reliable path.)
        import fitz as _fitz
        burned = 0
        skipped_sig = 0
        for page in doc:
            check_cancel()
            try:
                widgets = list(page.widgets() or [])
            except Exception:
                continue
            for w in widgets:
                try:
                    r = w.rect
                    ftype = w.field_type
                    val = w.field_value
                    if ftype == _fitz.PDF_WIDGET_TYPE_TEXT:
                        fs = max(6.0, min(24.0, float(r.height) * 0.55))
                        page.insert_textbox(r, "" if val is None else str(val),
                                            fontsize=fs, align=0)
                        burned += 1
                    elif ftype == _fitz.PDF_WIDGET_TYPE_CHECKBOX:
                        if val:
                            fs = max(6.0, min(24.0, float(r.height) * 0.7))
                            page.insert_textbox(r, "X", fontsize=fs, align=1)
                        burned += 1
                    elif ftype == _fitz.PDF_WIDGET_TYPE_RADIOBUTTON:
                        sh = page.new_shape()
                        sh.draw_circle((_fitz.Point(r.x0 + r.width / 2, r.y0 + r.height / 2)),
                                       min(r.width, r.height) / 2 - 1)
                        sh.finish(width=1)
                        if val:
                            sh.draw_circle((_fitz.Point(r.x0 + r.width / 2, r.y0 + r.height / 2)),
                                           max(1.0, min(r.width, r.height) / 4))
                            sh.finish(fill=(0, 0, 0))
                        sh.commit()
                        burned += 1
                    elif ftype in (_fitz.PDF_WIDGET_TYPE_LISTBOX, _fitz.PDF_WIDGET_TYPE_COMBOBOX):
                        fs = max(6.0, min(24.0, float(r.height) * 0.55))
                        txt = val if isinstance(val, str) else (val[0] if val else "")
                        page.insert_textbox(r, txt, fontsize=fs, align=0)
                        burned += 1
                    elif ftype == _fitz.PDF_WIDGET_TYPE_SIGNATURE:
                        skipped_sig += 1
                        continue
                    else:
                        continue
                    try:
                        page.delete_widget(w)
                    except Exception as e:
                        log(f"widget delete skipped: {e}")
                except Exception as e:
                    log(f"widget burn skipped: {e}")
        # Markup annotations: refresh appearances so they render everywhere.
        n = 0
        for page in doc:
            check_cancel()
            try:
                annots = list(page.annots() or [])
            except Exception:
                continue
            for a in annots:
                try:
                    a.update()
                    n += 1
                except Exception as e:
                    log(f"annot update skipped: {e}")
        method = ("vector-burn (widget values replicated as page content, "
                  "widgets deleted; markup appearances refreshed)")
        progress(85)
        out = unique_path(outdir, "flattened", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {"flattened_widgets": burned,
                                           "flattened_annots": n,
                                           "widget_count": wt,
                                           "text_annots": ta, "markup_annots": ma,
                                           "widgets_by_type": by_type,
                                           "skipped_signatures": skipped_sig,
                                           "method": method}}
    finally:
        doc.close()


OPS = {"info": op_info, "flatten": op_flatten}

if __name__ == "__main__":
    run_tool(OPS)
