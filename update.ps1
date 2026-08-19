# =====================================================================
# NetMap Auto-Updater (Windows PowerShell)
# Pulls latest changes from git main branch, rebuilds Rust scanner,
# updates Python & Frontend dependencies.
# =====================================================================

$ErrorActionPreference = "Continue"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      NetMap Windows System Auto-Updater  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Pull latest git changes
if (Test-Path ".git") {
    Write-Host "[NetMap Updater] Fetching latest updates from git repository..." -ForegroundColor Yellow
    git pull origin main
}

# 2. Rebuild Rust Scanner Engine
Write-Host "[NetMap Updater] Rebuilding Rust scanning engine (netmap-scanner)..." -ForegroundColor Yellow
Set-Location scanner
cargo build --release
Set-Location ..

# 3. Update Python dependencies
Write-Host "[NetMap Updater] Updating Python backend dependencies..." -ForegroundColor Yellow
if (Test-Path "venv\Scripts\pip.exe") {
    .\venv\Scripts\pip.exe install -r requirements.txt --quiet
} else {
    pip install -r requirements.txt --quiet
}

# 4. Update & Rebuild Frontend
if (Test-Path "frontend") {
    Write-Host "[NetMap Updater] Updating React frontend & building production bundle..." -ForegroundColor Yellow
    Set-Location frontend
    npm install --quiet
    npm run build
    Set-Location ..
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "   NetMap successfully updated to latest! " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
