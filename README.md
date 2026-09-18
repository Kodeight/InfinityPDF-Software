# InfinityPDF — Desktop Document Suite (v1.6.0)

Windows desktop application for PDF productivity: batch watermarking
(Multi PDF), PDF Security, Universal Converter, plus 25 additional PDF
tools (organize, compress, edit, extract, OCR/scan, sign & forms,
privacy, measure). Local-first: all PDF processing runs on your machine
via bundled Python backends — no account, no cloud processing.

## Install (customers)

- Supported OS: Windows 10 / Windows 11 (64-bit).
- Run the `InfinityPDF-1.6.0.exe` installer, then launch InfinityPDF
  from the Start Menu. No Node.js, Python, pip, or Git required.
- Microsoft Office (Word/PowerPoint/Excel) is required ONLY for
  Office → PDF conversion. All pure-PDF and image features work
  without Office and show a clear error when Office is unavailable.
- Languages: English, French, German, Spanish, Italian, Portuguese,
  Arabic (legacy tools fully translated; new-tool titles/descriptions
  translated; operation labels are English).

## Tools (28)

Core: Multi PDF · PDF Security · Universal Converter.
New tools: PDF Organizer · PDF Compressor · PDF to Images ·
Images to PDF · PDF to Text · PDF to Word · PDF to Excel ·
PDF Image Extractor · PDF Table Extractor · PDF Information ·
PDF Editor · PDF Crop · PDF Snapshot · PDF Flattener · OCR PDF ·
Scan to PDF · Remove Blank Pages · Certificate Generator ·
Batch PDF Renamer · PDF Signer · PDF Form Builder ·
PDF Metadata Cleaner · PDF Redaction · PDF Repair · PDF Measurement.

Input/output formats: PDF, DOCX/DOC, PPTX (via Office), XLSX/CSV,
PNG/JPG/WebP/TIFF/BMP, TXT/Markdown. OCR languages: English, French,
Arabic (bundled Tesseract engine ships with the installer).

Honesty notes: PDF Signer places *visual* signatures (drawn, typed, or
image) — not cryptographic digital signatures. PDF Redaction truly
removes content under marked areas. PDF Security enforces owner-password
restrictions readable by compliant viewers.

## Privacy

Local-first: documents are processed on your PC. No telemetry, no
analytics, no cloud uploads. Two exceptions needing network: Excel
recipient/data import loads the SheetJS library from CDN, and UI fonts
load from Google Fonts (falls back to system fonts offline).

## Known limitations

- PDF → PPTX is unsupported inside the packaged app (PyInstaller /
  python-pptx hook incompatibility); it reports a clear error.
- Excel import needs internet (SheetJS CDN); without it, importing
  recipient/data lists fails with an error instead of silently.
- requirements.txt pins trail the local runtime; the frozen backend
  EXEs are built from the synced build environment, not from those pins.
- The app must not be running from `dist\win-unpacked` while rebuilding
  the installer (file lock); close it first.

## Troubleshooting

- `Invalid format. Please provide PDF files.` → the file is not a PDF
  (checked by header, not extension).
- `Required OCR engine is unavailable.` → install Tesseract/ocrmypdf,
  or use the vendored bundle shipped with the installer.
- Office conversions fail → install Word/PowerPoint/Excel; pure-PDF
  features do not need Office.
- Cancel a long job with Stop; partial outputs are never presented as
  finished (0/N is reported honestly).

## Developers

Prerequisites: Node.js 18+ and npm; Python 3.10+ on PATH as `python`
(Windows).

```bash
npm install
pip install -r requirements.txt
npm run dev        # React dev server + Electron (entry: main/main.js)
```

Build & package:

```bash
npm run build          # production React bundle -> build/
npm run build:backend  # PyInstaller: backend.spec + newtools.spec -> backend-dist/
npm run dist           # build + backends + electron-builder installer -> dist/
```

Entry points: dev and packaged both use `main/main.js`
(preload: `main/preload.js`). Low-memory machines: retry the production
build with `GENERATE_SOURCEMAP=false` (ForkTsChecker OOM otherwise).

Architecture:

- `src/` — React renderer (dashboard, 3 core panels, 25 isolated tool
  panels under `src/components/newtools/`)
- `main/` — Electron main process (IPC handlers) + minimal preload
  bridge (contextIsolation on, nodeIntegration off)
- `backend.py` — core Python engine (multi-PDF, security, universal
  convert), frozen to `backend-dist/InfinityPDF-backend.exe`
- `new_tools/` — one Python module per new tool plus shared protocol
  helper (`_common.py`) and frozen runner (`newtools-backend.exe`)
- IPC ↔ Python protocol: `PROGRESS:<n>` lines on stdout, one final
  `RESULT:<json>` line; cancellation via `NEWTOOL_CANCEL_FILE` /
  `INFINITYPDF_CANCEL_FILE` flag files plus child-process termination;
  claimed outputs are re-verified (exist, non-empty, readable PDF)
  before success is reported.

Environment variables:

| Variable | Used by | Purpose |
|---|---|---|
| `INFINITYPDF_RENDERER_URL` | Electron main | Override renderer URL |
| `INFINITYPDF_CANCEL_FILE` | multi-PDF backend | Cancel flag file |
| `NEWTOOL_CANCEL_FILE` | new-tools backends | Cancel flag file |

`.env` / `.env.local` are local-only and not committed.

## Tests

No test framework is wired into the repo (`npm test` has no suite).
Verification is done with local, gitignored helper scripts kept outside
the repo (`%LOCALAPPDATA%/Temp/opencode/`): py_compile, a 60+ check
backend matrix over all 25 new tools plus core CLI workflows (real
PDFs, invalid/Unicode/space filenames, cancellation), frozen-EXE
matrices, OCR output checks (eng/fra/ara), and production builds.
Keep any new scratch test scripts out of git (see `.gitignore`).

## User docs

See `USER_GUIDE.md` for end-user workflows in English.

## License

No LICENSE file is present in this repository. All rights reserved by
default; commercial distribution requires explicit owner clearance and
a legal review of third-party terms (see THIRD-PARTY-NOTICES.md —
notably PyMuPDF/AGPL).
