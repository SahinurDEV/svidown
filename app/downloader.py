"""yt-dlp download worker with progress tracking."""

import asyncio
import logging
import multiprocessing
import os
import re
from typing import Any, Callable

import yt_dlp
import yt_dlp.networking.impersonate

from .formats import build_format_string, build_ytdl_options, add_chapter_splitting
from .models import Download, DownloadStatus, ChapterFile

log = logging.getLogger("downloader")

# Shared multiprocessing manager
_manager = None


def _get_manager():
    """Get or create the shared multiprocessing manager."""
    global _manager
    if _manager is None:
        _manager = multiprocessing.Manager()
    return _manager


def _download_process(
    url: str,
    download_dir: str,
    temp_dir: str,
    output_template: str,
    output_template_chapter: str,
    format_string: str,
    ytdl_opts: dict[str, Any],
    split_by_chapters: bool,
    chapter_template: str,
    speed_limit: int | None,
    status_queue: multiprocessing.Queue,
    subtitle_langs: str | None = None,
    download_sections: str | None = None,
) -> None:
    """Download process running in subprocess."""
    debug_logging = logging.getLogger().isEnabledFor(logging.DEBUG)

    def progress_hook(status: dict[str, Any]) -> None:
        """Send progress updates to the queue."""
        filtered = {
            k: v for k, v in status.items()
            if k in (
                "tmpfilename", "filename", "status", "msg",
                "total_bytes", "total_bytes_estimate",
                "downloaded_bytes", "speed", "eta",
            )
        }
        status_queue.put(filtered)

    def postprocessor_hook(data: dict[str, Any]) -> None:
        """Handle postprocessor events."""
        pp = data.get("postprocessor")
        pp_status = data.get("status")

        # Handle MoveFiles completion
        if pp == "MoveFiles" and pp_status == "finished":
            info = data.get("info_dict", {})
            if "__finaldir" in info:
                filename = os.path.join(
                    info["__finaldir"],
                    os.path.basename(info.get("filepath", ""))
                )
            else:
                filename = info.get("filepath", "")
            status_queue.put({"status": "finished", "filename": filename})

        # Handle SplitChapters completion
        elif pp == "SplitChapters" and pp_status == "finished":
            chapters = data.get("info_dict", {}).get("chapters", [])
            for chapter in chapters:
                if isinstance(chapter, dict) and "filepath" in chapter:
                    status_queue.put({"chapter_file": chapter["filepath"]})

    # Build yt-dlp parameters
    params = {
        "quiet": not debug_logging,
        "verbose": debug_logging,
        "no_color": True,
        "paths": {"home": download_dir, "temp": temp_dir},
        "outtmpl": {
            "default": output_template,
            "chapter": output_template_chapter,
        },
        "format": format_string,
        "socket_timeout": 30,
        "ignore_no_formats_error": True,
        "continuedl": True,
        "progress_hooks": [progress_hook],
        "postprocessor_hooks": [postprocessor_hook],
        **ytdl_opts,
    }

    # Add chapter splitting if enabled
    if split_by_chapters:
        params["outtmpl"]["chapter"] = chapter_template
        if "postprocessors" not in params:
            params["postprocessors"] = []
        params["postprocessors"].append({
            "key": "FFmpegSplitChapters",
            "force_keyframes": False,
        })

    # Add speed limit if specified
    if speed_limit and speed_limit > 0:
        params["ratelimit"] = speed_limit

    # Subtitles
    if subtitle_langs:
        langs = [x.strip() for x in subtitle_langs.split(",") if x.strip()]
        if langs:
            params["writesubtitles"] = True
            params["writeautomaticsub"] = True
            params["subtitleslangs"] = langs if "all" not in [l.lower() for l in langs] else ["all"]
            params.setdefault("postprocessors", []).append({
                "key": "FFmpegEmbedSubtitle",
                "already_have_subtitle": False,
            })

    # Time-range clip via download_sections (yt-dlp)
    # Must pass parsed (start, end) floats — NOT raw "*0:00-0:05" strings.
    if download_sections:
        try:
            from yt_dlp.utils import download_range_func, parse_duration
            section = download_sections.strip()
            if not section.startswith("*"):
                section = "*" + section
            # Support "*start-end" or "*start-end,start2-end2"
            ranges = []
            for part in section[1:].split(","):
                part = part.strip()
                if "-" not in part:
                    raise ValueError(f"clip must look like 0:30-1:00, got {part!r}")
                start_s, end_s = part.split("-", 1)
                start = parse_duration(start_s or "0") or 0
                end = float("inf") if end_s in ("", "inf", "infinite") else (parse_duration(end_s) or 0)
                ranges.append([start, end])
            params["download_ranges"] = download_range_func([], ranges)
            params["force_keyframes_at_cuts"] = True
        except Exception as e:
            status_queue.put({"status": "error", "msg": f"Invalid clip range: {e}"})
            return

    try:
        ret = yt_dlp.YoutubeDL(params=params).download([url])
        status_queue.put({"status": "finished" if ret == 0 else "error"})
    except yt_dlp.utils.YoutubeDLError as e:
        log.error(f"Download error: {e}")
        status_queue.put({"status": "error", "msg": str(e)})
    except Exception as e:
        log.error(f"Unexpected error: {e}")
        status_queue.put({"status": "error", "msg": str(e)})


