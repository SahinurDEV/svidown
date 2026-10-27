"""Runtime yt-dlp auto-update on start and on a configurable interval."""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("ytdlp_updater")


def parse_ytdlp_version_date(version: str) -> datetime | None:
    """Parse yt-dlp version like 2026.10.26 or 2026.02.04 into a date."""
    try:
        parts = version.strip().split(".")
        if len(parts) < 3:
            return None
        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
        return datetime(year, month, day, tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def ytdlp_age_days(version: str | None = None) -> int | None:
    if version is None:
        try:
            from yt_dlp.version import __version__ as version
        except Exception:
            return None
    dt = parse_ytdlp_version_date(version)
    if not dt:
        return None
    now = datetime.now(timezone.utc)
    return (now.date() - dt.date()).days


def get_version_info(stale_after_days: int = 60) -> dict[str, Any]:
    try:
        from yt_dlp.version import __version__ as ytdlp_version
    except Exception:
        ytdlp_version = "unknown"

    age = ytdlp_age_days(ytdlp_version)
    stale = age is not None and age > stale_after_days
    return {
        "yt-dlp": ytdlp_version,
        "version": os.environ.get("SVIDOWN_VERSION", "1.0.0"),
        "yt_dlp_age_days": age,
        "yt_dlp_stale": stale,
        "yt_dlp_stale_after_days": stale_after_days,
    }


def update_ytdlp_sync() -> tuple[bool, str]:
    """Run pip/uv upgrade of yt-dlp. Returns (success, message)."""
    log.info("Checking for yt-dlp updates...")
    commands = [
        [sys.executable, "-m", "pip", "install", "-U", "yt-dlp[default,curl-cffi,deno]"],
        ["uv", "pip", "install", "--system", "-U", "yt-dlp[default,curl-cffi,deno]"],
        ["uv", "pip", "install", "-U", "yt-dlp[default,curl-cffi,deno]"],
    ]
    last_err = ""
    for cmd in commands:
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
                check=False,
            )
            out = (proc.stdout or "") + (proc.stderr or "")
            if proc.returncode == 0:
                try:
                    from importlib import reload
                    import yt_dlp
                    import yt_dlp.version as ver
                    reload(yt_dlp)
                    reload(ver)
                    msg = f"yt-dlp updated to {ver.__version__}"
                except Exception:
                    msg = "yt-dlp update command succeeded"
                log.info(msg)
                return True, msg
            last_err = out[-500:] if out else f"exit {proc.returncode}"
        except FileNotFoundError:
            continue
        except Exception as e:
            last_err = str(e)
            continue

    log.warning(f"yt-dlp auto-update failed: {last_err}")
    return False, last_err or "update failed"


async def update_ytdlp() -> tuple[bool, str]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, update_ytdlp_sync)


async def ytdlp_update_loop(
    enabled: bool,
    interval_hours: float,
    run_on_start: bool,
) -> None:
    """Background task: optional start update + periodic updates."""
    if not enabled:
        log.info("yt-dlp auto-update disabled (YTDLP_AUTO_UPDATE=false)")
        return

    if run_on_start:
        try:
            await update_ytdlp()
        except Exception as e:
            log.warning(f"Startup yt-dlp update error: {e}")

    interval = max(1.0, float(interval_hours)) * 3600.0
    while True:
        await asyncio.sleep(interval)
        try:
            await update_ytdlp()
        except Exception as e:
            log.warning(f"Periodic yt-dlp update error: {e}")
