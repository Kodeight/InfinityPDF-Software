import React from 'react';
import { translations, LanguageCode } from '../../translations';

// New-tools registry (additive expansion). Existing TOOLS/constants are
// untouched. Canonical English text lives in the defs below; translated
// titles/descriptions/categories resolve via translations.ts (`nt_*` keys)
// with English fallback. Operation/param labels remain English-by-design.

export const ntTitle = (id: string, lang: string): string =>
  translations[`nt_${id}_title`]?.[lang as LanguageCode] || NEW_TOOL_MAP[id]?.title || id;

export const ntDesc = (id: string, lang: string): string =>
  translations[`nt_${id}_desc`]?.[lang as LanguageCode] || NEW_TOOL_MAP[id]?.desc || '';

export const ntCat = (cat: string, lang: string): string => {
  const slug = cat.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
  return translations[`nt_cat_${slug}`]?.[lang as LanguageCode] || cat;
};

export type ParamType = 'text' | 'number' | 'select' | 'check' | 'pages' | 'filepick' | 'textarea';

export interface ToolParam {
  key: string;
  label: string;
  type: ParamType;
  def?: any;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  wide?: boolean;
}

export interface ToolOperation {
  name: string;
  label: string;
  params: ToolParam[];
  hint?: string;
}

export interface ToolInput {
  key: string;
  label: string;
  accept: string;
  multiple?: boolean;
}

export interface NewToolDef {
  id: string;
  title: string;
  desc: string;
  category: string;
  icon: React.ReactNode;
  inputs: ToolInput[];
  operations: ToolOperation[];
  // Preview rendering (render op -> first image output shown + region tools).
  preview?: { op: string; dpi?: number };
  // Region selection on the preview, mapped into the given op/args.
  region?: { forOp: string; multi: boolean; argKey: string; pageKey?: string; label: string };
  // Special result renderers + follow-up actions.
  resultView?: 'tables' | 'pagelist' | 'metadata' | 'renamer' | 'scan' | 'ocr' | 'none';
  autoOp?: string;
  signaturePad?: boolean;
  measure?: boolean;
  certFlow?: boolean;
  dataFile?: boolean;
}

const P = (key: string, label: string, type: ParamType, def?: any, extra?: Partial<ToolParam>): ToolParam => ({
  key, label, type, def, ...extra,
});

const I = (key: string, label: string, accept: string, multiple?: boolean): ToolInput => ({
  key, label, accept, multiple,
});

const catIcon = (d: string) => (
  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
  </svg>
);

const ICONS: Record<string, React.ReactNode> = {
  Generate: catIcon('M12 6v6m0 0v6m0-6h6m-6 0H6'),
  Convert: catIcon('M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'),
  Edit: catIcon('M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'),
  Optimize: catIcon('M13 10V3L4 14h7v7l9-11h-7z'),
  Extract: catIcon('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'),
  Scan: catIcon('M12 4v1m6.364 1.636l-.707.707M20 12h-1m-1.636 6.364l-.707-.707M12 20v-1M6.343 17.657l.707-.707M4 12h1m1.636-6.364l.707.707M15 12a3 3 0 11-6 0 3 3 0 016 0z'),
  'Sign & Forms': catIcon('M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'),
  Privacy: catIcon('M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'),
  Technical: catIcon('M9 7h6m-5 4h4m5-9H5a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2V4a2 2 0 00-2-2z'),
};

const PDF = (key = 'pdf', label = 'PDF file', multiple = false) => I(key, label, '.pdf', multiple);
const PDFS = (key = 'files', label = 'PDF files') => I(key, label, '.pdf', true);

