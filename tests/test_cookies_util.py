import os
from pathlib import Path

from app.cookies_util import is_valid_netscape_cookiefile, sanitize_ytdl_options


def test_missing_cookiefile(tmp_path: Path):
    assert not is_valid_netscape_cookiefile(str(tmp_path / "nope.txt"))


def test_empty_cookiefile(tmp_path: Path):
    f = tmp_path / "cookies.txt"
    f.write_text("")
    assert not is_valid_netscape_cookiefile(str(f))
    opts = sanitize_ytdl_options({"cookiefile": str(f), "quiet": True})
    assert "cookiefile" not in opts
    assert opts["quiet"] is True


def test_valid_netscape(tmp_path: Path):
    f = tmp_path / "cookies.txt"
    f.write_text(
        "# Netscape HTTP Cookie File\n"
        ".youtube.com\tTRUE\t/\tFALSE\t0\tCONSENT\tYES\n"
    )
    assert is_valid_netscape_cookiefile(str(f))
    opts = sanitize_ytdl_options({"cookiefile": str(f)})
    assert opts["cookiefile"] == str(f)
