"""HTTP route handlers for Svidown."""

import asyncio
import json
import logging
import os
from pathlib import Path
import re

from aiohttp import web

from .config import Config
from .download_manager import DownloadManager
from .downloader import extract_channel_info
from .models import DownloadEncoder
from .url_safety import validate_download_url
from .cookies_util import sanitize_ytdl_options
from .ytdlp_updater import get_version_info

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

    @routes.post(config.URL_PREFIX + "extract-channel")
    async def extract_channel(request: web.Request) -> web.Response:
        """Extract video list from a channel or playlist URL."""
        try:
            post = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(reason="Invalid JSON")

        url = post.get("url")
        if not url:
            raise web.HTTPBadRequest(reason="Missing 'url'")

        ok, err = validate_download_url(url)
        if not ok:
            return json_response({"status": "error", "msg": err})

        limit = int(post.get("limit", 0))

        log.info(f"Extracting channel/playlist: {url} limit={limit}")

        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                extract_channel_info,
                url,
                config.DOWNLOAD_DIR,
                config.TEMP_DIR,
                limit,
                sanitize_ytdl_options(dict(config.YTDL_OPTIONS)),
            )
            return json_response({"status": "ok", **result})
        except Exception as e:
            log.error(f"Channel extraction error: {e}")
            return json_response({"status": "error", "msg": str(e)})

    @routes.get(config.URL_PREFIX + "history")
    async def get_history(request: web.Request) -> web.Response:
        """Get download history."""
        log.info("Sending download history")
        result = await manager.get_all()
        return json_response(result)


    @routes.get(config.URL_PREFIX + "cookies/status")
    async def cookies_status(request: web.Request) -> web.Response:
        """Report whether a valid cookies file is configured."""
        from .cookies_util import is_valid_netscape_cookiefile
        path = config.COOKIES_FILE or "/cookies/cookies.txt"
        valid = is_valid_netscape_cookiefile(path)
        size = 0
        mtime = None
        if os.path.isfile(path):
            try:
                st = os.stat(path)
                size = st.st_size
                mtime = st.st_mtime
            except OSError:
                pass
        active = bool(config.YTDL_OPTIONS.get("cookiefile"))
        return web.json_response({
            "path": path,
            "valid": valid,
            "active": active,
            "size": size,
            "mtime": mtime,
        })

    @routes.post(config.URL_PREFIX + "cookies")
    async def upload_cookies(request: web.Request) -> web.Response:
        """Upload a Netscape cookies.txt (multipart field 'file' or raw body)."""
        from .cookies_util import is_valid_netscape_cookiefile, sanitize_ytdl_options
        path = config.COOKIES_FILE or "/cookies/cookies.txt"
        Path(os.path.dirname(path) or ".").mkdir(parents=True, exist_ok=True)

        content_type = request.content_type or ""
        data = b""
        if "multipart" in content_type:
            reader = await request.multipart()
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name in ("file", "cookies", "cookiefile") or (
                    part.filename and part.filename.endswith(".txt")
                ):
                    data = await part.read(decode=False)
                    break
        else:
            data = await request.read()

        if not data or not data.strip():
            return json_response({"status": "error", "msg": "Empty cookies file"})

        text_body = data.decode("utf-8", errors="replace")
        tmp = path + ".upload"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text_body)
            f.flush()
            os.fsync(f.fileno())
        if not is_valid_netscape_cookiefile(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass
            return json_response({
                "status": "error",
                "msg": "File is not a valid Netscape cookies.txt (need # Netscape header or tab-separated cookie lines)",
            })
        os.replace(tmp, path)
        config.YTDL_OPTIONS["cookiefile"] = path
        config.YTDL_OPTIONS = sanitize_ytdl_options(config.YTDL_OPTIONS)
        log.info(f"Cookies uploaded to {path}")
        return json_response({"status": "ok", "path": path, "active": "cookiefile" in config.YTDL_OPTIONS})

    @routes.delete(config.URL_PREFIX + "cookies")
    async def delete_cookies(request: web.Request) -> web.Response:
        path = config.COOKIES_FILE or "/cookies/cookies.txt"
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError as e:
            return json_response({"status": "error", "msg": str(e)})
        config.YTDL_OPTIONS.pop("cookiefile", None)
        return json_response({"status": "ok"})

    @routes.post(config.URL_PREFIX + "retry")
    async def retry_downloads(request: web.Request) -> web.Response:
        try:
            post = await request.json()
        except json.JSONDecodeError:
            raise web.HTTPBadRequest(reason="Invalid JSON")
        ids = post.get("ids") or post.get("urls")
        if not ids:
            raise web.HTTPBadRequest(reason="Missing 'ids'")
        result = await manager.retry(ids)
        return json_response(result)

    @routes.get(config.URL_PREFIX + "status")
    async def app_status(request: web.Request) -> web.Response:
        """Combined health + self-test + yt-dlp freshness for the UI alert banner."""
        from .selftest import get_status
        from .cookies_util import is_valid_netscape_cookiefile
        from .ytdlp_updater import get_version_info
        st = get_status()
        ver = get_version_info(config.YTDLP_STALE_AFTER_DAYS)
        path = config.COOKIES_FILE or "/cookies/cookies.txt"
        alert = None
        level = "ok"
        if st.last_ok is False:
            level = "error"
            alert = f"Self-test failed: {st.last_msg}"
        elif ver.get("yt_dlp_stale"):
            level = "warn"
            alert = f"yt-dlp is {ver.get('yt_dlp_age_days')} days old — downloads may break"
        elif not is_valid_netscape_cookiefile(path) and not config.YTDL_OPTIONS.get("cookiefile"):
            level = "info"
            alert = "No cookies loaded — Instagram/fb.watch/TikTok may need a cookies.txt upload"
        return web.json_response({
            "level": level,
            "alert": alert,
            "selftest": st.to_dict(),
            "version": ver,
            "cookies_valid": is_valid_netscape_cookiefile(path),
        })

    @routes.post(config.URL_PREFIX + "selftest")
    async def trigger_selftest(request: web.Request) -> web.Response:
        from .selftest import run_selftest
        st = await run_selftest(manager, config)
        return web.json_response({"status": "ok" if st.last_ok else "error", **st.to_dict()})


    @routes.get(config.URL_PREFIX + "health")
    async def health(request: web.Request) -> web.Response:
        """Liveness probe (no auth required)."""
        return web.json_response({"status": "ok"})

    @routes.get(config.URL_PREFIX + "version")
    async def get_version(request: web.Request) -> web.Response:
        """Get version information including yt-dlp freshness."""
        return web.json_response(get_version_info(config.YTDLP_STALE_AFTER_DAYS))

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
    app.router.add_route("OPTIONS", config.URL_PREFIX + "extract-channel", cors_options)
    app.router.add_route("OPTIONS", config.URL_PREFIX + "cookies", cors_options)
    app.router.add_route("OPTIONS", config.URL_PREFIX + "retry", cors_options)
    app.router.add_route("OPTIONS", config.URL_PREFIX + "selftest", cors_options)


def setup_cors(app: web.Application, allowed_origins: list | None = None) -> None:
    """Set up CORS headers from an allowlist.

    Args:
        app: aiohttp application
        allowed_origins: ["*"] for any, list of origins, or empty/None to omit ACAO
    """
    allowed = allowed_origins or []

    async def on_prepare(
        request: web.Request,
        response: web.StreamResponse,
    ) -> None:
        origin = request.headers.get("Origin")
        if not origin:
            return
        if allowed == ["*"]:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        elif origin in allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        # else: no ACAO header — browser blocks cross-origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-API-Token"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

    app.on_response_prepare.append(on_prepare)
