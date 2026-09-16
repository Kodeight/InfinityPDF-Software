#!/usr/bin/env python3
"""PDF TO EXCEL - detect word-grid tables and export to XLSX (new tool, additive).

CLI: python pdf_to_excel.py <operation> <args-json> <output-dir>
Ops:
  detect(pdf, pages) -> tables metadata + grids (no output file)
  export(pdf, pages) -> .xlsx via openpyxl, one sheet per table
                        named P{page}_T{n}, grids as rows.

Table detection uses the sibling _tables helper (fitz word boxes).
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpyxl import Workbook

from _tables import detect_tables
from _common import (
    check_cancel, parse_pages, progress, require_arg,
    run_tool, unique_path, validate_pdf,
)

import fitz


def _page_count(pdf):
    doc = fitz.open(pdf)
    try:
        return len(doc)
    finally:
        doc.close()


def op_detect(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _page_count(pdf)
    spec = args.get("pages", "all")
    parse_pages(spec, total)  # validate early for a clean error
    tables = detect_tables(pdf, spec)
    check_cancel()
    progress(100)
    return {"outputs": [], "info": {
        "tables_found": len(tables),
        "tables": tables,
    }}


def op_export(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    total = _page_count(pdf)
    spec = args.get("pages", "all")
    parse_pages(spec, total)  # validate early for a clean error
    tables = detect_tables(pdf, spec)
    if not tables:
        return {"success": False,
                "error": "No tables detected on the selected pages",
                "outputs": [], "info": {"tables_found": 0}}
    wb = Workbook()
    try:
        wb.remove(wb.active)
    except Exception:
        pass
    for k, table in enumerate(tables):
        check_cancel()
        title = "P%s_T%s" % (table["page"], table["table"])
        ws = wb.create_sheet(title=title)
        for row in table.get("grid", []):
            ws.append(list(row))
        progress(int(((k + 1) / len(tables)) * 90))
    base = os.path.splitext(os.path.basename(pdf))[0].strip() or "document"
    out = unique_path(outdir, base + "_tables", "xlsx")
    wb.save(out)
    progress(100)
    return {"outputs": [out], "info": {
        "tables_found": len(tables),
        "sheets": [("P%s_T%s" % (t["page"], t["table"])) for t in tables],
    }}


OPS = {"detect": op_detect, "export": op_export}

if __name__ == "__main__":
    run_tool(OPS)
