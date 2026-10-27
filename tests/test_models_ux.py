from app.models import Download, DownloadStatus


def test_paused_status_roundtrip():
    d = Download(
        id="abc",
        url="https://www.youtube.com/watch?v=jNQXAC9IVRw",
        title="Me at the zoo",
        quality="best",
        format="mp4",
        status=DownloadStatus.PAUSED,
        subtitle_langs="en",
        download_sections="*0:00-0:10",
        thumbnail="https://example.com/t.jpg",
        duration=19.0,
    )
    data = d.to_dict()
    assert data["status"] == "paused"
    assert data["subtitle_langs"] == "en"
    assert data["download_sections"] == "*0:00-0:10"
    assert data["duration"] == 19.0
    back = Download.from_dict(data)
    assert back.status == DownloadStatus.PAUSED
    assert back.subtitle_langs == "en"
