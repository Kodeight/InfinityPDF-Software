# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

a = Analysis(
    ['backend.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'win32com.client',
        'reportlab',
        'reportlab.pdfgen.canvas',
        'reportlab.lib.colors',
        'pypdf',
        'pypdf._encryption',
        'PIL',
        # universal-convert paths (verified missing from the packaged EXE:
        # PDF->DOCX failed with "pdf2docx library not installed")
        'fitz',
        'pdf2docx',
        'docx',
        'openpyxl',
        'numpy',
        # NOTE: 'pptx' intentionally omitted — the stock hook-pptx crashes
        # analysis in this env (python-pptx 0.6.21, isolated subprocess dies
        # with 0xC0000005). PDF->PPTX therefore needs review before it can
        # be supported in the packaged EXE; see plan P1.
        # Frozen numpy 2.x misses C-extension submodules via the stock hook
        # (verified: numpy._core._exceptions absent -> pdf2docx/cv2 broken).
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
    name='InfinityPDF-backend',
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
