#!/usr/bin/env bash
set -e

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
cd ..

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
