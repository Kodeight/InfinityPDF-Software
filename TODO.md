# INFINITY PDF — MASSIVE TOOL EXPANSION
## STRICT ADDITIVE ARCHITECTURE — DO NOT MODIFY EXISTING TOOLS

You are working on an existing **desktop application** called **Infinity PDF**.

Infinity PDF is a desktop document/PDF productivity suite.

The application already contains several working tools that are considered COMPLETE and STABLE.

Your task is to add a large collection of NEW tools to the application.

# 🚨 ABSOLUTE / NON-NEGOTIABLE RULE

## DO NOT MODIFY THE EXISTING TOOLS.

This is the most important requirement in this entire task.

The existing tools are already working correctly and must remain completely untouched.

DO NOT:
- rewrite existing backend files
- refactor existing backend files
- rename existing backend files
- move existing backend files
- modify existing backend logic
- modify existing frontend logic
- modify existing frontend components
- modify existing state management
- modify existing conversion logic
- modify existing PDF generation logic
- modify existing watermark logic
- modify existing security logic
- modify existing IPC handlers
- modify existing API routes
- modify existing Python modules
- modify existing shared utilities if they are currently used by existing tools
- modify existing CSS that could affect existing tools
- replace existing libraries
- upgrade dependencies unnecessarily
- "clean up" existing code
- optimize existing code
- merge new functionality into existing files
- alter existing workflows

The existing tools must be treated as **frozen production code**.

If an existing file appears to be the "best place" to implement something new, DO NOT modify it.

Create a NEW file instead.

If existing functionality needs to be reused, import/call it only if doing so is completely safe and does not require modifying the existing implementation.

If reuse would require modifying an existing file, create an independent implementation for the new tool instead.

---

# EXISTING TOOLS

The following existing functionality is considered stable and must NOT be changed:

## 1. Multi-PDF Generator

This tool is designed primarily for schools and organizations.

Current functionality includes:

- Importing an Excel/student list.
- Detecting/listing students.
- Selecting students.
- Generating individual PDFs.
- Applying student-specific watermarks.
- Generating a separate PDF for each student.
- Naming generated PDFs using the student's name.
- Applying watermarks to every page.
- Custom watermark functionality.
- PDF generation.
- Security options before generation.

DO NOT TOUCH THIS TOOL.

---

## 2. Universal Converter

The existing Universal Converter supports document conversion between formats.

It is considered existing functionality.

DO NOT MODIFY ITS IMPLEMENTATION.

---

## 3. Watermark Functionality

Watermark functionality already exists.

DO NOT CREATE A REPLACEMENT.

DO NOT MODIFY THE EXISTING WATERMARK IMPLEMENTATION.

---

## 4. PDF Security

PDF security already exists and is working.

It allows users to configure PDF protection such as:

- Password protection
- Printing permissions
- Copying permissions
- Editing permissions
- Other supported PDF security options

DO NOT MODIFY THIS IMPLEMENTATION.

DO NOT REFACTOR IT.

DO NOT MOVE IT.

DO NOT MERGE NEW SECURITY FEATURES INTO IT.

If a new tool requires PDF security, treat the existing security system as external functionality and only integrate with it if that can be done without modifying it.

Otherwise, the new tool must remain independent.

---

# ARCHITECTURAL REQUIREMENT

This is a **desktop application**, NOT a web application.

The application already uses Python for backend/document processing.

Continue using Python for the backend of the new tools.

Each NEW TOOL must have its own dedicated Python backend file.

Do not create one enormous Python backend containing all new functionality.

Instead use an architecture similar to:

backend/
    existing/
        ... DO NOT TOUCH ...

    new_tools/
        pdf_editor.py
        pdf_organizer.py
        pdf_compressor.py
        pdf_repair.py
        pdf_ocr.py
        pdf_to_images.py
        images_to_pdf.py
        pdf_to_text.py
        pdf_to_excel.py
        pdf_to_word.py
        scan_to_pdf.py
        certificate_generator.py
        batch_pdf_renamer.py
        batch_pdf_watermark.py
        pdf_signer.py
        pdf_forms.py
        pdf_metadata_cleaner.py
        pdf_redaction.py
        pdf_measurement.py
        pdf_snapshot.py
        pdf_crop.py
        pdf_blank_page_remover.py
        pdf_flatten.py
        pdf_info.py
        pdf_image_extractor.py
        pdf_table_extractor.py

