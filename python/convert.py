import sys
import os
import json
import tempfile
from pathlib import Path
import random
import string
import traceback

import win32com.client
import pythoncom
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color
from PIL import Image

# =====================================================
# HELPERS
# =====================================================

def generate_owner_password():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=16))


def sanitize_filename(name):
    return "".join(
        c for c in name if c.isalnum() or c in (" ", "-", "_")
    ).rstrip()


def map_pdf_permissions(restrictions):
    perms = 0

    if restrictions.get("allowPrinting"):
        perms |= 0b100
    if restrictions.get("allowCopying"):
        perms |= 0b10000
    if restrictions.get("allowEditing"):
        perms |= 0b10
    if restrictions.get("allowAnnotate"):
        perms |= 0b1000
    if restrictions.get("allowAssemble"):
        perms |= 0b100000
    if restrictions.get("allowFillForm"):
        perms |= 0b1000000

    return perms


# =====================================================
# PPTX → PDF
# =====================================================

def pptx_to_pdf(pptx_path, output_pdf_path):
    pythoncom.CoInitialize()
    powerpoint = None
    prs = None

    try:
        powerpoint = win32com.client.Dispatch("PowerPoint.Application")
        prs = powerpoint.Presentations.Open(
            os.path.abspath(pptx_path),
            WithWindow=False
        )
        prs.SaveAs(os.path.abspath(output_pdf_path), 32)
    finally:
        if prs:
            prs.Close()
        if powerpoint:
            powerpoint.Quit()
        pythoncom.CoUninitialize()


# =====================================================
# DOCX → PDF
# =====================================================

def docx_to_pdf(docx_path, output_pdf_path):
    pythoncom.CoInitialize()
    word = None
    doc = None

    try:
        word = win32com.client.Dispatch("Word.Application")
        doc = word.Documents.Open(os.path.abspath(docx_path), ReadOnly=True)
        doc.SaveAs(os.path.abspath(output_pdf_path), FileFormat=17)  # 17 = PDF
    finally:
        if doc:
            doc.Close()
        if word:
            word.Quit()
        pythoncom.CoUninitialize()


# =====================================================
# XLSX → PDF
# =====================================================

def xlsx_to_pdf(xlsx_path, output_pdf_path):
    pythoncom.CoInitialize()
    excel = None
    wb = None

    try:
        excel = win32com.client.Dispatch("Excel.Application")
        wb = excel.Workbooks.Open(os.path.abspath(xlsx_path), ReadOnly=True)
        wb.ExportAsFixedFormat(0, os.path.abspath(output_pdf_path))  # 0 = PDF
    finally:
        if wb:
            wb.Close()
        if excel:
            excel.Quit()
        pythoncom.CoUninitialize()


# =====================================================
# IMAGE → PDF
# =====================================================

def image_to_pdf(image_path, output_pdf_path):
    image = Image.open(image_path)
    # Convert to RGB if necessary (for PNG with transparency)
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGB")
    image.save(output_pdf_path, "PDF", resolution=100.0)


# =====================================================
# WATERMARK
# =====================================================

def apply_watermark(input_pdf, text, options):
    reader = PdfReader(input_pdf)
    writer = PdfWriter()

    opacity = options.get("opacity", 20) / 100
    font_size = options.get("fontSize", 36)
    rotation = options.get("rotation", -30)
    diagonal = options.get("diagonal", False)
    pos_x = options.get("positionX", 50) / 100
    pos_y = options.get("positionY", 50) / 100

    for page in reader.pages:
        packet = tempfile.TemporaryFile()
        w, h = float(page.mediabox.width), float(page.mediabox.height)

        can = canvas.Canvas(packet, pagesize=(w, h))
        can.setFont("Helvetica-Bold", font_size)
        can.setFillColor(Color(0, 0, 0, alpha=opacity))

        if diagonal:
            can.translate(w / 2, h / 2)
            can.rotate(45)
            can.drawCentredString(0, 0, text)
        else:
            can.translate(w * pos_x, h * pos_y)
            can.rotate(rotation)
            can.drawCentredString(0, 0, text)

        can.save()
        packet.seek(0)

        watermark = PdfReader(packet)
        page.merge_page(watermark.pages[0])
        writer.add_page(page)

    return writer


