"""Shared runtime for InfinityPDF NEW tools (additive expansion).

Every new tool module is standalone and uses this helper only for
boilerplate: CLI parsing, stdout protocol, progress, cancellation,
temporary outputs and validation. It never touches existing app code.

Stdout protocol (kept separate from human logs on stderr):
  PROGRESS:<0-100>          flushed progress updates
  RESULT:<json>             exactly one final line:
    {"success": True, "outputs": [...], "info": {...}}
    {"success": False, "error": "..."}
    {"success": False, "cancelled": True}

Cancellation: the Electron layer sets NEWTOOL_CANCEL_FILE to a flag-file
path and kills the process on STOP. Modules poll cancel_requested()
between units of work so no extra work starts after cancellation.
"""

import json
import os
import sys
import tempfile
import traceback
import uuid


class Cancelled(Exception):
    pass


def _tag():
    try:
        return os.path.splitext(os.path.basename(sys.argv[0]))[0]
    except Exception:
        return "new-tool"


def log(msg):
    print(f"[{_tag()}] {msg}", file=sys.stderr, flush=True)


def progress(pct):
    try:
        pct = max(0, min(100, int(pct)))
    except Exception:
        pct = 0
    print(f"PROGRESS:{pct}", flush=True)


def emit_result(obj):
    print("RESULT:" + json.dumps(obj, ensure_ascii=False), flush=True)


def cancel_flag_path():
    return os.environ.get("NEWTOOL_CANCEL_FILE", "")


def cancel_requested():
    p = cancel_flag_path()
    return bool(p) and os.path.exists(p)


def check_cancel():
    if cancel_requested():
        raise Cancelled("Cancelled by user")


def fail(msg):
    emit_result({"success": False, "error": str(msg)})


def ensure_outdir(path):
    os.makedirs(path, exist_ok=True)
    return os.path.abspath(path)


def unique_path(outdir, stem, ext):
    """Return a non-colliding output path; never overwrites inputs."""
    safe = "".join(c for c in stem if c not in r'\/:*?"<>|').strip() or "output"
    if not ext.startswith("."):
        ext = "." + ext
    candidate = os.path.join(outdir, safe + ext)
    n = 2
    while os.path.exists(candidate):
        candidate = os.path.join(outdir, f"{safe}_{n}{ext}")
        n += 1
    return candidate


def read_args():
    """CLI: <module> <operation> <args-json> <output-dir>"""
    if len(sys.argv) < 4:
        fail("Invalid arguments. Expected: <operation> <args-json> <output-dir>")
        sys.exit(0)
    op = sys.argv[1]
    try:
        args = json.loads(sys.argv[2]) if sys.argv[2] else {}
    except Exception as e:
        fail(f"Invalid JSON arguments: {e}")
        sys.exit(0)
    outdir = ensure_outdir(sys.argv[3])
    return op, args, outdir


def require_arg(args, name):
    if name not in args or args[name] in (None, ""):
        raise ValueError(f"Missing required argument: {name}")
    return args[name]


def validate_pdf(path):
    if not path or not os.path.exists(path):
        raise FileNotFoundError(f"Input file not found: {path}")
    if os.path.getsize(path) == 0:
        raise ValueError(f"Input file is empty: {path}")
    with open(path, "rb") as f:
        header = f.read(5)
    if not header.startswith(b"%PDF"):
        raise ValueError(f"Not a PDF file (bad header): {path}")
    return os.path.abspath(path)


def validate_image(path):
    if not path or not os.path.exists(path):
        raise FileNotFoundError(f"Image file not found: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".bmp"):
        raise ValueError(f"Unsupported image format: {ext or '(none)'} for {path}")
    return os.path.abspath(path)


def parse_pages(spec, total):
    """'all' | '' | '1,3,5-7' (1-based, inclusive) -> sorted 0-based list."""
    if spec is None or str(spec).strip().lower() in ("", "all"):
        return list(range(total))
    picked = set()
    for part in str(spec).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            a, b = int(a), int(b)
            if a < 1 or b > total or a > b:
                raise ValueError(f"Page range out of bounds: {part} (document has {total} pages)")
            picked.update(range(a - 1, b))
        else:
            n = int(part)
            if n < 1 or n > total:
                raise ValueError(f"Page out of bounds: {part} (document has {total} pages)")
            picked.add(n - 1)
    if not picked:
        raise ValueError("No pages selected")
    return sorted(picked)


def temp_workdir(prefix="ipdf_new_"):
    d = os.path.join(tempfile.gettempdir(), prefix + uuid.uuid4().hex)
    os.makedirs(d, exist_ok=True)
    return d


def run_tool(ops):
    """Dispatch helper. ops: {name: fn(args, outdir) -> dict}."""
    op, args, outdir = read_args()
    if op not in ops:
        fail(f"Unknown operation: {op}")
        return
    try:
        log(f"Starting '{op}'")
        result = ops[op](args, outdir)
        if not isinstance(result, dict):
            result = {"info": result}
        result.setdefault("success", True)
        result.setdefault("outputs", [])
        result.setdefault("info", {})
        log(f"Finished '{op}'")
        emit_result(result)
    except Cancelled as e:
        log(f"Cancelled '{op}'")
        emit_result({"success": False, "cancelled": True, "error": str(e)})
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        fail(f"{e}")
