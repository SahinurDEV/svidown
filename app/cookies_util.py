"""Safe cookiefile handling for yt-dlp options."""

from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("cookies")


def is_valid_netscape_cookiefile(path: str) -> bool:
    """Return True if path exists, is non-empty, and looks like Netscape cookies."""
    if not path or not os.path.isfile(path):
        return False

    try:
        size = os.path.getsize(path)
    except OSError:
        return False

    if size <= 0:
        return False

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            # Read enough to validate header / first data lines
            sample = f.read(8192)
    except OSError:
        return False

    if not sample.strip():
        return False

    # Netscape format: optional header, then tab-separated fields
    # Also accept "# HTTP Cookie File" / "# Netscape HTTP Cookie File"
    lines = [ln.strip() for ln in sample.splitlines() if ln.strip()]
    if not lines:
        return False

    header_ok = any(
        "netscape" in ln.lower() or "http cookie file" in ln.lower()
        for ln in lines[:5]
        if ln.startswith("#")
    )

    data_lines = [ln for ln in lines if not ln.startswith("#")]
    if not data_lines:
        # Header-only file is not usable
        return False

    # A valid cookie line has at least 6-7 tab-separated fields
    for ln in data_lines[:10]:
        parts = ln.split("\t")
        if len(parts) >= 6:
            return True
        # Some exporters use spaces; require multiple fields
        if len(ln.split()) >= 6 and header_ok:
            return True

    return header_ok and len(data_lines) > 0 and "\t" in data_lines[0]


def sanitize_ytdl_options(opts: dict[str, Any]) -> dict[str, Any]:
    """Copy opts and drop cookiefile if missing/invalid. Log a warning when dropped."""
    result = dict(opts)
    cookiefile = result.get("cookiefile")
    if not cookiefile:
        return result

    if is_valid_netscape_cookiefile(str(cookiefile)):
        log.info(f"Using cookiefile: {cookiefile}")
        return result

    log.warning(
        "Ignoring cookiefile %r — file missing, empty, or not valid Netscape format. "
        "Downloads will continue without cookies. Export fresh cookies from your browser "
        "and restart, or unset YTDL_OPTIONS cookiefile.",
        cookiefile,
    )
    result.pop("cookiefile", None)
    return result
