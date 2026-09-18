# Third-Party Notices — InfinityPDF v1.6.0

Best-effort inventory for legal review BEFORE commercial sale. License
names below are the upstream projects' stated terms; verify each against
the exact version bundled before distributing.

## Must-review items

- **PyMuPDF (fitz) 1.25.x — GNU AGPL-3.0-or-later (or commercial).**
  Used by nearly every Python tool (rendering, editing, OCR pipeline,
  compression). AGPL distribution in a closed commercial product
  requires a commercial license from Artifex OR a replacement engine.
  DO NOT SELL until this is resolved.
- **Tesseract OCR (bundled under thirdparty/tesseract/) — Apache-2.0.**
  Traineddata files (eng/ara/fra) — Apache-2.0. Redistribution
  permitted with notice preservation.

## Python (requirements.txt)

- pypdf 3.17.1 — BSD-3-Clause
- Pillow 10.4.0 — HPND
- reportlab 4.0.4 — BSD
- python-docx 1.1.2 — MIT
- python-pptx 0.6.21 — MIT
- openpyxl 3.1.2 — MIT
- pdf2docx 0.5.6 — MIT
- docx2pdf 0.1.8 — MIT
- pandas 2.0.3 — BSD-3-Clause
- numpy (unpinned) — BSD-3-Clause
- pywin32 311 — PSF License (Windows-only Office/COM paths)

## JavaScript / Electron

- Electron 25 — MIT
- React / ReactDOM 18 — MIT
- react-scripts 5.0.1 (build-time) — MIT
- electron-builder 26 (build-time) — MIT
- fs-extra — MIT
- Tailwind CSS 3 — MIT
- SheetJS xlsx (CDN, runtime for Excel import) — Apache-2.0
- Google Fonts: Josefin Sans, Jost — SIL Open Font License 1.1

## Assets

- Application icons under public/favicon* — verify ownership/redistribution
  rights before sale (owner-supplied artwork assumed).

Removed (unused, no longer shipped): @google/genai, electron-store,
pdf-lib (npm), pdf-lib CDN script.
