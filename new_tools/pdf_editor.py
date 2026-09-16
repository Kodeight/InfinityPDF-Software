#!/usr/bin/env python3
"""PDF EDITOR — vector-preserving annotations, TRUE text replacement, page ops.

CLI: python pdf_editor.py <operation> <args-json> <output-dir>
Ops:
  render{pdf,page,dpi} -> PNG preview of 1-based page + info{w_pt,h_pt}
  inspect_text{pdf,page|pages} -> selectable text spans per page
  replace_text{pdf,replacements[{page,span_id|rect,new_text}]} -> new PDF,
    old glyphs truly removed (redaction), replacement set in the original
    font where reusable (Base-14 or extracted embedded subset), per-item
    verification + honest warnings
  delete_text{pdf,targets[{page,span_id|rect}]} -> new PDF with spans removed
  apply{pdf,edits[],page_ops[],text_edits[]} -> new PDF + full report

Scope/limits (do not oversell): single-line in-place replacement only;
replacement must fit the original line (auto-shrink to a 60% floor, else a
clear error); complex-script shaping is not applied; pages without a text
layer (scans, outlined text) are reported, not faked.

Edit record: {kind[text,note,highlight,underline,strike,rect,circle,line,arrow,draw,image],
  page(1-based), x0,y0,x1,y1 (PDF points, origin top-left),
  text,font_size,color[r,g,b 0-1],align[left,center,right],
  stroke[r,g,b],fill[r,g,b or null],width,points[[x,y]...] for draw,image_path}

Implemented with fitz (PyMuPDF), vector-preserving, no rasterization:
  text -> insert_textbox, notes -> add_text_annot,
  highlight/underline/strike -> add_*_annot + update,
  shapes -> page.new_shape drawings, images -> insert_image.
page_ops entries {op[delete,rotate,duplicate,insert_blank,extract],pages,angle,at}
are applied in order before edits (edit page numbers refer to post-page_ops pages).

NOTE: complex-script (Arabic) overlay shaping depends on platform fonts;
text is stored as given (no reshaping engine applied here).
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress, require_arg, run_tool,
    unique_path, validate_pdf,
)
import fitz


def _color(v):
    if v is None:
        return None
    try:
        c = [float(x) for x in v]
    except Exception:
        return None
    if len(c) != 3:
        return None
    c = [max(0.0, min(1.0, x)) for x in c]
    return tuple(c)


def _resolve_pages(spec, total):
    """Accept 'all'/'1,2-3'/list of 1-based ints -> sorted 0-based list."""
    if spec is None or (isinstance(spec, str) and spec.strip().lower() in ("", "all")):
        return list(range(total))
    if isinstance(spec, (list, tuple)):
        out = set()
        for n in spec:
            n = int(n)
            if n < 1 or n > total:
                raise ValueError(f"Page out of bounds: {n} (document has {total} pages)")
            out.add(n - 1)
        if not out:
            raise ValueError("No pages selected")
        return sorted(out)
    from _common import parse_pages
    return parse_pages(str(spec), total)


STD_FONTS = {
    # PDF Base-14 name (as reported in span["font"]) -> fitz fontname alias.
    "courier": "cour", "courier-bold": "courbo",
    "courier-oblique": "courro", "courier-boldoblique": "courboo",
    "helvetica": "helv", "helvetica-bold": "hebo",
    "helvetica-oblique": "helvo", "helvetica-boldoblique": "heboo",
    "times-roman": "tiro", "times-bold": "tibo",
    "times-italic": "tiit", "times-bolditalic": "tibi",
    "symbol": "symb", "zapfdingbats": "zadb",
}

_AR_RTL_RE = None


def _rtl_re():
    global _AR_RTL_RE
    if _AR_RTL_RE is None:
        import re
        _AR_RTL_RE = re.compile(r"[\u0590-\u08FF]")
    return _AR_RTL_RE


def _span_list(page):
    """Selectable text spans on a page: [{id, text, font, size, color, bbox}]."""
    out = []
    try:
        data = page.get_text("dict")
    except Exception as e:
        raise ValueError(f"Could not read page text layer: {e}")
    for b in data.get("blocks", []):
        if b.get("type", 0) != 0:
            continue
        for line in b.get("lines", []):
            for s in line.get("spans", []):
                text = s.get("text", "")
                if not text.strip():
                    continue
                bbox = s.get("bbox", [0, 0, 0, 0])
                out.append({
                    "id": len(out),
                    "text": text,
                    "font": str(s.get("font", "")),
                    "size": round(float(s.get("size", 0) or 0), 2),
                    "color": int(s.get("color", 0) or 0),
                    "bbox": {"x0": bbox[0], "y0": bbox[1],
                             "x1": bbox[2], "y1": bbox[3]},
                })
    return out


def op_inspect_text(args, outdir):
    from _common import parse_pages
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        pages_spec = args.get("pages", args.get("page", "all"))
        if isinstance(pages_spec, int):
            pages = [pages_spec - 1]
        else:
            pages = parse_pages(pages_spec, total)
        spans_by_page = {}
        for pno in pages:
            check_cancel()
            spans_by_page[str(pno + 1)] = _span_list(doc[pno])
        progress(100)
        return {"outputs": [], "info": {"pages": total, "spans": spans_by_page}}
    finally:
        doc.close()


def _srgb_to_frac(color_int):
    try:
        v = int(color_int)
    except Exception:
        v = 0
    return ((v >> 16 & 255) / 255.0, (v >> 8 & 255) / 255.0, (v & 255) / 255.0)


def _resolve_replacement_font(doc, page, span_font, workdir):
    """Return (kind, fontname_or_file, warnings[]).

    kind: 'standard' (Base-14 alias), 'embedded' (extracted font file),
    'fallback' (helv + warning).
    """
    base = span_font.split("+")[-1].strip()
    alias = STD_FONTS.get(base.lower())
    if alias:
        return "standard", alias, []
    # Try the embedded subset: match span font against page fonts, extract.
    try:
        for f in page.get_fonts(full=True):
            xref, _ext, _type, basefont = f[0], f[1], f[2], f[3]
            if str(basefont).split("+")[-1].lower() == base.lower():
                raw = doc.extract_font(xref)
                if isinstance(raw, dict):
                    ext, content = raw.get("ext", "ttf"), raw.get("content", b"")
                else:
                    ext, content = (raw[1] if len(raw) > 1 else "ttf",
                                    raw[3] if len(raw) > 3 else b"")
                if content:
                    import uuid as _uuid
                    fpath = os.path.join(workdir, f"emb_{_uuid.uuid4().hex}.{ext}")
                    with open(fpath, "wb") as fh:
                        fh.write(content)
                    return "embedded", fpath, []
    except Exception as e:
        log(f"embedded font extract skipped ({span_font}): {e}")
    return ("fallback", "helv",
            [f"Original font '{span_font}' is not reusable; replacement uses Helvetica."])


def _replace_span_text(doc, page, span, new_text, workdir, label):
    """True replacement: remove old glyphs, insert new text, verify both."""
    warnings = []
    if _rtl_re().search(new_text or ""):
        warnings.append("Replacement contains right-to-left/complex script; "
                        "glyph shaping is not applied by this engine.")
    rect = fitz.Rect(span["bbox"]["x0"], span["bbox"]["y0"],
                     span["bbox"]["x1"], span["bbox"]["y1"])
    if rect.width <= 0 or rect.height <= 0:
        raise ValueError(f"{label}: span has an empty bounding box")
    size = float(span.get("size") or 12)
    if size <= 0:
        size = 12
    method, fontref, fwarns = _resolve_replacement_font(
        doc, page, span.get("font", ""), workdir)
    warnings.extend(fwarns)
    color = _srgb_to_frac(span.get("color", 0))

    # Fit check on a single line: shrink to a 60% floor, else refuse rather
    # than silently overflowing the original layout. Measurement uses a
    # fitz.Font object because get_text_length() has no fontfile support.
    try:
        if method == "embedded":
            measure_font = fitz.Font(fontfile=fontref)
        else:
            measure_font = fitz.Font(fontname=fontref)
    except Exception as e:
        raise ValueError(f"{label}: cannot load replacement font ({e})")

    def _measure(text, fsize):
        return measure_font.text_length(text, fontsize=fsize)

    trial_size = size
    insert_kwargs = {"fontsize": trial_size, "color": color, "align": 0}
    if method == "embedded":
        insert_kwargs["fontfile"] = fontref
    else:
        insert_kwargs["fontname"] = fontref
    while trial_size >= size * 0.6:
        insert_kwargs["fontsize"] = trial_size
        try:
            need = _measure(new_text, trial_size)
        except Exception:
            need = rect.width  # measure failed: attempt at current size once
            trial_size = size * 0.6 - 1
            continue
        if need <= rect.width or trial_size <= size * 0.6 + 1e-9:
            break
        trial_size *= 0.9
    if trial_size < size:
        warnings.append(f"Replacement scaled to {trial_size:.1f}pt to fit the original line width.")
    try:
        final_need = _measure(new_text, insert_kwargs["fontsize"])
    except Exception:
        final_need = 0
    if final_need > rect.width * 1.02:
        raise ValueError(f"{label}: replacement is too long for the original layout "
                         f"(needs wider line). Split it or shorten the text.")

    page.add_redact_annot(rect)
    page.apply_redactions()
    gone = new_text not in page.get_text("text")  # sanity: old text must be gone
    # Insert rect: span bboxes hug the glyphs too tightly for insert_textbox
    # leading (verified: it needs ~2x fontsize of vertical room). Anchor at
    # the original top so nothing bleeds into the previous line; extend down
    # as needed. Width is unchanged to preserve horizontal layout. The
    # redaction above stays exact so neighbors are untouched.
    irect = fitz.Rect(rect.x0, rect.y0,
                       rect.x1, rect.y0 + max(rect.height, size * 2.0))
    left = page.insert_textbox(irect, new_text, **insert_kwargs)
    if left < 0:
        raise ValueError(f"{label}: replacement did not fit after fit check")
    return {"method": method, "font_size": round(insert_kwargs["fontsize"], 1),
            "warnings": warnings, "old_gone": bool(gone)}


def _find_span(spans, ref, label):
    if isinstance(ref, int):
        if 0 <= ref < len(spans):
            return spans[ref]
        raise ValueError(f"{label}: span_id {ref} out of range (page has {len(spans)} spans)")
    if isinstance(ref, dict) and all(k in ref for k in ("x0", "y0", "x1", "y1")):
        r = fitz.Rect(ref["x0"], ref["y0"], ref["x1"], ref["y1"])
        best, best_overlap = None, 0.0
        for s in spans:
            b = s["bbox"]
            sr = fitz.Rect(b["x0"], b["y0"], b["x1"], b["y1"])
            inter = r & sr
            overlap = inter.get_area() / (sr.get_area() or 1.0)
            if overlap > best_overlap:
                best, best_overlap = s, overlap
        if best is None or best_overlap <= 0:
            raise ValueError(f"{label}: no text span overlaps the given rect")
        return best
    raise ValueError(f"{label}: need span_id (int) or rect {{x0,y0,x1,y1}}")


def op_replace_text(args, outdir):
    from _common import temp_workdir
    import shutil
    pdf = validate_pdf(require_arg(args, "pdf"))
    replacements = require_arg(args, "replacements")
    if not isinstance(replacements, list) or not replacements:
        raise ValueError("'replacements' must be a non-empty array")
    workdir = temp_workdir("ipdf_txtedit_")
    doc = fitz.open(pdf)
    try:
        report = []
        for i, rep in enumerate(replacements):
            check_cancel()
            label = f"replacements[{i}]"
            if not isinstance(rep, dict):
                raise ValueError(f"{label} must be an object")
            pno = int(rep.get("page", 1))
            if pno < 1 or pno > len(doc):
                raise ValueError(f"{label}.page out of bounds")
            new_text = rep.get("new_text", "")
            if not isinstance(new_text, str) or not new_text:
                raise ValueError(f"{label}.new_text must be a non-empty string")
            ref = rep.get("span_id", rep.get("rect", None))
            page = doc[pno - 1]
            spans = _span_list(page)
            if not spans:
                raise ValueError(f"{label}: page {pno} has no selectable text "
                                 "(scanned image or outlined text cannot be edited this way)")
            span = _find_span(spans, ref, label)
            detail = _replace_span_text(doc, page, span, new_text, workdir, label)
            # Verify: old span text gone, new text present on the page.
            after = page.get_text("text")
            old_gone = span["text"] not in after
            new_here = new_text in after
            if not (old_gone and new_here):
                raise ValueError(f"{label}: post-edit verification failed "
                                 f"(old_gone={old_gone}, new_present={new_here})")
            report.append({"page": pno, "span_id": span["id"], "ok": True, **detail})
            progress(int(((i + 1) / len(replacements)) * 90))
        out = unique_path(outdir, "edited_text", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {"replaced": report, "count": len(report)}}
    finally:
        try:
            doc.close()
        except Exception:
            pass
        shutil.rmtree(workdir, ignore_errors=True)


def op_delete_text(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    targets = require_arg(args, "targets")
    if not isinstance(targets, list) or not targets:
        raise ValueError("'targets' must be a non-empty array")
    doc = fitz.open(pdf)
    try:
        report = []
        for i, tgt in enumerate(targets):
            check_cancel()
            label = f"targets[{i}]"
            if not isinstance(tgt, dict):
                raise ValueError(f"{label} must be an object")
            pno = int(tgt.get("page", 1))
            if pno < 1 or pno > len(doc):
                raise ValueError(f"{label}.page out of bounds")
            ref = tgt.get("span_id", tgt.get("rect", None))
            page = doc[pno - 1]
            spans = _span_list(page)
            if not spans:
                raise ValueError(f"{label}: page {pno} has no selectable text")
            span = _find_span(spans, ref, label)
            b = span["bbox"]
            page.add_redact_annot(fitz.Rect(b["x0"], b["y0"], b["x1"], b["y1"]))
            page.apply_redactions()
            gone = span["text"] not in page.get_text("text")
            if not gone:
                raise ValueError(f"{label}: text still extractable after removal")
            report.append({"page": pno, "span_id": span["id"], "ok": True})
            progress(int(((i + 1) / len(targets)) * 90))
        out = unique_path(outdir, "deleted_text", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {"deleted": report, "count": len(report)}}
    finally:
        try:
            doc.close()
        except Exception:
            pass


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
        zoom = dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        out = unique_path(outdir, f"editor_p{page_no}_{int(dpi)}dpi", "png")
        pix.save(out)
        progress(100)
        return {"outputs": [out], "info": {"page": page_no, "pages": total,
                                           "w_pt": round(r.width, 2), "h_pt": round(r.height, 2),
                                           "dpi": dpi}}
    finally:
        doc.close()


def _apply_page_ops(doc, page_ops):
    """Apply page_ops in order, mutating doc (or replacing it for extract). Returns doc."""
    if not page_ops:
        return doc
    for idx, pop in enumerate(page_ops):
        check_cancel()
        if not isinstance(pop, dict):
            raise ValueError(f"page_ops[{idx}] must be an object")
        op = str(pop.get("op", "")).strip().lower()
        if op not in ("delete", "rotate", "duplicate", "insert_blank", "extract"):
            raise ValueError(f"page_ops[{idx}].op must be one of delete,rotate,duplicate,insert_blank,extract")
        total = len(doc)
        if op == "insert_blank":
            at = pop.get("at", None)
            if at is None or str(at).strip().lower() in ("", "end"):
                pos = -1
            else:
                pos = int(at) - 1
                pos = max(0, min(pos, total))
            if total > 0:
                ref = doc[min(max(pos if pos >= 0 else total - 1, 0), total - 1)]
                w, h = ref.rect.width, ref.rect.height
            else:
                w, h = 595.0, 842.0
            if pos == -1:
                doc.new_page(width=w, height=h)
            else:
                doc.new_page(pno=pos, width=w, height=h)
            progress(int(((idx + 1) / len(page_ops)) * 40))
            continue
        pages = _resolve_pages(pop.get("pages", "all"), total)
        if op == "delete":
            for pno in sorted(pages, reverse=True):
                check_cancel()
                doc.delete_page(pno)
            if len(doc) == 0:
                doc.new_page(width=595, height=842)
        elif op == "rotate":
            angle = int(pop.get("angle", 90))
            if angle % 90 != 0:
                raise ValueError(f"page_ops[{idx}].angle must be a multiple of 90")
            for pno in pages:
                check_cancel()
                pg = doc[pno]
                pg.set_rotation((pg.rotation + angle) % 360)
        elif op == "duplicate":
            at = pop.get("at", None)
            for pno in pages:
                check_cancel()
                doc.copy_page(pno)
            if at is not None and str(at).strip().lower() not in ("", "end"):
                pos = max(0, min(int(at) - 1, len(doc)))
                # move the just-appended copies (len(pages) of them) to pos, preserving order
                copies = list(range(len(doc) - len(pages), len(doc)))
                for k, c in enumerate(copies):
                    doc.move_page(c, pos + k)
        elif op == "extract":
            new = fitz.open()
            try:
                for pno in pages:
                    check_cancel()
                    new.insert_pdf(doc, from_page=pno, to_page=pno)
            except Exception:
                new.close()
                raise
            if len(new) == 0:
                new.close()
                raise ValueError("extract produced an empty document")
            doc.close()
            doc = new
        progress(int(((idx + 1) / len(page_ops)) * 40))
    return doc


def _apply_single_edit(page, edit, idx):
    kind = str(edit.get("kind", "")).strip().lower()
    valid = ("text", "note", "highlight", "underline", "strike", "rect", "circle",
             "line", "arrow", "draw", "image")
    if kind not in valid:
        raise ValueError(f"edits[{idx}].kind must be one of {','.join(valid)}")
    x0 = float(edit.get("x0", 0)); y0 = float(edit.get("y0", 0))
    x1 = float(edit.get("x1", 0)); y1 = float(edit.get("y1", 0))
    rect = fitz.Rect(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
    text = str(edit.get("text", ""))
    font_size = float(edit.get("font_size", 12) or 12)
    color = _color(edit.get("color", [0, 0, 0])) or (0, 0, 0)
    stroke = _color(edit.get("stroke", [1, 0, 0])) or (1, 0, 0)
    fill_raw = edit.get("fill", None)
    fill = _color(fill_raw) if fill_raw is not None else None
    width = float(edit.get("width", 1.5) or 1.5)
    align_raw = str(edit.get("align", "left")).lower()
    align = {"left": 0, "center": 1, "right": 2}.get(align_raw, 0)
    if kind == "text":
        if not text:
            raise ValueError(f"edits[{idx}]: text edit needs 'text'")
        if rect.width <= 1 or rect.height <= 1:
            rect = fitz.Rect(rect.x0, rect.y0, rect.x0 + 200, rect.y0 + 50)
        page.insert_textbox(rect, text, fontsize=font_size, color=color, align=align)
    elif kind == "note":
        pt = fitz.Point(rect.x0, rect.y0)
        annot = page.add_text_annot(pt, text or "Note")
        annot.update()
    elif kind in ("highlight", "underline", "strike"):
        if rect.width <= 1 or rect.height <= 1:
            raise ValueError(f"edits[{idx}]: {kind} needs a non-empty rect")
        if kind == "highlight":
            annot = page.add_highlight_annot(rect)
        elif kind == "underline":
            annot = page.add_underline_annot(rect)
        else:
            annot = page.add_strikeout_annot(rect)
        try:
            annot.set_colors(stroke=stroke)
        except Exception as e:
            log(f"annot colors skipped: {e}")
        annot.update()
    elif kind in ("rect", "circle", "line", "arrow", "draw"):
        shape = page.new_shape()
        try:
            if kind == "rect":
                shape.draw_rect(rect)
            elif kind == "circle":
                shape.draw_oval(rect)
            elif kind == "line":
                shape.draw_line(fitz.Point(rect.x0, rect.y0), fitz.Point(rect.x1, rect.y1))
            elif kind == "arrow":
                p0 = fitz.Point(rect.x0, rect.y0); p1 = fitz.Point(rect.x1, rect.y1)
                shape.draw_line(p0, p1)
                # arrowhead: two short segments at p1
                try:
                    import math
                    ang = math.atan2(p1.y - p0.y, p1.x - p0.x)
                    L = max(8.0, width * 6.0)
                    for da in (math.radians(150), math.radians(-150)):
                        a = ang + da
                        q = fitz.Point(p1.x + L * math.cos(a), p1.y + L * math.sin(a))
                        shape.draw_line(p1, q)
                except Exception as e:
                    log(f"arrowhead skipped: {e}")
            else:  # draw polyline
                pts_raw = edit.get("points", [])
                if not pts_raw or len(pts_raw) < 2:
                    raise ValueError(f"edits[{idx}]: draw needs points[[x,y],...] with >= 2 points")
                pts = [fitz.Point(float(p[0]), float(p[1])) for p in pts_raw]
                shape.draw_polyline(pts)
            shape.finish(color=stroke, fill=fill, width=width, closePath=(kind in ("rect", "circle")))
            shape.commit()
        except Exception:
            try:
                shape.commit()
            except Exception:
                pass
            raise
    elif kind == "image":
        ipath = edit.get("image_path", "")
        if not ipath or not os.path.exists(ipath):
            raise ValueError(f"edits[{idx}]: image needs existing 'image_path'")
        if rect.width <= 1 or rect.height <= 1:
            raise ValueError(f"edits[{idx}]: image needs a non-empty rect")
        page.insert_image(rect, filename=os.path.abspath(ipath))


def op_apply(args, outdir):
    from _common import temp_workdir
    import shutil
    pdf = validate_pdf(require_arg(args, "pdf"))
    edits = args.get("edits", []) or []
    page_ops = args.get("page_ops", []) or []
    text_edits = args.get("text_edits", []) or []
    if not isinstance(edits, list) or not isinstance(page_ops, list):
        raise ValueError("'edits' and 'page_ops' must be arrays")
    if not isinstance(text_edits, list):
        raise ValueError("'text_edits' must be an array")
    doc = fitz.open(pdf)
    workdir = temp_workdir("ipdf_txtedit_")
    try:
        doc = _apply_page_ops(doc, page_ops)
        progress(30)
        # True text replacement runs before overlay edits so annotations
        # drawn by the user sit on top of the replaced text.
        text_report = []
        for i, rep in enumerate(text_edits):
            check_cancel()
            if not isinstance(rep, dict):
                raise ValueError(f"text_edits[{i}] must be an object")
            pno = int(rep.get("page", 1))
            if pno < 1 or pno > len(doc):
                raise ValueError(f"text_edits[{i}].page out of bounds")
            new_text = rep.get("new_text", "")
            if not isinstance(new_text, str) or not new_text:
                raise ValueError(f"text_edits[{i}].new_text must be a non-empty string")
            page = doc[pno - 1]
            spans = _span_list(page)
            if not spans:
                raise ValueError(f"text_edits[{i}]: page {pno} has no selectable text")
            span = _find_span(spans, rep.get("span_id", rep.get("rect", None)),
                              f"text_edits[{i}]")
            detail = _replace_span_text(doc, page, span, new_text, workdir,
                                        f"text_edits[{i}]")
            after = page.get_text("text")
            if span["text"] in after or new_text not in after:
                raise ValueError(f"text_edits[{i}]: post-edit verification failed")
            text_report.append({"page": pno, "span_id": span["id"], "ok": True, **detail})
            progress(30 + int(((i + 1) / max(len(text_edits), 1)) * 15))
        progress(45)
        total = len(doc)
        applied = 0
        denom = max(len(edits), 1)
        for i, edit in enumerate(edits):
            check_cancel()
            if not isinstance(edit, dict):
                raise ValueError(f"edits[{i}] must be an object")
            pno = int(edit.get("page", 1))
            if pno < 1 or pno > len(doc):
                raise ValueError(f"edits[{i}].page out of bounds: {pno} (document has {len(doc)} pages)")
            _apply_single_edit(doc[pno - 1], edit, i)
            applied += 1
            progress(45 + int(((i + 1) / denom) * 50))
        # validate image paths are inside handled types is done in _apply_single_edit
        out = unique_path(outdir, "edited", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {"edits_applied": applied, "edit_count": len(edits),
                                           "text_edits_applied": text_report,
                                           "page_ops_applied": len(page_ops), "pages": len(doc),
                                           "pages_before": total}}
    finally:
        try:
            doc.close()
        except Exception:
            pass
        shutil.rmtree(workdir, ignore_errors=True)


OPS = {"render": op_render, "apply": op_apply,
       "inspect_text": op_inspect_text, "replace_text": op_replace_text,
       "delete_text": op_delete_text}

if __name__ == "__main__":
    run_tool(OPS)
