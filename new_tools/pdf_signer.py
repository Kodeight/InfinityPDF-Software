#!/usr/bin/env python3
"""PDF SIGNER — stamp visual signatures onto pages (new tool, additive).

CLI: python pdf_signer.py <operation> <args-json> <output-dir>
Ops:
  apply{pdf, signatures[{page, rect{x0,y0,x1,y1}, kind[draw,type,image],
        image_path(for image), text(for type), pen_color, pen_width,
        points[] (for draw)}]}

Draw strokes (points[] required for kind=draw) and typed text are rendered
to transparent PNGs with PIL, then stamped via fitz insert_image overlay.
Image signatures use the given image file. Output is a NEW pdf.

NOTE: these are VISUAL signature graphics only — NOT cryptographic digital
signatures. The info block of every result states this explicitly.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress,
    require_arg, run_tool, unique_path, validate_pdf, validate_image,
)

import io

VISUAL_NOTE = (
    "Visual signatures only — these graphics are stamped onto the page "
    "content and are NOT cryptographic digital signatures. "
    "No certificate, hash, or DocMDP permission is applied."
)


def _parse_color(value, default=(20, 40, 160)):
    if not value:
        return default
    s = str(value).strip()
    named = {"black": (0, 0, 0), "blue": (20, 40, 160), "red": (180, 30, 30),
             "green": (20, 120, 60)}
    if s.lower() in named:
        return named[s.lower()]
    if s.startswith("#"):
        s = s[1:]
    if len(s) == 6:
        try:
            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
        except Exception:
            return default
    return default


def _render_draw_png(rect_w, rect_h, points, pen_color, pen_width):
    from PIL import Image, ImageDraw
    scale = 3
    W = max(8, int(rect_w * scale))
    H = max(8, int(rect_h * scale))
    img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    # points are in rect-local PDF points; normalise to bitmap pixels
    xs = [p[0] for p in points]; ys = [p[1] for p in points]
    minx, miny = min(xs), min(ys)
    maxx, maxy = max(xs), max(ys)
    spanx = max(1e-6, maxx - minx); spany = max(1e-6, maxy - miny)
    pad = 6
    norm = [((p[0] - minx) / spanx * (W - 2 * pad) + pad,
             (p[1] - miny) / spany * (H - 2 * pad) + pad) for p in points]
    wpx = max(2, int(pen_width * scale))
    if len(norm) == 1:
        x, y = norm[0]
        d.ellipse([x - wpx, y - wpx, x + wpx, y + wpx], fill=pen_color + (255,))
    else:
        d.line(norm, fill=pen_color + (255,), width=wpx, joint="curve")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _render_text_png(rect_w, rect_h, text, pen_color):
    from PIL import Image, ImageDraw, ImageFont
    scale = 3
    W = max(8, int(rect_w * scale))
    H = max(8, int(rect_h * scale))
    img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", max(12, H // 3))
    except Exception:
        try:
            font = ImageFont.truetype("DejaVuSans.ttf", max(12, H // 3))
        except Exception:
            font = ImageFont.load_default()
    try:
        bbox = d.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        tw, th = (W // 2, H // 2)
    d.text(((W - tw) / 2, (H - th) / 2), text, font=font, fill=pen_color + (255,))
    # underline flourish
    d.line([(W * 0.1, H * 0.85), (W * 0.9, H * 0.85)], fill=pen_color + (255,), width=max(2, H // 40))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def op_apply(args, outdir):
    import fitz
    pdf = validate_pdf(require_arg(args, "pdf"))
    sigs = require_arg(args, "signatures")
    if not isinstance(sigs, list) or not sigs:
        raise ValueError("signatures must be a non-empty list")

    doc = fitz.open(pdf)
    try:
        total = len(doc)
        for i, s in enumerate(sigs):
            check_cancel()
            if not isinstance(s, dict):
                raise ValueError(f"signatures[{i}] must be an object")
            try:
                page_no = int(s.get("page", 1))
            except Exception:
                raise ValueError(f"signatures[{i}].page must be an integer")
            if page_no < 1 or page_no > total:
                raise ValueError(f"signatures[{i}].page out of bounds (1-{total})")
            rect = s.get("rect")
            if not isinstance(rect, dict):
                raise ValueError(f"signatures[{i}].rect is required")
            try:
                x0, y0, x1, y1 = (float(rect["x0"]), float(rect["y0"]),
                                  float(rect["x1"]), float(rect["y1"]))
            except Exception:
                raise ValueError(f"signatures[{i}].rect needs x0,y0,x1,y1 numbers")
            if x1 <= x0 or y1 <= y0:
                raise ValueError(f"signatures[{i}].rect is empty/inverted")
            kind = str(s.get("kind", "")).strip().lower()
            if kind not in ("draw", "type", "image"):
                raise ValueError(f"signatures[{i}].kind must be draw, type or image")
            color = _parse_color(s.get("pen_color"), (20, 40, 160))
            try:
                pen_width = float(s.get("pen_width", 2.0))
            except Exception:
                pen_width = 2.0
            page = doc[page_no - 1]
            # clamp rect into the page
            pr = page.rect
            x0 = max(pr.x0, min(x0, pr.x1 - 1)); y0 = max(pr.y0, min(y0, pr.y1 - 1))
            x1 = max(x0 + 1, min(x1, pr.x1)); y1 = max(y0 + 1, min(y1, pr.y1))
            frect = frect_obj = fitz.Rect(x0, y0, x1, y1)
            w, h = frect.width, frect.height

            if kind == "draw":
                pts = s.get("points")
                if not pts:
                    raise ValueError(
                        f"signatures[{i}]: kind 'draw' needs points[] "
                        "(list of [x,y] strokes in rect-local coordinates)")
                # accept flat [[x,y],...] or segmented [[[x,y],...], ...]
                flat = pts[0][0] if (isinstance(pts[0], list) and pts and isinstance(pts[0][0], list)) else pts
                # if segmented, draw each segment separately then composite
                if pts and isinstance(pts[0], list) and pts[0] and isinstance(pts[0][0], list):
                    from PIL import Image as _PI
                    import io as _io
                    base = None
                    for seg in pts:
                        if len(seg) < 1:
                            continue
                        png = _render_draw_png(w, h, seg, color, pen_width)
                        im = _PI.open(_io.BytesIO(png)).convert("RGBA")
                        base = im if base is None else _PI.alpha_composite(base, im)
                    buf = _io.BytesIO()
                    base.save(buf, "PNG")
                    png_bytes = buf.getvalue()
                else:
                    png_bytes = _render_draw_png(w, h, flat, color, pen_width)
                page.insert_image(frect_obj, stream=png_bytes, overlay=True)
            elif kind == "type":
                text = s.get("text", "")
                if not str(text).strip():
                    raise ValueError(f"signatures[{i}]: kind 'type' needs text")
                png_bytes = _render_text_png(w, h, str(text), color)
                page.insert_image(frect_obj, stream=png_bytes, overlay=True)
            else:  # image
                ipath = s.get("image_path")
                if not ipath:
                    raise ValueError(f"signatures[{i}]: kind 'image' needs image_path")
                validate_image(ipath)
                page.insert_image(frect_obj, filename=ipath, overlay=True)
            log(f"stamped {kind} signature on page {page_no}")
            progress(int(((i + 1) / max(len(sigs), 1)) * 95))
        out_path = unique_path(outdir, "signed", "pdf")
        doc.save(out_path, garbage=3, deflate=True)
        progress(100)
        return {"outputs": [out_path], "info": {
            "count": len(sigs), "note": VISUAL_NOTE,
        }}
    finally:
        doc.close()


OPS = {"apply": op_apply}

if __name__ == "__main__":
    run_tool(OPS)
