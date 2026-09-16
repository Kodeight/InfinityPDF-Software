"""Shared table-detection helper for the NEW extraction tools.

Reconstructs row/column grids from fitz word boxes (no extra dependency).
Used by pdf_to_excel.py and pdf_table_extractor.py. New file — existing
code is untouched.
"""

import fitz


def _cluster(values, tol):
    groups = []
    for v in sorted(values):
        if groups and abs(v - groups[-1][-1]) <= tol:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [sum(g) / len(g) for g in groups]


def detect_tables_on_page(page, min_rows=2, min_cols=2):
    """Return a list of tables; each table is a list of row-lists of text."""
    words = page.get_text("words")  # x0,y0,x1,y1,word,block,line,word_no
    if not words:
        return []
    heights = [w[3] - w[1] for w in words]
    heights.sort()
    row_tol = max(2.0, (heights[len(heights) // 2]) * 0.6)

    rows = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        placed = False
        for r in rows:
            if abs(w[1] - r["y"]) <= row_tol:
                r["words"].append(w)
                r["y"] = (r["y"] * (len(r["words"]) - 1) + w[1]) / len(r["words"])
                placed = True
                break
        if not placed:
            rows.append({"y": w[1], "words": [w]})
    rows.sort(key=lambda r: r["y"])
    if len(rows) < min_rows:
        return []

    centers = []
    for r in rows:
        for w in sorted(r["words"], key=lambda w: w[0]):
            centers.append((w[0] + w[2]) / 2)
    if not centers:
        return []
    widths = sorted(w[2] - w[0] for r in rows for w in r["words"])
    col_tol = max(6.0, widths[len(widths) // 2] * 0.5)
    col_centers = _cluster(centers, col_tol)
    if len(col_centers) < min_cols:
        return []

    grid = []
    for r in rows:
        cells = [""] * len(col_centers)
        for w in r["words"]:
            cx = (w[0] + w[2]) / 2
            idx = min(range(len(col_centers)), key=lambda i: abs(col_centers[i] - cx))
            cells[idx] = (cells[idx] + " " + w[4]).strip()
        grid.append(cells)
    # Drop fully-empty rows.
    grid = [r for r in grid if any(c.strip() for c in r)]
    if len(grid) < min_rows:
        return []
    return [grid]


def detect_tables(pdf_path, pages_spec="all"):
    doc = fitz.open(pdf_path)
    try:
        from _common import parse_pages
        total = len(doc)
        pages = parse_pages(pages_spec, total)
        out = []
        for pno in pages:
            for tno, grid in enumerate(detect_tables_on_page(doc[pno])):
                out.append({"page": pno + 1, "table": tno + 1, "rows": len(grid),
                            "cols": len(grid[0]) if grid else 0, "grid": grid})
        return out
    finally:
        doc.close()
