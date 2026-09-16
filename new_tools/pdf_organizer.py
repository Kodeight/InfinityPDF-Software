#!/usr/bin/env python3
"""PDF ORGANIZER - vector-preserving page management (new tool, additive).

CLI: python pdf_organizer.py <operation> <args-json> <output-dir>
Ops: info, render, merge, split_ranges, split_every_n, extract,
     delete_pages, rotate, duplicate, reorder, replace,
     insert_blank, insert_from

Page manipulation uses pypdf (no rasterization). render uses fitz.
Pages specs: "all" or "1,3,5-7" (1-based) via _common.parse_pages.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fitz
from pypdf import PdfReader, PdfWriter

from _common import (
    check_cancel, log, parse_pages, progress, require_arg,
    run_tool, unique_path, validate_pdf,
)

A4_PT = (595.28, 841.89)
LETTER_PT = (612.0, 792.0)


def _stem(pdf_path, suffix):
    base = os.path.splitext(os.path.basename(pdf_path))[0].strip() or "document"
    return "%s_%s" % (base, suffix)


def _write_writer(writer, outdir, stem):
    out = unique_path(outdir, stem, "pdf")
    with open(out, "wb") as f:
        writer.write(f)
    return out


def _total_pages(pdf_path):
    return len(PdfReader(pdf_path).pages)


def _rotate_page(page, angle):
    angle = int(angle) % 360
    if angle == 0:
        return
    if angle % 90 != 0:
        raise ValueError("Rotation angle must be a multiple of 90 (got %s)" % angle)
    try:
        page.rotate(angle)
    except Exception:
        if angle == 90:
            page.rotate_clockwise(90)
        elif angle == 180:
            page.rotate_clockwise(180)
        elif angle == 270:
            page.rotate_clockwise(270)
        else:  # pragma: no cover
            raise


def _at_to_insert_index(at, total):
    """Convert 1-based insertion position to 0-based index. None -> end."""
    if at is None or at == "":
        return total
    at = int(at)
    if at < 1 or at > total + 1:
        raise ValueError("Insert position 'at' out of bounds: %s (document has %s pages)" % (at, total))
    return at - 1


def op_info(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    reader = PdfReader(pdf)
    total = len(reader.pages)
    sizes = []
    for i, page in enumerate(reader.pages):
        check_cancel()
        box = page.mediabox
        w, h = float(box.width), float(box.height)
        sizes.append({"page": i + 1, "width_pt": round(w, 2), "height_pt": round(h, 2),
                      "orientation": "landscape" if w > h else "portrait"})
        progress(int(((i + 1) / max(total, 1)) * 90))
    try:
        meta = {str(k).lstrip("/"): ("" if v is None else str(v)) for k, v in dict(reader.metadata or {}).items()}
    except Exception:
        meta = {}
    progress(100)
    return {"outputs": [], "info": {
        "file_name": os.path.basename(pdf),
        "file_size_bytes": os.path.getsize(pdf),
        "pages": total,
        "page_sizes": sizes,
        "metadata": meta,
        "is_encrypted": bool(reader.is_encrypted),
    }}


def op_render(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    page_no = int(args.get("page", 1))
    dpi = float(args.get("dpi", 150))
    if dpi < 36 or dpi > 600:
        raise ValueError("dpi must be between 36 and 600")
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        if page_no < 1 or page_no > total:
            raise ValueError("Page out of bounds: %s (document has %s pages)" % (page_no, total))
        check_cancel()
        pix = doc[page_no - 1].get_pixmap(matrix=fitz.Matrix(dpi / 72.0, dpi / 72.0), alpha=False)
        out = unique_path(outdir, _stem(pdf, "p%s_%sdpi" % (page_no, int(dpi))), "png")
        pix.save(out)
        progress(100)
        return {"outputs": [out], "info": {"page": page_no, "dpi": dpi,
                                           "width_px": pix.width, "height_px": pix.height}}
    finally:
        doc.close()


def op_merge(args, outdir):
    files = require_arg(args, "files")
    if not isinstance(files, list) or not files:
        raise ValueError("'files' must be a non-empty list of PDF paths")
    paths = [validate_pdf(f) for f in files]
    order = args.get("order")
    if order is not None:
        order = [int(i) for i in order]
        if sorted(order) != list(range(len(paths))):
            raise ValueError("'order' must be a permutation of 0-based file indices 0..%s" % (len(paths) - 1))
        paths = [paths[i] for i in order]
    writer = PdfWriter()
    readers = [PdfReader(p) for p in paths]
    total_pages = sum(len(r.pages) for r in readers)
    done = 0
    for reader in readers:
        for page in reader.pages:
            check_cancel()
            writer.add_page(page)
            done += 1
            if total_pages:
                progress(int(done / total_pages * 90))
    out = _write_writer(writer, outdir, "merged")
    progress(100)
    return {"outputs": [out], "info": {"files": len(paths), "pages": total_pages, "order": order}}


def op_split_ranges(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    ranges = require_arg(args, "ranges")
    if not isinstance(ranges, list) or not ranges:
        raise ValueError("'ranges' must be a non-empty list of {name, pages}")
    total = _total_pages(pdf)
    reader = PdfReader(pdf)
    outputs = []
    parts = []
    for idx, part in enumerate(ranges):
        check_cancel()
        if not isinstance(part, dict):
            raise ValueError("Each range must be an object {name, pages}")
        name = str(part.get("name") or ("part_%s" % (idx + 1)))
        sel = parse_pages(part.get("pages", "all"), total)
        writer = PdfWriter()
        for pno in sel:
            writer.add_page(reader.pages[pno])
        out = _write_writer(writer, outdir, name)
        outputs.append(out)
        parts.append({"name": name, "pages": [p + 1 for p in sel], "file": out})
        progress(int(((idx + 1) / len(ranges)) * 100))
    return {"outputs": outputs, "info": {"parts": parts}}


def op_split_every_n(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    n = int(require_arg(args, "n"))
    if n < 1:
        raise ValueError("'n' must be >= 1")
    total = _total_pages(pdf)
    reader = PdfReader(pdf)
    outputs = []
    parts = []
    chunks = (total + n - 1) // n
    for c in range(chunks):
        check_cancel()
        sel = list(range(c * n, min((c + 1) * n, total)))
        writer = PdfWriter()
        for pno in sel:
            writer.add_page(reader.pages[pno])
        out = _write_writer(writer, outdir, _stem(pdf, "part%02d" % (c + 1)))
        outputs.append(out)
        parts.append({"part": c + 1, "pages": [p + 1 for p in sel], "file": out})
        progress(int(((c + 1) / chunks) * 100))
    return {"outputs": outputs, "info": {"parts": parts, "chunk_size": n}}


def op_extract(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _total_pages(pdf)
    sel = parse_pages(args.get("pages", "all"), total)
    reader = PdfReader(pdf)
    writer = PdfWriter()
    for k, pno in enumerate(sel):
        check_cancel()
        writer.add_page(reader.pages[pno])
        progress(int(((k + 1) / len(sel)) * 90))
    out = _write_writer(writer, outdir, _stem(pdf, "extract"))
    progress(100)
    return {"outputs": [out], "info": {"pages": [p + 1 for p in sel], "count": len(sel)}}


def op_delete_pages(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _total_pages(pdf)
    doomed = set(parse_pages(require_arg(args, "pages"), total))
    keep = [p for p in range(total) if p not in doomed]
    if not keep:
        raise ValueError("Refusing to delete all pages")
    reader = PdfReader(pdf)
    writer = PdfWriter()
    for k, pno in enumerate(keep):
        check_cancel()
        writer.add_page(reader.pages[pno])
        progress(int(((k + 1) / len(keep)) * 90))
    out = _write_writer(writer, outdir, _stem(pdf, "deleted"))
    progress(100)
    return {"outputs": [out], "info": {"deleted": sorted(p + 1 for p in doomed),
                                       "remaining": len(keep)}}


def op_rotate(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _total_pages(pdf)
    sel = set(parse_pages(args.get("pages", "all"), total))
    angle = int(require_arg(args, "angle")) % 360
    if angle % 90 != 0:
        raise ValueError("Rotation angle must be a multiple of 90")
    reader = PdfReader(pdf)
    writer = PdfWriter()
    for i in range(total):
        check_cancel()
        writer.add_page(reader.pages[i])
        if i in sel and angle:
            _rotate_page(writer.pages[-1], angle)
        progress(int(((i + 1) / total) * 90))
    out = _write_writer(writer, outdir, _stem(pdf, "rotated"))
    progress(100)
    return {"outputs": [out], "info": {"pages": sorted(p + 1 for p in sel), "angle": angle}}


def op_duplicate(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _total_pages(pdf)
    sel = parse_pages(require_arg(args, "pages"), total)
    after = int(args.get("after", 0))
    if after < 0 or after > total:
        raise ValueError("'after' out of bounds: %s (document has %s pages)" % (after, total))
    reader = PdfReader(pdf)
    writer = PdfWriter()
    for i in range(total):
        check_cancel()
        writer.add_page(reader.pages[i])
        if i == after - 1:
            for pno in sel:
                writer.add_page(reader.pages[pno])
        progress(int(((i + 1) / total) * 90))
    if after == 0:
        for pno in sel:
            check_cancel()
            writer.add_page(reader.pages[pno])
    out = _write_writer(writer, outdir, _stem(pdf, "duplicated"))
    progress(100)
    return {"outputs": [out], "info": {"duplicated": [p + 1 for p in sel], "after": after,
                                       "pages": len(writer.pages)}}


def op_reorder(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _total_pages(pdf)
    new_order = [int(x) for x in require_arg(args, "new_order")]
    if sorted(new_order) == list(range(total)):
        zero_based = list(new_order)
    elif sorted(new_order) == list(range(1, total + 1)):
        zero_based = [x - 1 for x in new_order]
    else:
        raise ValueError("'new_order' must contain each page exactly once (0-based 0..%s or 1-based 1..%s)"
                         % (total - 1, total))
    reader = PdfReader(pdf)
    writer = PdfWriter()
    for k, pno in enumerate(zero_based):
        check_cancel()
        writer.add_page(reader.pages[pno])
        progress(int(((k + 1) / total) * 90))
    out = _write_writer(writer, outdir, _stem(pdf, "reordered"))
    progress(100)
    return {"outputs": [out], "info": {"new_order": new_order}}


def op_replace(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    src_pdf = validate_pdf(require_arg(args, "src_pdf"))
    total = _total_pages(pdf)
    src_total = _total_pages(src_pdf)
    index = int(require_arg(args, "index"))
    src_page = int(require_arg(args, "src_page"))
    if index < 1 or index > total:
        raise ValueError("'index' out of bounds: %s (document has %s pages)" % (index, total))
    if src_page < 1 or src_page > src_total:
        raise ValueError("'src_page' out of bounds: %s (source has %s pages)" % (src_page, src_total))
    reader = PdfReader(pdf)
    src_reader = PdfReader(src_pdf)
    writer = PdfWriter()
    for i in range(total):
        check_cancel()
        if i == index - 1:
            writer.add_page(src_reader.pages[src_page - 1])
        else:
            writer.add_page(reader.pages[i])
        progress(int(((i + 1) / total) * 90))
    out = _write_writer(writer, outdir, _stem(pdf, "replaced"))
    progress(100)
    return {"outputs": [out], "info": {"index": index, "src_page": src_page,
                                       "src_file": os.path.basename(src_pdf)}}


def op_insert_blank(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _total_pages(pdf)
    at_index = _at_to_insert_index(args.get("at"), total)
    count = int(args.get("count", 1))
    if count < 1 or count > 500:
        raise ValueError("'count' must be between 1 and 500")
    page_size = str(args.get("page_size", "A4"))
    if page_size == "Letter":
        w, h = LETTER_PT
    elif page_size == "A4":
        w, h = A4_PT
    else:
        raise ValueError("page_size must be one of [A4, Letter]")
    reader = PdfReader(pdf)
    writer = PdfWriter()
    for i in range(total):
        check_cancel()
        if i == at_index:
            for _ in range(count):
                writer.add_blank_page(width=w, height=h)
        writer.add_page(reader.pages[i])
        progress(int(((i + 1) / total) * 90))
    if at_index >= total:
        for _ in range(count):
            check_cancel()
            writer.add_blank_page(width=w, height=h)
    out = _write_writer(writer, outdir, _stem(pdf, "insertblank"))
    progress(100)
    return {"outputs": [out], "info": {"at": args.get("at"), "count": count,
                                       "page_size": page_size, "pages": len(writer.pages)}}


def op_insert_from(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    src_pdf = validate_pdf(require_arg(args, "src_pdf"))
    total = _total_pages(pdf)
    src_total = _total_pages(src_pdf)
    at_index = _at_to_insert_index(args.get("at"), total)
    sel = parse_pages(args.get("src_pages", "all"), src_total)
    reader = PdfReader(pdf)
    src_reader = PdfReader(src_pdf)
    writer = PdfWriter()
    for i in range(total):
        check_cancel()
        if i == at_index:
            for pno in sel:
                writer.add_page(src_reader.pages[pno])
        writer.add_page(reader.pages[i])
        progress(int(((i + 1) / total) * 90))
    if at_index >= total:
        for pno in sel:
            check_cancel()
            writer.add_page(src_reader.pages[pno])
    out = _write_writer(writer, outdir, _stem(pdf, "insertfrom"))
    progress(100)
    return {"outputs": [out], "info": {"at": args.get("at"),
                                       "inserted": [p + 1 for p in sel],
                                       "src_file": os.path.basename(src_pdf),
                                       "pages": len(writer.pages)}}


OPS = {
    "info": op_info,
    "render": op_render,
    "merge": op_merge,
    "split_ranges": op_split_ranges,
    "split_every_n": op_split_every_n,
    "extract": op_extract,
    "delete_pages": op_delete_pages,
    "rotate": op_rotate,
    "duplicate": op_duplicate,
    "reorder": op_reorder,
    "replace": op_replace,
    "insert_blank": op_insert_blank,
    "insert_from": op_insert_from,
}

if __name__ == "__main__":
    run_tool(OPS)
