from app.facebook_urls import resolve_facebook_url, friendly_facebook_error


def test_numeric_share_v():
    url, err = resolve_facebook_url("https://www.facebook.com/share/v/587352057218646/")
    assert err is None
    assert "watch?v=587352057218646" in url


def test_numeric_share_r():
    url, err = resolve_facebook_url("https://www.facebook.com/share/r/1625323641519890/")
    assert err is None
    assert "/reel/1625323641519890" in url


def test_non_facebook_passthrough():
    url, err = resolve_facebook_url("https://www.youtube.com/watch?v=jNQXAC9IVRw")
    assert err is None
    assert "youtube" in url


def test_friendly_hint():
    msg = friendly_facebook_error("ERROR: redirect loop detected facebook")
    assert "cookies.txt" in msg.lower() or "cookie" in msg.lower()
