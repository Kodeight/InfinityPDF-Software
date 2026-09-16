# InfinityPDF — Master Engineering Specification

Read this file completely before doing anything in this repository.
It inherits all rules below to every future session automatically.

## 1. What this is

Windows desktop document suite: Electron + React renderer, Electron main
process, Python document backends. Three core tools (Multi-PDF Generator,
PDF Security, Universal Converter) plus 25 isolated tools under
`src/components/newtools/` backed by `new_tools/*.py`.

Production branch is **`main`** (verified head: audit rollout + stabilization).
`origin/master` is legacy, strictly behind — do NOT delete it, do NOT
develop on it. GitHub default-branch flip to `main` is an owner web-UI step.

## 2. Non-negotiable rules

1. **No fake implementations.** No fake progress, fake cancellation, stub
   PDFs, or placeholder backends. Every tool has a real backend and a tested
   end-to-end workflow. If something cannot be done, report it honestly in
   the UI and in your summary — never simulate it.
2. **Verify, don't assume.** Trace features end-to-end. A button existing
   proves nothing. Reproduce bugs before fixing; test after fixing.
3. **Smallest robust change.** No rewrites, no mass refactors, no dependency
   upgrades without necessity. Preserve working functionality; when in doubt,
   the existing behavior wins.
4. **Never commit or push unless explicitly asked.** Same for test files:
   test/scratch scripts stay OUT of git (see `.gitignore`: `test*.py`,
   `run_all_checks.py`, `*regression*`, `TODO.md`, `*fix.md`, `*task.md`,
   `TestOutput/`, local outputs, heavy binaries).
5. **No test files in the repo, ever.** Verification harnesses live outside
   the repo (`%LOCALAPPDATA%/Temp/opencode/`) or as already-ignored local
   helpers. The master local command is
   `run_full_stabilization_checks.py` (see §9).
6. **Offline-first environment.** No network (pip/npm registries time out).
   Never add a dependency you cannot vendor; never `pip/npm install`
   anything without checking it is actually necessary and reachable.
7. **Use specialized file tools, never shell, for file ops.** PowerShell here
   is 5.1: no `&&`, quote paths with spaces, `; if ($?) { }` for chaining.

## 3. Architecture map

| Layer | Location | Notes |
|---|---|---|
| Renderer | `src/` (CRA build → `build/`) | Entry `main/main.js`, NOT `public/electron.js` (deleted stale) |
| Electron main | `main/main.js`, preload `main/preload.js` | All IPC lives here |
| Core Python | `backend.py` → frozen `backend-dist/InfinityPDF-backend.exe` | CLI: `apply-security`, `multi-pdf`, `universal-convert` |
| New tools Python | `new_tools/<tool>.py` + `_common.py` + `runner.py` | Frozen `backend-dist/newtools-backend.exe` |
| OCR engine (optional) | `thirdparty/tesseract/` (gitignored binaries + README) | Shipped via `extraResources` when vendored |

## 4. IPC ↔ Python protocol (both directions, no exceptions)

- Stdout carries ONLY `PROGRESS:<0-100>` lines and ONE final `RESULT:<json>`.
  All diagnostics go to stderr (`_common.log`). Python stdout is forced
  UTF-8 in `_common.py` (Windows consoles are cp1252 and corrupt Arabic).
- `RESULT` shape: `{success, outputs[], info{}}` or
  `{success:false, error}` or `{success:false, cancelled:true}`.
- **Exit code ≠ success** (item 6). Enforced at three layers:
  1. Python `_common.verify_result_outputs` (dev `run_tool` + packaged
     `runner.py`): outputs exist, non-empty, PDFs open with ≥1 page.
  2. Electron `run-new-tool` re-verifies every claimed output file;
     multi-PDF flips phantom successes to error entries; universal
     re-checks `result.path`.

## 5. Jobs, cancellation, temp files

- Renderer ids are **opaque routing tokens**. The server mints authoritative
  `srv_<time>_<seq>_<rand>` ids (`activeNewToolJobs` keyed by server id,
  `newToolTokenIndex` maps token → newest live job). Never key tracking
  state by a renderer value. Progress events carry both ids; cancel resolves
  via the token index.
- Multi-PDF/Security/Universal are **single-flight by design** (one active
  process each); new-tools are multi-job via the map above.
- Cancellation = kill child process tree (`taskkill /T /F` on Windows) AND
  touch the flag file (`INFINITYPDF_CANCEL_FILE` / `NEWTOOL_CANCEL_FILE`).
  Python polls the flag between units and cleans temp files; `finally`
  blocks in main remove flag files and drop map entries.
