"""URL safety checks to block SSRF and non-http(s) schemes."""

from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

log = logging.getLogger("url_safety")

_BLOCKED_SCHEMES = frozenset({
    "file", "ftp", "ftps", "data", "javascript", "gopher",
    "dict", "sftp", "tftp", "ldap", "ldaps",
})


# Clash/fake-ip and some proxies map public DNS names into this range.
# Python 3.13+ also marks it as is_private — exclude it from SSRF blocks.
_FAKE_IP_NET = ipaddress.ip_network("198.18.0.0/15")


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Block private/loopback/link-local/unspecified (except fake-ip 198.18/15)."""
    try:
        if ip.version == 4 and ip in _FAKE_IP_NET:
            return False
    except Exception:
        pass
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_unspecified
    )


def _host_resolves_to_blocked(hostname: str) -> bool | None:
    """Return True if hostname resolves to a blocked address.

    Returns None if DNS resolution fails (caller decides).
    """
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return None

    for info in infos:
        sockaddr = info[4]
        try:
            ip = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            continue
        if _is_blocked_ip(ip):
            return True
    return False


def validate_download_url(url: str) -> tuple[bool, str]:
    """Validate that a URL is safe to pass to yt-dlp.

    Returns:
        (ok, error_message). error_message is empty when ok.
    """
    if not url or not isinstance(url, str):
        return False, "URL is required"

    url = url.strip()
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()

    if not scheme:
        return False, "URL must include a scheme (http or https)"

    if scheme in _BLOCKED_SCHEMES:
        return False, f"Scheme '{scheme}' is not allowed"

    if scheme not in ("http", "https"):
        return False, f"Only http and https URLs are allowed (got '{scheme}')"

    hostname = parsed.hostname
    if not hostname:
        return False, "URL must include a hostname"

    # Literal IP in hostname
    try:
        ip = ipaddress.ip_address(hostname)
        if _is_blocked_ip(ip):
            return False, "Private, loopback, and link-local addresses are blocked"
    except ValueError:
        # Hostname — resolve and check
        blocked = _host_resolves_to_blocked(hostname)
        if blocked is True:
            return False, "URL resolves to a private, loopback, or link-local address"
        # If DNS fails, still allow — yt-dlp will error; we mainly block clear SSRF

    # Block obvious metadata endpoints by name
    lowered = hostname.lower().rstrip(".")
    if lowered in ("metadata.google.internal", "metadata", "localhost") or lowered.endswith(".localhost"):
        return False, "This hostname is blocked"

    return True, ""
