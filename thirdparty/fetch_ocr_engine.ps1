<#
.SYNOPSIS
  Vendors the Tesseract OCR runtime + eng/ara/fra language data into
  thirdparty/tesseract (gitignored binaries; README committed).
.DESCRIPTION
  NEVER installs anything on the machine. Downloads the vendor artifacts,
  verifies hashes/sizes, and lays them out as thirdparty/tesseract/README.md
  describes. The Tesseract binary arrives as an INNO SETUP INSTALLER which
  must NOT be executed on a locked-down machine: the script stops after
  download+verification and prints the portable-harvest steps for a staging
  machine (extract installer to a folder, copy bin/ + tessdata/ here).

  Verified asset (Sep 2026):
    https://github.com/UB-Mannheim/tesseract/releases/download/v5.4.0.20240606/tesseract-ocr-w64-setup-5.4.0.20240606.exe
    50,175,248 bytes,
    SHA256 C885FFF6998E0608BA4BB8AB51436E1C6775C2BAFC2559A19B423E18678B60C9
#>
[CmdletBinding()]
param(
  [string]$TargetDir = (Join-Path $PSScriptRoot "tesseract"),
  [switch]$SkipBinary
)

$ErrorActionPreference = "Stop"

$BinDir = Join-Path $TargetDir "bin"
$DataDir = Join-Path $TargetDir "tessdata"
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null

# --- Language data: direct download, no installer involved ---
foreach ($lang in @("eng", "ara", "fra")) {
  $Url = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$lang.traineddata"
  $Dest = Join-Path $DataDir "$lang.traineddata"
  Write-Host "Downloading $lang.traineddata ..."
  Invoke-WebRequest -Uri $Url -OutFile $Dest
  $Size = (Get-Item $Dest).Length
  if ($Size -lt 100KB) { throw "$lang.traineddata suspiciously small ($Size bytes)" }
  # traineddata v4 magic: 0x18 followed by 0xFFFFFFFF
  $magic = New-Object byte[] 8
  [IO.File]::OpenRead($Dest).Read($magic, 0, 8) | Out-Null
  if (-not ($magic[0] -eq 0x18 -and $magic[4] -eq 0xFF)) {
    throw "$lang.traineddata failed magic-byte check"
  }
}

if (-not $SkipBinary) {
  $Asset = "tesseract-ocr-w64-setup-5.4.0.20240606.exe"
  $ExpectedSha256 = "C885FFF6998E0608BA4BB8AB51436E1C6775C2BAFC2559A19B423E18678B60C9"
  $ExpectedSize = 50175248
  $Url = "https://github.com/UB-Mannheim/tesseract/releases/download/v5.4.0.20240606/$Asset"
  $Dest = Join-Path ([IO.Path]::GetTempPath()) $Asset
  Write-Host "Downloading $Asset (installer - will NOT be executed) ..."
  Invoke-WebRequest -Uri $Url -OutFile $Dest
  $Got = Get-Item $Dest
  if ($Got.Length -ne $ExpectedSize) { throw "size mismatch: $($Got.Length)" }
  $Hash = (Get-FileHash -LiteralPath $Dest -Algorithm SHA256).Hash
  if ($Hash -ne $ExpectedSha256) { throw "SHA256 mismatch: $Hash" }
  Write-Host "Verified. Harvest the portable runtime on a staging machine:"
  Write-Host "  1. Copy $Dest to the staging machine."
  Write-Host "  2. Extract WITHOUT system install, e.g.:"
  Write-Host "       installer.exe /SILENT /DIR=C:\tessharvest   (then copy files, uninstall)"
  Write-Host "     or unpack with 7-Zip (no execution at all)."
  Write-Host "  3. Copy tesseract.exe + its DLLs into $BinDir"
  Write-Host "  4. Confirm: & '$BinDir\tesseract.exe' --list-langs  (expect eng/ara/fra)"
}

Write-Host "Language data vendored in $DataDir"
