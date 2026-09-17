# Vendored Tesseract OCR engine (optional bundle)

InfinityPDF's OCR tool prefers a **vendored Tesseract binary** so customers
never install Python, Tesseract, or developer dependencies. When this folder
contains a working bundle, the app uses it automatically (dev and packaged);
when absent, the backend falls back to `INFINITYPDF_TESSERACT` → system
`PATH` → a clear "engine unavailable" message. Nothing crashes either way.

## Current status

- `tessdata/{eng,ara,fra}.traineddata` (tessdata_fast, verified magic bytes
  + sizes) are vendored locally (gitignored, shipped when present).
- `bin/tesseract.exe` is NOT yet vendored: the only verified Windows
  distribution is an Inno Setup installer, and locked-down environments must
  not execute it. See "Binary harvest" below.
- Until the binary lands, `engines` reports `bundled:false` and `ocr`
  degrades gracefully. The full wiring (precedence, `TESSDATA_PREFIX`,
  subsets, packaged injection) is verified with a stub engine.

## Licensing verdict (bundling is permitted)

- Tesseract 5: Apache 2.0. tessdata_fast: Apache 2.0. Leptonica: BSD.
  All permit redistribution with attribution — keep the upstream
  `LICENSE`/`NOTICE` next to the binaries.
- Rejected alternative: Windows built-in WinRT OCR (present on Win10+ but
  Arabic/French depend on optional user language packs → unreliable offline;
  plus WinRT/COM interop and no searchable-PDF pipeline). Tesseract stays.

## Binary harvest (one time, staging machine)

1. Run `thirdparty/fetch_ocr_engine.ps1` (downloads + hash-verifies the
   installer; never executes it).
2. On a staging machine, extract WITHOUT system install and copy
   `tesseract.exe` + its DLLs into `bin/`.
3. Confirm `tesseract.exe --list-langs` shows eng/ara/fra, then run the
   genuine accuracy gate (English/French/Arabic scanned pages).

## Expected layout

```text
thirdparty/tesseract/
  README.md            (this file — always committed)
  bin/
    tesseract.exe      (Windows; `tesseract` on other platforms — gitignored)
  tessdata/
    eng.traineddata    (gitignored)
    ara.traineddata    (gitignored)
    fra.traineddata    (gitignored)
```

Only `README.md` is committed. Binaries and language data are gitignored
(they add ~35 MB) but ship inside the installer via electron-builder
`extraResources` when present.

## Vendoring (run once on a machine with network)

```powershell
powershell -ExecutionPolicy Bypass -File thirdparty/fetch_ocr_engine.ps1
```

The script downloads:

| Component | Source | License | Approx. size |
|---|---|---|---|
| Tesseract 5 Windows binary | UB Mannheim builds (`tesseract-ocr-w64-setup` portable zip) | Apache 2.0 | ~20 MB |
| `eng.traineddata` (tessdata_fast) | `https://github.com/tesseract-ocr/tessdata_fast` | Apache 2.0 | ~4.5 MB |
| `ara.traineddata` (tessdata_fast) | same repo | Apache 2.0 | ~3 MB |
| `fra.traineddata` (tessdata_fast) | same repo | Apache 2.0 | ~4 MB |

`tessdata_fast` is chosen over `tessdata_best` deliberately: ~10x faster
startup/OCR at a small accuracy cost, which matters for batch PDFs.
Leptonica (bundled inside the UB Mannheim build) is BSD-licensed.

Keep a copy of the corresponding `LICENSE`/`NOTICE` files next to the
binaries and preserve them in the installer.

## How the app finds it

1. Dev: `<repo>/thirdparty/tesseract/bin/tesseract.exe` (+ `tessdata/`)
2. Packaged: `<resources>/thirdparty/tesseract/...` (via `extraResources`)
3. Override: `INFINITYPDF_TESSERACT` env var, or explicit `tesseract_bin` /
   `tessdata_dir` job arguments (caller-provided paths always win)
4. Fallback: system `tesseract` on `PATH`, then ocrmypdf, then pytesseract

Discovery and precedence live in `new_tools/pdf_ocr.py`
(`_resolve_tesseract`); injection lives in `main/main.js`
(`resolveVendoredTesseract`). The backend sets `TESSDATA_PREFIX` for the
child process, so operation is fully offline.

## Verification without the real binaries

The wiring (precedence, env propagation, subset handling) is verified with
a stub executable — see the OCR item in the engineering notes. The genuine
end-to-end check (Arabic/French/English accuracy) requires the real bundle
and is a release-gate step, not a unit test.