Use the actual project structure where appropriate, but preserve the principle:

> ONE NEW TOOL = ONE DEDICATED PYTHON BACKEND MODULE.

If a tool requires multiple Python files internally, that is acceptable, but it must have a clearly isolated entry module.

---

# FRONTEND ARCHITECTURE

The new tools must also be isolated on the frontend.

Do not modify existing tool pages/components unless absolutely required to register a new navigation item.

Prefer creating new files:

frontend/
    ... existing files remain untouched ...

    tools/
        PdfEditor/
        PdfOrganizer/
        PdfCompressor/
        PdfRepair/
        PdfOcr/
        PdfToImages/
        ImagesToPdf/
        PdfToText/
        PdfToExcel/
        PdfToWord/
        ScanToPdf/
        CertificateGenerator/
        BatchPdfRenamer/
        PdfSigner/
        PdfForms/
        PdfMetadataCleaner/
        PdfRedaction/
        PdfMeasurement/
        PdfSnapshot/
        PdfCrop/
        BlankPageRemover/
        PdfFlatten/
        PdfInfo/
        PdfImageExtractor/
        PdfTableExtractor/

Adapt this structure to the existing framework.

The principle remains:

> NEW TOOL = NEW FRONTEND MODULE + NEW BACKEND MODULE.

---

# TOOL REGISTRATION

Adding a new tool will naturally require the application to know that the tool exists.

Only make the **minimum possible change** required to register the new tools in the application navigation/router/tool registry.

Do not modify the implementation of existing tools.

If the existing navigation is contained in a single file and adding a new menu item requires editing that file, make the smallest possible additive change.

Do not refactor the navigation.

Do not redesign it.

Do not modify existing navigation entries.

Only append the new tools.

---

# NEW TOOLS TO IMPLEMENT

Implement the following tools.

---

# 01 — PDF EDITOR

Create a dedicated PDF editing workspace.

The user should be able to:

- Open PDF.
- View PDF pages.
- Navigate pages.
- Zoom in/out.
- Fit page.
- Fit width.
- Select objects.
- Add text.
- Edit supported existing text.
- Move text.
- Resize text.
- Change font.
- Change font size.
- Change font color.
- Change alignment.
- Add images.
- Move images.
- Resize images.
- Delete objects.
- Add rectangles.
- Add circles.
- Add lines.
- Add arrows.
- Draw/freehand.
- Highlight.
- Underline.
- Strikethrough.
- Add notes.
- Add text boxes.
- Undo.
- Redo.

Page operations:

- Delete page.
- Rotate page.
- Reorder pages.
- Duplicate page.
- Insert page.
- Extract pages.

Saving:

- Save.
- Save As.
- User chooses destination through the desktop file dialog.
- Never overwrite the original automatically.
- Preserve original PDF.

The editor must produce a valid PDF.

Do not rasterize the entire PDF unless absolutely necessary.

Preserve vector/text/image content wherever possible.

---

# 02 — PDF ORGANIZER

Create a dedicated PDF page-management tool.

Features:

- Add multiple PDFs.
- Display files.
- Display page thumbnails.
- Merge PDFs.
- Reorder PDFs.
- Reorder pages.
- Delete pages.
- Extract pages.
- Rotate pages.
- Duplicate pages.
- Replace pages.
- Insert pages.
- Split PDF.
- Split by page range.
- Split every N pages.

Allow drag-and-drop where supported by the desktop framework.

Output must be saved using a user-selected location.

Never overwrite source files by default.

---

# 03 — PDF COMPRESSOR

Create a dedicated PDF compression tool.

Allow users to:

- Select PDF.
- See original file size.
- Choose compression level.

Options:

- Low
- Balanced
- High
- Maximum

Where technically possible provide advanced controls:

- Image resolution
- Image quality
- JPEG compression
- Downsampling
- Remove unnecessary metadata
- Remove unused objects
- Optimize fonts
- Optimize streams

Show:

Original size
↓
Output size
↓
Percentage reduction

Do not destroy readability unnecessarily.

---

# 04 — PDF REPAIR

Create a dedicated PDF repair utility.

Attempt to recover PDFs with structural problems such as:

