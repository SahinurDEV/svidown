"""Socket.IO WebSocket handlers for Svidown."""

import asyncio
import json
import logging
import os

import socketio

from .config import Config
from .download_manager import DownloadManager
from .models import Download, DownloadEncoder
from .routes import get_custom_dirs

log = logging.getLogger("websocket")


class SocketNotifier:
    """Notifier that sends events via Socket.IO."""

    def __init__(self, sio: socketio.AsyncServer):
        self.sio = sio
        self._encoder = DownloadEncoder()

    def _encode(self, data) -> str:
        """Encode data to JSON string."""
        return json.dumps(data, cls=DownloadEncoder)

    async def added(self, download: Download) -> None:
        """Notify that a download was added."""
        log.info(f"Download added: {download.title}")
        await self.sio.emit("added", self._encode(download))

    async def updated(self, download: Download) -> None:
        """Notify that a download was updated."""
        log.debug(f"Download updated: {download.title}")
        await self.sio.emit("updated", self._encode(download))

    async def completed(self, download: Download) -> None:
        """Notify that a download completed."""
        log.info(f"Download completed: {download.title}")
        await self.sio.emit("completed", self._encode(download))

    async def canceled(self, url: str) -> None:
        """Notify that a download was canceled."""
        log.info(f"Download canceled: {url}")
        await self.sio.emit("canceled", self._encode(url))

    async def cleared(self, url: str) -> None:
        """Notify that a download was cleared."""
        log.info(f"Download cleared: {url}")
        await self.sio.emit("cleared", self._encode(url))


def setup_websocket(
    sio: socketio.AsyncServer,
    config: Config,
    manager: DownloadManager,
) -> SocketNotifier:
    """Set up Socket.IO event handlers.

    Args:
        sio: Socket.IO server instance
        config: Application configuration
        manager: Download manager instance

    Returns:
        Socket notifier instance
    """
    notifier = SocketNotifier(sio)

    @sio.event
    async def connect(sid: str, environ: dict) -> None:
        """Handle client connection."""
        log.info(f"Client connected: {sid}")

        # Send current downloads
        active, done = manager.get_current()
        data = (
            [(url, dl.to_dict()) for url, dl in active],
            [(url, dl.to_dict()) for url, dl in done],
        )
        await sio.emit("all", json.dumps(data, cls=DownloadEncoder), to=sid)

        # Send configuration
        await sio.emit(
            "configuration",
            json.dumps(config.to_dict(), cls=DownloadEncoder),
            to=sid,
        )

        # Send custom directories if enabled
        if config.CUSTOM_DIRS:
            dirs = get_custom_dirs(config)
            await sio.emit(
                "custom_dirs",
                json.dumps(dirs, cls=DownloadEncoder),
                to=sid,
            )

        # Send ytdl options file status if configured
        if config.YTDL_OPTIONS_FILE:
            result = get_options_update_time(config)
            await sio.emit(
                "ytdl_options_changed",
                json.dumps(result, cls=DownloadEncoder),
                to=sid,
            )

    @sio.event
    async def disconnect(sid: str) -> None:
        """Handle client disconnection."""
        log.info(f"Client disconnected: {sid}")

    return notifier


def get_options_update_time(
    config: Config,
    success: bool = True,
    msg: str = "",
) -> dict:
    """Get yt-dlp options file update time.

    Args:
        config: Application configuration
        success: Whether the last load was successful
        msg: Error message if not successful

    Returns:
        Dict with success, msg, and update_time
    """
    result = {
        "success": success,
        "msg": msg,
        "update_time": None,
    }

    if config.YTDL_OPTIONS_FILE and os.path.exists(config.YTDL_OPTIONS_FILE):
        try:
            result["update_time"] = os.path.getmtime(config.YTDL_OPTIONS_FILE)
        except OSError as e:
            log.warning(f"Could not get modification time: {e}")

    return result


async def watch_options_file(
    sio: socketio.AsyncServer,
    config: Config,
) -> None:
    """Watch yt-dlp options file for changes.

    Args:
        sio: Socket.IO server instance
        config: Application configuration
    """
    if not config.YTDL_OPTIONS_FILE:
        return

    try:
        from watchfiles import awatch, Change

        class OptionsFileFilter:
            """Filter for watching only the options file."""

            def __call__(self, change_type: int, path: str) -> bool:
                if path != config.YTDL_OPTIONS_FILE:
                    return False

                # Check with samefile if file exists
                if os.path.exists(config.YTDL_OPTIONS_FILE):
                    try:
                        if not os.path.samefile(path, config.YTDL_OPTIONS_FILE):
                            return False
                    except OSError:
                        if path != config.YTDL_OPTIONS_FILE:
                            return False

                return change_type in (Change.modified, Change.added, Change.deleted)

        log.info(f"Watching options file: {config.YTDL_OPTIONS_FILE}")

        async for changes in awatch(config.YTDL_OPTIONS_FILE, watch_filter=OptionsFileFilter()):
            log.info(f"Options file changed: {changes}")
            success, msg = config.load_ytdl_options()
            result = get_options_update_time(config, success, msg)
            await sio.emit(
                "ytdl_options_changed",
                json.dumps(result, cls=DownloadEncoder),
            )

    except ImportError:
        log.warning("watchfiles not installed, options file watching disabled")
    except Exception as e:
        log.error(f"Error watching options file: {e}")


def start_options_watcher(
    sio: socketio.AsyncServer,
    config: Config,
) -> None:
    """Start the options file watcher task.

    Args:
        sio: Socket.IO server instance
        config: Application configuration
    """
    if config.YTDL_OPTIONS_FILE:
        asyncio.create_task(watch_options_file(sio, config))
