"""Daily self-test download and health status."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, asdict
from typing import Any

log = logging.getLogger("selftest")

DEFAULT_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


@dataclass
class SelfTestStatus:
    enabled: bool = True
    last_run_at: float | None = None
    last_ok: bool | None = None
    last_msg: str = ""
    last_url: str = ""
    next_run_at: float | None = None
    running: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_status = SelfTestStatus()


def get_status() -> SelfTestStatus:
    return _status


async def run_selftest(manager, config) -> SelfTestStatus:
    """Run one probe download (skip_download extract + tiny best audio/video)."""
    global _status
    if _status.running:
        return _status
    _status.running = True
    url = getattr(config, "SELFTEST_URL", None) or os.environ.get("SELFTEST_URL") or DEFAULT_URL
    _status.last_url = url
    _status.last_run_at = time.time()
    try:
        from .url_safety import validate_download_url
        from .downloader import extract_info
        from .cookies_util import sanitize_ytdl_options

        ok, err = validate_download_url(url)
        if not ok:
            raise RuntimeError(err)

        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(
            None,
            extract_info,
            url,
            config.DOWNLOAD_DIR,
            config.TEMP_DIR,
            sanitize_ytdl_options(dict(config.YTDL_OPTIONS)),
        )
        if not info:
            raise RuntimeError("extract_info returned empty")
        title = info.get("title") or info.get("id") or "ok"
        _status.last_ok = True
        _status.last_msg = f"OK: extracted “{title}”"
        log.info(f"Self-test OK: {title}")
    except Exception as e:
        _status.last_ok = False
        _status.last_msg = str(e)[:500]
        log.warning(f"Self-test FAILED: {e}")
    finally:
        _status.running = False
    return _status


async def selftest_loop(manager, config) -> None:
    enabled = getattr(config, "SELFTEST_ENABLED", True)
    interval_h = float(getattr(config, "SELFTEST_INTERVAL_HOURS", 24) or 24)
    run_on_start = getattr(config, "SELFTEST_ON_START", True)
    _status.enabled = bool(enabled)
    if not enabled:
        log.info("Self-test disabled")
        return

    if run_on_start:
        await run_selftest(manager, config)
        _status.next_run_at = time.time() + interval_h * 3600

    while True:
        wait = max(60.0, interval_h * 3600)
        _status.next_run_at = time.time() + wait
        await asyncio.sleep(wait)
        await run_selftest(manager, config)
