"""
NetMap API — Real-time Network Scanner, Streaming, and History API.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import json
import time

from scanner import NetworkScanner
import db
import updater

app = FastAPI(
    title="NetMap API",
    description="Real network reconnaissance scanner & streaming API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scanner = NetworkScanner()
is_scanning = False


class ScanRequest(BaseModel):
    subnet: Optional[str] = "auto"
    scan_ports: Optional[bool] = True
    os_detect: Optional[bool] = False
    timeout_ms: Optional[int] = 500
    scan_docker: Optional[bool] = True
    # Active pivot testing: "user@host" you already hold SSH access to.
    # Uses your existing SSH agent/keys only — never accepts a password.
    pivot: Optional[str] = None
    pivot_key: Optional[str] = None


@app.on_event("startup")
def startup_event():
    # Initialize in-memory SQLite database
    db.get_db()


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "NetMap API",
        "engine": "Rust netmap-scanner",
        "version": updater.get_current_version(),
        "uptime_sec": round(time.process_time(), 2),
    }


@app.get("/api/version")
def get_version_info(refresh: bool = False) -> Dict[str, Any]:
    """Return installed version, latest release status, and update availability."""
    return updater.check_for_updates(force_refresh=refresh)


@app.post("/api/version/update")
def trigger_update() -> Dict[str, Any]:
    """Trigger system update procedure."""
    return updater.trigger_system_update()


@app.get("/api/interfaces")
def get_interfaces() -> List[Dict[str, Any]]:
    return scanner.get_system_interfaces()


@app.get("/api/topology")
def get_topology() -> Dict[str, Any]:
    cached = db.get_current_topology()
    if cached is None:
        cached = scanner.execute_scan()
        db.save_scan(cached)
    return cached


@app.post("/api/scan")
def trigger_scan(req: ScanRequest) -> Dict[str, Any]:
    global is_scanning
    is_scanning = True
    try:
        result = scanner.execute_scan(
            target_subnet=req.subnet or "auto",
            timeout_ms=req.timeout_ms or 500,
            os_detect=req.os_detect or False,
            banners=req.scan_ports if req.scan_ports is not None else True,
            scan_docker=req.scan_docker if req.scan_docker is not None else True,
            pivot=req.pivot,
            pivot_key=req.pivot_key,
        )
        db.save_scan(result)
        return {
            "status": "success",
            "message": f"Scan completed for {req.subnet}",
            "result": result,
        }
    finally:
        is_scanning = False


@app.get("/api/scan/stream")
def stream_scan(
    subnet: str = "auto",
    timeout_ms: int = 500,
    os_detect: bool = False,
    banners: bool = True,
    scan_docker: bool = True,
    pivot: Optional[str] = None,
    pivot_key: Optional[str] = None,
):
    """Server-Sent Events (SSE) endpoint for real-time live discovery updates."""
    global is_scanning

    def event_generator():
        global is_scanning
        is_scanning = True
        try:
            for raw_line in scanner.execute_scan_stream(
                target_subnet=subnet,
                timeout_ms=timeout_ms,
                os_detect=os_detect,
                banners=banners,
                scan_docker=scan_docker,
                pivot=pivot,
                pivot_key=pivot_key,
            ):
                yield f"data: {raw_line}\n\n"
                try:
                    event_obj = json.loads(raw_line)
                    if event_obj.get("event") == "complete":
                        db.save_scan(event_obj.get("data", {}))
                except Exception:
                    pass
        finally:
            is_scanning = False

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/history")
def get_history() -> List[Dict[str, Any]]:
    return db.get_scan_history()


@app.get("/api/history/{scan_id}")
def get_history_item(scan_id: int) -> Dict[str, Any]:
    scan = db.get_scan_by_id(scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found in session history")
    return scan


@app.delete("/api/history")
def clear_history() -> Dict[str, str]:
    db.clear_history()
    return {"status": "success", "message": "Session history cleared"}


@app.get("/api/scan/status")
def scan_status() -> Dict[str, Any]:
    return {
        "isScanning": is_scanning,
        "hasCachedResult": db.get_current_topology() is not None,
    }


import os
from fastapi.staticfiles import StaticFiles

frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
