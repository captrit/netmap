#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if user requested auto-update
if [ "${1:-}" = "--update" ] || [ "${1:-}" = "-u" ] || [ "${1:-}" = "update" ]; then
    echo "[NetMap] Triggering System Auto-Update..."
    ./update.sh
    echo ""
fi

# Detect virtual environment python or fall back to system python
if [ -f "venv/bin/python3" ]; then
    PYTHON_BIN="venv/bin/python3"
elif [ -f "../venv/bin/python3" ]; then
    PYTHON_BIN="../venv/bin/python3"
else
    PYTHON_BIN="python3"
fi

echo "[NetMap] Building Rust Scanner binary..."
cd scanner && cargo build --release
cd "$SCRIPT_DIR"

# Re-apply setcap if capability binary is present and setcap command exists
if command -v setcap &>/dev/null && [ -f "scanner/target/release/netmap-scanner" ]; then
    sudo setcap cap_net_raw,cap_net_admin+eip scanner/target/release/netmap-scanner 2>/dev/null || true
fi

echo "[NetMap] Starting FastAPI Backend on http://localhost:8000 using $PYTHON_BIN..."
$PYTHON_BIN backend/main.py &
BACKEND_PID=$!

echo "[NetMap] Starting React Frontend on http://localhost:3000..."
cd frontend && npm run dev &
FRONTEND_PID=$!

cleanup() {
    echo -e "\n[NetMap] Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup INT TERM

echo "[NetMap] System running! Press Ctrl+C to stop."
wait

