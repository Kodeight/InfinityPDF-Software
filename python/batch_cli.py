#!/usr/bin/env python3
"""
CLI script for batch generation of personalized PDFs from PPTX.
Usage: python batch_cli.py <pptx_file> <student_file> <output_folder> [options]
"""

import sys
import os
import json
import argparse
from pathlib import Path
import pandas as pd

def parse_student_file(file_path):
    """Parse student list from CSV or XLSX file"""
    file_ext = file_path.lower().split('.')[-1]

    if file_ext == 'csv':
        df = pd.read_csv(file_path)
    elif file_ext == 'xlsx':
        df = pd.read_excel(file_path, engine='openpyxl')
    else:
        raise ValueError("File must be CSV or XLSX format")

    df.columns = df.columns.str.lower()

    if 'name' not in df.columns:
        raise ValueError("File must contain a 'name' column")

    students = []
    for _, row in df.iterrows():
        student = {'name': str(row['name']).strip()}
        if 'id' in df.columns:
            student['id'] = str(row['id']).strip()
        if 'class' in df.columns:
            student['class'] = str(row['class']).strip()
        if 'email' in df.columns:
            student['email'] = str(row['email']).strip()
        students.append(student)

    return students

def main():
    parser = argparse.ArgumentParser(description='Generate personalized PDFs from PPTX')
    parser.add_argument('pptx_file', help='Path to PPTX file')
    parser.add_argument('student_file', help='Path to student CSV or XLSX file')
    parser.add_argument('output_folder', help='Output folder for generated PDFs')
    
    # --- ADDED ALL NEW OPTIONS ---
    parser.add_argument('--spacing', type=int, default=0, help='Letter spacing in pixels')
    parser.add_argument('--rotation', type=int, default=30, help='Watermark rotation in degrees')
    parser.add_argument('--font-size', type=int, default=36, help='Watermark font size in points')
    parser.add_argument('--opacity', type=int, default=20, help='Watermark opacity (1-100)')
    parser.add_argument('--diagonal', action='store_true', help='Use centered, 45-degree diagonal watermark')
    parser.add_argument('--positionX', type=int, default=50, help='Watermark X position (%)')
    parser.add_argument('--positionY', type=int, default=50, help='Watermark Y position (%)')
    
    # PDF Restrictions
    parser.add_argument('--disablePrinting', action='store_true', help='Disable PDF printing')
    parser.add_argument('--disableCopying', action='store_true', help='Disable PDF copying')
    parser.add_argument('--disableEditing', action='store_true', help='Disable PDF editing')

    args = parser.parse_args()

    # Validate inputs
    if not os.path.exists(args.pptx_file):
        print(f"Error: PPTX file '{args.pptx_file}' not found")
        sys.exit(1)

    if not os.path.exists(args.student_file):
        print(f"Error: Student file '{args.student_file}' not found")
        sys.exit(1)

    if not args.pptx_file.lower().endswith('.pptx'):
        print("Error: PPTX file must have .pptx extension")
        sys.exit(1)

    if not args.student_file.lower().endswith(('.csv', '.xlsx')):
        print("Error: Student file must be CSV or XLSX format")
        sys.exit(1)

    # Parse student list
    try:
        students = parse_student_file(args.student_file)
        print(f"Loaded {len(students)} students from {args.student_file}")
    except Exception as e:
        print(f"Error parsing student file: {e}")
        sys.exit(1)

    # Prepare data for convert.py
    student_list = {
        'students': students,
        'uploadedAt': 'CLI',
        'filename': os.path.basename(args.student_file)
    }

    watermark_options = {
        'spacing': args.spacing,
        'rotation': args.rotation,
        'fontSize': args.font_size,
        'opacity': args.opacity,
        'diagonal': args.diagonal,
        'positionX': args.positionX,
        'positionY': args.positionY,
        'pdfRestrictions': {
            'disablePrinting': args.disablePrinting,
            'disableCopying': args.disableCopying,
            'disableEditing': args.disableEditing
        }
    }

    # Import and run convert.py logic
    # Assumes convert.py is in the same directory or python/ subdirectory
    script_dir = os.path.dirname(__file__)
    if os.path.exists(os.path.join(script_dir, 'convert.py')):
         sys.path.insert(0, script_dir)
    elif os.path.exists(os.path.join(script_dir, '../python/convert.py')):
         sys.path.insert(0, os.path.join(script_dir, '../python'))
    else:
        print("Error: convert.py not found.")
        sys.exit(1)
        
    import convert

    # Run conversion
    try:
        convert.main_with_args(
            args.pptx_file,
            args.output_folder,
            json.dumps(student_list),
            json.dumps(watermark_options)
        )
        print(f"\nBatch generation completed. PDFs saved in {args.output_folder}")
    except Exception as e:
        print(f"Error during conversion: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()