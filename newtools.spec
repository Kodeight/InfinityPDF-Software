# -*- mode: python ; coding: utf-8 -*-
# Frozen bundle for the 25 NEW tools (additive expansion).
# Entry: new_tools/runner.py  ->  dist: backend-dist/newtools-backend.exe
# The Electron packaged app spawns this instead of `python new_tools/<tool>.py`
# (no interpreter ships with the installer). Dev still uses plain python.

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

new_tool_modules = [
    'pdf_organizer', 'pdf_compressor', 'pdf_to_images', 'images_to_pdf',
    'pdf_to_text', 'pdf_info', 'pdf_to_word', 'pdf_to_excel',
    'pdf_image_extractor', 'pdf_table_extractor', 'pdf_editor', 'pdf_crop',
    'pdf_snapshot', 'pdf_flatten', 'pdf_ocr', 'scan_to_pdf',
    'pdf_blank_page_remover', 'certificate_generator', 'batch_pdf_renamer',
    'pdf_signer', 'pdf_forms', 'pdf_metadata_cleaner', 'pdf_redaction',
    'pdf_repair', 'pdf_measurement',
]

a = Analysis(
    ['new_tools/runner.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=new_tool_modules + [
        '_common',
        '_tables',
        'fitz',
        'pypdf',
        'pypdf._encryption',
        'PIL',
        'reportlab',
        'reportlab.pdfgen.canvas',
        'reportlab.lib.colors',
        'reportlab.lib.pagesizes',
        'reportlab.platypus',
        'docx',
        'pdf2docx',
        'openpyxl',
        'numpy',
        'pandas',
        # Frozen numpy 2.x misses C-extension submodules via the stock hook
        # (verified root cause for pdf2docx/cv2 failing frozen).
    ] + collect_submodules('numpy._core'),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='newtools-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
