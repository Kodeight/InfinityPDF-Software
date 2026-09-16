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
    "Required OCR engine is unavailable. InfinityPDF ships an optional "
    "vendored Tesseract bundle (see thirdparty/tesseract/README.md); "
    "otherwise install Tesseract OCR and ocrmypdf to enable searchable-PDF / "
    "text OCR. "
    "See https://tesseract-ocr.github.io/ and https://ocrmypdf.readthedocs.io/ ."
)

# Vendored-engine discovery. Precedence (first usable wins):
#   1. explicit `tesseract_bin` argument (Electron injects the vendored path)
#   2. INFINITYPDF_TESSERACT environment variable
#   3. system PATH (`tesseract`)
# An explicit `tessdata_dir` (or TESSDATA_PREFIX) points at eng/ara/fra
# language data so the install is fully offline.

# ---------------------------------------------------------------------------
# CHECK LAYER (detection only — safe to call anywhere, never crashes)
# ---------------------------------------------------------------------------

def _is_executable(path):
    return bool(path) and os.path.isfile(path) and os.access(path, os.X_OK)


def _resolve_tesseract(explicit=None):
    """Return (binary_path_or_None, source) with source in
    {'bundled', 'env', 'path', 'none'}."""
    if explicit and _is_executable(explicit):
        return explicit, "bundled"
    env_bin = os.environ.get("INFINITYPDF_TESSERACT", "")
    if env_bin and _is_executable(env_bin):
        return env_bin, "env"
    path_bin = shutil.which("tesseract")
    if path_bin:
        return path_bin, "path"
    return None, "none"


def _resolve_tessdata(explicit=None):
    if explicit and os.path.isdir(explicit):
        return explicit
    env_dir = os.environ.get("TESSDATA_PREFIX", "")
    if env_dir and os.path.isdir(env_dir):
        return env_dir
    return ""


def _detect_engines(explicit_bin=None, explicit_data=None):
    """Detect optional OCR engines. Never raises for missing pieces."""
    tesseract_bin, tess_source = _resolve_tesseract(explicit_bin)
    tessdata_dir = _resolve_tessdata(explicit_data) if tesseract_bin else ""
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
        "tesseract_source": tess_source,
        "tessdata_dir": tessdata_dir,
        "bundled": tess_source == "bundled",
        "ocrmypdf_available": bool(ocrmypdf_bin),
        "ocrmypdf_path": ocrmypdf_bin or "",
        "pytesseract_available": bool(has_pytesseract),
        "languages": sorted(set(languages)),
    }


def _check_requirements(explicit_bin=None, explicit_data=None):
    """Return (engine_name, status). Preference order:
    vendored/system tesseract CLI (no Python deps) -> ocrmypdf ->
    pytesseract+tesseract. None when nothing usable is installed."""
    st = _detect_engines(explicit_bin, explicit_data)
    if st["tesseract_available"]:
        return "tesseract-cli", st
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


def _tesseract_env(tessdata_dir):
    """Environment for the tesseract child: offline language data first."""
    env = dict(os.environ)
    if tessdata_dir:
        env["TESSDATA_PREFIX"] = tessdata_dir
    return env


def _run_tesseract_cli(tesseract_bin, tessdata_dir, src_pdf, dst_base, lang_str,
                       mode, workdir):
    """Direct Tesseract CLI pipeline (no ocrmypdf, no pytesseract needed).

    searchable: `tesseract in.pdf outbase -l langs pdf` (text layer over the
    original pages, appearance preserved byte-for-byte where possible).
    txt:        `tesseract in.pdf outbase -l langs txt`.
    """
    out_ext = "pdf" if mode == "searchable" else "txt"
    cmd = [tesseract_bin, src_pdf, dst_base, "-l", lang_str or "eng", out_ext]
    log(f"running tesseract CLI ({os.path.basename(tesseract_bin)} ... -l {lang_str} {out_ext})")
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=1800,
            cwd=workdir, env=_tesseract_env(tessdata_dir),
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("tesseract timed out")
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "")[-2000:]
        raise RuntimeError(f"tesseract failed (exit {proc.returncode}): {detail}")
    produced = dst_base + (".pdf" if mode == "searchable" else ".txt")
    if not os.path.exists(produced):
        raise RuntimeError("tesseract finished but produced no output file")
    return produced


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
    st = _detect_engines(args.get("tesseract_bin"), args.get("tessdata_dir"))
    note = (
        "Detection only. Engine preference: vendored/system Tesseract CLI "
        "(no Python deps) > ocrmypdf > pytesseract+tesseract. "
        "InfinityPDF can ship a vendored Tesseract bundle "
        "(thirdparty/tesseract/README.md) so customers install nothing; "
        "otherwise a system Tesseract/ocrmypdf is used when present."
    )
    return {"outputs": [], "info": {
        "tesseract_available": st["tesseract_available"],
        "tesseract_source": st["tesseract_source"],
        "bundled": st["bundled"],
        "tessdata_dir": st["tessdata_dir"],
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
    engine, st = _check_requirements(args.get("tesseract_bin"),
                                     args.get("tessdata_dir"))
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
    tess_bin = st.get("tesseract_path", "")
    tess_data = st.get("tessdata_dir", "")

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

        if engine == "tesseract-cli":
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
                            check_cancel()
                            sub.insert_pdf(s, from_page=pi, to_page=pi)
                        sub.save(src_for_ocr)
                    finally:
                        sub.close()
                finally:
                    s.close()
            dst_base = unique_path(outdir, "ocr_searchable" if mode == "searchable" else "ocr",
                                   "pdf" if mode == "searchable" else "txt")
            if dst_base.lower().endswith((".pdf", ".txt")):
                dst_base = dst_base[:dst_base.rfind(".")]
            progress(15)
            check_cancel()
            out_file = _run_tesseract_cli(tess_bin, tess_data, src_for_ocr,
                                          dst_base, lang_str, mode, workdir)
            progress(100)
            return {"outputs": [out_file], "info": {
                "engine": "tesseract-cli", "mode": mode, "langs": langs,
                "pages": [i + 1 for i in idxs],
                "bundled": st.get("bundled", False),
            }}

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
