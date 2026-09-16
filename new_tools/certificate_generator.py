#!/usr/bin/env python3
"""CERTIFICATE GENERATOR — fill one PDF per data row (new tool, additive).

CLI: python certificate_generator.py <operation> <args-json> <output-dir>
Ops:
  inspect{pdf} -> {placeholders:[{{name}}...], pages}
  generate{template, rows[](list of dicts), field_map{placeholder:column},
           naming(e.g. "{{name}} - Certificate"), output_subdir(bool)}

Build: reportlab text overlay merged per-row with pypdf.
Data isolation: a FRESH template reader + fresh overlay is built per row;
after generation each output is verified with fitz text search to contain
its own row marker and none of the sibling rows' markers. Any leak fails
that row explicitly. Filenames are sanitized (strip \\/:*?"<>|) + deduped.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress,
    require_arg, run_tool, unique_path, validate_pdf,
)

import io
import re

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z0-9_.\- ]+?)\s*\}\}")


def _sanitize_stem(name):
    bad = '\\/:*?"<>|'
    for ch in bad:
        name = name.replace(ch, "")
    name = " ".join(str(name).split()).strip(" .")
    return name or "certificate"


def _extract_placeholders_fitz(doc):
    found = []
    for page in doc:
        try:
            text = page.get_text("text") or ""
        except Exception:
            text = ""
        for m in _PLACEHOLDER_RE.finditer(text):
            ph = "{{" + m.group(1).strip() + "}}"
            if ph not in found:
                found.append(ph)
    return found


def op_inspect(args, outdir):
    import fitz
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        placeholders = _extract_placeholders_fitz(doc)
        total = len(doc)
    finally:
        doc.close()
    return {"outputs": [], "info": {"placeholders": placeholders, "pages": total}}


def _render_name(pattern, row, field_map):
    def _sub(m):
        key = m.group(1).strip()
        col = field_map.get("{{" + key + "}}", field_map.get(key, key))
        return str(row.get(col, row.get(key, "")))
    return _PLACEHOLDER_RE.sub(_sub, str(pattern))


def _build_overlay_bytes(page_sizes, placements):
    """placements: {page_index: [(rect, value)]}. Returns PDF bytes."""
    from reportlab.pdfgen import canvas as _canvas
    from reportlab.lib.colors import white as _white, black as _black
    buf = io.BytesIO()
    c = _canvas.Canvas(buf)
    for idx, (pw, ph) in enumerate(page_sizes):
        c.setPageSize((pw, ph))
        for rect, value in placements.get(idx, []):
            x0, y0, x1, y1 = rect
            # cover the original placeholder so only the value shows
            try:
                c.setFillColor(_white)
                c.rect(x0, y0, max(1.0, x1 - x0), max(1.0, y1 - y0),
                       stroke=0, fill=1)
            except Exception:
                pass
            c.setFillColor(_black)
            box_w = max(10.0, x1 - x0)
            box_h = max(10.0, y1 - y0)
            fs = min(24.0, max(8.0, box_h * 0.6))
            try:
                c.setFont("Helvetica", fs)
            except Exception:
                pass
            # reportlab origin is bottom-left; fitz rects are top-left based
            # on the same page height, so flip y.
            baseline = ph - y1 + (box_h - fs) / 2.0
            c.drawString(x0 + 1, max(0.0, baseline), str(value))
        c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


def _generate_single_row(template_bytes, row, field_map, markers):
    """Fresh reader + fresh overlay per row. Returns (pdf_bytes, used)."""
    import fitz
    from pypdf import PdfReader, PdfWriter
    _ = markers  # markers only used at verify time; kept explicit for isolation audit
    # Fresh fitz read for geometry/search (never shares state across rows)
    fdoc = fitz.open(stream=template_bytes, filetype="pdf")
    try:
        page_sizes = [(p.rect.width, p.rect.height) for p in fdoc]
        placements = {}
        used = {}
        for idx, page in enumerate(fdoc):
            for ph_full in set(_PLACEHOLDER_RE.findall(page.get_text("text") or "")):
                key = "{{" + ph_full.strip() + "}}"
                col = field_map.get(key, field_map.get(ph_full.strip(), ph_full.strip()))
                value = row.get(col, "")
                used[key] = value
                try:
                    rects = page.search_for(key)
                except Exception:
                    rects = []
                if not rects:
                    # fallback: search without braces spacing variants
                    try:
                        rects = page.search_for(ph_full.strip()) or []
                    except Exception:
                        rects = []
                for r in rects:
                    placements.setdefault(idx, []).append(
                        ((r.x0, r.y0, r.x1, r.y1), value))
        if not used:
            # template has no detectable placeholders: still emit a row page
            # stamping the first value at a default location on page 1
            first_col = next(iter(row.keys()), None)
            if first_col is not None:
                w, h = page_sizes[0]
                placements.setdefault(0, []).append(
                    ((72, 72, w - 72, 120), row.get(first_col, "")))
                used = {"(default)": row.get(first_col, "")}
    finally:
        fdoc.close()
    overlay_bytes = _build_overlay_bytes(page_sizes, placements)
    # Fresh pypdf reader + writer per row (critical isolation)
    base = PdfReader(io.BytesIO(bytes(template_bytes)))
    over = PdfReader(io.BytesIO(overlay_bytes))
    writer = PdfWriter()
    for i, bpage in enumerate(base.pages):
        writer.add_page(bpage)
        if i < len(over.pages):
            try:
                writer.pages[i].merge_page(over.pages[i])
            except Exception as e:
                log(f"merge warning page {i + 1}: {e}")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue(), used


def op_generate(args, outdir):
    import fitz
    template = validate_pdf(require_arg(args, "template"))
    rows = require_arg(args, "rows")
    if not isinstance(rows, list) or not rows:
        raise ValueError("rows must be a non-empty list of dicts")
    for i, r in enumerate(rows):
        if not isinstance(r, dict):
            raise ValueError(f"rows[{i}] must be an object")
    field_map = args.get("field_map", {}) or {}
    if not isinstance(field_map, dict):
        raise ValueError("field_map must be an object")
    naming = str(args.get("naming", "{{name}} - Certificate"))
    output_subdir = bool(args.get("output_subdir", False))

    with open(template, "rb") as f:
        template_bytes = f.read()
    if not template_bytes.startswith(b"%PDF"):
        raise ValueError("template is not a PDF file")

    target_dir = os.path.join(outdir, "certificates") if output_subdir else outdir
    os.makedirs(target_dir, exist_ok=True)

    # row markers for leak verification: first column value per row
    first_cols = []
    for r in rows:
        first_cols.append(str(next(iter(r.values()), "")))
    unique_markers = len(set(first_cols)) == len(first_cols) and all(first_cols)

    generated, failed, verification = [], [], []
    used_names = set()
    for i, row in enumerate(rows):
        check_cancel()
        subbed = _render_name(naming, row, field_map)
        # naming may reference raw columns too; second pass on bare keys
        try:
            subbed = subbed.format(**{str(k): str(v) for k, v in row.items()})
        except Exception:
            pass
        stem = _sanitize_stem(subbed) or f"certificate_{i + 1}"
        base = stem
        n = 2
        while stem.lower() in used_names or os.path.exists(os.path.join(target_dir, stem + ".pdf")):
            stem = f"{base}_{n}"
            n += 1
        used_names.add(stem.lower())
        out_path = os.path.join(target_dir, stem + ".pdf")
        try:
            pdf_bytes, used = _generate_single_row(template_bytes, row, field_map, first_cols)
            with open(out_path, "wb") as f:
                f.write(pdf_bytes)
            # ---- verify: own marker present, siblings absent ----
            own = first_cols[i]
            try:
                vdoc = fitz.open(out_path)
                try:
                    full_text = "\n".join(p.get_text("text") or "" for p in vdoc)
                finally:
                    vdoc.close()
            except Exception as e:
                raise RuntimeError(f"verification open failed: {e}")
            own_ok = bool(own) and (own in full_text)
            leak = False
            leaked_from = None
            if unique_markers and own:
                for j, other in enumerate(first_cols):
                    if j != i and other and other in full_text:
                        # only count as leak if this sibling value is not also
                        # legitimately part of this row
                        if other not in [str(v) for v in row.values()]:
                            leak = True
                            leaked_from = j
                            break
            if leak:
                try:
                    os.remove(out_path)
                except Exception:
                    pass
                failed.append({"row": i, "file": None,
                               "error": f"Data leak detected (sibling row {leaked_from} marker present)"})
                verification.append({"row": i, "file": None, "own_marker_found": own_ok,
                                     "leak": True, "ok": False})
            elif not own_ok:
                failed.append({"row": i, "file": out_path,
                               "error": f"Verification failed: row marker {own!r} not found in output"})
                verification.append({"row": i, "file": out_path, "own_marker_found": False,
                                     "leak": False, "ok": False})
            else:
                generated.append(out_path)
                verification.append({"row": i, "file": out_path, "own_marker_found": True,
                                     "leak": False, "ok": True})
        except Exception as e:
            log(f"row {i} failed: {e}")
            failed.append({"row": i, "file": None, "error": str(e)})
            verification.append({"row": i, "file": None, "own_marker_found": False,
                                 "leak": False, "ok": False})
        progress(int(((i + 1) / max(len(rows), 1)) * 100))

    info = {"generated": generated, "failed": failed, "verification": verification,
            "count_ok": len(generated), "count_failed": len(failed)}
    if failed and not generated:
        return {"success": False, "error": f"All {len(rows)} rows failed: {failed[0].get('error')}",
                "outputs": [], "info": info}
    return {"outputs": generated, "info": info}


OPS = {"inspect": op_inspect, "generate": op_generate}

if __name__ == "__main__":
    run_tool(OPS)
