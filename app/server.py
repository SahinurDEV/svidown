#!/usr/bin/env python3
"""Svidown - Video Downloader Server.

MIT License - A fresh implementation of a web-based video downloader.
"""

import logging
import os
import socket
import ssl
import sys

from aiohttp import web
from aiohttp.log import access_logger
import socketio

from .config import Config, parse_log_level
from .download_manager import DownloadManager
from .routes import setup_routes, setup_cors
from .websocket import setup_websocket, start_options_watcher

log = logging.getLogger("server")


def setup_logging(level: str) -> None:
    """Configure logging.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    if not logging.getLogger().hasHandlers():
        logging.basicConfig(
            level=parse_log_level(level),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )


def supports_reuse_port() -> bool:
    """Check if SO_REUSEPORT is supported."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        sock.close()
        return True
    except (AttributeError, OSError):
        return False


def create_app(config: Config | None = None) -> tuple[web.Application, DownloadManager]:
    """Create the aiohttp application.

    Args:
        config: Application configuration (loaded from env if not provided)

    Returns:
        Tuple of (application, download_manager)
    """
    # Load config if not provided
    if config is None:
        config = Config.from_env()

    # Create aiohttp app and Socket.IO server
    app = web.Application()
    sio = socketio.AsyncServer(cors_allowed_origins="*")
    sio.attach(app, socketio_path=config.URL_PREFIX + "socket.io")

    # Create download manager with websocket notifier
    notifier = setup_websocket(sio, config, None)  # Manager set below
    manager = DownloadManager(config, notifier)

    # Re-setup websocket with manager (needed for connect handler)
    notifier = setup_websocket(sio, config, manager)
    # Update manager's notifier reference
    manager.notifier = notifier

    # Setup routes
    setup_routes(app, config, manager)
    setup_cors(app)

    # Initialize manager on startup
    app.on_startup.append(lambda app: manager.initialize())

    # Start options file watcher on startup
    app.on_startup.append(lambda app: start_options_watcher(sio, config))

    # Store references for testing
    app["config"] = config
    app["manager"] = manager
    app["sio"] = sio

    return app, manager


def run_server(config: Config | None = None) -> None:
    """Run the server.

    Args:
        config: Application configuration (loaded from env if not provided)
    """
    # Load config if not provided
    if config is None:
        config = Config.from_env()

    # Setup logging
    setup_logging(config.LOGLEVEL)
    logging.getLogger().setLevel(parse_log_level(config.LOGLEVEL))

    log.info(f"Starting Svidown server on {config.HOST}:{config.PORT}")

    # Create application
    app, _ = create_app(config)

    # Configure access logging
    access_log = access_logger if config.ENABLE_ACCESSLOG else None

    # Configure SSL if enabled
    ssl_context = None
    if config.HTTPS:
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(
            certfile=config.CERTFILE,
            keyfile=config.KEYFILE,
        )

    # Run the server
    web.run_app(
        app,
        host=config.HOST,
        port=config.PORT,
        reuse_port=supports_reuse_port(),
        ssl_context=ssl_context,
        access_log=access_log,
    )


def main() -> None:
    """Main entry point."""
    # Early logging setup for startup messages
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
