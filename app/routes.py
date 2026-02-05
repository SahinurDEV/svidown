"""HTTP route handlers for Svidown."""

import json
import logging
import os
from pathlib import Path
import re

from aiohttp import web

from .config import Config
from .download_manager import DownloadManager
from .models import DownloadEncoder

log = logging.getLogger("routes")


def create_routes(
    config: Config,
    manager: DownloadManager,
) -> web.RouteTableDef:
    """Create HTTP route handlers.

    Args:
        config: Application configuration
        manager: Download manager instance

    Returns:
        Route table definition
    """
    routes = web.RouteTableDef()
    encoder = DownloadEncoder()

    def json_response(data) -> web.Response:
        """Create JSON response with custom encoder."""
        return web.Response(
            text=json.dumps(data, cls=DownloadEncoder),
            content_type="application/json",
        )

    @routes.post(config.URL_PREFIX + "add")
    async def add_download(request: web.Request) -> web.Response:
        """Add a new download."""
        log.info("Received add download request")

        try:
            post = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(reason="Invalid JSON")

        url = post.get("url")
        quality = post.get("quality")

        if not url or not quality:
            log.error("Missing 'url' or 'quality'")
            raise web.HTTPBadRequest(reason="Missing 'url' or 'quality'")

        # Extract optional parameters
        format = post.get("format")
        folder = post.get("folder")
        custom_name_prefix = post.get("custom_name_prefix", "")
        auto_start = post.get("auto_start", True)
        split_by_chapters = post.get("split_by_chapters", False)
        chapter_template = post.get("chapter_template", config.OUTPUT_TEMPLATE_CHAPTER)

        # Parse playlist limit
        playlist_item_limit = post.get(
            "playlist_item_limit",
            config.DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT
        )
        playlist_item_limit = int(playlist_item_limit)

        # Parse speed limit
        speed_limit = post.get("speed_limit")
        if speed_limit is not None:
            speed_limit = int(speed_limit)

        log.info(f"Adding: {url} quality={quality} format={format}")

        result = await manager.add(
            url=url,
            quality=quality,
            format=format,
            folder=folder,
            custom_name_prefix=custom_name_prefix,
            playlist_item_limit=playlist_item_limit,
            auto_start=auto_start,
            split_by_chapters=split_by_chapters,
            chapter_template=chapter_template,
            speed_limit=speed_limit,
        )

        return json_response(result)

    @routes.post(config.URL_PREFIX + "delete")
    async def delete_download(request: web.Request) -> web.Response:
        """Cancel or clear downloads."""
        try:
            post = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(reason="Invalid JSON")

        ids = post.get("ids")
        where = post.get("where")

        if not ids or where not in ("queue", "done"):
            log.error("Missing 'ids' or invalid 'where'")
            raise web.HTTPBadRequest(reason="Missing 'ids' or invalid 'where'")

        log.info(f"Delete request: {ids} from {where}")

        if where == "queue":
            result = await manager.cancel(ids)
        else:
            result = await manager.clear(ids)

        return json_response(result)

    @routes.post(config.URL_PREFIX + "start")
    async def start_pending(request: web.Request) -> web.Response:
        """Start pending downloads."""
        try:
            post = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(reason="Invalid JSON")

        ids = post.get("ids")
        if not ids:
            raise web.HTTPBadRequest(reason="Missing 'ids'")

        log.info(f"Starting pending downloads: {ids}")
        result = await manager.start_pending(ids)

        return json_response(result)

    @routes.get(config.URL_PREFIX + "history")
    async def get_history(request: web.Request) -> web.Response:
        """Get download history."""
        log.info("Sending download history")
        result = await manager.get_all()
        return json_response(result)

    @routes.get(config.URL_PREFIX + "version")
    async def get_version(request: web.Request) -> web.Response:
        """Get version information."""
        from yt_dlp.version import __version__ as ytdlp_version

        return web.json_response({
            "yt-dlp": ytdlp_version,
            "version": os.environ.get("SVIDOWN_VERSION", "1.0.0"),
        })

    @routes.get(config.URL_PREFIX)
    async def index(request: web.Request) -> web.Response:
        """Serve index.html."""
        index_path = os.path.join(
            config.BASE_DIR,
            "ui/dist/svidown/browser/index.html"
        )
        response = web.FileResponse(index_path)

        # Set default theme cookie
        if "svidown_theme" not in request.cookies:
            response.set_cookie("svidown_theme", config.DEFAULT_THEME)

        return response

    @routes.get(config.URL_PREFIX + "robots.txt")
    async def robots(request: web.Request) -> web.Response:
        """Serve robots.txt."""
        if config.ROBOTS_TXT:
            return web.FileResponse(os.path.join(config.BASE_DIR, config.ROBOTS_TXT))

        return web.Response(
            text="User-agent: *\nDisallow: /download/\nDisallow: /audio_download/\n",
            content_type="text/plain",
        )

    return routes


