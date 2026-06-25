# Single-file Stockfish installer. Run this in PowerShell — it
# downloads Stockfish and sets up the bridge in one go.
#
# Usage (any of these):
#   powershell -ExecutionPolicy Bypass -File setup-stockfish.ps1
#   iwr -useb https://eloevader.github.io/ChessEngine/setup-stockfish.ps1 | iex
#
# What it does:
#   1. Downloads the official Stockfish Windows AVX2 build (~5MB)
#   2. Unpacks it to .\engine\
#   3. Starts the bridge in the foreground
#   4. You can leave the bridge running and open the chess app
$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
if (-not $repoRoot) { $repoRoot = (Get-Location).Path }
$engineDir = Join-Path $repoRoot 'engine'
if (!(Test-Path $engineDir)) {
  New-Item -ItemType Directory -Path $engineDir | Out-Null
}

# Clean up any half-extracted Stockfish source from a previous failed run
Get-ChildItem -Path $engineDir -Filter 'AUTHORS' -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Cleaning leftover extraction at $($_.DirectoryName) ..." -ForegroundColor Yellow
  Remove-Item $_.DirectoryName -Recurse -Force -ErrorAction SilentlyContinue
}

# 1. Find or download stockfish.exe
$exe = Get-ChildItem -Path $engineDir -Filter 'stockfish*.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) {
  # Try sibling locations too
  $exe = Get-ChildItem -Path $repoRoot -Filter 'stockfish*.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (-not $exe) {
  Write-Host "Downloading Stockfish..." -ForegroundColor Cyan
  $url = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-windows-x86-64-avx2.zip'
  $zip = Join-Path $env:TEMP 'stockfish-windows.zip'
  $extractRoot = Join-Path $env:TEMP 'stockfish-extract'
  if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
  New-Item -ItemType Directory -Path $extractRoot | Out-Null
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  } catch {
    Write-Host "Download failed: $_" -ForegroundColor Red
    Write-Host "Please check your internet connection and try again." -ForegroundColor Yellow
    exit 1
  }
  Expand-Archive -Path $zip -DestinationPath $extractRoot -Force
  # The zip contains a `stockfish/` folder with the binary inside.
  # Move it directly to engineDir/stockfish.exe for a clean path.
  $found = Get-ChildItem -Path $extractRoot -Filter 'stockfish*.exe' -Recurse | Select-Object -First 1
  if ($found) {
    $dest = Join-Path $engineDir 'stockfish.exe'
    Move-Item -LiteralPath $found.FullName -Destination $dest -Force
    Write-Host "Installed to: $dest" -ForegroundColor Green
    # Clean up the rest of the extracted source tree
    Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $zip -ErrorAction SilentlyContinue
  } else {
    Write-Host "Could not locate stockfish binary inside the downloaded zip." -ForegroundColor Red
    exit 1
  }
  $exe = Get-ChildItem -Path $engineDir -Filter 'stockfish.exe' | Select-Object -First 1
}

if (-not $exe) {
  Write-Host "Could not locate stockfish.exe after download." -ForegroundColor Red
  exit 1
}
Write-Host "Stockfish found at: $($exe.FullName)" -ForegroundColor Green

# 2. Find the bridge script
$bridge = Join-Path $repoRoot 'scripts\stockfish-bridge.cjs'
if (-not (Test-Path $bridge)) {
  $bridge = Join-Path $repoRoot '..\scripts\stockfish-bridge.cjs'
}
if (-not (Test-Path $bridge)) {
  Write-Host "Could not find stockfish-bridge.cjs at $bridge" -ForegroundColor Red
  exit 1
}

# 3. Check node
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "Node.js is not installed or not on PATH." -ForegroundColor Red
  Write-Host "Download it from https://nodejs.org (LTS is fine)." -ForegroundColor Yellow
  exit 1
}
Write-Host "Using node: $node" -ForegroundColor Green

# 4. Launch the bridge
Write-Host ""
Write-Host "Starting Stockfish bridge on ws://localhost:8765 ..." -ForegroundColor Cyan
Write-Host "Open the chess app in your browser." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the bridge." -ForegroundColor Yellow
Write-Host ""
& $node $bridge "`"$($exe.FullName)`""