- Broken cross-reference tables.
- Corrupted object references.
- Invalid metadata.
- Malformed structures.
- Incomplete PDF generation.

Workflow:

Open PDF
→ Analyze
→ Repair
→ Preview result
→ Save repaired PDF

Never modify the original source file.

If repair is impossible, provide a meaningful error.

---

# 05 — OCR PDF

Create a dedicated OCR tool.

Features:

- Open scanned/image PDF.
- OCR selected pages or entire PDF.
- Produce searchable PDF.
- Preserve original appearance where possible.
- Extract recognized text.

Language selection must support at minimum:

- Arabic
- English
- French

Design the architecture so additional languages can be added later.

Arabic requirements:

- Correct RTL handling.
- Correct Arabic character shaping.
- Unicode support.
- Mixed Arabic/English text.
- Arabic numerals.
- Unicode filenames.

Allow:

- Searchable PDF output.
- TXT export where practical.

---

# 06 — PDF → IMAGES

Create a PDF-to-image converter.

Output formats:

- PNG
- JPG/JPEG
- WebP
- TIFF if supported

Options:

- All pages.
- Selected pages.
- DPI.
- Quality.
- Image format.

For multiple pages provide:

- Individual image files.
- Optional ZIP output.

Example:

document.pdf

→

document_001.png
document_002.png
document_003.png

---

# 07 — IMAGES → PDF

Create an image-to-PDF tool.

Support:

- JPG
- JPEG
- PNG
- WebP
- TIFF where supported

Allow multiple images.

Features:

- Drag/reorder.
- Page size.
- A4.
- Letter.
- Custom.
- Portrait.
- Landscape.
- Margins.
- Fit image.
- Fill page.
- One image per page.

Save as PDF.

---

# 08 — PDF → TEXT

Extract text from PDFs.

Features:

- Entire PDF.
- Selected pages.
- Preserve line breaks where possible.
- Unicode.
- Arabic support.
- French.
- English.

Export:

- TXT
- DOCX where practical
- Markdown where practical

Do not rely solely on OCR for PDFs that already contain a valid text layer.

Automatically detect whether OCR may be required.

---

# 09 — PDF → EXCEL

Create a PDF table extraction tool.

Detect tables where possible.

Allow users to:

- Select pages.
- Detect tables.
- Preview extracted table.
- Export to XLSX.

Preserve:

- Rows.
- Columns.
- Cell contents.

Support multiple tables.

Do not silently produce broken spreadsheets.

Show a preview before export whenever practical.

---

# 10 — PDF → WORD

Create a dedicated PDF-to-DOCX tool.

Attempt to preserve:

- Text.
- Paragraphs.
- Headings.
- Tables.
- Images.
- Basic formatting.

Support Arabic and RTL text.

If the PDF is scanned, offer OCR-assisted extraction.

---

# 11 — SCAN → PDF

If scanner access is supported by the desktop environment, create a scanner workflow.

Features:

- Detect available scanners.
- Scan pages.
- Preview pages.
- Reorder.
- Delete pages.
- Rotate.
- Crop.
- Deskew.
- Remove blank pages.
- Create PDF.

Optional:

- OCR after scanning.

If scanner APIs are unavailable on a platform, implement the tool architecture so scanner integration can be added later without redesigning the rest of the application.

---

# 12 — CERTIFICATE GENERATOR

Create a certificate/document personalization tool.

Users can:

- Import Excel/CSV data.
- Load a PDF/document template.
- Define placeholders.

Example:

{{name}}
{{grade}}
{{course}}
{{date}}
{{certificate_id}}

Example input:

Name | Grade | Course
Ahmed | A | Mathematics
Sara | A+ | Mathematics

Generate:

Ahmed - Certificate.pdf
Sara - Certificate.pdf

Replace placeholders automatically.

Support:

- Batch generation.
- Custom output directory.
- Preview.
- Individual generation.
- Bulk generation.
- PDF output.

Do not modify the existing Multi-PDF Generator.

This must be a separate implementation.

---

# 13 — BATCH PDF RENAMER

Create a batch file-renaming utility specifically for PDFs.

Allow:

- Import multiple PDFs.
- Import Excel/CSV mapping.
- Map existing filename to new filename.
- Preview changes.
- Apply changes.

Example:

