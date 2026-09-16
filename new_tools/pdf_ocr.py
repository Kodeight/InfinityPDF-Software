#!/usr/bin/env python3
"""PDF OCR — searchable-PDF / text extraction via optional OCR engines.

CLI: python pdf_ocr.py <operation> <args-json> <output-dir>
Ops:
  engines{} -> {tesseract_available, ocrmypdf_available, pytesseract_available, languages[], note}
  ocr{pdf, pages, langs[], mode[searchable,txt]}

Architecture (check-then-run separation so engines can be added later):
  * check layer:  _detect_engines() / _check_requirements() — pure detection,
    never runs OCR, never raises for missing engines.
  * run layer:    _run_ocrmypdf() / _run_pytesseract_pipeline() — full
    pipelines with progress + temp-file cleanup.
  * op layer:     op_engines() / op_ocr() — check first, then dispatch.

If no real engine is present, op_ocr returns success False with a clear
message (never a stack trace).
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, parse_pages, progress,
    require_arg, run_tool, unique_path, validate_pdf,
)

import json
import shutil
import subprocess
import tempfile

_MISSING_MSG = (
    "Required OCR engine is unavailable (install Tesseract OCR and ocrmypdf "
    "to enable searchable-PDF / text OCR). "
    "See https://tesseract-ocr.github.io/ and https://ocrmypdf.readthedocs.io/ ."
)

# ---------------------------------------------------------------------------
# CHECK LAYER (detection only — safe to call anywhere, never crashes)
# ---------------------------------------------------------------------------

def _detect_engines():
    """Detect optional OCR engines. Never raises for missing pieces."""
    tesseract_bin = shutil.which("tesseract")
    ocrmypdf_bin = shutil.which("ocrmypdf")
    try:
        import pytesseract  # noqa: F401
        has_pytesseract = True
    except Exception:
        has_pytesseract = False
    tesseract_available = tesseract_bin is not None
    ocrmypdf_available = ocrmypdf_bin is not None
    languages = []
    if tesseract_bin:
        try:
            proc = subprocess.run(
                [tesseract_bin, "--list-langs"],
                capture_output=True, text=True, timeout=20,
            )
            out = (proc.stdout or "") + "\n" + (proc.stderr or "")
            for line in out.splitlines():
                line = line.strip()
                if not line or line.startswith("List of"):
                    continue
                if line and all(c.isalnum() or c in ("_", "-", "+") for c in line):
                    languages.append(line)
        except Exception as e:
            log(f"language listing failed: {e}")
    return {
        "tesseract_available": bool(tesseract_available),
        "tesseract_path": tesseract_bin or "",
        "ocrmypdf_available": bool(ocrmypdf_available),
        "ocrmypdf_path": ocrmypdf_bin or "",
        "pytesseract_available": bool(has_pytesseract),
        "languages": sorted(set(languages)),
    }


def _check_requirements():
    """Return (engine_name, status) where engine_name is 'ocrmypdf',
    'pytesseract' or None when nothing usable is installed."""
    st = _detect_engines()
    if st["ocrmypdf_available"]:
        return "ocrmypdf", st
    if st["pytesseract_available"] and st["tesseract_available"]:
        return "pytesseract", st
    return None, st


# ---------------------------------------------------------------------------
# RUN LAYER (full pipelines; only called after the check layer picked one)
# ---------------------------------------------------------------------------

def _run_ocrmypdf(src_pdf, dst_pdf, lang_str, workdir):
    ocrmypdf_bin = shutil.which("ocrmypdf")
    if not ocrmypdf_bin:
        raise RuntimeError("ocrmypdf binary disappeared during run")
    cmd = [
        ocrmypdf_bin,
        "-l", lang_str or "eng",
        "--skip-text",
        "--optimize", "0",
        "--output-type", "pdf",
        src_pdf, dst_pdf,
    ]
    log(f"running ocrmypdf ({' '.join(cmd[:4])} ...)")
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=1800,
            cwd=workdir,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("ocrmypdf timed out")
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "")[-2000:]
        raise RuntimeError(f"ocrmypdf failed (exit {proc.returncode}): {detail}")
    if not os.path.exists(dst_pdf):
        raise RuntimeError("ocrmypdf finished but produced no output file")


def _run_pytesseract_pipeline(src_pdf, page_idxs, lang_str, mode, dst_base, total_pages):
    """Render pages at 300 dpi, OCR with pytesseract, rebuild output.

    searchable: new PDF with the page image + invisible OCR text layer.
    txt:        plain-text file with form-feed page separators.
    Returns the output file path.
    """
    import fitz
    try:
        import pytesseract
    except Exception:
        raise RuntimeError("pytesseract Python package is not installed")
    if shutil.which("tesseract") is None:
        raise RuntimeError("Tesseract OCR binary not found on PATH")
    from PIL import Image

    src = fitz.open(src_pdf)
    try:
        if mode == "txt":
            chunks = []
            for k, pi in enumerate(page_idxs):
                check_cancel()
                page = src[pi]
                pix = page.get_pixmap(dpi=300)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                try:
                    text = pytesseract.image_to_string(img, lang=lang_str or "eng")
                except Exception as e:
                    raise RuntimeError(f"OCR failed on page {pi + 1}: {e}")
                chunks.append(f"--- page {pi + 1} ---\n{text}")
                progress(int(((k + 1) / max(len(page_idxs), 1)) * 95))
            out_txt = dst_base + ".txt"
            with open(out_txt, "w", encoding="utf-8") as f:
                f.write("\n\f\n".join(chunks) + "\n")
            progress(100)
            return out_txt
        # searchable PDF
        out = fitz.open()
        try:
            for k, pi in enumerate(page_idxs):
                check_cancel()
                page = src[pi]
                pix = page.get_pixmap(dpi=300)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                try:
                    text = pytesseract.image_to_string(img, lang=lang_str or "eng")
                except Exception as e:
                    raise RuntimeError(f"OCR failed on page {pi + 1}: {e}")
                rect = page.rect
                npage = out.new_page(width=rect.width, height=rect.height)
                tmp = os.path.join(tempfile.gettempdir(), f"ipdf_ocr_{pi}.png")
                try:
                    pix.save(tmp)
                    npage.insert_image(npage.rect, filename=tmp)
                finally:
                    try:
                        if os.path.exists(tmp):
                            os.remove(tmp)
                    except Exception:
                        pass
                if text.strip():
                    # invisible (render_mode=3) text layer over the image
                    try:
                        npage.insert_textbox(
                            npage.rect, text, fontsize=8, render_mode=3,
                        )
                    except Exception as e:
                        log(f"text-layer insert warning p{pi + 1}: {e}")
                progress(int(((k + 1) / max(len(page_idxs), 1)) * 95))
            out_path = dst_base + ".pdf"
            out.save(out_path, garbage=3, deflate=True)
            progress(100)
            return out_path
        finally:
            out.close()
    finally:
        src.close()


# ---------------------------------------------------------------------------
# OP LAYER
# ---------------------------------------------------------------------------

def op_engines(args, outdir):
    st = _detect_engines()
    note = (
        "Detection only: ocrmypdf binary and/or Tesseract OCR binary + "
        "pytesseract package enable the 'ocr' op. "
        "Preferred engine is ocrmypdf; fallback is pytesseract + tesseract. "
        "No engine is bundled with InfinityPDF."
    )
    return {"outputs": [], "info": {
        "tesseract_available": st["tesseract_available"],
        "ocrmypdf_available": st["ocrmypdf_available"],
        "pytesseract_available": st["pytesseract_available"],
        "languages": st["languages"],
        "note": note,
    }}


def op_ocr(args, outdir):
    import fitz
    pdf = validate_pdf(require_arg(args, "pdf"))
    pages_spec = args.get("pages", "all")
    langs = args.get("langs", ["eng"])
    if isinstance(langs, str):
        langs = [langs]
    langs = [str(x).strip() for x in langs if str(x).strip()]
    if not langs:
        langs = ["eng"]
    mode = str(args.get("mode", "searchable")).strip().lower()
    if mode not in ("searchable", "txt"):
        raise ValueError("mode must be 'searchable' or 'txt'")

    # ---- CHECK phase (no OCR work starts here) ----
    engine, st = _check_requirements()
    if engine is None:
        return {
            "success": False,
            "error": _MISSING_MSG,
            "outputs": [],
            "info": {
                "tesseract_available": st["tesseract_available"],
                "ocrmypdf_available": st["ocrmypdf_available"],
                "pytesseract_available": st["pytesseract_available"],
                "languages": st["languages"],
            },
        }
    lang_str = "+".join(langs)

    # ---- RUN phase ----
    workdir = tempfile.mkdtemp(prefix="ipdf_ocr_")
    try:
        doc = fitz.open(pdf)
        try:
            total = len(doc)
        finally:
            doc.close()
        if isinstance(pages_spec, list):
            idxs = [int(p) - 1 for p in pages_spec]
            idxs = [i for i in idxs if 0 <= i < total]
            if not idxs:
                raise ValueError("No pages selected")
            idxs = sorted(set(idxs))
        else:
            idxs = parse_pages(pages_spec, total)
        progress(5)

        if engine == "ocrmypdf":
            import fitz as _fitz
            if len(idxs) == total:
                src_for_ocr = pdf
            else:
                src_for_ocr = os.path.join(workdir, "subset.pdf")
                s = _fitz.open(pdf)
                try:
                    sub = _fitz.open()
                    try:
                        for pi in idxs:
                            sub.insert_pdf(s, from_page=pi, to_page=pi)
                        sub.save(src_for_ocr)
                    finally:
                        sub.close()
                finally:
                    s.close()
            tmp_out = os.path.join(workdir, "ocr.pdf")
            progress(15)
            check_cancel()
            _run_ocrmypdf(src_for_ocr, tmp_out, lang_str, workdir)
            progress(85)
            check_cancel()
            if mode == "txt":
                d = _fitz.open(tmp_out)
                try:
                    parts = []
                    for i, page in enumerate(d):
                        parts.append(f"--- page {i + 1} ---\n{page.get_text('text')}")
                    out_txt = unique_path(outdir, "ocr", "txt")
                    with open(out_txt, "w", encoding="utf-8") as f:
                        f.write("\n\f\n".join(parts) + "\n")
                finally:
                    d.close()
                progress(100)
                return {"outputs": [out_txt], "info": {
                    "engine": "ocrmypdf", "mode": mode, "langs": langs,
                    "pages": [i + 1 for i in idxs],
                }}
            final_pdf = unique_path(outdir, "ocr_searchable", "pdf")
            try:
                import shutil as _sh
                _sh.copyfile(tmp_out, final_pdf)
            except Exception:
                d = _fitz.open(tmp_out)
                try:
                    d.save(final_pdf)
                finally:
                    d.close()
            progress(100)
            return {"outputs": [final_pdf], "info": {
                "engine": "ocrmypdf", "mode": mode, "langs": langs,
                "pages": [i + 1 for i in idxs],
            }}
        else:  # pytesseract pipeline
            dst_base = unique_path(outdir, "ocr_searchable" if mode == "searchable" else "ocr",
                                   "pdf" if mode == "searchable" else "txt")
            if dst_base.lower().endswith((".pdf", ".txt")):
                dst_base = dst_base[:dst_base.rfind(".")]
            check_cancel()
            out_file = _run_pytesseract_pipeline(pdf, idxs, lang_str, mode, dst_base, total)
            return {"outputs": [out_file], "info": {
                "engine": "pytesseract+tesseract", "mode": mode, "langs": langs,
                "pages": [i + 1 for i in idxs],
            }}
    finally:
        try:
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:
            pass


OPS = {"engines": op_engines, "ocr": op_ocr}

if __name__ == "__main__":
    run_tool(OPS)
