# Changelog

## 1.6.0 (release candidate)

- New dedicated PDF Compressor workspace: file list, compression
  settings (level/DPI/quality/metadata with Auto = level defaults),
  working Analyze (real size/pages/images/fonts per file), primary
  Compress with Stop, per-file results (original → compressed,
  reduction %), Export-all and per-file Open. No output-folder step.
- All 25 new-tool titles/descriptions/categories translated (7
  languages); `more_tools` chrome key added.
- Light Mode added (theme-aware palette, warm light glass, sun/moon
  switcher in navbar, persisted in localStorage, dark default).
- Global custom select styling; language selector chevron spacing fixed
  via the shared padding system.
- PDF Editor: render loading spinner; image upload auto-arms the image
  tool with an armed-file chip and labeled placements; Replace PDF
  header button; output folder moved next to Save.
- More Tools dropdown: uniform category spacing (CSS columns);
  scrollbar clipping fixed globally (rounded clip wrapper + nested
  scroller in overlays; rounded track/corner safety net).
- Removed dead cloud AI service (`src/services/ai.ts`, which sent
  recipient names to an external API) and unused npm deps
  (@google/genai, electron-store, pdf-lib, xlsx) plus the unused
  pdf-lib CDN script. Excel import still uses the SheetJS CDN.
- Verified: 60+ check backend matrix over all tools (real PDFs,
  invalid/Unicode/space filenames, cancellation), frozen-EXE matrices,
  OCR output in English/French/Arabic, production + installer builds.

## 1.5.0

- Stabilization baseline: server job IDs, IPC hardening, output
  validation, true text editing, OCR vendoring, button alignment.
