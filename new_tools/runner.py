#!/usr/bin/env python3
"""Packaged entry point for the NEW tools (additive expansion).

CLI: runner.py <tool> <operation> <args-json> <output-dir>

Dispatches to the per-tool OPS table of new_tools/<tool>.py using the same
PROGRESS:/RESULT: protocol as the dev path (python new_tools/<tool>.py).
This module exists so PyInstaller can freeze ONE bundle (newtools-backend)
covering all new tools instead of 25 separate executables.

In development, Electron spawns `python new_tools/<tool>.py` directly; the
packaged app spawns `newtools-backend.exe <tool> ...` (see main/main.js).
"""

import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _common import (  # noqa: E402
    Cancelled,
    check_cancel,
    emit_result,
    ensure_outdir,
    log,
    progress,
)

ALLOWED_TOOLS = [
    "pdf_organizer", "pdf_compressor", "pdf_to_images", "images_to_pdf",
    "pdf_to_text", "pdf_info", "pdf_to_word", "pdf_to_excel",
    "pdf_image_extractor", "pdf_table_extractor", "pdf_editor", "pdf_crop",
    "pdf_snapshot", "pdf_flatten", "pdf_ocr", "scan_to_pdf",
    "pdf_blank_page_remover", "certificate_generator", "batch_pdf_renamer",
    "pdf_signer", "pdf_forms", "pdf_metadata_cleaner", "pdf_redaction",
    "pdf_repair", "pdf_measurement",
]


def main(argv):
    if len(argv) != 5:
        emit_result({"success": False,
                     "error": "Expected: <tool> <operation> <args-json> <output-dir>"})
        return 0
    _, tool, operation, args_json, output_dir = argv
    if tool not in ALLOWED_TOOLS:
        emit_result({"success": False, "error": f"Unknown tool: {tool}"})
        return 0
    try:
        args = json.loads(args_json) if args_json else {}
    except Exception as e:
        emit_result({"success": False, "error": f"Invalid JSON arguments: {e}"})
        return 0
    if not isinstance(args, dict):
        emit_result({"success": False, "error": "Invalid arguments: object expected"})
        return 0
    outdir = ensure_outdir(output_dir)
    try:
        log(f"Starting '{tool}:{operation}'")
        import importlib
        module = importlib.import_module(tool)
        ops = getattr(module, "OPS", None)
        if not isinstance(ops, dict) or operation not in ops:
            emit_result({"success": False,
                         "error": f"Unknown operation: {operation}"})
            return 0
        check_cancel()
        result = ops[operation](args, outdir)
        if not isinstance(result, dict):
            result = {"info": result}
        result.setdefault("success", True)
        result.setdefault("outputs", [])
        result.setdefault("info", {})
        if result.get("success"):
            from _common import verify_result_outputs
            ok, problem = verify_result_outputs(result)
            if not ok:
                log(f"Output validation failed for '{tool}:{operation}': {problem}")
                result = {"success": False, "error": problem,
                          "outputs": [], "info": result.get("info", {})}
        progress(100)
        log(f"Finished '{tool}:{operation}'")
        emit_result(result)
    except Cancelled as e:
        emit_result({"success": False, "cancelled": True, "error": str(e)})
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        emit_result({"success": False, "error": str(e)})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