class DownloadWorker:
    """Worker that runs yt-dlp downloads in a subprocess."""

    def __init__(
        self,
        download: Download,
        download_dir: str,
        temp_dir: str,
        output_template: str,
        output_template_chapter: str,
        ytdl_opts: dict[str, Any] | None = None,
    ):
        self.download = download
        self.download_dir = download_dir
        self.temp_dir = temp_dir
        self.output_template = output_template
        self.output_template_chapter = output_template_chapter
        self.ytdl_opts = ytdl_opts or {}

        # Build format string and options
        self.format_string = build_format_string(download.format, download.quality)
        self.options = build_ytdl_options(
            download.format,
            download.quality,
            self.ytdl_opts,
        )

        # Handle impersonate option
        if "impersonate" in self.options:
            self.options["impersonate"] = yt_dlp.networking.impersonate.ImpersonateTarget.from_str(
                self.options["impersonate"]
            )

        self._process: multiprocessing.Process | None = None
        self._status_queue: multiprocessing.Queue | None = None
        self._canceled = False
        self._paused = False
        self._tmpfilename: str | None = None

    async def start(
        self,
        on_update: Callable[[Download], Any] | None = None,
    ) -> Download:
        """Start the download and wait for completion.

        Args:
            on_update: Callback for progress updates

        Returns:
            Updated Download object
        """
        log.info(f"Starting download: {self.download.title}")

        manager = _get_manager()
        self._status_queue = manager.Queue()

        self._process = multiprocessing.Process(
            target=_download_process,
            args=(
                self.download.url,
                self.download_dir,
                self.temp_dir,
                self.output_template,
                self.output_template_chapter,
                self.format_string,
                self.options,
                self.download.split_by_chapters,
                self.download.chapter_template,
                self.download.speed_limit,
                self._status_queue,
                self.download.subtitle_langs,
                self.download.download_sections,
            ),
        )

        self.download.status = DownloadStatus.PREPARING
        if on_update:
            await self._call_update(on_update)

        self._process.start()

        # Start status monitoring
        loop = asyncio.get_running_loop()
        asyncio.create_task(self._monitor_status(on_update))

        # Wait for process to complete
        await loop.run_in_executor(None, self._process.join)

        return self.download

    async def _monitor_status(
        self,
        on_update: Callable[[Download], Any] | None,
    ) -> None:
        """Monitor the status queue for updates."""
        loop = asyncio.get_running_loop()

        while True:
            try:
                status = await loop.run_in_executor(
                    None,
                    self._status_queue.get,
                )
            except Exception:
                break

            if status is None or self._canceled:
                break

            # Handle chapter file
            if "chapter_file" in status:
                chapter_file = status["chapter_file"]
                rel_path = os.path.relpath(chapter_file, self.download_dir)
                file_size = None
                if os.path.exists(chapter_file):
                    file_size = os.path.getsize(chapter_file)

                # Check if already exists
                existing = next(
                    (cf for cf in self.download.chapter_files
                     if cf.filename == rel_path),
                    None
                )
                if not existing:
                    self.download.chapter_files.append(
                        ChapterFile(filename=rel_path, size=file_size)
                    )
                continue

            # Update tmpfilename for cleanup
            if "tmpfilename" in status:
                self._tmpfilename = status["tmpfilename"]

            # Update filename
            if "filename" in status:
                filename = status["filename"]
                self.download.filename = os.path.relpath(filename, self.download_dir)
                if os.path.exists(filename):
                    self.download.size = os.path.getsize(filename)

                # Handle thumbnail format filename
                if self.download.format == "thumbnail":
                    self.download.filename = re.sub(
                        r"\.webm$", ".jpg", self.download.filename
                    )

            # Update status
            if "status" in status:
                status_str = status["status"]
                if status_str == "downloading":
                    self.download.status = DownloadStatus.DOWNLOADING
                elif status_str == "finished":
                    self.download.status = DownloadStatus.FINISHED
                elif status_str == "error":
                    self.download.status = DownloadStatus.ERROR

            # Update progress
            if "downloaded_bytes" in status:
                total = status.get("total_bytes") or status.get("total_bytes_estimate")
                if total:
                    self.download.percent = status["downloaded_bytes"] / total * 100

            # Update speed and ETA
            self.download.speed = status.get("speed", self.download.speed)
            self.download.eta = status.get("eta", self.download.eta)
            self.download.msg = status.get("msg", self.download.msg)

            if on_update:
                await self._call_update(on_update)

    async def _call_update(
        self,
        on_update: Callable[[Download], Any],
    ) -> None:
        """Call update callback, handling both sync and async callbacks."""
        result = on_update(self.download)
        if asyncio.iscoroutine(result):
            await result

    def pause(self) -> None:
        """Pause the download (cancel process but mark as paused)."""
        log.info(f"Pausing download: {self.download.title}")
        self._paused = True
        self.cancel()

    def cancel(self) -> None:
        """Cancel the download."""
        log.info(f"Canceling download: {self.download.title}")
        self._canceled = True

        if self._process and self._process.is_alive():
            try:
                self._process.kill()
            except Exception as e:
                log.error(f"Error killing process: {e}")

        if self._status_queue:
            try:
                self._status_queue.put(None)
            except Exception:
                pass

    def cleanup(self) -> None:
        """Clean up resources."""
        log.debug(f"Cleaning up: {self.download.title}")

        if self._process:
            try:
                self._process.close()
            except Exception:
                pass

        if self._status_queue:
            try:
                self._status_queue.put(None)
            except Exception:
                pass

    def cleanup_temp_file(self) -> None:
        """Remove temporary download file if it exists."""
        if self._tmpfilename and os.path.isfile(self._tmpfilename):
            try:
                os.remove(self._tmpfilename)
                log.debug(f"Removed temp file: {self._tmpfilename}")
            except OSError as e:
                log.warning(f"Failed to remove temp file: {e}")

    @property
    def is_running(self) -> bool:
        """Check if the download process is running."""
        try:
            return self._process is not None and self._process.is_alive()
        except ValueError:
            return False

    @property
    def is_started(self) -> bool:
        """Check if the download has been started."""
        return self._process is not None

    @property
    def is_canceled(self) -> bool:
        """Check if the download was canceled."""
        return self._canceled

    @property
    def is_paused(self) -> bool:
        """Check if the download was paused."""
        return self._paused


