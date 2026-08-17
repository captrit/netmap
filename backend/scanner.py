"""
NetPulse v2 Scanner — Python wrapper around the Rust netpulse-scanner binary.
Supports both synchronous JSON execution and asynchronous live streaming (NDJSON -> SSE).
"""
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional


SCANNER_BINARY = str(
    Path(__file__).parent.parent / "scanner" / "target" / "release" / "netpulse-scanner"
)


class NetworkScanner:
    """Wrapper that delegates network scanning to the compiled Rust binary."""

    def __init__(self) -> None:
        self._verify_binary()

    def _verify_binary(self) -> None:
        if not os.path.isfile(SCANNER_BINARY):
            raise FileNotFoundError(
                f"Scanner binary not found: {SCANNER_BINARY}. "
                "Run `cargo build --release` in scanner/ directory."
            )
        if not os.access(SCANNER_BINARY, os.X_OK):
            os.chmod(SCANNER_BINARY, 0o755)

    def get_system_interfaces(self) -> List[Dict[str, Any]]:
        interfaces: List[Dict[str, Any]] = []
        try:
            result = subprocess.run(
                ["ip", "-o", "addr", "show"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            mac_map: Dict[str, str] = {}
            link_result = subprocess.run(
                ["ip", "-o", "link", "show"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            for line in link_result.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 2:
                    name = parts[1].rstrip(":")
                    if "link/ether" in parts:
                        idx = parts.index("link/ether")
                        if idx + 1 < len(parts):
                            mac_map[name] = parts[idx + 1].lower()

            for line in result.stdout.splitlines():
                parts = line.split()
                if len(parts) < 4:
                    continue
                iface_name = parts[1].rstrip(":")
                family = parts[2]
                ip_cidr = parts[3]

                if family != "inet":
                    continue

                ip = ip_cidr.split("/")[0]
                if_type = self._classify_interface(iface_name, ip)

                interfaces.append({
                    "name": iface_name,
                    "ip": ip,
                    "subnet": ip_cidr,
                    "mac": mac_map.get(iface_name, ""),
                    "isUp": True,
                    "type": if_type,
                })
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            pass
        return interfaces

    @staticmethod
    def _classify_interface(name: str, ip: str) -> str:
        if name == "lo":
            return "loopback"
        if name.startswith(("wl", "wlan")):
            return "wifi"
        if name.startswith(("br-", "docker", "veth")) or name == "docker0":
            return "docker"
        if any(kw in name for kw in ("tun", "tap", "wg", "ipsec", "ppp")):
            return "vpn"
        if name.startswith(("en", "eth")):
            return "ethernet"
        return "ethernet"

    def execute_scan(
        self,
        target_subnet: str = "auto",
        timeout_ms: int = 500,
        os_detect: bool = False,
        banners: bool = True,
    ) -> Dict[str, Any]:
        cmd = [SCANNER_BINARY, "--subnet", target_subnet, "--timeout", str(timeout_ms)]
        if os_detect:
            cmd.append("--os-detect")
        if not banners:
            cmd.append("--no-banners")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
            return self._error_result(str(e))

        if not result.stdout.strip():
            return self._error_result(result.stderr.strip() or "Empty scanner output")

        try:
            return json.loads(result.stdout.strip())
        except json.JSONDecodeError as e:
            return self._error_result(f"JSON parse error: {e}")

    def execute_scan_stream(
        self,
        target_subnet: str = "auto",
        timeout_ms: int = 500,
        os_detect: bool = False,
        banners: bool = True,
    ) -> Generator[str, None, None]:
        """Stream scanner events (NDJSON) line by line as they occur."""
        cmd = [
            SCANNER_BINARY,
            "--subnet", target_subnet,
            "--timeout", str(timeout_ms),
            "--stream",
        ]
        if os_detect:
            cmd.append("--os-detect")
        if not banners:
            cmd.append("--no-banners")

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )

            if process.stdout is not None:
                for line in process.stdout:
                    line_str = line.strip()
                    if line_str.startswith("{") and line_str.endswith("}"):
                        yield line_str

            process.wait()
        except Exception as e:
            yield json.dumps({"event": "error", "data": {"message": str(e)}})

    @staticmethod
    def _error_result(message: str) -> Dict[str, Any]:
        return {
            "summary": {
                "totalHosts": 0,
                "onlineHosts": 0,
                "gatewaysCount": 0,
                "dockerCount": 0,
                "vpnCount": 0,
                "avgLatencyMs": 0,
                "openPortsCount": 0,
                "subnetsScanned": [],
                "scanDurationMs": 0,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "error": message,
            },
            "nodes": [],
            "links": [],
        }
