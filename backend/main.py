from fastapi import FastAPI, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import time

from scanner import NetworkScanner

app = FastAPI(
    title="NetPulse Obsidian API",
    description="Real-time Network Scanner and Graph Intelligence API",
    version="1.0.0"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scanner = NetworkScanner()
cached_topology: Optional[Dict[str, Any]] = None
is_scanning = False

class ScanRequest(BaseModel):
    subnet: Optional[str] = "192.168.29.0/24"
    scan_ports: Optional[bool] = True

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "NetPulse Scanner API", "uptime_sec": round(time.process_time(), 2)}

@app.get("/api/interfaces")
def get_interfaces():
    return scanner.get_system_interfaces()

@app.get("/api/topology")
def get_topology():
    global cached_topology
    if cached_topology is None:
        cached_topology = scanner.execute_scan()
    return cached_topology

@app.post("/api/scan")
def trigger_scan(req: ScanRequest):
    global cached_topology, is_scanning
    is_scanning = True
    result = scanner.execute_scan(target_subnet=req.subnet or "192.168.29.0/24")
    cached_topology = result
    is_scanning = False
    return {
        "status": "success",
        "message": f"Scan completed for {req.subnet}",
        "result": result
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
