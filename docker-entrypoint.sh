#!/usr/bin/env bash
set -e

echo "[NetMap Docker] Starting NetMap Scanner API & Web UI on http://0.0.0.0:8000..."
exec python3 backend/main.py
