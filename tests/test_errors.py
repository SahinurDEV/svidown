from app.errors import friendly_error


def test_403():
    msg = friendly_error("ERROR: unable to download video data: HTTP Error 403: Forbidden")
    assert "403" in msg
    assert "cookies" in msg.lower() or "retry" in msg.lower()


def test_login_required():
    msg = friendly_error("Sign in to confirm you're not a bot")
    assert "login" in msg.lower() or "cookies" in msg.lower()


def test_private():
    msg = friendly_error("Private video. Sign in if you've been granted access")
    assert "private" in msg.lower()


def test_geo():
    msg = friendly_error("The uploader has not made this video available in your country")
    assert "geo" in msg.lower() or "region" in msg.lower()


def test_unsupported():
    msg = friendly_error("Unsupported URL: https://example.com/foo")
    assert "unsupported" in msg.lower() or "invalid" in msg.lower()


def test_no_formats():
    msg = friendly_error("Requested format is not available")
    assert "format" in msg.lower()


def test_enametoolong():
    msg = friendly_error("[Errno 36] File name too long: ENAMETOOLONG")
    assert "long" in msg.lower()


def test_network():
    msg = friendly_error("Failed to establish a new connection: Connection refused")
    assert "network" in msg.lower() or "connectivity" in msg.lower()


def test_empty():
    msg = friendly_error(None)
    assert "unknown" in msg.lower()


def test_passthrough_unknown():
    msg = friendly_error("Some obscure extractor failure XYZ")
    assert "XYZ" in msg
