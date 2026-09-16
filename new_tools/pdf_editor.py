#!/usr/bin/env python3
"""PDF EDITOR — vector-preserving annotations, drawings and page ops (new tool, additive).

CLI: python pdf_editor.py <operation> <args-json> <output-dir>
Ops:
  render{pdf,page,dpi} -> PNG preview of 1-based page + info{w_pt,h_pt}
  apply{pdf,edits[],page_ops[]} -> new PDF + info{edits_applied}

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
    pdf = validate_pdf(require_arg(args, "pdf"))
    edits = args.get("edits", []) or []
    page_ops = args.get("page_ops", []) or []
    if not isinstance(edits, list) or not isinstance(page_ops, list):
        raise ValueError("'edits' and 'page_ops' must be arrays")
    doc = fitz.open(pdf)
    try:
        doc = _apply_page_ops(doc, page_ops)
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
                                           "page_ops_applied": len(page_ops), "pages": len(doc),
                                           "pages_before": total}}
    finally:
        try:
            doc.close()
        except Exception:
            pass


OPS = {"render": op_render, "apply": op_apply}

if __name__ == "__main__":
    run_tool(OPS)
