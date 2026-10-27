"""Map raw yt-dlp / network errors to plain-language guidance."""

from __future__ import annotations

import re


_RULES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"HTTP Error 403|403:\s*Forbidden|status code 403", re.I),
        "Access denied (HTTP 403). The site blocked this download. Try uploading fresh cookies, "
        "or wait and retry — the site may be rate-limiting this server.",
    ),
    (
        re.compile(r"private video|this video is private|private playlist", re.I),
        "This video is private. Only the owner (or people they shared it with) can watch it. "
        "Public links work without cookies; private ones need the owner's cookies.",
    ),
    (
        re.compile(r"sign in|login required|not a bot|confirm you.?re not|age.?restricted|members.?only", re.I),
        "Login required. This video needs an account. Export cookies from your browser "
        "(Netscape cookies.txt) and upload them in the Cookies panel, then retry.",
    ),
    (
        re.compile(
            r"geo.?block|not available in your|blocked in your country|"
            r"unavailable in your country|not made this video available in your country|"
            r"available in your country",
            re.I,
        ),
        "Geo-blocked. This video is not available from this server's region. "
        "A VPN/proxy closer to the allowed region, or cookies from that region, may help.",
    ),
    (
        re.compile(r"unsupported url|no suitable extractor|unable to extract|is not a valid url", re.I),
        "Unsupported or invalid URL. Check the link, or open the site's share menu and copy the full video URL.",
    ),
    (
        re.compile(r"HTTP Error 404|404:\s*Not Found|Unable to download webpage", re.I),
        "Page not found (404). The link may be broken, expired, or not a direct video URL. Double-check and try the full share link.",
    ),
    (
        re.compile(r"no video formats|requested format is not available|format is not available|no formats", re.I),
        "No usable formats found. Try a different quality preset (e.g. Best MP4 or 720p), "
        "or upload cookies if the site hides formats from anonymous viewers.",
    ),
    (
        re.compile(r"file name too long|ENAMETOOLONG|name too long", re.I),
        "Filename too long for the filesystem. The app shortens titles automatically — retry; "
        "if it still fails, use a custom name prefix.",
    ),
    (
        re.compile(
            r"timed? ?out|connection (reset|refused|aborted)|network is unreachable|"
            r"temporary failure in name resolution|name or service not known|"
            r"Failed to establish a new connection|Remote end closed connection|"
            r"SSL:|Max retries exceeded",
            re.I,
        ),
        "Network error. Check internet connectivity on this server and retry. "
        "If it keeps failing, the site may be blocking the server IP.",
    ),
    (
        re.compile(r"Video unavailable|has been removed|taken down|copyright", re.I),
        "Video unavailable. It may have been removed, set to private, or blocked for copyright.",
    ),
    (
        re.compile(r"Requested content is not available|content is not available", re.I),
        "Content not available. It may be region-locked, expired, or require login cookies.",
    ),
]


def friendly_error(raw: str | None, *, facebook_hint: str | None = None) -> str:
    """Return a user-facing explanation for a yt-dlp/network error string."""
    if not raw:
        return "Download failed for an unknown reason. Retry, or check the server logs."
    text = str(raw).strip()
    for pattern, message in _RULES:
        if pattern.search(text):
            if facebook_hint and "facebook" in text.lower():
                return f"{message} {facebook_hint}"
            return message
    # Keep a shortened raw message as fallback so power users still see detail
    short = text.replace("\n", " ")
    if len(short) > 280:
        short = short[:277] + "..."
    return short
