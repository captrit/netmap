# NetMap: High-Performance Network Reconnaissance & Topology Visualizer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Engine: Rust](https://img.shields.io/badge/Engine-Rust%202.0-orange.svg)](scanner/)
[![Backend: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](backend/)
[![Frontend: React](https://img.shields.io/badge/Frontend-React%20%2B%20Tailwind-61DAFB.svg)](frontend/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)

**NetMap** is a high-performance network discovery suite and interactive topology visualizer engineered for cybersecurity professionals, VAPT engineers, and network administrators. Built with a multi-threaded Rust scanning engine, FastAPI backend, and an obsidian-themed React visualizer, NetMap executes multi-layer L2 to L7 network sweeps, deep service banner grabbing, mDNS/NetBIOS/SSL/TTL fingerprinting, and real-time SSE topology streaming.

---

## Core Capabilities

- **Multi-Threaded Rust Scanner Engine (`netmap-scanner`)**: Sub-second subnet sweeps powered by asynchronous Rust (`tokio`).
- **Deep Device Fingerprinting**: Combines ICMP TTL heuristics, HTTP title extraction, SSL CN parsing, mDNS (`avahi-resolve`), and NetBIOS (`nmblookup`).
- **Iceberg Stealth Recon Engine**: Multi-layer L3 ICMP Timestamp/Mask, L4 TCP ACK/SYN, UDP Unreachable, and L5-L7 SSDP/WS-Discovery multicast probes to uncover firewalled and hidden hosts.
- **Real-Time SSE Streaming**: Live discovery feed line-by-line via Server-Sent Events (NDJSON stream to frontend).
- **Docker Native**: Single-command containerized deployment with host networking.

---

## System Architecture

```mermaid
graph TD
    UI["React 18 + Tailwind Web UI<br/>(Port 3000 / Embedded Port 8000)"]
    API["FastAPI Python Backend<br/>(Port 8000)"]
    ENGINE["netmap-scanner (Rust Engine)"]
    SYSTEM["System Probe Utilities<br/>(arp-scan, nmap, avahi, ping)"]

    UI -->|SSE Live Stream / REST API| API
    API -->|Subprocess Execution| ENGINE
    ENGINE -->|L2 / L3 / L4 / L7 Probes| SYSTEM
```

---

## Multi-Layer Reconnaissance Pipeline

```mermaid
graph LR
    subgraph L2 ["Layer 2 Data Link"]
        ARP["ARP Sweep<br/>(arp-scan)"]
        NEIGHBOR["Kernel Neighbor Table<br/>(/proc/net/arp)"]
    end

    subgraph L3 ["Layer 3 Network"]
        ICMP_ECHO["ICMP Echo Sweep"]
        ICMP_TIME["ICMP Timestamp Probe<br/>(Type 13)"]
        ICMP_MASK["ICMP Netmask Probe<br/>(Type 17)"]
    end

    subgraph L4 ["Layer 4 Transport"]
        TCP_ACK["TCP ACK Stealth Probe<br/>(Ports 80, 443, 22, 445)"]
        TCP_SYN["TCP SYN Sweep<br/>(Admin Ports)"]
        UDP_UNREACH["UDP Unreachable Probe<br/>(Ports 53, 123, 137, 161)"]
    end

    subgraph L5_L7 ["Layer 5-7 Application & Multicast"]
        SSDP["SSDP Multicast<br/>(UDP 1900)"]
        WSD["WS-Discovery<br/>(UDP 3702)"]
        MDNS["mDNS / NetBIOS<br/>(UDP 5353 / 137)"]
    end

    L2 --> L3
    L3 --> L4
    L4 --> L5_L7
```

---

## Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    participant UI as React Frontend
    participant Backend as FastAPI Backend
    participant Scanner as Rust Scanner (netmap-scanner)
    participant Target as Local Subnet / Target Hosts

    UI->>Backend: POST /api/scan or GET /api/scan/stream
    Backend->>Scanner: Spawn Subprocess (netmap-scanner --subnet --stream)
    
    rect rgb(20, 25, 35)
        Note over Scanner,Target: Phase 1: Subnet & Interface Auto-Detection
        Scanner->>Scanner: Enumerate IPv4 Interfaces & Routing Tables
        
        Note over Scanner,Target: Phase 2: Multi-Pass Discovery
        Scanner->>Target: L2 ARP + L3 ICMP (Echo, Timestamp, Mask)
        Scanner->>Target: L4 TCP ACK/SYN + UDP Unreachable
        Scanner->>Target: L5-L7 Multicast Probes (SSDP, WS-Discovery, mDNS)
        
        Note over Scanner,Target: Phase 3: Port Scanning & Fingerprinting
        Scanner->>Target: Concurrent TCP Port Scan (Top + Deep Tier)
        Scanner->>Target: Grab Service Banners & SSL Certificates
        Scanner->>Target: Execute SNMP sysDescr & TTL OS Heuristics
    end

    Scanner-->>Backend: Stream JSON Events (node, link, warning)
    Backend-->>UI: Server-Sent Events (SSE Stream)
    UI->>UI: Render Dynamic Topology Graph & Host Matrix
```

---

## Permission & Security Setup

For NetMap to achieve 100% host discovery, accurate OS fingerprinting, and raw packet control (ICMP ping sweeps, ARP scans, SYN probes, and TTL calculations), elevated network permissions are required.

> [!IMPORTANT]
> **Security Best Practice:** Never run the FastAPI web server or Python process as root. NetMap uses **Linux File Capabilities** (`setcap`), granting raw socket permissions only to the compiled scanner binary while keeping the web application safely unprivileged.

### Linux Privilege Setup (Recommended)

After compiling the Rust binary, run the privilege setup script once:

```bash
cd scanner
./setup-privileges.sh
```

Or execute manually:

```bash
# Grant RAW network capabilities to the scanner binary and helper utilities
sudo setcap cap_net_raw,cap_net_admin+eip scanner/target/release/netmap-scanner
sudo setcap cap_net_raw,cap_net_admin+eip $(which arp-scan)
sudo setcap cap_net_raw+eip $(which nmap)
```

Verify capability assignment:
```bash
getcap scanner/target/release/netmap-scanner
```

---

### Windows Privilege Setup

1. **Install Npcap Driver**: Download and install [Npcap](https://npcap.com/#download) with *"Support raw 802.11 traffic"* enabled.
2. **Run in Administrator Terminal**: Launch PowerShell or Command Prompt as Administrator when executing the scanner binary or docker container.

---

### macOS Privilege Setup

1. **Grant BPF Device Access**: macOS requires permissions on Berkeley Packet Filter (`/dev/bpf*`) devices:
   ```bash
   sudo chown $USER:admin /dev/bpf*
   ```
2. Alternatively, run the scanner component with `sudo`:
   ```bash
   sudo ./scanner/target/release/netmap-scanner --subnet auto
   ```

---

## Installation & Setup Guide

### Option 1: Docker (Recommended)

Docker allows single-command deployment with pre-configured Linux capabilities and host network access.

#### Using Docker Compose

```bash
# 1. Clone repository
git clone https://github.com/captrit/netmap.git
cd netmap

# 2. Build and start container
docker compose up --build
```

Access the Web Dashboard at: **`http://localhost:8000`**

#### Using Docker Run

```bash
docker build -t netmap .

docker run -d \
  --name netmap \
  --net=host \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  netmap
```

---

### Option 2: Linux Native Setup

#### Prerequisites
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Python**: `python3` (v3.10+) and `pip`
- **Node.js**: `node` (v18+) and `npm`
- **Network utilities**: `sudo apt install nmap arp-scan avahi-utils iputils-ping`

#### Build & Run Step-by-Step

```bash
# 1. Clone repository
git clone https://github.com/captrit/netmap.git
cd netmap

# 2. Build Rust Scanner Engine
cd scanner
cargo build --release
cd ..

# 3. Apply raw socket permissions
./scanner/setup-privileges.sh

# 4. Set up Python environment & install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 5. Install Frontend dependencies
cd frontend
npm install
cd ..

# 6. Start NetMap using unified launcher
./start_netmap.sh
```

Access Web UI at: **`http://localhost:3000`** (Backend API running on `http://localhost:8000`).

---

### Option 3: Windows Setup (via WSL2 or Native)

#### Option A: Using WSL2 (Ubuntu on Windows) - Recommended
1. Install WSL2: `wsl --install`
2. Open Ubuntu terminal inside WSL2 and follow the **Linux Native Setup** above.

#### Option B: Windows Native Setup
1. Install [Rust for Windows](https://www.rust-lang.org/tools/install).
2. Install [Python 3](https://www.python.org/downloads/) and [Node.js](https://nodejs.org/).
3. Install [Npcap](https://npcap.com/).
4. In an Administrator PowerShell:
   ```powershell
   cd scanner; cargo build --release; cd ..
   pip install -r requirements.txt
   cd frontend; npm install; cd ..
   python backend\main.py
   ```

---

### Option 4: macOS Setup

```bash
# 1. Install prerequisites via Homebrew
brew install rust node python3 nmap arp-scan

# 2. Clone and build scanner
git clone https://github.com/captrit/netmap.git
cd netmap/scanner
cargo build --release
cd ..

# 3. Grant BPF socket permissions
sudo chown $USER:admin /dev/bpf*

# 4. Install backend & frontend dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..

# 5. Launch NetMap
./start_netmap.sh
```

---

### Updating NetMap (Cross-Platform Auto-Update)

No need to remove or re-clone the repository when new features or fixes are pushed to the `main` branch. Use the automated updater for your operating system:

#### Linux / macOS / WSL / Git Bash:
```bash
# Option 1: Run dedicated updater script directly
./update.sh

# Option 2: Or pass --update flag to the start script
./start_netmap.sh --update
```

#### Windows (Native PowerShell):
```powershell
.\update.ps1
```

The auto-updater automatically:
1. Pulls the latest commits from the `main` branch (`git pull origin main`).
2. Rebuilds the Rust scanner engine (`netmap-scanner`).
3. Re-applies OS-specific raw network socket capabilities (`setcap` on Linux / BPF tips on macOS).
4. Updates Python backend & React frontend dependencies and rebuilds the application.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check and engine status |
| `/api/interfaces` | `GET` | List host network interfaces and IP subnets |
| `/api/topology` | `GET` | Fetch latest cached network topology |
| `/api/scan` | `POST` | Trigger synchronous full-subnet scan |
| `/api/scan/stream` | `GET` | SSE stream for real-time live host discovery |
| `/api/history` | `GET` | List session scan history |
| `/api/history` | `DELETE` | Clear session history |

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.