001.pdf → Ahmed.pdf
002.pdf → Sara.pdf
003.pdf → Yacine.pdf

Never rename until the user confirms.

Protect against duplicate names.

---

# 14 — PDF SIGNER

Create a signature tool.

Allow:

- Draw signature.
- Type signature.
- Import signature image.
- Place signature on page.
- Resize.
- Move.
- Rotate.
- Delete.

Support multiple signatures.

Save as a new PDF.

Do not claim that a visual signature is a cryptographic digital signature unless the implementation actually performs certificate-based signing.

---

# 15 — PDF FORM BUILDER

Create a PDF form creation/editing tool.

Support:

- Text fields.
- Checkboxes.
- Radio buttons.
- Dropdowns.
- Date fields.
- Signature fields.

Allow:

- Add field.
- Move field.
- Resize field.
- Rename field.
- Delete field.
- Configure basic properties.

Save valid PDF forms.

---

# 16 — PDF METADATA CLEANER

Create a privacy/metadata cleanup tool.

Display metadata such as:

- Author.
- Creator.
- Producer.
- Title.
- Subject.
- Keywords.
- Creation date.
- Modification date.

Allow users to remove or edit metadata.

Where technically safe, allow removal of:

- Comments.
- Attachments.
- Hidden metadata.

Provide a clear warning that metadata removal does not guarantee removal of all hidden content unless the implementation explicitly handles it.

Save as a new PDF.

---

# 17 — PDF REDACTION

Create a proper redaction tool.

This is NOT simply a drawing tool.

Provide:

- Select text/area.
- Mark for redaction.
- Preview.
- Apply redaction.
- Save new PDF.

When redaction is applied, the underlying content must actually be removed where the PDF architecture allows it.

Do NOT implement secure redaction as merely drawing a black rectangle over existing text.

If a particular PDF structure cannot be safely redacted, communicate that limitation.

---

# 18 — PDF MEASUREMENT

Create a measurement tool.

Allow users to:

- Calibrate scale.
- Measure distance.
- Measure area.
- Measure perimeter.
- Measure angles where technically possible.

Example:

1 cm = 1 meter

Then the user can measure a technical drawing.

Display measurement values clearly.

This tool is particularly useful for:

- Architecture.
- Engineering.
- Construction.
- Technical drawings.

---

# 19 — PDF SNAPSHOT

Create a snapshot/capture tool.

Allow users to:

- Select rectangular region.
- Copy selection.
- Save selection as image.
- Export selection to PNG/JPG.
- Create PDF from selected region.

Do not alter the original PDF.

---

# 20 — PDF CROP

Create a visual crop tool.

Features:

- Crop page.
- Crop selected pages.
- Apply same crop to all pages.
- Preview.
- Reset crop.
- Save as new PDF.

Support:

- Manual crop.
- Preset sizes.
- A4.
- Letter.
- Custom dimensions.

---

# 21 — REMOVE BLANK PAGES

Create a utility that detects blank or nearly blank pages.

Workflow:

Open PDF
→ Analyze pages
→ Display detected blank pages
→ User confirms
→ Remove
→ Save new PDF

Do NOT automatically delete pages without confirmation.

Use a configurable blank-page threshold if technically appropriate.

---

# 22 — PDF FLATTENER

Create a PDF flattening tool.

Allow users to flatten supported:

- Annotations.
- Form fields.
- Markups.
- Other supported interactive elements.

Explain what will be flattened before processing.

Save a new PDF.

Do not modify the original.

---

# 23 — PDF INFORMATION

Create a lightweight PDF inspection tool.

Display:

- Number of pages.
- Page sizes.
- Orientation.
- PDF version.
- File size.
- Metadata.
- Encryption status.
- Permission status.
- Whether pages contain selectable text.
- Whether pages appear scanned.
- Image count where detectable.
- Font information where available.

This should be read-only.

---

# 24 — PDF IMAGE EXTRACTOR

Create a tool that extracts embedded images from PDFs.

Allow:

- Extract all images.
- Extract selected pages.
- Preview images.
- Save individual images.
- Save all images to selected folder.
- Optional ZIP.

Preserve original image format where technically possible.

---

# 25 — PDF TABLE EXTRACTOR

Create a specialized table extraction tool.

Workflow:

