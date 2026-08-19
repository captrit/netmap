#!/usr/bin/env bash
# Grants the scanner binary (+ arp-scan/nmap) raw-socket capability so the
# backend never needs to run as root, and you never need to babysit sudo.
#
# Why setcap instead of "just run the backend as root": this app is a
# FastAPI/uvicorn server (with --reload and CORS "*" by default) meant to be
# open-sourced. Making "run the whole web server as root" the documented
# default means anyone who clones this repo and follows the README is one
# framework/dependency RCE away from a full root compromise. setcap grants
# only the exact capability (CAP_NET_RAW/CAP_NET_ADMIN) these specific
# binaries need for raw ICMP/ARP sockets — nothing else escalates, and the
# backend process itself stays an unprivileged user the entire time.
#
# Effect is permanent EXCEPT the scanner binary itself, which loses its
# capability every time you rebuild it (`cargo build --release` produces a
# new file). Re-run this script (or just the last line) after every rebuild.
#
# Usage: ./setup-privileges.sh   (will prompt for your sudo password once)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="$SCRIPT_DIR/target/release/netmap-scanner"

if [ ! -f "$BINARY" ]; then
    echo "error: $BINARY not found — run 'cargo build --release' first." >&2
    exit 1
fi

ARP_SCAN_BIN="$(command -v arp-scan || true)"
NMAP_BIN="$(command -v nmap || true)"

echo "Granting cap_net_raw,cap_net_admin+eip to:"
echo "  - $BINARY"
[ -n "$ARP_SCAN_BIN" ] && echo "  - $ARP_SCAN_BIN" || echo "  - (arp-scan not found on PATH, skipping)"
[ -n "$NMAP_BIN" ] && echo "  - $NMAP_BIN" || echo "  - (nmap not found on PATH, skipping)"
echo

sudo setcap cap_net_raw,cap_net_admin+eip "$BINARY"
[ -n "$ARP_SCAN_BIN" ] && sudo setcap cap_net_raw,cap_net_admin+eip "$ARP_SCAN_BIN"
[ -n "$NMAP_BIN" ] && sudo setcap cap_net_raw+eip "$NMAP_BIN"

echo
echo "Done. Verify with: getcap $BINARY"
echo "The backend (Python/uvicorn) does NOT need sudo — start it as your normal user."
echo
echo "NOT granted by default: policy-based IPsec VPN visibility (\`ip xfrm policy\`)"
echo "needs the system 'ip' binary itself to have cap_net_admin. That's a bigger grant"
echo "than the above — 'ip' can also WRITE routes/interfaces/XFRM state, and every"
echo "process on the system that calls it would inherit the same capability, not just"
echo "this scanner. Only run this if you understand and accept that tradeoff:"
echo "  sudo setcap cap_net_admin+eip \$(command -v ip)"
