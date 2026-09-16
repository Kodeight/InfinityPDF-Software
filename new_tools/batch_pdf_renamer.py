#!/usr/bin/env python3
"""BATCH PDF RENAMER — preview then apply renames (new tool, additive).

CLI: python batch_pdf_renamer.py <operation> <args-json> <output-dir>
Ops:
  preview{files[], mapping{oldpath:newname} | pattern}
  apply{files[], mapping|pattern, confirmed(bool, must be true)}

Pattern supports {index} (1-based), {name} (current stem), {date} (YYYY-MM-DD).
Renames stay in the same directory and never overwrite: apply() validates
the WHOLE batch first and fails entirely if any collision would occur.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress,
    require_arg, run_tool,
)

import datetime


def _new_name_for(path, mapping, pattern, index):
    abspath = os.path.abspath(path)
    newname = None
    if isinstance(mapping, dict):
        for k, v in mapping.items():
            try:
                if os.path.abspath(k) == abspath:
                    newname = v
                    break
            except Exception:
                if k == path:
                    newname = v
                    break
    if newname is None and pattern:
        stem = os.path.splitext(os.path.basename(path))[0]
        newname = str(pattern).replace("{index}", str(index)) \
                              .replace("{name}", stem) \
                              .replace("{date}", datetime.date.today().isoformat())
    if newname is None:
        raise ValueError(f"No mapping or pattern covers: {path}")
    newname = os.path.basename(str(newname)).strip()
    if not newname:
        raise ValueError(f"Empty new name for: {path}")
    # preserve/require extension: keep original ext when none given
    orig_ext = os.path.splitext(path)[1]
    if orig_ext and not os.path.splitext(newname)[1]:
        newname += orig_ext
    for ch in '\\/:*?"<>|':
        if ch in newname:
            raise ValueError(f"Illegal character {ch!r} in new name {newname!r}")
    return newname


def _plan(files, mapping, pattern):
    planned = []
    for i, path in enumerate(files, start=1):
        check_cancel()
        if not path or not os.path.exists(path):
            raise FileNotFoundError(f"Input file not found: {path}")
        if not os.path.isfile(path):
            raise ValueError(f"Not a file: {path}")
        newname = _new_name_for(path, mapping, pattern, i)
        newpath = os.path.join(os.path.dirname(os.path.abspath(path)), newname)
        planned.append({"old": os.path.abspath(path), "new": newpath,
                        "new_name": newname})
        progress(int((i / max(len(files), 1)) * 50))
    # collision analysis
    collisions = []
    seen_targets = {}
    for p in planned:
        t = os.path.normcase(os.path.abspath(p["new"]))
        if p["old"] == p["new"]:
            collisions.append({"old": p["old"], "new": p["new"], "reason": "unchanged"})
        if t in seen_targets:
            collisions.append({"old": p["old"], "new": p["new"],
                               "reason": f"duplicate target (also from {seen_targets[t]})"})
        else:
            seen_targets[t] = p["old"]
        if os.path.exists(p["new"]) and os.path.abspath(p["new"]) not in [q["old"] for q in planned]:
            collisions.append({"old": p["old"], "new": p["new"], "reason": "target already exists"})
    progress(100)
    return planned, collisions


def op_preview(args, outdir):
    files = require_arg(args, "files")
    if not isinstance(files, list) or not files:
        raise ValueError("files must be a non-empty list")
    mapping = args.get("mapping")
    pattern = args.get("pattern")
    if not mapping and not pattern:
        raise ValueError("Provide mapping or pattern")
    planned, collisions = _plan(files, mapping, pattern)
    return {"outputs": [], "info": {
        "planned": planned, "collisions": collisions,
        "can_apply": len(collisions) == 0,
    }}


def op_apply(args, outdir):
    files = require_arg(args, "files")
    if not isinstance(files, list) or not files:
        raise ValueError("files must be a non-empty list")
    if args.get("confirmed") is not True:
        return {"success": False, "error": "Refusing to rename: confirmed must be true",
                "outputs": [], "info": {}}
    mapping = args.get("mapping")
    pattern = args.get("pattern")
    if not mapping and not pattern:
        raise ValueError("Provide mapping or pattern")
    planned, collisions = _plan(files, mapping, pattern)
    if collisions:
        return {"success": False,
                "error": f"Batch aborted: {len(collisions)} collision(s) would occur; no files renamed",
                "outputs": [], "info": {"planned": planned, "collisions": collisions}}
    done = []
    try:
        for k, p in enumerate(planned):
            check_cancel()
            os.rename(p["old"], p["new"])
            done.append({"old": p["old"], "new": p["new"]})
            log(f"renamed {p['old']} -> {p['new']}")
            progress(int(((k + 1) / max(len(planned), 1)) * 100))
    except Exception as e:
        # best-effort rollback of already-renamed pairs
        for d in reversed(done):
            try:
                if os.path.exists(d["new"]) and not os.path.exists(d["old"]):
                    os.rename(d["new"], d["old"])
            except Exception:
                pass
        raise RuntimeError(f"Rename failed partway and was rolled back: {e}")
    return {"outputs": [], "info": {"renamed": done, "count": len(done)}}


OPS = {"preview": op_preview, "apply": op_apply}

if __name__ == "__main__":
    run_tool(OPS)
