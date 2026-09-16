<#
.SYNOPSIS
  Vendors the Tesseract OCR engine + eng/ara/fra language data into
  thirdparty/tesseract (gitignored binaries; README committed).
.DESCRIPTION
  Requires network access. Downloads the UB Mannheim Tesseract 5 portable
  build and tessdata_fast language files, verifies sizes, and lays them out
  as thirdparty/tesseract/README.md describes. Re-run to upgrade versions.
#>
[CmdletBinding()]
param(
  [string]$TesseractVersion = "5.5.0",
  [string]$TargetDir = (Join-Path $PSScriptRoot "tesseract")
)

$ErrorActionPreference = "Stop"

$BinDir = Join-Path $TargetDir "bin"
$DataDir = Join-Path $TargetDir "tessdata"
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null

$ZipUrl = "https://github.com/UB-Mannheim/tesseract/releases/download/v$TesseractVersion/tesseract-ocr-w64-setup-v$TesseractVersion.exe"
# NOTE: UB-Mannheim also publishes .zip archives; prefer a portable zip when
# available for the requested version and extract tesseract.exe + dlls.
$TmpZip = Join-Path ([IO.Path]::GetTempPath()) "tesseract-bundle.zip"
Write-Host "Downloading Tesseract $TesseractVersion ..."
Invoke-WebRequest -Uri $ZipUrl -OutFile $TmpZip

$TmpDir = Join-Path ([IO.Path]::GetTempPath()) ("tesseract-bundle-" + [Guid]::NewGuid().ToString("N"))
Expand-Archive -Path $TmpZip -DestinationPath $TmpDir -Force
$Exe = Get-ChildItem -Path $TmpDir -Filter "tesseract.exe" -Recurse | Select-Object -First 1
if (-not $Exe) { throw "tesseract.exe not found in downloaded bundle" }
Copy-Item -Path (Join-Path $Exe.DirectoryName "*") -Destination $BinDir -Recurse -Force
Remove-Item -Path $TmpZip -Force -ErrorAction SilentlyContinue
Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue

foreach ($lang in @("eng", "ara", "fra")) {
  $Url = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$lang.traineddata"
  $Dest = Join-Path $DataDir "$lang.traineddata"
  Write-Host "Downloading $lang.traineddata ..."
  Invoke-WebRequest -Uri $Url -OutFile $Dest
  $Size = (Get-Item $Dest).Length
  if ($Size -lt 100KB) { throw "$lang.traineddata suspiciously small ($Size bytes)" }
}

& (Join-Path $BinDir "tesseract.exe") --list-langs | Write-Host
Write-Host "Vendored OK in $TargetDir"
