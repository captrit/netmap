"""
NetPulse In-Memory Database Module.
Provides session-only persistence for scan topology and history.
Data is stored strictly in-memory (:memory:) and wipes automatically when the server is restarted or stopped.
"""
import json
import sqlite3
import time
from typing import Any, Dict, List, Optional

# Shared in-memory SQLite URI so multiple threads/requests access the same memory DB
DB_URI = "file:netpulse_session.db?mode=memory&cache=shared"

_conn: Optional[sqlite3.Connection] = None


def get_db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_URI, uri=True, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        init_db(_conn)
    return _conn


def init_db(conn: sqlite3.Connection) -> None:
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                subnet TEXT NOT NULL,
                total_hosts INTEGER NOT NULL,
                online_hosts INTEGER NOT NULL,
                open_ports INTEGER NOT NULL,
                scan_duration_ms REAL NOT NULL,
                result_json TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS current_topology (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                updated_at TEXT NOT NULL,
                result_json TEXT NOT NULL
            );
        """)


def save_scan(result: Dict[str, Any]) -> int:
    conn = get_db()
    summary = result.get("summary", {})
    timestamp = summary.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S"))
    subnets = ",".join(summary.get("subnetsScanned", ["auto"]))
    total_hosts = summary.get("totalHosts", 0)
    online_hosts = summary.get("onlineHosts", 0)
    open_ports = summary.get("openPortsCount", 0)
    duration_ms = summary.get("scanDurationMs", 0.0)
    json_str = json.dumps(result)

    with conn:
        cursor = conn.execute(
            """
            INSERT INTO scan_history (timestamp, subnet, total_hosts, online_hosts, open_ports, scan_duration_ms, result_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (timestamp, subnets, total_hosts, online_hosts, open_ports, duration_ms, json_str),
        )
        scan_id = cursor.lastrowid

        conn.execute(
            """
            INSERT INTO current_topology (id, updated_at, result_json)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, result_json=excluded.result_json
            """,
            (timestamp, json_str),
        )

    return scan_id


def get_scan_history() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.execute(
        """
        SELECT id, timestamp, subnet, total_hosts, online_hosts, open_ports, scan_duration_ms
        FROM scan_history
        ORDER BY id DESC
        """
    )
    rows = cursor.fetchall()
    return [
        {
            "id": row["id"],
            "timestamp": row["timestamp"],
            "subnet": row["subnet"],
            "totalHosts": row["total_hosts"],
            "onlineHosts": row["online_hosts"],
            "openPorts": row["open_ports"],
            "scanDurationMs": row["scan_duration_ms"],
        }
        for row in rows
    ]


def get_scan_by_id(scan_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.execute("SELECT result_json FROM scan_history WHERE id = ?", (scan_id,))
    row = cursor.fetchone()
    if row:
        return json.loads(row["result_json"])
    return None


def get_current_topology() -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.execute("SELECT result_json FROM current_topology WHERE id = 1")
    row = cursor.fetchone()
    if row:
        return json.loads(row["result_json"])
    return None


def clear_history() -> None:
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM scan_history")
        conn.execute("DELETE FROM current_topology")