PDF
→ Select page/area
→ Detect table
→ Preview table
→ Edit detected cells if necessary
→ Export XLSX/CSV

Support:

- Multiple tables.
- Arabic text.
- Unicode.
- Mixed languages.

---

# GENERAL UI REQUIREMENTS

All new tools must visually belong to Infinity PDF.

Reuse the existing design language conceptually:

- Typography.
- Cards.
- Buttons.
- Icons.
- Spacing.
- Borders.
- Dialogs.
- File pickers.
- Progress indicators.

However:

DO NOT modify existing components merely to make them "better."

If an existing shared component is safe to reuse, reuse it.

If modifying it would affect existing tools, create a new component specifically for the new tool.

---

# FILE PICKING

Because this is a desktop application, use the application's existing native file/folder selection mechanism if it is safe to reuse.

New tools must support:

- Open file.
- Select multiple files.
- Select folder where appropriate.
- Save As.
- Choose output directory.

Never assume a browser-style file system.

---

# PROGRESS AND CANCELLATION

Long-running tools must provide progress feedback.

Examples:

OCR:
0% → 100%

Compression:
Processing page 24/120

Image conversion:
Page 17/80

Batch operations:
File 32/150

Where technically possible, provide:

[ Stop ]

for long-running operations.

Cancellation must actually cancel/terminate the underlying new operation.

Do not fake cancellation by simply changing UI state.

Every new backend process that can take significant time should be designed with cancellation in mind.

---

# ERROR HANDLING

Every new tool must handle failures gracefully.

Never allow a backend exception to crash the application.

Provide useful messages such as:

"Unable to open this PDF."

"PDF appears to be corrupted."

"Unable to save the output file."

"Insufficient permissions for the selected folder."

"Required OCR engine is unavailable."

"Unable to extract a reliable table from this page."

Do not show raw Python stack traces to normal users.

Log detailed technical information separately for debugging.

---

# TEMPORARY FILES

Each new tool must manage its own temporary files.

Temporary files must:

- Use safe temporary directories.
- Have unique names.
- Be cleaned after successful completion.
- Be cleaned after cancellation.
- Be cleaned after errors where possible.

Do not leave temporary document copies scattered around the user's system.

---

# SECURITY

Never execute PDF contents as code.

Treat imported documents as untrusted input.

Avoid shell command construction using raw user-controlled filenames.

Use subprocess argument arrays rather than unsafe shell string concatenation.

Validate file paths.

Validate extensions but do not rely on extensions alone.

Prevent accidental overwriting of source files.

---

# ARABIC / UNICODE REQUIREMENT

Infinity PDF must have strong Unicode support.

All new tools that process document text must support:

- Arabic.
- English.
- French.
- Mixed Arabic/Latin.
- Unicode filenames.
- Unicode paths.
- RTL text.

Do not assume ASCII filenames.

Do not hardcode paths.

Do not use encoding assumptions such as ASCII.

Use UTF-8 wherever appropriate.

For PDF rendering/generation, ensure Arabic fonts and shaping are handled properly.

---

# DEPENDENCIES

Before adding a new dependency:

1. Inspect existing dependencies.
2. Determine whether the required functionality is already available.
3. Reuse existing libraries if appropriate.
4. If a new dependency is required, isolate its usage to the new tool.
5. Do not replace an existing working dependency.

Do not perform broad dependency upgrades.

Do not upgrade Python packages unrelated to these new tools.

Do not change the existing runtime environment unnecessarily.

---

# PYTHON BACKEND DESIGN

Every backend module should expose a clean interface.

For example:

pdf_compressor.py

Should conceptually provide functions/classes such as:

compress_pdf(...)
get_pdf_info(...)
estimate_compression(...)

pdf_ocr.py:

ocr_pdf(...)
detect_languages(...)
cancel_ocr(...)

pdf_organizer.py:

merge_pdfs(...)
split_pdf(...)
rotate_pages(...)
extract_pages(...)
reorder_pages(...)

Use names appropriate to the actual implementation.

Do not create fake placeholder functions that do nothing.

---

# LOGGING

Each new backend module should provide useful logging.

Example:

[PDF OCR] Opening file
[PDF OCR] Detecting pages
[PDF OCR] Processing page 1/20
[PDF OCR] Processing page 2/20
[PDF OCR] Completed