# =====================================================
# ENCRYPT & SAVE
# =====================================================

def write_encrypted_pdf(writer, output_path, restrictions):
    owner_pw = generate_owner_password()
    perms = map_pdf_permissions(restrictions)

    with open(output_path, "wb") as f:
        writer.encrypt(
            user_password="",
            owner_password=owner_pw,
            permissions=perms
        )
        writer.write(f)

    return owner_pw


# =====================================================
# MAIN
# =====================================================

def main():
    """
    Expected argv:
    1: appMode
    2: inputPath (pptx or pdf)
    3: outputFolder
    4: studentList JSON
    5: watermarkOptions JSON
    6: pdfRestrictions JSON
    """

    try:
        app_mode = sys.argv[1]
        input_path = sys.argv[2]
        output_folder = sys.argv[3]

        student_list = json.loads(sys.argv[4]) if sys.argv[4] else {}
        watermark_options = json.loads(sys.argv[5]) if sys.argv[5] else {}
        pdf_restrictions = json.loads(sys.argv[6]) if len(sys.argv) > 6 else {}

        os.makedirs(output_folder, exist_ok=True)

        # =================================================
        # SIMPLE MODE (PPTX → PDF, NO WATERMARK)
        # =================================================
        if app_mode == "simple":
            output_pdf = os.path.join(
                output_folder,
                sanitize_filename(Path(input_path).stem) + ".pdf"
            )

            pptx_to_pdf(input_path, output_pdf)
            print("PROGRESS:70")

            reader = PdfReader(output_pdf)
            writer = PdfWriter()

            for page in reader.pages:
                writer.add_page(page)

            write_encrypted_pdf(writer, output_pdf, pdf_restrictions)
            print("PROGRESS:100")
            return

        # =================================================
        # PERMISSIONS MODE (PDF → SECURED PDF)
        # =================================================
        if app_mode == "permissions":
            reader = PdfReader(input_path)
            writer = PdfWriter()

            for page in reader.pages:
                writer.add_page(page)

            output_pdf = os.path.join(
                output_folder,
                sanitize_filename(Path(input_path).stem) + "_secured.pdf"
            )

            write_encrypted_pdf(writer, output_pdf, pdf_restrictions)
            print("PROGRESS:100")
            return

        # =================================================
        # UNIVERSAL MODE (DOCX/XLSX/IMAGE → PDF)
        # =================================================
        if app_mode == "universal":
            output_pdf = os.path.join(
                output_folder,
                sanitize_filename(Path(input_path).stem) + ".pdf"
            )

            file_ext = Path(input_path).suffix.lower()

            if file_ext in ['.doc', '.docx']:
                docx_to_pdf(input_path, output_pdf)
            elif file_ext in ['.xls', '.xlsx']:
                xlsx_to_pdf(input_path, output_pdf)
            elif file_ext in ['.png', '.jpg', '.jpeg']:
                image_to_pdf(input_path, output_pdf)
            else:
                raise ValueError(f"Unsupported file type: {file_ext}")

            print("PROGRESS:70")

            reader = PdfReader(output_pdf)
            writer = PdfWriter()

            for page in reader.pages:
                writer.add_page(page)

            write_encrypted_pdf(writer, output_pdf, pdf_restrictions)
            print("PROGRESS:100")
            return

        # =================================================
        # PERSONALIZED MODE
        # =================================================
        with tempfile.TemporaryDirectory() as tmp:
            base_pdf = os.path.join(tmp, "base.pdf")

            pptx_to_pdf(input_path, base_pdf)
            print("PROGRESS:10")

            students = student_list.get("students", [])
            total = len(students)

            for i, student in enumerate(students, start=1):
                percent = 10 + int((i / total) * 90)
                print(f"PROGRESS:{percent}")
                print(f"STATUS:Processing {student['name']}")

                writer = apply_watermark(
                    base_pdf,
                    student["name"],
                    watermark_options
                )

                out_name = sanitize_filename(
                    f"{Path(input_path).stem} - {student['name']}"
                ) + ".pdf"

                out_path = os.path.join(output_folder, out_name)

                write_encrypted_pdf(writer, out_path, pdf_restrictions)

            print("PROGRESS:100")
            print("STATUS:All PDFs generated successfully")

    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