- `window-all-closed` kills every tracked child. Every long op has Stop in
  the UI (Generate→Stop→Stopping→Generate); never leave `completed:true`
  after total failure — report `0/N` honestly.
- Backend temp files: unique names under `os.tmpdir()`, removed on success,
  error, AND cancellation paths. Never overwrite inputs (`unique_path`);
  legacy `backend.py` clobber paths were fixed — keep it that way.

## 6. Filesystem IPC policy (defense in depth, item 5)

- `get-file-data`: images only, ≤15 MB, and ONLY under `os.tmpdir()` or
  session-registered output dirs (`knownOutputDirs`, populated by
  `run-new-tool`). This blocks renderer-driven reads of arbitrary user files.
- `export-files`: validated shapes, regular files only, ≤500 entries,
  returns `{copied, skipped}`; zero copies = failure.
- `open-path`: strings only, must exist (`existsSync` also rejects URLs).
- `outputDir` arbitrary `ensureDir` is an accepted residual (backends write
  only their own outputs there). Document any widening here.
- Never build shell strings from user paths; `spawn` arg arrays only.

## 7. Python backend rules

- Allowed libs: fitz, pypdf, PIL, reportlab, python-docx, pdf2docx, openpyxl,
  numpy, pandas, pywin32 (Windows-only paths). No new deps.
- `win32com` usage: absolute paths, `ReadOnly`, `DisplayAlerts` off,
  `try/finally` close+quit, input-exists checks, output-exists polling.
  Never `print()` to stdout (breaks the single-JSON-line contract).
- Use **symbolic** `fitz.PDF_WIDGET_TYPE_*` constants — numeric values differ
  per PyMuPDF build (verified incident).
- `insert_textbox` needs ~2× fontsize of vertical room; span bboxes are
  tight — anchor insert rects at the original top, redact exact rects.
- Text replacement scope: single-line, redact + font-reuse insert
  (Base-14 alias → extracted embedded subset → Helvetica fallback + warning),
  per-item verification (old gone + new present). Overflow → clear error,
  never silent misfit. No shaping engine: warn on complex script.
- PyInstaller: `backend.spec` + `newtools.spec` are the ONLY build specs
  (dead specs were quarantined). Frozen numpy 2.x needs
  `collect_submodules('numpy._core')` (verified root cause). `pptx` is
  excluded — `hook-pptx` crashes analysis on python-pptx 0.6.21; PDF→PPTX in
  the packaged EXE is therefore unsupported until that is resolved.
- Rebuild with `npm run build:backend`, then re-run the EXE matrices
  (backend matrix + runner matrix, §9) before calling any EXE current.

## 8. Frontend rules

- Reuse `ProgressBar`, `previewSrc()` (`preview.ts`, data-URL via
  `get-file-data` — never raw `file://`, blocked in dev and risky packaged).
- Progress subscriptions MUST unsubscribe (preload returns an unsubscribe
  fn); never `setState` during render.
- Never capture loop-mutated `let` in `setState` updaters — copy to a per-
  iteration `const` first (verified batching bug class).
- Debounce preview renders; discard stale responses by sequence.
- i18n: legacy tools use `translations.ts` (keep keys in all 7 languages,
  no dead keys); new-tools panels are English-by-design strings in `toolDefs`.
- No global CSS that leaks into existing components; no per-button padding
  hacks (fix the layout rule, not the instance).

## 9. Verification (local-only; never commit harnesses)

Master command (outside repo):
`%LOCALAPPDATA%/Temp/opencode/run_full_stabilization_checks.py`
covers py_compile, backend suite (65), Arabic regression (8), text-editing
(9), OCR stub wiring (7), both EXE matrices, protocol sims, TS transpile,
and optionally `npm run build`.

- `npm run build` needs `GENERATE_SOURCEMAP=false` on low-RAM machines
  (ForkTsChecker OOM otherwise). Build is green with only pre-existing
  warnings; keep it that way — zero warnings from touched files.
- Genuine OCR accuracy (ara/fra/eng) requires the real vendored bundle and
  is a release-gate step, not a unit test (stub wiring is tested).
- `requirements.txt` pins intentionally trail the local runtime; sync pins
  with the EXE build environment before `electron-builder`, never blindly.

## 10. Git hygiene

- Commit/push only on explicit request. `git status` must show no test,
  TODO/fix/task, output, or binary files — `.gitignore` enforces this;
  extend it when adding new scratch categories.
- Untracked-but-present: `.env`, `build/`, `backend-dist/`, `dist/`,
  `TestOutput/`, `thirdparty/tesseract/{bin,tessdata}`. Never force-add them.
- `main` = production. `master` = legacy (behind, do not delete, do not use).
