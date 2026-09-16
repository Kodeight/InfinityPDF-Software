# InfinityPDF — Desktop Document Suite

Electron + React desktop application for PDF productivity: batch watermarking,
PDF security, universal conversion, plus 25 additional PDF tools (organize,
compress, edit, extract, OCR/scan, sign & forms, privacy, measure).

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+ on PATH as `python` (Windows)
- Microsoft Office (Word/PowerPoint/Excel) for Office → PDF conversion
  (pure-PDF/image features work without Office)
- Optional: Tesseract OCR + ocrmypdf to enable the OCR tool
  (the app detects their absence and explains it instead of crashing)

## Run locally

```bash
npm install
pip install -r requirements.txt
npm run dev        # React dev server + Electron (entry: main/main.js)
```

## Build & package

```bash
npm run build          # production React bundle -> build/
npm run build:backend  # PyInstaller: backend.spec + newtools.spec -> backend-dist/
npm run dist           # build + backends + electron-builder installer -> dist/
```

Entry points: dev and packaged both use `main/main.js`
(preload: `main/preload.js`). Low-memory machines: if the production build
runs out of memory in the type-checker, retry with
`GENERATE_SOURCEMAP=false`.

## Architecture

- `src/` — React renderer (dashboard, 3 core panels, 25 isolated tool panels
  under `src/components/newtools/`)
- `main/` — Electron main process (IPC handlers) + preload bridge
- `backend.py` — core Python engine (multi-PDF, security, universal convert),
  frozen to `backend-dist/InfinityPDF-backend.exe` for the installer
- `new_tools/` — one Python module per new tool plus a shared protocol
  helper (`_common.py`) and a frozen runner (`newtools-backend.exe`)
- IPC ↔ Python protocol: `PROGRESS:<n>` lines on stdout, one final
  `RESULT:<json>` line; cancellation via `NEWTOOL_CANCEL_FILE` /
  `INFINITYPDF_CANCEL_FILE` flag files plus child-process termination

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `INFINITYPDF_RENDERER_URL` | Electron main | Override renderer URL |
| `INFINITYPDF_CANCEL_FILE` | multi-PDF backend | Cancel flag file |
| `NEWTOOL_CANCEL_FILE` | new-tools backends | Cancel flag file |
| `API_KEY` | AI service (optional) | Gemini key for recipient tokens (browser fallback only) |

`.env` / `.env.local` are local-only and not committed.

## Tests

No test framework is wired into the repo (`npm test` has no suite).
Verification is done with local, gitignored helper scripts plus the
packaged-EXE matrices documented during development. Keep any new scratch
test scripts out of git (see `.gitignore`).

## User docs

See `USER_GUIDE.md` for end-user workflows in English.
UI languages: English, French, German, Spanish, Italian, Portuguese, Arabic.
