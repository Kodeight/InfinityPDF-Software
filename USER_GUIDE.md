# PPTX to Personalized PDF Converter - User Guide

## Overview
This desktop application converts PowerPoint presentations (.pptx) into personalized, permission-locked PDF files for each student in your class. Each PDF includes the student's name as a semi-transparent watermark on every page, and permissions are set to allow only printing.

## Installation
1. Ensure you have Node.js and Python installed on your system.
2. Clone or download the project files.
3. Install dependencies:
   ```
   npm install
   pip install -r requirements.txt
   ```
4. Run the application:
   ```
   npm start
   ```

## Step-by-Step Usage

### 1. Upload Student List
- Click "Upload Student Sheet" in the left panel.
- Select a CSV or Excel (.xlsx) file containing student information.
- The file must include a column named "name" (case-insensitive).
- Optional columns: "id", "class", "email".
- The list will be stored locally and reused for future conversions until replaced.

### 2. Upload PPTX File
- Click "Upload PPTX" in the center panel.
- Select your PowerPoint presentation file.
- Adjust watermark options if desired:
  - Spacing: Distance between watermark repetitions (pixels)
  - Rotation: Angle of watermark text (degrees)
  - Font Size: Size of watermark text (points)
- Opacity is fixed at 50% for readability.

### 3. Preview
- In the right panel, select a student from the dropdown.
- Toggle "Show Watermark" to preview how the watermark will appear.
- This gives you an idea of placement and visibility.

### 4. Generate PDFs
- Click "Browse" to select the output folder where PDFs will be saved.
- Click "Generate All" to start the conversion process.
- Monitor progress in the bottom panel.
- PDFs will be created in a new subfolder within your selected directory.

## Output
- Each student gets a personalized PDF named `{Student Name} - {Original PPTX Name}.pdf`
- File names are sanitized to remove special characters.
- PDFs are permission-locked: printing allowed, copying/editing disabled.
- A random owner password is generated for each PDF (displayed in status).

## CLI Usage (Optional)
For batch processing without the GUI:

```
python python/batch_cli.py presentation.pptx students.csv output_folder [options]
```

Options:
- `--spacing`: Watermark spacing (default: 100)
- `--rotation`: Watermark rotation (default: 30)
- `--font-size`: Watermark font size (default: 36)

## Security & Privacy Notes
- Student data is stored locally using electron-store.
- PDFs are encrypted with owner passwords to prevent unauthorized copying.
- Clear stored student lists when finished using "Clear Stored List".
- Generated PDFs contain personal data - handle appropriately.

## Troubleshooting
- Ensure PPTX files are not corrupted.
- Check that student CSV has a "name" column.
- Verify Python dependencies are installed.
- If generation fails, check console for error messages.

## Requirements
- Node.js 14+
- Python 3.7+
- Windows/Mac/Linux (cross-platform)

## Support
For issues or questions, check the console output for error details or contact the developer.
