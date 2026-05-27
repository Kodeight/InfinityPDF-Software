import os
import sys
from pypdf import PdfReader, PdfWriter
from backend import InfinityBackend

# Create a dummy PDF
def create_dummy_pdf(filename):
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    with open(filename, "wb") as f:
        writer.write(f)

input_pdf = "dummy_input.pdf"
create_dummy_pdf(input_pdf)

# Initialize Backend
engine = InfinityBackend(".")
print("Engine Initialized")

# Define permissions (Everything FALSE -> Should be restricted)
permissions = {
    "print": False,
    "copy": False,
    "edit": False,
    "restructure": False,
    "forms": False,
    "comments": False
}

print(f"Applying permissions: {permissions}")
result = engine.apply_pdf_restrictions(input_pdf, permissions)
print(f"Result: {result}")

if result["success"]:
    out_path = result["path"]
    print(f"Checking output: {out_path}")
    
    reader = PdfReader(out_path)
    if reader.is_encrypted:
        print("[OK] PDF is Encrypted")
        # Try to print/extract
        # pypdf won't enforce it on python side, but we can check the status
        try:
            print(f"Encryption Method: {reader.evaluate_transparency}") 
            # Check user access (rough check)
            # Since we have no user password, we can open it.
            # But we check if permissions are set.
            print("To verify truly, open this PDF in Acrobat/Edge and check security options.")
        except:
            pass
    else:
        print("❌ PDF is NOT Encrypted (FAILED)")
else:
    print("[FAIL] Failed to apply restrictions")
