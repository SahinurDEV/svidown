"""Facebook URL normalization and clearer login-wall errors."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote, unquote, urlparse, parse_qs

log = logging.getLogger("facebook_urls")

_FB_HOSTS = ("facebook.com", "fb.watch", "fb.com", "facebookwkhpilnemxj7akgyu5t6n3z4q.com")


def _is_facebook_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower().lstrip("www.")
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) for h in ("facebook.com", "fb.com", "fb.watch", "m.facebook.com", "mbasic.facebook.com"))


def _looks_like_login(url: str, body: str = "") -> bool:
    u = (url or "").lower()
    if "/login" in u or "login.php" in u:
        return True
    head = (body or "")[:4000].lower()
    return "log in to facebook" in head or "you must log in" in head


def _extract_canonical_from_html(html: str) -> str | None:
    patterns = [
        r'property="og:url"\s+content="([^"]+)"',
        r'rel="canonical"\s+href="([^"]+)"',
        r'"video_url":"(https:\\/\\/www\.facebook\.com\\/[^"]+)"',
        r'content="(https://www\.facebook\.com/(?:reel|watch|[^"/]+/videos)/\S+?)"',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.I)
        if not m:
            continue
        cand = m.group(1).encode("utf-8").decode("unicode_escape") if "\\/" in m.group(1) else m.group(1)
        cand = cand.replace("\\/", "/")
        if "/reel/" in cand or "/watch" in cand or "/videos/" in cand:
            return cand.split("#")[0]
    # video id fallbacks
    for pat in (r'"video_id":"(\d{8,})"', r"/reel/(\d{8,})", r"watch/\?v=(\d{8,})"):
        m = re.search(pat, html)
        if m:
            vid = m.group(1)
            if "/reel/" in html or "reel" in pat:
                return f"https://www.facebook.com/reel/{vid}/"
            return f"https://www.facebook.com/watch?v={vid}"
    return None


def resolve_facebook_url(url: str) -> tuple[str, str | None]:
    """Normalize/resolve Facebook URLs.

    Returns (url, error_message). error_message set when unrecoverable (e.g. login wall).
    """
    if not url or not _is_facebook_url(url):
        return url, None

    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""

    # Numeric share shortcuts (rare but cheap)
    m = re.match(r"^/share/v/(\d+)/?$", path)
    if m:
        return f"https://www.facebook.com/watch?v={m.group(1)}", None
    m = re.match(r"^/share/r/(\d+)/?$", path)
    if m:
        return f"https://www.facebook.com/reel/{m.group(1)}/", None

    # m.facebook.com → www for consistency
    if host.startswith("m.") or host.startswith("mbasic."):
        url = "https://www.facebook.com" + path + (("?" + parsed.query) if parsed.query else "")
        parsed = urlparse(url)
        host = "www.facebook.com"

    needs_resolve = (
        "fb.watch" in host
        or path.startswith("/share/")
        or host.endswith("fb.watch")
    )
    if not needs_resolve:
        return url, None

    try:
        from curl_cffi import requests as creq
    except ImportError:
        if "fb.watch" in host:
            return url, (
                "Facebook short link (fb.watch) could not be resolved without curl_cffi. "
                "Paste the full facebook.com/videos/... or /reel/... URL, or provide cookies."
            )
        return url, None

    try:
        r = creq.get(
            url,
            impersonate="chrome",
            allow_redirects=True,
            timeout=25,
            headers={"Accept-Language": "en-US,en;q=0.9"},
        )
    except Exception as e:
        err = str(e)
        if "redirect" in err.lower() or "Maximum" in err:
            return url, (
                "Facebook short/share link hit a login redirect loop from this server IP. "
                "Export a Netscape cookies.txt from a logged-in browser (Get cookies.txt LOCALLY), "
                "mount it at /cookies/cookies.txt, and retry — or paste the full "
                "facebook.com/watch?v=... /reel/... /Page/videos/... URL instead."
            )
        log.warning(f"Facebook resolve failed for {url}: {e}")
        return url, None

    final = str(r.url or "")
    if _looks_like_login(final, r.text or ""):
        return url, (
            "Facebook requires login to open this short/share link from the server "
            "(common on datacenter IPs). Provide browser cookies via COOKIES_FILE / "
            "YTDL_OPTIONS cookiefile, or paste the full public facebook.com video/reel URL."
        )

    canonical = _extract_canonical_from_html(r.text or "") or final
    # Prefer clean reel/watch without tracking junk when possible
    if "/reel/" in canonical or "/watch" in canonical or "/videos/" in canonical:
        # strip share_url / rdid noise
        p = urlparse(canonical)
        clean_q = ""
        if "v=" in (p.query or "") and "/watch" in p.path:
            qs = parse_qs(p.query)
            if "v" in qs:
                canonical = f"https://www.facebook.com/watch?v={qs['v'][0]}"
        elif "/reel/" in p.path:
            rm = re.search(r"/reel/(\d+)", p.path)
            if rm:
                canonical = f"https://www.facebook.com/reel/{rm.group(1)}/"
        log.info(f"Resolved Facebook URL {url} → {canonical}")
        return canonical, None

    if canonical and canonical != url and not _looks_like_login(canonical):
        return canonical, None

    return url, None


def friendly_facebook_error(msg: str) -> str:
    """Annotate raw yt-dlp Facebook errors with cookie guidance when relevant."""
    low = (msg or "").lower()
    if not any(k in low for k in ("facebook", "fb.watch", "login", "redirect loop", "cannot parse data")):
        return msg
    hint = (
        " Hint: many Facebook videos need a logged-in Netscape cookies.txt on datacenter "
        "IPs. Export with 'Get cookies.txt LOCALLY', place at ./cookies/cookies.txt, restart. "
        "Prefer full /watch?v=, /reel/, or /Page/videos/ URLs over fb.watch when possible."
    )
    if hint.strip() in msg:
        return msg
    return (msg or "").rstrip() + hint