def get_custom_dirs(config: Config) -> dict[str, list[str]]:
    """Get list of custom directories.

    Args:
        config: Application configuration

    Returns:
        Dict with 'download_dir' and 'audio_download_dir' lists
    """
    def list_subdirs(base: str) -> list[str]:
        """Recursively list subdirectories."""
        path = Path(base)
        dirs = []

        for subdir in path.glob("**/"):
            # Convert to relative path
            rel = str(subdir.relative_to(path))
            if rel == ".":
                continue

            # Apply exclude filter
            if config.CUSTOM_DIRS_EXCLUDE_REGEX:
                if re.search(config.CUSTOM_DIRS_EXCLUDE_REGEX, rel):
                    continue

            dirs.append(rel)

        return sorted(dirs)

    download_dirs = list_subdirs(config.DOWNLOAD_DIR)

    # Use same list if directories are the same
    if config.DOWNLOAD_DIR == config.AUDIO_DOWNLOAD_DIR:
        audio_dirs = download_dirs
    else:
        audio_dirs = list_subdirs(config.AUDIO_DOWNLOAD_DIR)

    return {
        "download_dir": download_dirs,
        "audio_download_dir": audio_dirs,
    }


def setup_routes(
    app: web.Application,
    config: Config,
    manager: DownloadManager,
) -> None:
    """Set up all routes on the application.

    Args:
        app: aiohttp application
        config: Application configuration
        manager: Download manager instance
    """
    routes = create_routes(config, manager)

    # Add static routes
    routes.static(
        config.URL_PREFIX + "download/",
        config.DOWNLOAD_DIR,
        show_index=config.DOWNLOAD_DIRS_INDEXABLE,
    )
    routes.static(
        config.URL_PREFIX + "audio_download/",
        config.AUDIO_DOWNLOAD_DIR,
        show_index=config.DOWNLOAD_DIRS_INDEXABLE,
    )
    routes.static(
        config.URL_PREFIX,
        os.path.join(config.BASE_DIR, "ui/dist/svidown/browser"),
    )

    # Handle URL prefix redirects
    if config.URL_PREFIX != "/":
        @routes.get("/")
        async def redirect_root(request: web.Request) -> web.Response:
            raise web.HTTPFound(config.URL_PREFIX)

        @routes.get(config.URL_PREFIX.rstrip("/"))
        async def redirect_dir(request: web.Request) -> web.Response:
            raise web.HTTPFound(config.URL_PREFIX)

    try:
        app.add_routes(routes)
    except ValueError as e:
        if "ui/dist/svidown/browser" in str(e):
            raise RuntimeError(
                "Frontend UI assets not found. "
                "Please run 'npm run build' in the frontend folder."
            ) from e
        raise

    # Add CORS OPTIONS handler
    async def cors_options(request: web.Request) -> web.Response:
        return web.Response(text='{"status": "ok"}')

    app.router.add_route("OPTIONS", config.URL_PREFIX + "add", cors_options)


def setup_cors(app: web.Application) -> None:
    """Set up CORS headers.

    Args:
        app: aiohttp application
    """
    async def on_prepare(
        request: web.Request,
        response: web.StreamResponse,
    ) -> None:
        if "Origin" in request.headers:
            response.headers["Access-Control-Allow-Origin"] = request.headers["Origin"]
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"

    app.on_response_prepare.append(on_prepare)