export const NEW_TOOL_DEFS: NewToolDef[] = [
  {
    id: 'pdf_organizer', title: 'PDF Organizer', category: 'Edit',
    desc: 'Merge, split, reorder, rotate, extract, duplicate, replace and insert PDF pages.',
    icon: ICONS.Edit, inputs: [PDFS()],
    operations: [
      { name: 'info', label: 'Analyze', params: [] },
      { name: 'merge', label: 'Merge files', params: [P('order', 'Order (e.g. 1,3,2 — blank = as listed)', 'text', '')] },
      { name: 'split_ranges', label: 'Split by ranges', params: [P('ranges', 'Ranges — one per line: name: pages', 'textarea', 'part1: 1-3\npart2: 4-6', { wide: true })] },
      { name: 'split_every_n', label: 'Split every N pages', params: [P('n', 'N', 'number', 1, { min: 1 })] },
      { name: 'extract', label: 'Extract pages', params: [P('pages', 'Pages', 'pages', 'all')] },
      { name: 'delete_pages', label: 'Delete pages', params: [P('pages', 'Pages', 'pages', '')] },
      { name: 'rotate', label: 'Rotate pages', params: [P('pages', 'Pages', 'pages', 'all'), P('angle', 'Angle', 'select', '90', { options: ['90', '180', '270'] })] },
      { name: 'duplicate', label: 'Duplicate pages', params: [P('pages', 'Pages', 'pages', ''), P('after', 'Insert after page (blank = end)', 'text', '')] },
      { name: 'reorder', label: 'Reorder pages', params: [P('new_order', 'New order (e.g. 3,1,2)', 'text', '')] },
      { name: 'replace', label: 'Replace page', params: [P('index', 'Page to replace', 'number', 1, { min: 1 }), P('src_pdf', 'Source PDF', 'filepick', 1), P('src_page', 'Source page', 'number', 1, { min: 1 })] },
      { name: 'insert_blank', label: 'Insert blank pages', params: [P('at', 'Insert at page (blank = end)', 'text', ''), P('count', 'Count', 'number', 1, { min: 1 }), P('page_size', 'Size', 'select', 'A4', { options: ['A4', 'Letter'] })] },
      { name: 'insert_from', label: 'Insert pages from file', params: [P('at', 'Insert at page (blank = end)', 'text', ''), P('src_pdf', 'Source PDF', 'filepick', 1), P('src_pages', 'Source pages', 'pages', 'all')] },
    ],
    preview: { op: 'render' },
  },
  {
    id: 'pdf_compressor', title: 'PDF Compressor', category: 'Optimize',
    desc: 'Reduce PDF size with 4 compression levels and image controls.',
    icon: ICONS.Optimize, inputs: [PDFS()],
    operations: [
      { name: 'info', label: 'Analyze', params: [] },
      {
        name: 'compress', label: 'Compress', params: [
          P('level', 'Level', 'select', 'balanced', { options: ['low', 'balanced', 'high', 'maximum'] }),
          P('image_dpi', 'Image DPI (0 = level default)', 'number', 0, { min: 0, max: 300 }),
          P('jpeg_quality', 'JPEG quality (0 = level default)', 'number', 0, { min: 0, max: 95 }),
          P('remove_metadata', 'Remove metadata', 'check', true),
        ],
      },
    ],
  },
  {
    id: 'pdf_to_images', title: 'PDF to Images', category: 'Convert',
    desc: 'Convert PDF pages to PNG, JPG, WebP or TIFF, optionally zipped.',
    icon: ICONS.Convert, inputs: [PDFS()],
    operations: [
      {
        name: 'convert', label: 'Convert', params: [
          P('pages', 'Pages', 'pages', 'all'),
          P('dpi', 'DPI', 'number', 150, { min: 36, max: 600 }),
          P('fmt', 'Format', 'select', 'png', { options: ['png', 'jpg', 'webp', 'tiff'] }),
          P('quality', 'Quality (JPG/WebP)', 'number', 85, { min: 10, max: 100 }),
          P('zip_output', 'Also make a ZIP', 'check', false),
        ],
      },
    ],
  },
  {
    id: 'images_to_pdf', title: 'Images to PDF', category: 'Convert',
    desc: 'Combine JPG, PNG, WebP or TIFF images into a PDF, one per page.',
    icon: ICONS.Convert, inputs: [I('images', 'Images (in page order)', '.jpg,.jpeg,.png,.webp,.tiff,.bmp', true)],
    operations: [
      {
        name: 'convert', label: 'Build PDF', params: [
          P('page_size', 'Page size', 'select', 'A4', { options: ['A4', 'Letter', 'Custom'] }),
          P('custom_w_mm', 'Custom width (mm)', 'number', 210),
          P('custom_h_mm', 'Custom height (mm)', 'number', 297),
          P('orientation', 'Orientation', 'select', 'portrait', { options: ['portrait', 'landscape'] }),
          P('margin_mm', 'Margin (mm)', 'number', 10, { min: 0 }),
          P('fit', 'Image fit', 'select', 'fit', { options: ['fit', 'fill', 'stretch'] }),
        ],
      },
    ],
  },
  {
    id: 'pdf_to_text', title: 'PDF to Text', category: 'Convert',
    desc: 'Extract Unicode text (Arabic supported) to TXT or Markdown; detects scanned pages.',
    icon: ICONS.Convert, inputs: [PDFS()],
    operations: [
      { name: 'detect_layer', label: 'Detect text layer', params: [] },
      { name: 'extract', label: 'Extract', params: [P('pages', 'Pages', 'pages', 'all'), P('fmt', 'Format', 'select', 'txt', { options: ['txt', 'md'] })] },
    ],
  },
  {
    id: 'pdf_info', title: 'PDF Information', category: 'Extract',
    desc: 'Read-only inspector: pages, sizes, fonts, metadata, encryption, text layer.',
    icon: ICONS.Extract, inputs: [PDFS()],
    operations: [{ name: 'info', label: 'Inspect', params: [] }],
    autoOp: 'info',
  },
  {
    id: 'pdf_to_word', title: 'PDF to Word', category: 'Convert',
    desc: 'Convert PDF to DOCX preserving text, tables and RTL/Arabic paragraphs.',
    icon: ICONS.Convert, inputs: [PDFS()],
    operations: [{ name: 'convert', label: 'Convert to DOCX', params: [] }],
  },
  {
    id: 'pdf_to_excel', title: 'PDF to Excel', category: 'Convert',
    desc: 'Detect tables in PDFs and export them to XLSX with preview.',
    icon: ICONS.Convert, inputs: [PDFS()],
    operations: [
      { name: 'detect', label: 'Detect tables', params: [P('pages', 'Pages', 'pages', 'all')] },
      { name: 'export', label: 'Export XLSX', params: [P('pages', 'Pages', 'pages', 'all')] },
    ],
    resultView: 'tables',
  },
  {
    id: 'pdf_image_extractor', title: 'PDF Image Extractor', category: 'Extract',
    desc: 'List and extract embedded images in original format, optionally zipped.',
    icon: ICONS.Extract, inputs: [PDFS()],
    operations: [
      { name: 'list', label: 'List images', params: [P('pages', 'Pages', 'pages', 'all')] },
      { name: 'extract', label: 'Extract', params: [P('pages', 'Pages', 'pages', 'all'), P('zip_output', 'Also make a ZIP', 'check', false)] },
    ],
  },
  {
    id: 'pdf_table_extractor', title: 'PDF Table Extractor', category: 'Extract',
    desc: 'Detect tables, preview cells, edit and export to XLSX or CSV.',
    icon: ICONS.Extract, inputs: [PDFS()],
    operations: [
      { name: 'detect', label: 'Detect tables', params: [P('pages', 'Pages', 'pages', 'all')] },
      { name: 'export', label: 'Export', params: [P('pages', 'Pages', 'pages', 'all'), P('fmt', 'Format', 'select', 'xlsx', { options: ['xlsx', 'csv'] })] },
    ],
    resultView: 'tables',
  },
  {
    id: 'pdf_editor', title: 'PDF Editor', category: 'Edit',
    desc: 'Annotate and edit pages: text, shapes, drawing, highlights, images, page operations.',
    icon: ICONS.Edit, inputs: [PDF('pdf', 'PDF to edit')],
    operations: [],
  },
  {
    id: 'pdf_crop', title: 'PDF Crop', category: 'Edit',
    desc: 'Visually crop pages with presets; preview, reset, save as new PDF.',
    icon: ICONS.Edit, inputs: [PDF()],
    operations: [
      {
        name: 'crop', label: 'Apply crop', params: [
          P('pages', 'Pages', 'pages', 'all'),
          P('preset', 'Preset (fills the region)', 'select', 'custom', { options: ['custom', 'A4', 'Letter'] }),
        ],
      },
    ],
    preview: { op: 'render' },
    region: { forOp: 'crop', multi: false, argKey: 'rect', pageKey: 'pages', label: 'Crop region' },
  },
  {
    id: 'pdf_snapshot', title: 'PDF Snapshot', category: 'Edit',
    desc: 'Capture a page region as PNG/JPG or a single-page PDF.',
    icon: ICONS.Edit, inputs: [PDF()],
    operations: [
      {
        name: 'capture', label: 'Capture', params: [
          P('dpi', 'DPI', 'number', 200, { min: 36, max: 600 }),
          P('fmt', 'Format', 'select', 'png', { options: ['png', 'jpg'] }),
          P('make_pdf', 'Also make a PDF', 'check', false),
        ],
      },
    ],
    preview: { op: 'render', dpi: 150 },
    region: { forOp: 'capture', multi: false, argKey: 'rect', label: 'Capture region (blank = full page)' },
  },
  {
    id: 'pdf_flatten', title: 'PDF Flattener', category: 'Edit',
    desc: 'Flatten annotations and form fields into page content; explains first.',
    icon: ICONS.Edit, inputs: [PDFS()],
    operations: [
      { name: 'info', label: 'What will be flattened', params: [] },
      { name: 'flatten', label: 'Flatten', params: [] },
    ],
  },
  {
    id: 'pdf_ocr', title: 'OCR PDF', category: 'Scan',
    desc: 'Make scanned PDFs searchable (Arabic, English, French); needs an OCR engine.',
    icon: ICONS.Scan, inputs: [PDFS()],
    operations: [
      {
        name: 'ocr', label: 'Run OCR', params: [
          P('pages', 'Pages', 'pages', 'all'),
          P('langs', 'Languages', 'text', 'eng', { help: 'Comma list, e.g. eng,ara,fra (if engine supports them)' }),
          P('mode', 'Output', 'select', 'searchable', { options: ['searchable', 'txt'] }),
        ],
      },
    ],
    resultView: 'ocr',
    autoOp: 'engines',
  },
  {
    id: 'scan_to_pdf', title: 'Scan to PDF', category: 'Scan',
    desc: 'Build PDFs from scanned/camera images: rotate, deskew, blank-page skip.',
    icon: ICONS.Scan, inputs: [I('images', 'Scanned images', '.jpg,.jpeg,.png,.tiff,.bmp', true)],
    operations: [
      {
        name: 'build', label: 'Build PDF', params: [
          P('rotate_all', 'Rotate all (deg)', 'select', '0', { options: ['0', '90', '180', '270'] }),
          P('deskew', 'Deskew', 'check', false),
          P('skip_if_blank', 'Skip blank pages', 'check', false),
          P('blank_threshold', 'Blank threshold (%)', 'number', 2, { min: 0, max: 50 }),
          P('page_size', 'Page size', 'select', 'SameAsImage', { options: ['SameAsImage', 'A4', 'Letter'] }),
          P('orientation', 'Orientation', 'select', 'portrait', { options: ['portrait', 'landscape'] }),
          P('margin_mm', 'Margin (mm)', 'number', 10, { min: 0 }),
        ],
      },
    ],
    resultView: 'scan',
    autoOp: 'scanners',
  },
  {
    id: 'pdf_blank_page_remover', title: 'Remove Blank Pages', category: 'Optimize',
    desc: 'Detect blank pages, review the list, confirm, then remove.',
    icon: ICONS.Optimize, inputs: [PDFS()],
    operations: [
      {
        name: 'analyze', label: 'Analyze', params: [
          P('threshold', 'Blank threshold (% ink)', 'number', 2, { min: 0, max: 50 }),
          P('mode', 'Detection', 'select', 'both', { options: ['both', 'text', 'render'] }),
        ],
      },
      {
        name: 'remove', label: 'Remove confirmed pages', params: [
          P('pages', 'Pages (or blank = auto-detected)', 'text', ''),
          P('threshold', 'Blank threshold (% ink)', 'number', 2, { min: 0, max: 50 }),
        ],
      },
    ],
    resultView: 'pagelist',
  },
  {
    id: 'certificate_generator', title: 'Certificate Generator', category: 'Generate',
    desc: 'Personalize a PDF template with {{placeholders}} from Excel/CSV rows.',
    icon: ICONS.Generate, inputs: [PDF('template', 'PDF template')],
    operations: [
      {
        name: 'generate', label: 'Generate', params: [
          P('naming', 'File naming', 'text', '{{name}} - Certificate'),
          P('field_map', 'Placeholder = column (one per line)', 'textarea', '', { wide: true, help: 'Blank = match by name automatically' }),
          P('output_subdir', 'Group outputs in a subfolder', 'check', true),
        ],
      },
    ],
    certFlow: true, dataFile: true,
  },
  {
    id: 'batch_pdf_renamer', title: 'Batch PDF Renamer', category: 'Generate',
    desc: 'Rename many PDFs from a mapping or pattern with collision protection.',
    icon: ICONS.Generate, inputs: [PDFS('files', 'PDFs to rename')],
    operations: [
      {
        name: 'preview', label: 'Preview renames', params: [
          P('mapping', 'Mapping — one per line: oldname=newname', 'textarea', '', { wide: true, help: 'Leave blank to use the pattern below' }),
          P('pattern', 'Pattern ({index},{name},{date})', 'text', '{index}_{name}'),
        ],
      },
      {
        name: 'apply', label: 'Apply renames', params: [
          P('mapping', 'Mapping (same as preview)', 'textarea', '', { wide: true }),
          P('pattern', 'Pattern', 'text', '{index}_{name}'),
          P('confirmed', 'I confirm these renames', 'check', false),
        ],
      },
    ],
    resultView: 'renamer',
  },
  {
    id: 'pdf_signer', title: 'PDF Signer', category: 'Sign & Forms',
    desc: 'Place visual signatures (drawn, typed or image). Not cryptographic signing.',
    icon: ICONS['Sign & Forms'], inputs: [PDF()],
    operations: [
      {
        name: 'apply', label: 'Apply signatures', params: [
          P('kind', 'Signature kind', 'select', 'type', { options: ['type', 'draw', 'image'] }),
          P('text', 'Typed signature', 'text', ''),
          P('sig_image', 'Signature image (PNG)', 'filepick', ''),
          P('pen_width', 'Pen width', 'number', 3, { min: 1, max: 12 }),
        ],
      },
    ],
    preview: { op: 'render' },
    region: { forOp: 'apply', multi: true, argKey: 'rect', label: 'Signature placement' },
    signaturePad: true,
  },
  {
    id: 'pdf_forms', title: 'PDF Form Builder', category: 'Sign & Forms',
    desc: 'Add text fields, checkboxes, radios, dropdowns, dates and signature fields.',
    icon: ICONS['Sign & Forms'], inputs: [PDF()],
    operations: [
      {
        name: 'apply', label: 'Build form', params: [
          P('fields', 'Fields — one per line: kind|name|page|value|options', 'textarea', 'text|full_name|1||', { wide: true, help: 'kinds: text, checkbox, radio, dropdown, date, signature. dropdown options separated by ;' }),
        ],
      },
    ],
    preview: { op: 'render' },
    region: { forOp: 'apply', multi: true, argKey: 'rect', label: 'Field placement (one region per field line, in order)' },
    autoOp: 'inspect',
  },
  {
    id: 'pdf_metadata_cleaner', title: 'PDF Metadata Cleaner', category: 'Privacy',
    desc: 'Inspect and remove metadata, XMP, attachments and comments.',
    icon: ICONS.Privacy, inputs: [PDFS()],
    operations: [
      { name: 'inspect', label: 'Inspect', params: [] },
      {
        name: 'clean', label: 'Clean', params: [
          P('title', 'Title (blank = erase)', 'text', ''),
          P('author', 'Author (blank = erase)', 'text', ''),
          P('subject', 'Subject (blank = erase)', 'text', ''),
          P('keywords', 'Keywords (blank = erase)', 'text', ''),
          P('creator', 'Creator (blank = erase)', 'text', ''),
          P('producer', 'Producer (blank = erase)', 'text', ''),
          P('strip_xmp', 'Remove XMP', 'check', true),
          P('remove_attachments', 'Remove attachments', 'check', false),
          P('remove_comments', 'Remove comments', 'check', false),
        ],
      },
    ],
    resultView: 'metadata',
  },
  {
    id: 'pdf_redaction', title: 'PDF Redaction', category: 'Privacy',
    desc: 'True redaction: content under marked areas is really removed.',
    icon: ICONS.Privacy, inputs: [PDF()],
    operations: [{ name: 'apply', label: 'Apply redaction', params: [] }],
    preview: { op: 'render' },
    region: { forOp: 'apply', multi: true, argKey: 'rect', label: 'Areas to redact' },
  },
  {
    id: 'pdf_repair', title: 'PDF Repair', category: 'Optimize',
    desc: 'Analyze and rebuild structurally damaged PDFs without touching originals.',
    icon: ICONS.Optimize, inputs: [PDFS('files', 'Possibly damaged PDFs')],
    operations: [
      { name: 'analyze', label: 'Analyze', params: [] },
      { name: 'repair', label: 'Repair', params: [] },
    ],
  },
  {
    id: 'pdf_measurement', title: 'PDF Measurement', category: 'Technical',
    desc: 'Calibrate a scale on technical drawings, then measure distance, area and angles.',
    icon: ICONS.Technical, inputs: [PDF()],
    operations: [],
    preview: { op: 'render' },
    measure: true,
  },
];

export const NEW_TOOL_MAP: Record<string, NewToolDef> = Object.fromEntries(
  NEW_TOOL_DEFS.map((d) => [d.id, d]),
);

export const NEW_TOOL_CATEGORIES: string[] = [
  'Generate', 'Convert', 'Edit', 'Optimize', 'Extract', 'Scan', 'Sign & Forms', 'Privacy', 'Technical',
];