Avoid excessive logs in production.

Never log sensitive document contents.

Never log passwords.

Never log private PDF text unnecessarily.

---

# OUTPUT SAFETY

By default:

INPUT:
document.pdf

OUTPUT:
document_processed.pdf

Never overwrite:

document.pdf

unless the user explicitly chooses the same path and confirms it.

---

# PERFORMANCE

New tools should not freeze the application.

Use background workers/processes where appropriate.

Long-running operations must not execute synchronously on the UI thread.

Particularly important for:

- OCR.
- Compression.
- PDF editing.
- PDF rendering.
- Table extraction.
- Large batch processing.
- Image conversion.
- PDF repair.

---

# BATCH PROCESSING

Where a tool naturally supports multiple files, support batch operation.

Potential batch-capable tools include:

- PDF Compressor.
- PDF OCR.
- PDF → Images.
- PDF → Word.
- PDF → Excel.
- PDF Metadata Cleaner.
- PDF Signer.
- PDF Renamer.
- PDF Flatten.
- Blank Page Remover.

However, do not sacrifice reliability for batch functionality.

---

# DRAG AND DROP

Where supported by the desktop UI framework, allow:

- Drag PDF into tool.
- Drag multiple PDFs.
- Drag images.
- Drag Excel/CSV files.

Do not modify existing drag/drop implementation.

Implement new behavior inside the new tool.

---

# DESIGN PRINCIPLE

Infinity PDF should feel like one cohesive application.

The user should not feel like they are opening 25 unrelated utilities.

Each tool should use a consistent structure:

1. Tool title.
2. Short description.
3. Input area.
4. Configuration/options.
5. Preview where useful.
6. Progress/status.
7. Output destination.
8. Primary action.
9. Error/success feedback.

---

# TOOL DISCOVERY

Because there are many tools, organize them into categories.

Suggested categories:

## Generate
- Multi-PDF Generator — EXISTING
- Certificate Generator

## Convert
- Universal Converter — EXISTING
- PDF → Word
- PDF → Excel
- PDF → Images
- Images → PDF
- PDF → Text

## Edit
- PDF Editor
- PDF Organizer
- PDF Crop
- PDF Snapshot
- PDF Flatten

## Optimize
- PDF Compressor
- PDF Repair
- Remove Blank Pages

## Extract
- PDF Image Extractor
- PDF Table Extractor
- PDF Information

## Scan
- OCR PDF
- Scan → PDF

## Sign & Forms
- PDF Signer
- PDF Form Builder

## Privacy
- PDF Metadata Cleaner
- PDF Redaction

## Technical
- PDF Measurement

Do NOT move or reorganize the existing tools.

Only add the new categories/items around them where required.

---

# EXISTING TOOL ISOLATION

Before writing code, identify the existing files associated with:

- Multi-PDF Generator.
- Universal Converter.
- Watermark.
- PDF Security.

Record them internally as:

PROTECTED FILES

Do not edit them.

If Git/version control is available, verify the final diff.

The final implementation should clearly demonstrate that protected files were not modified.

---

# GIT / DIFF REQUIREMENT

Before declaring completion:

Inspect the version-control diff.

Verify:

- Existing backend files were not modified.
- Existing frontend tool files were not modified.
- Existing conversion logic was not modified.
- Existing watermark logic was not modified.
- Existing security logic was not modified.

If an existing file was accidentally changed, revert that change unless it is the minimal unavoidable registration change.

---

# TESTING

Every new tool must have at least one happy-path test and meaningful error-path testing.

Test:

- Normal PDFs.
- Multi-page PDFs.
- Large PDFs where practical.
- Unicode filenames.
- Arabic filenames.
- Arabic text.
- Mixed Arabic/English text.
- Invalid PDFs.
- Missing files.
- Permission failures.
- Cancelled operations.
- Save failures.

---

# PDF EDITOR TESTS

Specifically test:

- Open PDF.
- Render pages.
- Zoom.
- Add text.
- Edit supported text.
- Add image.
- Add shape.
- Highlight.
- Draw.
- Move objects.
- Resize objects.
- Delete objects.
- Undo.
- Redo.
- Delete page.
- Rotate page.
- Reorder page.
- Save As.
- Reopen saved PDF.
- Verify edits persist.
- Verify original PDF remains unchanged.

