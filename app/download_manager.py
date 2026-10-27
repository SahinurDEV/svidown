"""Download queue management."""

import asyncio
import logging
import os
import types
from datetime import datetime
from typing import Any, Callable, Protocol

import yt_dlp

from .config import Config
from .downloader import DownloadWorker, extract_info
from .formats import is_audio_format, is_audio_quality
from .models import Download, DownloadStatus
from .persistence import DownloadStore
from .url_safety import validate_download_url
from .disk_guard import check_disk_space
from .facebook_urls import resolve_facebook_url, friendly_facebook_error
from .cookies_util import sanitize_ytdl_options

log = logging.getLogger("manager")


class DownloadNotifier(Protocol):
    """Protocol for download event notifications."""

    async def added(self, download: Download) -> None: ...
    async def updated(self, download: Download) -> None: ...
    async def completed(self, download: Download) -> None: ...
    async def failed(self, download: Download) -> None: ...
    async def canceled(self, url: str) -> None: ...
    async def cleared(self, url: str) -> None: ...


class DownloadManager:
    """Manages download queue with concurrency control."""

    def __init__(self, config: Config, notifier: DownloadNotifier):
        self.config = config
        self.notifier = notifier

        # Initialize stores
        self.queue = DownloadStore("queue", config.STATE_DIR)
        self.pending = DownloadStore("pending", config.STATE_DIR)
        self.done = DownloadStore("done", config.STATE_DIR)

        # Concurrency control
        self._semaphore = asyncio.Semaphore(config.MAX_CONCURRENT_DOWNLOADS)
        self._workers: dict[str, DownloadWorker] = {}

    async def initialize(self) -> None:
        """Initialize the manager and resume pending downloads."""
        log.info("Initializing download manager")

        # Resume downloads from queue
        for url, download in await self.queue.items():
            asyncio.create_task(self._start_download(download, auto_start=True))

        # Restore pending (paused) downloads
        for url, download in await self.pending.items():
            await self.notifier.added(download)

    async def add(
        self,
        url: str,
        quality: str,
        format: str,
        folder: str | None = None,
        custom_name_prefix: str = "",
        playlist_item_limit: int = 0,
        auto_start: bool = True,
        split_by_chapters: bool = False,
        chapter_template: str | None = None,
        speed_limit: int | None = None,
        already: set[str] | None = None,
    ) -> dict[str, Any]:
        """Add a new download.

        Args:
            url: URL to download
            quality: Quality setting
            format: Output format
            folder: Custom output folder
            custom_name_prefix: Prefix for output filename
            playlist_item_limit: Max playlist items (0 = unlimited)
            auto_start: Start download immediately
            split_by_chapters: Split video by chapters
            chapter_template: Template for chapter files
            speed_limit: Speed limit in bytes/second
            already: Set of already processed URLs (for recursion detection)

        Returns:
            Status dict with 'status' and optional 'msg'
        """
        log.info(
            f"Adding download: {url} quality={quality} format={format} "
            f"folder={folder} auto_start={auto_start}"
        )

        ok, err = validate_download_url(url)
        if not ok:
            return {"status": "error", "msg": err}

        url, fb_err = resolve_facebook_url(url)
        if fb_err:
            return {"status": "error", "msg": fb_err}

        disk_ok, disk_msg = check_disk_space(
            self.config.DOWNLOAD_DIR,
            self.config.MIN_FREE_DISK_MB,
        )
        if not disk_ok:
            return {"status": "error", "msg": disk_msg}

        # Recursion detection for playlists
        already = already or set()
        if url in already:
            log.info(f"Recursion detected, skipping: {url}")
            return {"status": "ok"}
        already.add(url)

        # Default chapter template
        if chapter_template is None:
            chapter_template = self.config.OUTPUT_TEMPLATE_CHAPTER

        # Extract info
        try:
            entry = await asyncio.get_running_loop().run_in_executor(
                None,
                extract_info,
                url,
                self.config.DOWNLOAD_DIR,
                self.config.TEMP_DIR,
                sanitize_ytdl_options(dict(self.config.YTDL_OPTIONS)),
            )
        except yt_dlp.utils.YoutubeDLError as e:
            return {"status": "error", "msg": friendly_facebook_error(str(e))}

        return await self._add_entry(
            entry=entry,
            quality=quality,
            format=format,
            folder=folder,
            custom_name_prefix=custom_name_prefix,
            playlist_item_limit=playlist_item_limit,
            auto_start=auto_start,
            split_by_chapters=split_by_chapters,
            chapter_template=chapter_template,
            speed_limit=speed_limit,
            already=already,
        )

    async def _add_entry(
        self,
        entry: dict[str, Any] | None,
        quality: str,
        format: str,
        folder: str | None,
        custom_name_prefix: str,
        playlist_item_limit: int,
        auto_start: bool,
        split_by_chapters: bool,
        chapter_template: str,
        speed_limit: int | None,
        already: set[str],
    ) -> dict[str, Any]:
        """Process an extracted entry."""
        if not entry:
            return {"status": "error", "msg": "Invalid or empty data"}

        # Check for scheduled live streams
        error = None
        if entry.get("live_status") == "is_upcoming" and "release_timestamp" in entry:
            dt = datetime.fromtimestamp(entry["release_timestamp"])
            error = f"Live stream scheduled for {dt.strftime('%Y-%m-%d %H:%M:%S')}"
        elif "msg" in entry:
            error = entry["msg"]

        etype = entry.get("_type", "video")

        # Handle URL redirect
        if etype.startswith("url"):
            return await self.add(
                url=entry["url"],
                quality=quality,
                format=format,
                folder=folder,
                custom_name_prefix=custom_name_prefix,
                playlist_item_limit=playlist_item_limit,
                auto_start=auto_start,
                split_by_chapters=split_by_chapters,
                chapter_template=chapter_template,
                speed_limit=speed_limit,
                already=already,
            )

        # Handle playlist
        if etype == "playlist":
            return await self._add_playlist(
                entry=entry,
                quality=quality,
                format=format,
                folder=folder,
                custom_name_prefix=custom_name_prefix,
                playlist_item_limit=playlist_item_limit,
                auto_start=auto_start,
                split_by_chapters=split_by_chapters,
                chapter_template=chapter_template,
                speed_limit=speed_limit,
                already=already,
            )

        # Handle video
        if etype == "video" or (etype.startswith("url") and "id" in entry and "title" in entry):
            return await self._add_video(
                entry=entry,
                quality=quality,
                format=format,
                folder=folder,
                custom_name_prefix=custom_name_prefix,
                playlist_item_limit=playlist_item_limit,
                auto_start=auto_start,
                split_by_chapters=split_by_chapters,
                chapter_template=chapter_template,
                speed_limit=speed_limit,
                error=error,
            )

        return {"status": "error", "msg": f"Unsupported resource type: {etype}"}

    async def _add_playlist(
        self,
        entry: dict[str, Any],
        quality: str,
        format: str,
        folder: str | None,
        custom_name_prefix: str,
        playlist_item_limit: int,
        auto_start: bool,
        split_by_chapters: bool,
        chapter_template: str,
        speed_limit: int | None,
        already: set[str],
    ) -> dict[str, Any]:
        """Process a playlist entry."""
        entries = entry.get("entries", [])

        # Convert generator to list
        if isinstance(entries, types.GeneratorType):
            entries = list(entries)

        log.info(f"Processing playlist with {len(entries)} entries")

        # Apply playlist limit
        if playlist_item_limit > 0:
            entries = entries[:playlist_item_limit]
            log.info(f"Limited to {playlist_item_limit} entries")

        playlist_index_digits = len(str(len(entries)))
        results = []

        for index, item in enumerate(entries, start=1):
            # Set playlist metadata
            item["_type"] = "video"
            item["playlist"] = entry.get("id")
            item["playlist_index"] = f"{{0:0{playlist_index_digits}d}}".format(index)

            for prop in ("id", "title", "uploader", "uploader_id"):
                if prop in entry:
                    item[f"playlist_{prop}"] = entry[prop]

            result = await self._add_entry(
                entry=item,
                quality=quality,
                format=format,
                folder=folder,
                custom_name_prefix=custom_name_prefix,
                playlist_item_limit=playlist_item_limit,
                auto_start=auto_start,
                split_by_chapters=split_by_chapters,
                chapter_template=chapter_template,
                speed_limit=speed_limit,
                already=already,
            )
            results.append(result)

        # Check for errors
        errors = [r["msg"] for r in results if r["status"] == "error" and "msg" in r]
        if errors:
            return {"status": "error", "msg": ", ".join(errors)}

        return {"status": "ok"}

    async def _add_video(
        self,
        entry: dict[str, Any],
        quality: str,
        format: str,
        folder: str | None,
        custom_name_prefix: str,
        playlist_item_limit: int,
        auto_start: bool,
        split_by_chapters: bool,
        chapter_template: str,
        speed_limit: int | None,
        error: str | None,
    ) -> dict[str, Any]:
        """Process a video entry."""
        url = entry.get("webpage_url") or entry.get("url")

        # Check if already in queue
        if self.queue.exists_sync(url):
            log.info(f"Already in queue: {url}")
            return {"status": "ok"}

        # Calculate download path
        download_dir, err = self._get_download_path(quality, format, folder)
        if err:
            return err

        # Convert generators in entry to lists for pickling
        entry = self._convert_generators(entry)

        # Create download object
        download = Download(
            id=entry.get("id", ""),
            url=url,
            title=entry.get("title") or entry.get("id", "Unknown"),
            quality=quality,
            format=format,
            folder=folder or "",
            custom_name_prefix=custom_name_prefix,
            error=error,
            entry=entry,
            playlist_item_limit=playlist_item_limit,
            split_by_chapters=split_by_chapters,
            chapter_template=chapter_template,
            speed_limit=speed_limit,
        )

        # Store and start
        if auto_start:
            await self.queue.put(download)
            asyncio.create_task(self._start_download(download, auto_start=True))
        else:
            await self.pending.put(download)

        await self.notifier.added(download)
        return {"status": "ok"}

    def _get_download_path(
        self,
        quality: str,
        format: str,
        folder: str | None,
    ) -> tuple[str | None, dict[str, Any] | None]:
        """Calculate download directory path.

        Returns:
            Tuple of (directory_path, error_dict)
        """
        # Determine base directory
        if is_audio_quality(quality) or is_audio_format(format):
            base_dir = self.config.AUDIO_DOWNLOAD_DIR
        else:
            base_dir = self.config.DOWNLOAD_DIR

        if not folder:
            return base_dir, None

        # Validate custom folder
        if not self.config.CUSTOM_DIRS:
            return None, {
                "status": "error",
                "msg": "Custom directories are disabled",
            }

        # Resolve and validate path
        full_path = os.path.realpath(os.path.join(base_dir, folder))
        real_base = os.path.realpath(base_dir)

        if not full_path.startswith(real_base):
            return None, {
                "status": "error",
                "msg": f"Folder must be inside {real_base}",
            }

        # Create directory if needed
        if not os.path.isdir(full_path):
            if not self.config.CREATE_CUSTOM_DIRS:
                return None, {
                    "status": "error",
                    "msg": f"Folder does not exist and CREATE_CUSTOM_DIRS is disabled",
                }
            os.makedirs(full_path, exist_ok=True)

        return full_path, None

    def _convert_generators(self, obj: Any) -> Any:
        """Recursively convert generators to lists for pickling."""
        if isinstance(obj, types.GeneratorType):
            return list(obj)
        if isinstance(obj, dict):
            return {k: self._convert_generators(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return type(obj)(self._convert_generators(item) for item in obj)
        return obj

    async def _start_download(
        self,
        download: Download,
        auto_start: bool = True,
    ) -> None:
        """Start a download with concurrency control."""
        if download.url in self._workers:
            worker = self._workers[download.url]
            if worker.is_canceled:
                log.info(f"Download was canceled: {download.title}")
                return

        async with self._semaphore:
            # Check if canceled while waiting for semaphore
            if download.url in self._workers:
                worker = self._workers[download.url]
                if worker.is_canceled:
                    return

            # Get download directory
            download_dir, _ = self._get_download_path(
                download.quality,
                download.format,
                download.folder,
            )

            # Build output template
            output_template = self.config.OUTPUT_TEMPLATE
            if download.custom_name_prefix:
                output_template = f"{download.custom_name_prefix}.{output_template}"

            # Handle playlist template
            entry = download.entry or {}
            if entry.get("playlist"):
                if self.config.OUTPUT_TEMPLATE_PLAYLIST:
                    output_template = self.config.OUTPUT_TEMPLATE_PLAYLIST
                for prop, value in entry.items():
                    if prop.startswith("playlist"):
                        output_template = output_template.replace(
                            f"%({prop})s", str(value)
                        )

            # Build ytdl options (re-sanitize cookiefile in case file changed)
            ytdl_opts = sanitize_ytdl_options(dict(self.config.YTDL_OPTIONS))
            if download.playlist_item_limit > 0:
                ytdl_opts["playlistend"] = download.playlist_item_limit

            # Create worker
            worker = DownloadWorker(
                download=download,
                download_dir=download_dir,
                temp_dir=self.config.TEMP_DIR,
                output_template=output_template,
                output_template_chapter=self.config.OUTPUT_TEMPLATE_CHAPTER,
                ytdl_opts=ytdl_opts,
            )
            self._workers[download.url] = worker

            # Run download
            try:
                await worker.start(on_update=self.notifier.updated)
            finally:
                self._post_download_cleanup(download, worker)

    def _post_download_cleanup(
        self,
        download: Download,
        worker: DownloadWorker,
    ) -> None:
        """Clean up after download completion."""
        # Handle failed downloads
        if download.status != DownloadStatus.FINISHED:
            worker.cleanup_temp_file()
            if download.status != DownloadStatus.ERROR:
                download.status = DownloadStatus.ERROR

        worker.cleanup()

        # Remove from workers dict
        self._workers.pop(download.url, None)

        # Update stores
        if self.queue.exists_sync(download.url):
            self.queue.delete_sync(download.url)

            if worker.is_canceled:
                asyncio.create_task(self.notifier.canceled(download.url))
            else:
                # Strip heavy entry data before persisting to history
                download.entry = None
                self.done.put_sync(download)
                # Cap / TTL prune history
                try:
                    self.done.prune(
                        self.config.HISTORY_MAX_ITEMS,
                        self.config.HISTORY_TTL_DAYS,
                    )
                except Exception as e:
                    log.warning(f"History prune failed: {e}")

                if download.status == DownloadStatus.ERROR:
                    asyncio.create_task(self.notifier.failed(download))
                else:
                    asyncio.create_task(self.notifier.completed(download))

    async def start_pending(self, urls: list[str]) -> dict[str, Any]:
        """Start pending downloads.

        Args:
            urls: List of URLs to start

        Returns:
            Status dict
        """
        for url in urls:
            download = await self.pending.get(url)
            if not download:
                log.warning(f"Pending download not found: {url}")
                continue

            await self.queue.put(download)
            await self.pending.delete(url)
            asyncio.create_task(self._start_download(download))

        return {"status": "ok"}

    async def cancel(self, urls: list[str]) -> dict[str, Any]:
        """Cancel downloads.

        Args:
            urls: List of URLs to cancel

        Returns:
            Status dict
        """
        for url in urls:
            # Check pending first
            if await self.pending.exists(url):
                await self.pending.delete(url)
                await self.notifier.canceled(url)
                continue

            # Check queue
            if not await self.queue.exists(url):
                log.warning(f"Download not found: {url}")
                continue

            # Cancel running download
            if url in self._workers:
                self._workers[url].cancel()
            else:
                await self.queue.delete(url)
                await self.notifier.canceled(url)

        return {"status": "ok"}

    async def clear(self, urls: list[str]) -> dict[str, Any]:
        """Clear completed downloads.

        Args:
            urls: List of URLs to clear

        Returns:
            Status dict
        """
        for url in urls:
            download = await self.done.get(url)
            if not download:
                log.warning(f"Completed download not found: {url}")
                continue

            # Delete file if configured
            if self.config.DELETE_FILE_ON_TRASHCAN and download.filename:
                download_dir, _ = self._get_download_path(
                    download.quality,
                    download.format,
                    download.folder,
                )
                if download_dir:
                    filepath = os.path.join(download_dir, download.filename)
                    try:
                        os.remove(filepath)
                    except OSError as e:
                        log.warning(f"Failed to delete file: {e}")

            await self.done.delete(url)
            await self.notifier.cleared(url)

        return {"status": "ok"}

    async def get_all(self) -> dict[str, list[dict[str, Any]]]:
        """Get all downloads.

        Returns:
            Dict with 'queue', 'pending', and 'done' lists
        """
        return {
            "queue": [d.to_dict() for _, d in await self.queue.items()],
            "pending": [d.to_dict() for _, d in await self.pending.items()],
            "done": [d.to_dict() for _, d in await self.done.items()],
        }

    def get_current(self) -> tuple[list[tuple[str, Download]], list[tuple[str, Download]]]:
        """Get current queue and done items (sync version for websocket).

        Returns:
            Tuple of (active_items, done_items)
        """
        active = (
            self.queue.items_sync() +
            self.pending.items_sync()
        )
        done = self.done.items_sync()
        return active, done
