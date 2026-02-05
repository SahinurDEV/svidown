"""yt-dlp format string builder and options configuration."""

import copy
from typing import Any

AUDIO_FORMATS = ("m4a", "mp3", "opus", "wav", "flac")


def build_format_string(format: str, quality: str) -> str:
    """Build yt-dlp format selection string.

    Args:
        format: Output format (mp4, any, m4a, mp3, opus, wav, flac, thumbnail, or custom:...)
        quality: Quality setting (best, best_ios, worst, audio, or resolution like 1080)

    Returns:
        yt-dlp format string

    Raises:
        ValueError: Unknown format
    """
    format = format or "any"

    # Custom format string
    if format.startswith("custom:"):
        return format[7:]

    # Thumbnail only - quality doesn't matter
    if format == "thumbnail":
        return "bestaudio/best"

    # Audio formats
    if format in AUDIO_FORMATS:
        return f"bestaudio[ext={format}]/bestaudio/best"

    # Video formats (mp4, any)
    if format in ("mp4", "any"):
        if quality == "audio":
            return "bestaudio/best"

        # Build video/audio format components
        vfmt, afmt = ("[ext=mp4]", "[ext=m4a]") if format == "mp4" else ("", "")
        vres = f"[height<={quality}]" if quality not in ("best", "best_ios", "worst") else ""
        vcombo = vres + vfmt

        # iOS-compatible format (h264/h265 video + aac audio)
        if quality == "best_ios":
            return (
                f"bestvideo[vcodec~='^((he|a)vc|h26[45])']{vres}+bestaudio[acodec=aac]/"
                f"bestvideo[vcodec~='^((he|a)vc|h26[45])']{vres}+bestaudio{afmt}/"
                f"bestvideo{vcombo}+bestaudio{afmt}/best{vcombo}"
            )

        return f"bestvideo{vcombo}+bestaudio{afmt}/best{vcombo}"

    raise ValueError(f"Unknown format: {format}")


def build_ytdl_options(
    format: str,
    quality: str,
    base_opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build yt-dlp options dictionary.

    Args:
        format: Output format
        quality: Quality setting
        base_opts: Base options to merge with (will be copied)

    Returns:
        yt-dlp options dictionary with postprocessors
    """
    opts = copy.deepcopy(base_opts) if base_opts else {}
    postprocessors: list[dict[str, Any]] = []

    # Audio format processing
    if format in AUDIO_FORMATS:
        postprocessors.append({
            "key": "FFmpegExtractAudio",
            "preferredcodec": format,
            "preferredquality": 0 if quality == "best" else quality,
        })

        # Embed thumbnail for audio (except wav which doesn't support it)
        if format != "wav" and "writethumbnail" not in opts:
            opts["writethumbnail"] = True
            postprocessors.append({
                "key": "FFmpegThumbnailsConvertor",
                "format": "jpg",
                "when": "before_dl",
            })
            postprocessors.append({"key": "FFmpegMetadata"})
            postprocessors.append({"key": "EmbedThumbnail"})

    # Thumbnail only processing
    if format == "thumbnail":
        opts["skip_download"] = True
        opts["writethumbnail"] = True
        postprocessors.append({
            "key": "FFmpegThumbnailsConvertor",
            "format": "jpg",
            "when": "before_dl",
        })

    # Merge postprocessors with any existing ones
    opts["postprocessors"] = postprocessors + opts.get("postprocessors", [])

    return opts


def add_chapter_splitting(opts: dict[str, Any], chapter_template: str) -> dict[str, Any]:
    """Add chapter splitting postprocessor to options.

    Args:
        opts: Existing options dictionary (will be modified)
        chapter_template: Output template for chapter files

    Returns:
        Modified options dictionary
    """
    if "outtmpl" not in opts:
        opts["outtmpl"] = {}

    opts["outtmpl"]["chapter"] = chapter_template

    if "postprocessors" not in opts:
        opts["postprocessors"] = []

    opts["postprocessors"].append({
        "key": "FFmpegSplitChapters",
        "force_keyframes": False,
    })

    return opts


def is_audio_format(format: str) -> bool:
    """Check if format is an audio-only format."""
    return format in AUDIO_FORMATS


def is_audio_quality(quality: str) -> bool:
    """Check if quality indicates audio-only download."""
    return quality == "audio"
