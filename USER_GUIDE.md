# InfinityPDF — User Guide

## What is InfinityPDF?

A Windows desktop app for working with PDFs: generate personalized PDFs,
lock down permissions, convert between formats, and use 25 extra tools for
organizing, compressing, editing, extracting, scanning/OCR, signing, forms,
privacy cleanup, and measurement.

## The three core tools

### 1. Multi-PDF Generator (schools & organizations)

1. Import an Excel list of recipients (first column = names).
2. Tick the recipients to include.
3. Choose the source PPTX or PDF.
4. Tune the watermark (text, rotation, size, opacity, position) and the
   PDF permissions (printing, copying, editing…).
5. Pick an output folder, then **Generate**.

While generation runs, the button becomes **Stop** — pressing it really
cancels the backend (no extra files are started, temp files are cleaned).
Afterwards the button returns to **Generate**; when finished it offers
**Open Folder**.

### 2. PDF Security

Drop in PDFs, choose what recipients may do (print / copy / edit /
restructure / fill forms / comment), then **Secure**. Each file is saved as
a new `SECURED_…pdf`; originals are never overwritten. Long batches can be
stopped with **Stop**. Use **Export** to copy results to a folder you pick.

### 3. Universal Converter

Drop in files, pick the target format (PDF, DOCX, PPTX, JPG, PNG…), then
**Convert**. Files already in the target format are skipped. Conversions
can be stopped with **Stop**; if nothing could be converted the app says so
instead of pretending success. DOCX → PDF keeps Arabic text, RTL direction
and tables (requires Microsoft Word).

## More Tools (25)

Open them from the dashboard grid (grouped by category) or the
**More Tools** menu in the top bar. Every tool follows the same pattern:

1. Load input file(s) with **Browse**.
2. Pick the operation and set its options.
3. For visual tools, check the preview and drag regions on it.
4. Press **Run** (long operations show progress and a **Stop** button).
5. **Open** individual outputs or **Export** them all to a folder you pick.

Categories: Generate (certificates, batch rename) · Convert (PDF ↔ images /
text / Word / Excel) · Edit (editor, organizer, crop, snapshot, flatten) ·
Optimize (compress, repair, blank pages) · Extract (info, images, tables) ·
Scan (OCR, scan-to-PDF) · Sign & Forms · Privacy (metadata, redaction) ·
Technical (measurement).

Notes:

- The **PDF Editor** annotates pages (text, shapes, drawing, highlights,
  images) and manages pages; saving always writes a new file.
- **Redaction** truly removes content (not black boxes); review before apply.
- **Signatures** are visual only, not cryptographic digital signatures.
- **OCR** needs Tesseract OCR installed; without it the tool tells you
  exactly what is missing.
- **Scan to PDF** works from image files (phone/camera scans); direct
  scanner drivers are not bundled.
- Metadata cleaning covers handled structures; it cannot guarantee every
  hidden byte is gone.

## Language

Switch languages (EN/FR/DE/ES/IT/PT/AR) in the top bar. Arabic content and
right-to-left documents are supported throughout conversion and extraction.

## Troubleshooting

- **Office conversions fail** → install Microsoft Word/PowerPoint/Excel;
  pure-PDF features do not need Office.
- **OCR unavailable** → install Tesseract OCR (+ ocrmypdf for searchable PDFs).
- **A file will not open** → it may be corrupted; try the **PDF Repair** tool.
- **Nothing was produced** → the app reports `0/N` instead of fake success;
  check the per-file error lines.
- **App feels stuck during a long job** → use **Stop**; progress and cancel
  are wired to the real backend process.
- **Build runs out of memory** (developers) → retry with
  `GENERATE_SOURCEMAP=false`.

## Privacy

Everything runs locally on your machine. Recipient lists stay in local app
storage; outputs are written only to folders you choose. Treat generated
personalized PDFs as personal data.
