#!/usr/bin/env python3
"""PDF TO TEXT - text-layer detection and UTF-8 text extraction (new tool, additive).

CLI: python pdf_to_text.py <operation> <args-json> <output-dir>
Ops:
  detect_layer(pdf) -> per-page has_text + OCR recommendation (no outputs)
  extract(pdf, pages, fmt) -> .txt or .md file (UTF-8)

Markdown mode infers headings from relative font sizes using fitz
dict extraction; line breaks are preserved.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fitz

from _common import (
    check_cancel, parse_pages, progress, require_arg,
    run_tool, unique_path, validate_pdf,
)


def op_detect_layer(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        pages = []
        text_pages = 0
        for i, page in enumerate(doc):
            check_cancel()
            txt = page.get_text("text") or ""
            stripped = txt.strip()
            has = bool(stripped)
            if has:
                text_pages += 1
            pages.append({"page": i + 1, "has_text": has,
                          "chars": len(stripped)})
            progress(int(((i + 1) / max(total, 1)) * 90))
        scanned = total - text_pages
        if scanned == total and total > 0:
            recommendation = "ocr_needed"
        elif scanned > 0:
            recommendation = "ocr_recommended_mixed"
        else:
            recommendation = "text_ok"
        progress(100)
        return {"outputs": [], "info": {
            "pages": pages, "text_pages": text_pages,
            "scanned_pages": scanned, "recommendation": recommendation,
        }}
    finally:
        doc.close()


def _median(values):
    s = sorted(values)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    if n % 2:
        return float(s[mid])
    return (float(s[mid - 1]) + float(s[mid])) / 2.0


def _page_markdown(page, baseline):
    """Convert one page to markdown using relative font sizes."""
    out_lines = []
    try:
        data = page.get_text("dict")
    except Exception:
        return page.get_text("text") or ""
    for block in data.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            texts = [(s.get("text", ""), float(s.get("size", 0) or 0)) for s in spans]
            texts = [(t, z) for t, z in texts if t]
            if not texts:
                continue
            line_text = "".join(t for t, _z in texts).strip()
            if not line_text:
                continue
            top = max(z for _t, z in texts)
            if baseline > 0 and top >= baseline * 1.6:
                out_lines.append("# " + line_text)
            elif baseline > 0 and top >= baseline * 1.3:
                out_lines.append("## " + line_text)
            else:
                out_lines.append(line_text)
        out_lines.append("")
    return "\n".join(out_lines).rstrip("\n")


def op_extract(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    fmt = str(args.get("fmt", "txt")).lower()
    if fmt not in ("txt", "md"):
        raise ValueError("fmt must be one of [txt, md]")
    doc = fitz.open(pdf)
    try:
        total = len(doc)
        sel = parse_pages(args.get("pages", "all"), total)
        if fmt == "md":
            sizes = []
            dicts = {}
            for pno in sel:
                check_cancel()
                try:
                    data = doc[pno].get_text("dict")
                except Exception:
                    continue
                dicts[pno] = data
                for block in data.get("blocks", []):
                    if block.get("type", 0) != 0:
                        continue
                    for line in block.get("lines", []):
                        for s in line.get("spans", []):
                            if (s.get("text") or "").strip():
                                sizes.append(float(s.get("size", 0) or 0))
            baseline = _median(sizes)
            chunks = []
            for k, pno in enumerate(sel):
                check_cancel()
                page = doc[pno]
                if pno in dicts:
                    chunks.append(_page_markdown(page, baseline))
                else:
                    chunks.append(page.get_text("text") or "")
                progress(int(((k + 1) / len(sel)) * 90))
            content = "\n\n---\n\n".join(c for c in chunks if c.strip())
            if not content.strip():
                content = ""
        else:
            chunks = []
            for k, pno in enumerate(sel):
                check_cancel()
                chunks.append(doc[pno].get_text("text") or "")
                progress(int(((k + 1) / len(sel)) * 90))
            content = "\n\n".join(c.rstrip("\n") for c in chunks)
        base = os.path.splitext(os.path.basename(pdf))[0].strip() or "document"
        out = unique_path(outdir, base, fmt)
        with open(out, "w", encoding="utf-8") as f:
            f.write(content)
        progress(100)
        return {"outputs": [out], "info": {
            "pages": [p + 1 for p in sel], "count": len(sel), "fmt": fmt,
            "chars": len(content),
        }}
    finally:
        doc.close()


OPS = {"detect_layer": op_detect_layer, "extract": op_extract}

if __name__ == "__main__":
    run_tool(OPS)
