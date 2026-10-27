#!/usr/bin/env python3
"""Svidown - Video Downloader Server.

MIT License - A fresh implementation of a web-based video downloader.
"""

import asyncio
import logging
import os
import socket
import ssl
import sys
import time
from pathlib import Path

from aiohttp import web
from aiohttp.log import access_logger
import socketio

from .auth import AuthConfig, auth_middleware
from .config import Config, parse_log_level
from .download_manager import DownloadManager
from .routes import setup_routes, setup_cors
from .websocket import setup_websocket, start_options_watcher
from .ytdlp_updater import ytdlp_update_loop
from .selftest import selftest_loop

log = logging.getLogger("server")


def setup_logging(level: str) -> None:
    if not logging.getLogger().hasHandlers():
        logging.basicConfig(
            level=parse_log_level(level),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )


def supports_reuse_port() -> bool:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        sock.close()
        return True
    except (AttributeError, OSError):
        return False


def cleanup_temp_dir(temp_dir: str, max_age_hours: float) -> int:
    """Remove stale files under TEMP_DIR older than max_age_hours."""
    if not temp_dir or max_age_hours <= 0:
        return 0
    root = Path(temp_dir)
    if not root.is_dir():
        return 0
    cutoff = time.time() - max_age_hours * 3600
    removed = 0
    for path in root.rglob("*"):
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
                removed += 1
        except OSError:
            continue
    if removed:
        log.info(f"Cleaned {removed} stale temp files from {temp_dir}")
    return removed


def create_app(config: Config | None = None) -> tuple[web.Application, DownloadManager]:
    if config is None:
        config = Config.from_env()

    auth = AuthConfig(
        username=config.AUTH_USERNAME,
        password=config.AUTH_PASSWORD,
        token=config.AUTH_TOKEN,
    )

    app = web.Application(middlewares=[auth_middleware])
    app["auth"] = auth
    app["config"] = config

    # Socket.IO CORS: use configured origins (empty = deny cross-origin browser clients)
    cors_origins = config.CORS_ORIGINS if config.CORS_ORIGINS else []
    if cors_origins == ["*"]:
        sio_cors = "*"
    elif cors_origins:
        sio_cors = cors_origins
    else:
        # Restrictive default: no cross-origin Socket.IO
        sio_cors = []

    sio = socketio.AsyncServer(
        cors_allowed_origins=sio_cors if sio_cors != [] else [],
        async_mode="aiohttp",
    )
    # Attach with auth for connect when enabled
    sio.attach(app, socketio_path=config.URL_PREFIX + "socket.io")

    # Placeholder notifier until manager exists
    class _Nop:
        async def added(self, d): pass
        async def updated(self, d): pass
        async def completed(self, d): pass
        async def failed(self, d): pass
        async def canceled(self, u): pass
        async def cleared(self, u): pass

    manager = DownloadManager(config, _Nop())
    notifier = setup_websocket(sio, config, manager, auth=auth)
    manager.notifier = notifier

    setup_routes(app, config, manager)
    setup_cors(app, config.CORS_ORIGINS)

    async def on_startup(app):
        cleanup_temp_dir(config.TEMP_DIR, config.TEMP_MAX_AGE_HOURS)
        # Prune history on boot
        try:
            manager.done.prune(config.HISTORY_MAX_ITEMS, config.HISTORY_TTL_DAYS)
        except Exception as e:
            log.warning(f"Startup history prune failed: {e}")

        await manager.initialize()
        start_options_watcher(sio, config)
        asyncio.create_task(
            ytdlp_update_loop(
                enabled=config.YTDLP_AUTO_UPDATE,
                interval_hours=config.YTDLP_UPDATE_INTERVAL_HOURS,
                run_on_start=config.YTDLP_UPDATE_ON_START,
            )
        )
        asyncio.create_task(selftest_loop(manager, config))

    app.on_startup.append(on_startup)
    app["manager"] = manager
    app["sio"] = sio
    return app, manager


def run_server(config: Config | None = None) -> None:
    if config is None:
        config = Config.from_env()

    setup_logging(config.LOGLEVEL)
    logging.getLogger().setLevel(parse_log_level(config.LOGLEVEL))

    log.info(f"Starting Svidown server on {config.HOST}:{config.PORT}")
    if config.AUTH_TOKEN or (config.AUTH_USERNAME and config.AUTH_PASSWORD):
        log.info("Authentication is ENABLED")
    else:
        log.warning("Authentication is DISABLED — anyone who can reach the port can use the API")

    app, _ = create_app(config)
    access_log = access_logger if config.ENABLE_ACCESSLOG else None

    ssl_context = None
    if config.HTTPS:
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(certfile=config.CERTFILE, keyfile=config.KEYFILE)

    web.run_app(
        app,
        host=config.HOST,
        port=config.PORT,
        reuse_port=supports_reuse_port(),
        ssl_context=ssl_context,
        access_log=access_log,
    )


def main() -> None:
    setup_logging(os.environ.get("LOGLEVEL", "INFO"))
    try:
        run_server()
    except KeyboardInterrupt:
        log.info("Server stopped by user")
        sys.exit(0)
    except Exception as e:
        log.error(f"Server error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
