# Downloads the official Stockfish Windows binary and installs it
# at engine/stockfish.exe next to this script.
# Usage: powershell -ExecutionPolicy Bypass -File download-stockfish.ps1
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $here '..\engine'
if (!(Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

# Stockfish 17.1 official Windows AVX2 build.
$url = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-windows-x86-64-avx2.zip'
$zip = Join-Path $env:TEMP 'stockfish-windows.zip'
$extractRoot = Join-Path $env:TEMP 'stockfish-extract'
if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
New-Item -ItemType Directory -Path $extractRoot | Out-Null

Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Write-Host "Unpacking ..."
Expand-Archive -Path $zip -DestinationPath $extractRoot -Force
$found = Get-ChildItem -Path $extractRoot -Filter 'stockfish*.exe' -Recurse | Select-Object -First 1
if ($found) {
  $target = Join-Path $dest 'stockfish.exe'
  Move-Item -LiteralPath $found.FullName -Destination $target -Force
  Write-Host "Installed to: $target" -ForegroundColor Green
  Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $zip -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "Next: run the bridge with:"
  Write-Host "  node ..\scripts\stockfish-bridge.js"
} else {
  Write-Host "Could not find the stockfish binary inside the zip." -ForegroundColor Red
  exit 1
}
