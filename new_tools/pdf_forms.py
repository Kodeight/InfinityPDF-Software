#!/usr/bin/env python3
"""PDF FORMS — inspect and create real AcroForm widgets (new tool, additive).

CLI: python pdf_forms.py <operation> <args-json> <output-dir>
Ops:
  inspect{pdf} -> existing AcroForm widgets list
  apply{pdf, fields[{kind[text,checkbox,radio,dropdown,date,signature],
        page, rect, name, value, options[], required, readonly}]}
    -> new PDF that opens with a valid AcroForm.

Date fields are stored as formatted text fields; signature fields are real
unsigned signature-type widgets (honest note in info — no certificate is
applied, signing happens later in a viewer).
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress,
    require_arg, run_tool, unique_path, validate_pdf,
)

import datetime

import fitz

# Widget types as symbolic PyMuPDF constants (numeric values differ per
# build — never hardcode them).
_KIND_TO_WIDGET = {
    "text": fitz.PDF_WIDGET_TYPE_TEXT,
    "checkbox": fitz.PDF_WIDGET_TYPE_CHECKBOX,
    "radio": fitz.PDF_WIDGET_TYPE_RADIOBUTTON,
    "dropdown": fitz.PDF_WIDGET_TYPE_COMBOBOX,
    "date": fitz.PDF_WIDGET_TYPE_TEXT,  # text field with formatted date value
    "signature": fitz.PDF_WIDGET_TYPE_SIGNATURE,  # unsigned
}

SIGNATURE_NOTE = (
    "Signature field is an UNSIGNED AcroForm signature widget (no "
    "certificate applied). Sign it later in a PDF viewer to create a real "
    "digital signature."
)


def _widget_type_name(t):
    names = {
        fitz.PDF_WIDGET_TYPE_UNKNOWN: "unknown",
        fitz.PDF_WIDGET_TYPE_BUTTON: "button",
        fitz.PDF_WIDGET_TYPE_CHECKBOX: "checkbox",
        fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "radiobutton",
        fitz.PDF_WIDGET_TYPE_TEXT: "text",
        fitz.PDF_WIDGET_TYPE_LISTBOX: "listbox",
        fitz.PDF_WIDGET_TYPE_COMBOBOX: "combobox",
        fitz.PDF_WIDGET_TYPE_SIGNATURE: "signature",
    }
    try:
        return names.get(int(t), str(t))
    except Exception:
        return str(t)


def op_inspect(args, outdir):
    import fitz
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        widgets = []
        for pno, page in enumerate(doc, start=1):
            check_cancel()
            try:
                wlist = list(page.widgets() or [])
            except Exception:
                wlist = []
            for w in wlist:
                try:
                    r = w.rect
                    rect = {"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1}
                except Exception:
                    rect = {}
                widgets.append({
                    "page": pno,
                    "name": getattr(w, "field_name", ""),
                    "type": _widget_type_name(getattr(w, "field_type", "")),
                    "value": getattr(w, "field_value", None),
                    "rect": rect,
                })
            progress(int((pno / max(len(doc), 1)) * 95))
        progress(100)
        return {"outputs": [], "info": {
            "widgets": widgets, "count": len(widgets),
            "is_form": len(widgets) > 0,
        }}
    finally:
        doc.close()


def _format_date(value):
    if value in (None, ""):
        return ""
    s = str(value).strip()
    fmts = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d",
            "%d.%m.%Y", "%Y.%m.%d", "%d %b %Y", "%d %B %Y")
    for f in fmts:
        try:
            return datetime.datetime.strptime(s, f).strftime("%Y-%m-%d")
        except Exception:
            continue
    try:
        return datetime.datetime.fromisoformat(s).strftime("%Y-%m-%d")
    except Exception:
        return s  # store verbatim as text if unparseable


def op_apply(args, outdir):
    import fitz
    pdf = validate_pdf(require_arg(args, "pdf"))
    fields = require_arg(args, "fields")
    if not isinstance(fields, list) or not fields:
        raise ValueError("fields must be a non-empty list")

    doc = fitz.open(pdf)
    try:
        total = len(doc)
        added = []
        for i, f in enumerate(fields):
            check_cancel()
            if not isinstance(f, dict):
                raise ValueError(f"fields[{i}] must be an object")
            kind = str(f.get("kind", "text")).strip().lower()
            if kind not in _KIND_TO_WIDGET:
                raise ValueError(
                    f"fields[{i}].kind must be one of text,checkbox,radio,dropdown,date,signature")
            try:
                page_no = int(f.get("page", 1))
            except Exception:
                raise ValueError(f"fields[{i}].page must be an integer")
            if page_no < 1 or page_no > total:
                raise ValueError(f"fields[{i}].page out of bounds (1-{total})")
            name = str(f.get("name", f"field_{i + 1}")).strip()
            if not name:
                raise ValueError(f"fields[{i}].name is required")
            rect = f.get("rect")
            if not isinstance(rect, dict):
                raise ValueError(f"fields[{i}].rect is required")
            try:
                x0, y0, x1, y1 = (float(rect["x0"]), float(rect["y0"]),
                                  float(rect["x1"]), float(rect["y1"]))
            except Exception:
                raise ValueError(f"fields[{i}].rect needs x0,y0,x1,y1 numbers")
            if x1 <= x0 or y1 <= y0:
                raise ValueError(f"fields[{i}].rect is empty/inverted")
            value = f.get("value")
            options = f.get("options", []) or []
            required = bool(f.get("required", False))
            readonly = bool(f.get("readonly", False))

            page = doc[page_no - 1]
            w = fitz.Widget()
            w.field_name = name
            w.field_type = _KIND_TO_WIDGET[kind]
            w.rect = fitz.Rect(x0, y0, x1, y1)

            if kind == "checkbox":
                w.field_value = bool(value) if not isinstance(value, bool) else value
            elif kind == "radio":
                if options and value not in options:
                    log(f"fields[{i}]: radio value not in options; storing anyway")
                if options:
                    try:
                        w.choice_values = [str(o) for o in options]
                    except Exception as e:
                        log(f"fields[{i}]: choice_values failed: {e}")
                w.field_value = value if value is not None else (options[0] if options else "")
            elif kind == "dropdown":
                if not options:
                    raise ValueError(f"fields[{i}]: dropdown needs options[]")
                try:
                    w.choice_values = [str(o) for o in options]
                except Exception as e:
                    raise ValueError(f"fields[{i}]: invalid options: {e}")
                w.field_value = value if value in options else options[0]
            elif kind == "date":
                w.field_value = _format_date(value)
            elif kind == "signature":
                w.field_value = None
            else:  # text
                w.field_value = "" if value is None else str(value)

            if kind in ("text", "date", "dropdown"):
                try:
                    w.text_fontsize = 11
                except Exception:
                    pass
            try:
                flags = 0
                if required:
                    flags |= 1 << 1  # Required
                if readonly:
                    flags |= 1  # ReadOnly
                w.field_flags = flags
            except Exception as e:
                log(f"fields[{i}]: field_flags failed: {e}")
            try:
                page.add_widget(w)
            except Exception as e:
                raise RuntimeError(f"fields[{i}] ({name}): add_widget failed: {e}")
            # Generate the appearance stream now so values render in every
            # viewer and survive a later flatten (bake burns appearances).
            try:
                w.update()
            except Exception as e:
                log(f"fields[{i}]: appearance update skipped: {e}")
            added.append({"name": name, "kind": kind, "page": page_no,
                          "value": getattr(w, "field_value", value)})
            progress(int(((i + 1) / max(len(fields), 1)) * 95))

        out_path = unique_path(outdir, "form", "pdf")
        doc.save(out_path, garbage=3, deflate=True)
        # sanity: output must open with a valid AcroForm when widgets added
        try:
            chk = fitz.open(out_path)
            try:
                n_widgets = sum(len(list(p.widgets() or [])) for p in chk)
            finally:
                chk.close()
        except Exception as e:
            raise RuntimeError(f"Saved form failed validation reopen: {e}")
        if n_widgets < len(added):
            log(f"warning: only {n_widgets}/{len(added)} widgets found on reopen")
        progress(100)
        notes = []
        if any(a["kind"] == "date" for a in added):
            notes.append("Date fields are stored as formatted (YYYY-MM-DD) text fields.")
        if any(a["kind"] == "signature" for a in added):
            notes.append(SIGNATURE_NOTE)
        return {"outputs": [out_path], "info": {
            "fields_added": added, "count": len(added),
            "acroform_widgets_on_reopen": n_widgets,
            "notes": notes,
        }}
    finally:
        doc.close()


OPS = {"inspect": op_inspect, "apply": op_apply}

if __name__ == "__main__":
    run_tool(OPS)
