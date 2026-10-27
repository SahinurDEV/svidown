"""Optional HTTP Basic / bearer-token authentication middleware."""

from __future__ import annotations

import base64
import hmac
import logging
from typing import Callable, Awaitable

from aiohttp import web

log = logging.getLogger("auth")


class AuthConfig:
    def __init__(
        self,
        username: str = "",
        password: str = "",
        token: str = "",
    ):
        self.username = username or ""
        self.password = password or ""
        self.token = token or ""

    @property
    def enabled(self) -> bool:
        return bool(self.token) or bool(self.username and self.password)


def _constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _header(request: web.Request, name: str) -> str:
    # Case-insensitive header get for both aiohttp and fake environ wrappers
    target = name.lower()
    for k, v in request.headers.items():
        if k.lower() == target:
            return v
    return ""


def check_credentials(auth: AuthConfig, request: web.Request) -> bool:
    """Return True if request is authenticated (or auth disabled)."""
    if not auth.enabled:
        return True

    # Bearer / raw token headers
    auth_header = _header(request, "Authorization")
    if auth.token:
        if auth_header.startswith("Bearer "):
            provided = auth_header[7:].strip()
            if _constant_time_eq(provided, auth.token):
                return True
        api_token = _header(request, "X-API-Token")
        if api_token and _constant_time_eq(api_token, auth.token):
            return True
        q = request.rel_url.query.get("token", "")
        if q and _constant_time_eq(q, auth.token):
            return True

    # HTTP Basic
    if auth.username and auth.password and auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header[6:].strip()).decode("utf-8")
            user, _, pwd = decoded.partition(":")
            if _constant_time_eq(user, auth.username) and _constant_time_eq(pwd, auth.password):
                return True
        except Exception:
            return False

    return False


@web.middleware
async def auth_middleware(
    request: web.Request,
    handler: Callable[[web.Request], Awaitable[web.StreamResponse]],
) -> web.StreamResponse:
    auth: AuthConfig = request.app["auth"]
    if not auth.enabled:
        return await handler(request)

    # Health probe is always open (Docker HEALTHCHECK).
    path = request.path.rstrip("/") or "/"
    if path.endswith("/health") or path == "/health":
        return await handler(request)

    if check_credentials(auth, request):
        return await handler(request)

    return web.Response(
        status=401,
        text='{"status":"error","msg":"Unauthorized"}',
        content_type="application/json",
        headers={"WWW-Authenticate": 'Basic realm="svidown"'},
    )


def socketio_auth_callback(auth: AuthConfig):
    """Return an auth callable for python-socketio connect."""

    def _auth(sid, environ, auth_payload=None):
        if not auth.enabled:
            return True

        # environ has HTTP_AUTHORIZATION etc.
        class _FakeReq:
            def __init__(self, environ, auth_payload):
                headers = {}
                for k, v in environ.items():
                    if k.startswith("HTTP_"):
                        name = k[5:].replace("_", "-").title()
                        # Fix Authorization casing
                        if name == "Authorization":
                            name = "Authorization"
                        headers[name] = v
                # QUERY_STRING token=
                qs = environ.get("QUERY_STRING", "")
                query = {}
                for part in qs.split("&"):
                    if "=" in part:
                        a, b = part.split("=", 1)
                        query[a] = b
                self.headers = headers
                self.rel_url = type("u", (), {"query": query})()
                if isinstance(auth_payload, dict):
                    tok = auth_payload.get("token") or auth_payload.get("Authorization")
                    if tok:
                        if not str(tok).startswith("Bearer ") and not str(tok).startswith("Basic "):
                            self.headers["X-Api-Token"] = str(tok)
                        else:
                            self.headers["Authorization"] = str(tok)

        fake = _FakeReq(environ, auth_payload)
        # Normalize header keys for check_credentials
        normalized = {}
        for k, v in fake.headers.items():
            kl = k.lower()
            if kl == "authorization":
                normalized["Authorization"] = v
            elif kl in ("x-api-token", "x-api-token"):
                normalized["X-API-Token"] = v
            else:
                normalized[k] = v
        fake.headers = normalized
        ok = check_credentials(auth, fake)  # type: ignore[arg-type]
        if not ok:
            log.warning(f"Socket.IO auth failed for sid={sid}")
        return ok

    return _auth