---

# OCR TESTS

Test:

- English PDF.
- French PDF.
- Arabic PDF.
- Mixed Arabic/English PDF.
- Scanned PDF.
- Multi-page scanned PDF.
- Unicode filename.
- Cancel OCR midway.

---

# ORGANIZER TESTS

Test:

- Merge.
- Split.
- Extract.
- Delete.
- Rotate.
- Reorder.
- Duplicate.
- Insert.
- Save output.
- Verify page order.

---

# COMPRESSOR TESTS

Verify:

- Output opens.
- Output size is reduced where compression is possible.
- Text remains readable.
- Images remain acceptable.
- Original file remains untouched.

---

# CERTIFICATE GENERATOR TESTS

Test:

Excel:

Name | Course | Grade

Multiple students.

Verify:

- Each student gets a separate PDF.
- Correct name appears.
- Correct data appears.
- Correct filename is generated.
- Output directory is correct.
- No student's data leaks into another student's document.

---

# CRITICAL DATA ISOLATION TEST

For all batch tools:

Student A's data must NEVER appear in Student B's output.

This is especially important for certificate generation and personalized document generation.

---

# FINAL ARCHITECTURE

The resulting project should conceptually resemble:

Infinity PDF
│
├── Existing Tools
│   ├── Multi-PDF Generator       ← DO NOT TOUCH
│   ├── Universal Converter       ← DO NOT TOUCH
│   ├── Watermark                 ← DO NOT TOUCH
│   └── PDF Security              ← DO NOT TOUCH
│
├── New Tools
│   ├── PDF Editor
│   ├── PDF Organizer
│   ├── PDF Compressor
│   ├── PDF Repair
│   ├── OCR
│   ├── PDF → Images
│   ├── Images → PDF
│   ├── PDF → Text
│   ├── PDF → Excel
│   ├── PDF → Word
│   ├── Scan → PDF
│   ├── Certificate Generator
│   ├── Batch PDF Renamer
│   ├── PDF Signer
│   ├── PDF Form Builder
│   ├── Metadata Cleaner
│   ├── Redaction
│   ├── Measurement
│   ├── Snapshot
│   ├── Crop
│   ├── Blank Page Remover
│   ├── Flatten
│   ├── PDF Information
│   ├── Image Extractor
│   └── Table Extractor
│
└── New isolated Python backend modules

---

# IMPLEMENTATION ORDER

Do NOT attempt to implement everything blindly in one giant change.

Implement in logical groups:

## Phase 1 — Core PDF tools

1. PDF Organizer
2. PDF Compressor
3. PDF → Images
4. Images → PDF
5. PDF → Text
6. PDF Information

## Phase 2 — Extraction

7. PDF → Word
8. PDF → Excel
9. PDF Image Extractor
10. PDF Table Extractor

## Phase 3 — Editing

11. PDF Editor
12. PDF Crop
13. PDF Snapshot
14. PDF Flatten

## Phase 4 — Scanning

15. OCR
16. Scan → PDF
17. Remove Blank Pages

## Phase 5 — Productivity

18. Certificate Generator
19. Batch PDF Renamer
20. PDF Signer
21. PDF Form Builder

## Phase 6 — Privacy / Advanced

22. Metadata Cleaner
23. Redaction
24. PDF Repair
25. PDF Measurement

After each phase:

- Run the application.
- Test the new tools.
- Verify existing tools still work.
- Inspect the Git diff.
- Confirm protected files remain untouched.

---

# ABSOLUTE FINAL RULE

The existing Infinity PDF functionality is considered stable production code.

The goal is:

> ADD functionality, NOT MODIFY functionality.

If there is a conflict between adding a new feature and preserving an existing feature:

**Preserving the existing feature wins.**

If a new tool cannot be implemented without changing existing functionality:

STOP.

Do not modify the existing implementation.

Instead isolate the new implementation and document the limitation.

At the end, provide:

1. List of all new tools implemented.
2. New frontend files created.
3. New Python backend files created.
4. New dependencies added, if any.
5. Existing protected files confirmed untouched.
6. Tests performed.
7. Known limitations.
8. Any tools that could not be fully implemented and why.

Do not declare the project complete merely because the UI exists.

Every tool must have a functional backend and a working end-to-end workflow.