def extract_info(
    url: str,
    download_dir: str,
    temp_dir: str,
    ytdl_opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Extract video information without downloading.

    Args:
        url: URL to extract info from
        download_dir: Download directory
        temp_dir: Temporary directory
        ytdl_opts: Additional yt-dlp options

    Returns:
        Extracted info dictionary

    Raises:
        yt_dlp.utils.YoutubeDLError: Extraction error
    """
    debug_logging = logging.getLogger().isEnabledFor(logging.DEBUG)
    opts = ytdl_opts or {}

    # Handle impersonate option
    if "impersonate" in opts:
        opts = opts.copy()
        opts["impersonate"] = yt_dlp.networking.impersonate.ImpersonateTarget.from_str(
            opts["impersonate"]
        )

    params = {
        "quiet": not debug_logging,
        "verbose": debug_logging,
        "no_color": True,
        "extract_flat": True,
        "ignore_no_formats_error": False,
        "noplaylist": True,
        "paths": {"home": download_dir, "temp": temp_dir},
        **opts,
    }

    return yt_dlp.YoutubeDL(params=params).extract_info(url, download=False)


def extract_channel_info(
    url: str,
    download_dir: str,
    temp_dir: str,
    limit: int = 0,
    ytdl_opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Extract all video entries from a channel/playlist URL.

    Args:
        url: Channel or playlist URL
        download_dir: Download directory
        temp_dir: Temporary directory
        limit: Max number of entries (0 = unlimited)
        ytdl_opts: Additional yt-dlp options

    Returns:
        Dict with channel title and list of video entries
    """
    debug_logging = logging.getLogger().isEnabledFor(logging.DEBUG)
    opts = ytdl_opts or {}

    if "impersonate" in opts:
        opts = opts.copy()
        opts["impersonate"] = yt_dlp.networking.impersonate.ImpersonateTarget.from_str(
            opts["impersonate"]
        )

    params = {
        "quiet": not debug_logging,
        "verbose": debug_logging,
        "no_color": True,
        "extract_flat": True,
        "ignore_no_formats_error": False,
        "paths": {"home": download_dir, "temp": temp_dir},
        **opts,
    }

    if limit > 0:
        params["playlistend"] = limit

    ydl = yt_dlp.YoutubeDL(params=params)

    # For YouTube channel URLs without a specific tab, default to /videos
    import re as _re
    channel_pattern = _re.compile(
        r'youtube\.com/(@[\w.-]+|channel/[\w-]+|c/[\w.-]+|user/[\w.-]+)/?$'
    )
    if channel_pattern.search(url):
        url = url.rstrip('/') + '/videos'

    info = ydl.extract_info(url, download=False)
    if not info:
        return {"title": "", "entries": []}

    # Single video, not a channel/playlist
    if info.get("_type") not in ("playlist", "multi_video"):
        return {
            "title": info.get("title", ""),
            "entries": [{
                "id": info.get("id", ""),
                "title": info.get("title", ""),
                "url": info.get("webpage_url") or info.get("url") or url,
                "duration": info.get("duration"),
                "thumbnail": info.get("thumbnail"),
            }],
        }

    # Flatten nested playlists (channel tabs return sub-playlists)
    entries = []
    for entry in (info.get("entries") or []):
        if entry is None:
            continue
        # Skip sub-playlist entries (like "Videos", "Shorts", "Live" tabs)
        entry_type = entry.get("_type", "video")
        if entry_type == "playlist":
            # Recursively extract from sub-playlist
            sub_entries = entry.get("entries") or []
            for sub in sub_entries:
                if sub is None:
                    continue
                entries.append({
                    "id": sub.get("id", ""),
                    "title": sub.get("title", ""),
                    "url": sub.get("webpage_url") or sub.get("url", ""),
                    "duration": sub.get("duration"),
                    "thumbnail": sub.get("thumbnail"),
                })
        else:
            entries.append({
                "id": entry.get("id", ""),
                "title": entry.get("title", ""),
                "url": entry.get("webpage_url") or entry.get("url", ""),
                "duration": entry.get("duration"),
                "thumbnail": entry.get("thumbnail"),
            })

    return {
        "title": info.get("title", ""),
        "channel": info.get("channel") or info.get("uploader", ""),
        "entries": entries,
    }


def extract_preview_info(
    url: str,
    download_dir: str,
    temp_dir: str,
    ytdl_opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Extract rich preview info (formats with sizes) without downloading."""
    debug_logging = logging.getLogger().isEnabledFor(logging.DEBUG)
    opts = dict(ytdl_opts or {})

    if "impersonate" in opts:
        opts["impersonate"] = yt_dlp.networking.impersonate.ImpersonateTarget.from_str(
            opts["impersonate"]
        )

    params = {
        "quiet": not debug_logging,
        "verbose": debug_logging,
        "no_color": True,
        "skip_download": True,
        "ignore_no_formats_error": False,
        "noplaylist": False,
        "extract_flat": False,
        "paths": {"home": download_dir, "temp": temp_dir},
        **opts,
    }

    info = yt_dlp.YoutubeDL(params=params).extract_info(url, download=False)
    if not info:
        return {"status": "error", "msg": "No info returned"}

    etype = info.get("_type", "video")
    if etype == "playlist":
        entries = []
        for e in (info.get("entries") or [])[:50]:
            if not e:
                continue
            entries.append({
                "id": e.get("id", ""),
                "title": e.get("title") or e.get("id") or "Untitled",
                "url": e.get("webpage_url") or e.get("url") or "",
                "duration": e.get("duration"),
                "thumbnail": e.get("thumbnail") or (e.get("thumbnails") or [{}])[-1].get("url"),
            })
        return {
            "status": "ok",
            "type": "playlist",
            "id": info.get("id", ""),
            "title": info.get("title") or info.get("id") or "Playlist",
            "thumbnail": info.get("thumbnail"),
            "entries": entries,
            "entry_count": len(info.get("entries") or []),
        }

    formats_out = []
    seen = set()
    for f in info.get("formats") or []:
        height = f.get("height")
        ext = f.get("ext")
        vcodec = f.get("vcodec") or "none"
        acodec = f.get("acodec") or "none"
        filesize = f.get("filesize") or f.get("filesize_approx")
        format_id = f.get("format_id")
        if not format_id:
            continue
        # Prefer progressive or combined estimates
        label = None
        if vcodec != "none" and height:
            label = f"{height}p"
        elif vcodec == "none" and acodec != "none":
            label = f"audio-{ext or 'm4a'}"
        else:
            continue
        key = (label, ext)
        if key in seen:
            continue
        seen.add(key)
        formats_out.append({
            "format_id": format_id,
            "label": label,
            "ext": ext,
            "height": height,
            "filesize": filesize,
            "tbr": f.get("tbr"),
            "vcodec": vcodec,
            "acodec": acodec,
        })

    # Aggregate common quality buckets with best filesize estimate
    buckets: dict[str, dict] = {}
    for f in formats_out:
        label = f["label"]
        if label.startswith("audio"):
            bucket = "mp3"
        elif f.get("height"):
            h = f["height"]
            if h >= 1080:
                bucket = "1080p"
            elif h >= 720:
                bucket = "720p"
            elif h >= 480:
                bucket = "480p"
            else:
                bucket = f"{h}p"
        else:
            continue
        prev = buckets.get(bucket)
        size = f.get("filesize") or 0
        if not prev or (size and size > (prev.get("filesize") or 0)):
            buckets[bucket] = {
                "quality": bucket,
                "filesize": f.get("filesize"),
                "ext": f.get("ext"),
                "format_id": f.get("format_id"),
            }

    # duration-based rough estimate when filesize missing
    duration = info.get("duration") or 0
    for b in buckets.values():
        if not b.get("filesize") and duration and info.get("formats"):
            # leave None — UI shows "—"
            pass

    thumb = info.get("thumbnail")
    if not thumb:
        thumbs = info.get("thumbnails") or []
        if thumbs:
            thumb = thumbs[-1].get("url")

    subs = []
    for lang, tracks in (info.get("subtitles") or {}).items():
        subs.append({"lang": lang, "auto": False})
    for lang, tracks in (info.get("automatic_captions") or {}).items():
        if lang not in {s["lang"] for s in subs}:
            subs.append({"lang": lang, "auto": True})

    return {
        "status": "ok",
        "type": "video",
        "id": info.get("id", ""),
        "title": info.get("title") or info.get("id") or "Untitled",
        "url": info.get("webpage_url") or url,
        "duration": duration,
        "thumbnail": thumb,
        "uploader": info.get("uploader") or info.get("channel"),
        "qualities": list(buckets.values()),
        "formats": formats_out[:40],
        "subtitles": sorted(subs, key=lambda s: (s["auto"], s["lang"]))[:40],
    }
