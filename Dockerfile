# ==========================================
# STAGE 1: Build Rust Scanner Engine
# ==========================================
FROM rust:1.80-slim-bookworm AS rust-builder
WORKDIR /usr/src/netmap

COPY scanner ./scanner
WORKDIR /usr/src/netmap/scanner
RUN cargo build --release

# ==========================================
# STAGE 2: Build React Web UI (Frontend)
# ==========================================
FROM node:20-slim AS frontend-builder
WORKDIR /usr/src/netmap/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

# ==========================================
# STAGE 3: Final Production Runtime Image
# ==========================================
FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Install network tools required for discovery, OS fingerprinting, and raw sockets
RUN apt-get update && apt-get install -y --no-install-recommends \
    iproute2 \
    iputils-ping \
    net-tools \
    nmap \
    arp-scan \
    libcap2-bin \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python dependencies and install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy compiled Rust scanner binary
COPY --from=rust-builder /usr/src/netmap/scanner/target/release/netmap-scanner /app/scanner/target/release/netmap-scanner

# Copy built frontend assets
COPY --from=frontend-builder /usr/src/netmap/frontend/dist /app/frontend/dist

# Copy backend source code & privilege setup scripts
COPY backend /app/backend
COPY scanner/setup-privileges.sh /app/scanner/setup-privileges.sh

# Apply capabilities to binaries so raw sockets work even when non-root
RUN chmod +x /app/scanner/target/release/netmap-scanner && \
    setcap cap_net_raw,cap_net_admin+eip /app/scanner/target/release/netmap-scanner && \
    (which arp-scan > /dev/null && setcap cap_net_raw,cap_net_admin+eip $(which arp-scan) || true) && \
    (which nmap > /dev/null && setcap cap_net_raw+eip $(which nmap) || true)

# Copy docker entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
