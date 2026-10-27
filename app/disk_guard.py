"""Disk space checks before accepting new downloads."""

from __future__ import annotations

import logging
import os
import shutil

log = logging.getLogger("disk_guard")


def check_disk_space(path: str, min_free_mb: int) -> tuple[bool, str]:
    """Return (ok, message). ok=False when free space is below threshold."""
    if min_free_mb <= 0:
        return True, ""

    try:
        usage = shutil.disk_usage(path if os.path.exists(path) else os.path.dirname(path) or "/")
    except OSError as e:
        log.warning(f"Could not check disk space for {path}: {e}")
        return True, ""  # fail open

    free_mb = usage.free / (1024 * 1024)
    if free_mb < min_free_mb:
        msg = (
            f"Insufficient disk space: {free_mb:.0f} MB free, "
            f"need at least {min_free_mb} MB"
        )
        log.warning(msg)
        return False, msg
    return True, ""
