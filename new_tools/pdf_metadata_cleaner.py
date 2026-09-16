#!/usr/bin/env python3
"""PDF METADATA CLEANER — inspect/strip metadata, XMP, attachments, comments (new tool, additive).

CLI: python pdf_metadata_cleaner.py <operation> <args-json> <output-dir>
Ops:
  inspect{pdf} -> info{metadata dict, has_xmp, attachments[], comment_count}
  clean{pdf,fields{title,author,subject,keywords,creator,producer} (empty string = erase),
        strip_xmp(bool),remove_attachments(bool),remove_comments(bool)}
    -> new PDF via fitz (set_metadata/del_xml_metadata/embfile_del/delete_annot) + garbage save.

NOTE: removal covers handled structures only (document info dict, XMP packet,
embedded files via embfile APIs, Text/FreeText comment annots). Other hidden
data (e.g. incremental-update remnants beyond garbage collection, custom
non-standard structures) may remain; output is garbage-collected but not forensically wiped.
"""

import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (
    check_cancel, log, progress, require_arg, run_tool,
    unique_path, validate_pdf,
)
import fitz


def _inspect_doc(doc):
    meta = dict(doc.metadata or {})
    try:
        names = list(doc.embfile_names() or [])
    except Exception:
        names = []
    has_xmp = False
    try:
        if hasattr(doc, "xref_xml_metadata"):
            xml = doc.xref_xml_metadata(-1)
            has_xmp = bool(xml)
        elif hasattr(doc, "get_xml_metadata"):
            has_xmp = bool(doc.get_xml_metadata())
    except Exception:
        has_xmp = False
    comments = 0
    for page in doc:
        try:
            annots = list(page.annots() or [])
        except Exception:
            continue
        for a in annots:
            try:
                if a.type[0] in (0, 2):
                    comments += 1
            except Exception:
                continue
    return meta, has_xmp, names, comments


def op_inspect(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    doc = fitz.open(pdf)
    try:
        check_cancel()
        meta, has_xmp, names, comments = _inspect_doc(doc)
        progress(100)
        return {"outputs": [], "info": {"metadata": {k: (v or "") for k, v in meta.items()},
                                        "has_xmp": has_xmp, "attachments": names,
                                        "attachment_count": len(names),
                                        "comment_count": comments, "pages": len(doc)}}
    finally:
        doc.close()


def op_clean(args, outdir):
    pdf = validate_pdf(require_arg(args, "pdf"))
    fields = args.get("fields", {}) or {}
    strip_xmp = bool(args.get("strip_xmp", False))
    remove_attachments = bool(args.get("remove_attachments", False))
    remove_comments = bool(args.get("remove_comments", False))
    if not isinstance(fields, dict):
        raise ValueError("'fields' must be an object")
    allowed = ("title", "author", "subject", "keywords", "creator", "producer")
    doc = fitz.open(pdf)
    try:
        meta = dict(doc.metadata or {})
        for k, v in fields.items():
            check_cancel()
            kl = str(k).strip().lower()
            if kl not in allowed:
                log(f"ignoring unknown metadata field: {k}")
                continue
            meta[kl] = "" if v is None else str(v)
        doc.set_metadata(meta)
        progress(25)
        xmp_stripped = False
        if strip_xmp:
            try:
                doc.del_xml_metadata()
                xmp_stripped = True
            except Exception as e:
                log(f"del_xml_metadata skipped: {e}")
        progress(45)
        removed_attachments = []
        if remove_attachments:
            try:
                names = list(doc.embfile_names() or [])
            except Exception as e:
                log(f"embfile_names skipped: {e}")
                names = []
            for n in names:
                check_cancel()
                try:
                    doc.embfile_del(n)
                    removed_attachments.append(n)
                except Exception as e:
                    log(f"embfile_del {n} skipped: {e}")
        progress(65)
        removed_comments = 0
        if remove_comments:
            for page in doc:
                check_cancel()
                try:
                    annots = list(page.annots() or [])
                except Exception:
                    continue
                for a in annots:
                    try:
                        if a.type[0] in (0, 2):
                            page.delete_annot(a)
                            removed_comments += 1
                    except Exception as e:
                        log(f"delete_annot skipped: {e}")
        progress(85)
        out = unique_path(outdir, "cleaned", "pdf")
        doc.save(out, garbage=4, deflate=True)
        progress(100)
        return {"outputs": [out], "info": {
            "metadata": {k: (v or "") for k, v in (doc.metadata or {}).items()},
            "fields_set": {k: str(v) for k, v in fields.items()},
            "xmp_stripped": xmp_stripped, "removed_attachments": removed_attachments,
            "removed_comments": removed_comments,
            "note": ("Removal covers handled structures only (info dict, XMP packet, "
                     "embedded files, Text/FreeText comments); other hidden data may remain.")}}
    finally:
        doc.close()


OPS = {"inspect": op_inspect, "clean": op_clean}

if __name__ == "__main__":
    run_tool(OPS)
