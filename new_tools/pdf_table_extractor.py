#!/usr/bin/env python3
"""PDF TABLE EXTRACTOR - detect word-grid tables and export them (new tool, additive).

CLI: python pdf_table_extractor.py <operation> <args-json> <output-dir>
Ops:
  detect(pdf, pages) -> tables metadata + grids (no output files)
  export(pdf, pages, fmt) -> fmt xlsx: one .xlsx, multi-sheet
                             (P{page}_T{n}); fmt csv: one .csv file
                             per table. UTF-8 with BOM for Excel.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import csv
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


def _export_xlsx(tables, outdir, base):
    wb = Workbook()
    try:
        wb.remove(wb.active)
    except Exception:
        pass
    for k, table in enumerate(tables):
        check_cancel()
        ws = wb.create_sheet(title="P%s_T%s" % (table["page"], table["table"]))
        for row in table.get("grid", []):
            ws.append(list(row))
        progress(int(((k + 1) / len(tables)) * 90))
    out = unique_path(outdir, base + "_tables", "xlsx")
    wb.save(out)
    return [out]


def _export_csv(tables, outdir):
    outputs = []
    for k, table in enumerate(tables):
        check_cancel()
        out = unique_path(outdir, "P%s_T%s" % (table["page"], table["table"]), "csv")
        with open(out, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            for row in table.get("grid", []):
                writer.writerow(list(row))
        outputs.append(out)
        progress(int(((k + 1) / len(tables)) * 90))
    return outputs


def op_export(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    fmt = str(args.get("fmt", "xlsx")).lower()
    if fmt not in ("xlsx", "csv"):
        raise ValueError("fmt must be one of [xlsx, csv]")
    total = _page_count(pdf)
    spec = args.get("pages", "all")
    parse_pages(spec, total)  # validate early for a clean error
    tables = detect_tables(pdf, spec)
    if not tables:
        return {"success": False,
                "error": "No tables detected on the selected pages",
                "outputs": [], "info": {"tables_found": 0}}
    base = os.path.splitext(os.path.basename(pdf))[0].strip() or "document"
    if fmt == "xlsx":
        outputs = _export_xlsx(tables, outdir, base)
    else:
        outputs = _export_csv(tables, outdir)
    progress(100)
    return {"outputs": outputs, "info": {
        "tables_found": len(tables), "fmt": fmt,
        "tables": [{"page": t["page"], "table": t["table"],
                    "rows": t["rows"], "cols": t["cols"]} for t in tables],
    }}


OPS = {"detect": op_detect, "export": op_export}

if __name__ == "__main__":
    run_tool(OPS)
