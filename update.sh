#!/usr/bin/env bash
# =====================================================================
# NetMap Auto-Updater
# Pulls latest changes from git main branch, rebuilds Rust scanner,
# updates Python & Frontend dependencies, and re-applies setcap privileges.
# =====================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "         NetMap System Auto-Updater       "
echo "=========================================="

# 1. Check Git status and pull latest main branch
if [ -d ".git" ]; then
    echo "[NetMap Updater] Fetching latest updates from git repository..."
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    
    HAS_LOCAL_CHANGES=false
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        echo "[NetMap Updater] Stashing local uncommitted changes..."
        git stash save -u "NetMap Auto-Update Auto-Stash $(date)"
        HAS_LOCAL_CHANGES=true
    fi

    echo "[NetMap Updater] Pulling latest updates from origin/$CURRENT_BRANCH..."
    git pull origin "$CURRENT_BRANCH" || {
        echo "[NetMap Updater] Warning: git pull returned non-zero exit code."
    }

    if [ "$HAS_LOCAL_CHANGES" = true ]; then
        echo "[NetMap Updater] Restoring stashed local changes..."
        git stash pop 2>/dev/null || echo "[NetMap Updater] Note: Check 'git stash list' if local conflict occurred."
    fi
else
    echo "[NetMap Updater] Warning: .git directory not found. Skipping git pull."
fi

# 2. Rebuild Rust Scanner Engine
echo "[NetMap Updater] Rebuilding Rust scanning engine (netmap-scanner)..."
cd "$SCRIPT_DIR/scanner"
cargo build --release
cd "$SCRIPT_DIR"

# Detect Operating System
OS_NAME="$(uname -s 2>/dev/null || echo "Unknown")"

# 3. Handle OS-Specific Privilege / Driver Settings
case "$OS_NAME" in
    Linux*)
        if command -v setcap &>/dev/null; then
            echo "[NetMap Updater] Re-applying Linux raw socket capabilities (setcap)..."
            if [ -f "$SCRIPT_DIR/scanner/target/release/netmap-scanner" ]; then
                sudo setcap cap_net_raw,cap_net_admin+eip "$SCRIPT_DIR/scanner/target/release/netmap-scanner" 2>/dev/null || \
                echo "[NetMap Updater] Note: If setcap prompts for sudo, run './scanner/setup-privileges.sh'."
            fi
        fi
        ;;
    Darwin*)
        echo "[NetMap Updater] macOS detected — checking BPF device permissions..."
        if [ -e "/dev/bpf0" ] && [ ! -w "/dev/bpf0" ]; then
            echo "[NetMap Updater] Note: Run 'sudo chown \$USER:admin /dev/bpf*' if packet capture requires BPF permissions."
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        echo "[NetMap Updater] Windows (Git Bash/MSYS) detected — ensure Npcap is installed for raw packet scanning."
        ;;
    *)
        echo "[NetMap Updater] Operating System: $OS_NAME"
        ;;
esac

# 4. Update Python Backend dependencies
if [ -f "$SCRIPT_DIR/venv/bin/activate" ]; then
    echo "[NetMap Updater] Updating Python backend dependencies in virtual environment..."
    source "$SCRIPT_DIR/venv/bin/activate"
    pip install -r requirements.txt --quiet
elif command -v pip3 &>/dev/null; then
    echo "[NetMap Updater] Updating Python backend dependencies..."
    pip3 install -r requirements.txt --quiet 2>/dev/null || true
fi

# 5. Update & Rebuild Frontend
if [ -d "$SCRIPT_DIR/frontend" ]; then
    echo "[NetMap Updater] Updating React frontend dependencies and rebuilding production bundle..."
    cd "$SCRIPT_DIR/frontend"
    if [ -f "package.json" ]; then
        npm install --quiet
        npm run build --quiet 2>/dev/null || npm run build
    fi
    cd "$SCRIPT_DIR"
fi

echo "=========================================="
echo "   NetMap successfully updated to latest! "
echo "   Run './start_netmap.sh' to launch.     "
echo "=========================================="
