"""
NetMap Production Update Manager
Handles version checking against GitHub Releases API and triggers system updates.
"""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

REPO_OWNER = "captrit"
REPO_NAME = "netmap"
GITHUB_RELEASES_API = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"

BASE_DIR = Path(__file__).parent.parent
VERSION_FILE = BASE_DIR / "VERSION"

# Cache version check results for 1 hour to prevent GitHub rate-limiting
_version_cache: Optional[Dict[str, Any]] = None
_last_check_time: float = 0.0
CACHE_TTL_SEC: int = 3600


def get_current_version() -> str:
    """Read the installed NetMap version from VERSION file."""
    if VERSION_FILE.exists():
        try:
            return VERSION_FILE.read_text().strip()
        except Exception:
            pass
    return "2.0.0"


def parse_semver(v_str: str) -> Tuple[int, ...]:
    """Parse a version string like 'v2.1.0' or '2.1.0' into an integer tuple."""
    cleaned = v_str.lstrip("v").strip()
    parts = []
    for part in cleaned.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    return tuple(parts)


def check_for_updates(force_refresh: bool = False) -> Dict[str, Any]:
    """Check GitHub Releases for the latest NetMap release."""
    global _version_cache, _last_check_time

    current_ver = get_current_version()
    now = time.time()

    if not force_refresh and _version_cache is not None and (now - _last_check_time) < CACHE_TTL_SEC:
        return _version_cache

    result: Dict[str, Any] = {
        "current_version": current_ver,
        "latest_version": current_ver,
        "update_available": False,
        "release_url": f"https://github.com/{REPO_OWNER}/{REPO_NAME}/releases",
        "release_notes": "",
        "published_at": None,
        "checked_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "error": None,
    }

    try:
        req = urllib.request.Request(
            GITHUB_RELEASES_API,
            headers={
                "User-Agent": "NetMap-Update-Manager",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                latest_tag = data.get("tag_name", "v" + current_ver)
                latest_ver = latest_tag.lstrip("v")
                body = data.get("body", "")
                published = data.get("published_at")
                html_url = data.get("html_url", result["release_url"])

                is_newer = parse_semver(latest_ver) > parse_semver(current_ver)

                result.update({
                    "latest_version": latest_ver,
                    "update_available": is_newer,
                    "release_url": html_url,
                    "release_notes": body,
                    "published_at": published,
                })
    except Exception as e:
        result["error"] = f"Unable to reach GitHub release API: {str(e)}"

    _version_cache = result
    _last_check_time = now
    return result


def trigger_system_update() -> Dict[str, Any]:
    """Execute update procedure cleanly."""
    updater_script = BASE_DIR / "update.sh"
    if not updater_script.exists():
        return {
            "status": "error",
            "message": "Update script update.sh not found on server.",
        }

    try:
        proc = subprocess.run(
            [str(updater_script)],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=300,
        )
        if proc.returncode == 0:
            # Clear version cache so subsequent checks reflect new state
            global _version_cache
            _version_cache = None
            return {
                "status": "success",
                "message": "NetMap update completed successfully.",
                "output": proc.stdout,
            }
        else:
            return {
                "status": "error",
                "message": f"Update script exited with status {proc.returncode}",
                "error": proc.stderr or proc.stdout,
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Execution failed: {str(e)}",
        }
