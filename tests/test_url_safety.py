from app.url_safety import validate_download_url


def test_https_ok():
    ok, msg = validate_download_url("https://www.youtube.com/watch?v=jNQXAC9IVRw")
    assert ok, msg


def test_file_blocked():
    ok, msg = validate_download_url("file:///etc/passwd")
    assert not ok
    assert "not allowed" in msg.lower() or "scheme" in msg.lower()


def test_loopback_ip_blocked():
    ok, msg = validate_download_url("http://127.0.0.1/secret")
    assert not ok


def test_localhost_blocked():
    ok, msg = validate_download_url("http://localhost:3000/add")
    assert not ok


def test_private_ip_blocked():
    ok, msg = validate_download_url("http://192.168.1.1/")
    assert not ok
