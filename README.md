# svidown

[![Docker Hub](https://img.shields.io/docker/pulls/sahinurdev/svidown)](https://hub.docker.com/r/sahinurdev/svidown)
[![Docker Image Version](https://img.shields.io/docker/v/sahinurdev/svidown/latest)](https://hub.docker.com/r/sahinurdev/svidown)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Download videos from 1000+ websites** - A modern, self-hosted video downloader with a clean web interface.

**Supported Architectures:** `linux/amd64` · `linux/arm64`

## Supported Platforms

svidown uses [yt-dlp](https://github.com/yt-dlp/yt-dlp). Real-world success depends on a **fresh yt-dlp**, network/IP reputation, and often **browser cookies**.

| Platform | Typical support | Notes |
|----------|-----------------|-------|
| YouTube | Good when yt-dlp is up to date | Needs recent yt-dlp + deno (bundled in Docker). Auto-update recommended. |
| Facebook | Partial | Public videos; cookies often required from datacenter IPs. |
| Instagram | Cookies required | Public reels/posts usually need a Netscape `cookies.txt`. Refresh when downloads start failing. |
| Twitter / X | Cookies often required | Public tweets with video. |
| TikTok | Unreliable without cookies | Many IPs get HTTP 403; try cookies + impersonate. |
| Vimeo | Cookies / login often required | Many "public" pages still need a logged-in session. |
| Dailymotion | Usually works | Public videos. |
| **1000+ more** | Varies | [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) |

> **Note:** Private, paywalled, and DRM-protected media are not supported. Keep yt-dlp updated — extractors break within days/weeks when sites change.

## Features

- Single URL input with automatic platform detection
- Multiple format options (MP4, MP3, MKV, etc.)
- Quality selection (Best, 1080p, 720p, 480p, Audio only)
- Download speed limiting
- Playlist / channel bulk support with item limits
- Real-time progress and ETA display
- Optional HTTP Basic / bearer-token auth
- yt-dlp auto-update (on start + periodic)
- Dark/Light theme support
- Mobile-responsive design

## Quick Start

### Using Docker

```bash
docker run -d -p 3000:3000 -v /path/to/downloads:/downloads sahinurdev/svidown
```

Then open http://localhost:3000 in your browser.

### Using Docker Compose

```yaml
services:
  svidown:
    image: sahinurdev/svidown:latest
    container_name: svidown
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Optional:
      # AUTH_USERNAME: admin
      # AUTH_PASSWORD: changeme
      YTDLP_AUTO_UPDATE: "true"
    volumes:
      - ./downloads:/downloads
      - ./cookies:/cookies
```

Run with:
```bash
docker compose up -d
```

### Browser cookies (Instagram / blocked YouTube / TikTok)

1. Install a browser extension such as **Get cookies.txt LOCALLY**.
2. Export cookies for the site into `./cookies/cookies.txt` (Netscape format).
3. Restart the container.

Empty or invalid cookie files are **ignored automatically** (downloads continue without cookies). Refresh cookies when sites start returning login/403 errors — session cookies often expire after a few days.

## Configuration

All configuration is done via environment variables.

### Download Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_CONCURRENT_DOWNLOADS` | Maximum simultaneous downloads | `3` |
| `DELETE_FILE_ON_TRASHCAN` | Delete files when removed from UI | `false` |
| `DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT` | Max playlist items (0 = unlimited) | `0` |
| `MIN_FREE_DISK_MB` | Reject new downloads below this free space | `512` |
| `HISTORY_MAX_ITEMS` | Cap completed/error history size | `500` |
| `HISTORY_TTL_DAYS` | Drop history older than N days (0 = off) | `30` |

### Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `DOWNLOAD_DIR` | Video download directory | `/downloads` |
| `AUDIO_DOWNLOAD_DIR` | Audio download directory | Same as `DOWNLOAD_DIR` |
| `CUSTOM_DIRS` | Enable custom subdirectories | `true` |
| `CREATE_CUSTOM_DIRS` | Auto-create directories | `true` |
| `STATE_DIR` | Queue persistence location | `/downloads/.svidown` |
| `TEMP_DIR` | Temporary files location | `/downloads/.svidown-tmp` |
| `TEMP_MAX_AGE_HOURS` | Delete stale temp files older than N hours | `24` |

### File Naming / yt-dlp

| Variable | Description | Default |
|----------|-------------|---------|
| `OUTPUT_TEMPLATE` | Filename template | `%(title)s.%(ext)s` |
| `OUTPUT_TEMPLATE_CHAPTER` | Chapter filename template | `%(title)s - %(section_number)s %(section_title)s.%(ext)s` |
| `OUTPUT_TEMPLATE_PLAYLIST` | Playlist filename template | `%(playlist_title)s/%(title)s.%(ext)s` |
| `YTDL_OPTIONS` | Additional yt-dlp options (JSON) | `{}` |
| `YTDL_OPTIONS_FILE` | Path to yt-dlp options file | - |
| `ENABLE_IMPERSONATE` | Set `impersonate=chrome` when curl_cffi is available | `true` |
| `COOKIES_FILE` | Path checked by entrypoint for Netscape cookies | `/cookies/cookies.txt` |

### yt-dlp auto-update

| Variable | Description | Default |
|----------|-------------|---------|
| `YTDLP_AUTO_UPDATE` | Upgrade yt-dlp inside the container | `true` |
| `YTDLP_UPDATE_ON_START` | Run an update when the process starts | `true` |
| `YTDLP_UPDATE_INTERVAL_HOURS` | Periodic update interval (hours) | `24` |
| `YTDLP_STALE_AFTER_DAYS` | UI warning if yt-dlp version date is older | `60` |

Set `YTDLP_AUTO_UPDATE=false` to disable. Prefer rebuilding/pulling a fresh image for reproducible deploys; auto-update keeps extractors working between rebuilds.

### Auth & CORS

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_USERNAME` | HTTP Basic username (with password) | - |
| `AUTH_PASSWORD` | HTTP Basic password | - |
| `AUTH_TOKEN` | Bearer / `X-API-Token` shared secret | - |
| `CORS_ORIGINS` | `*` or comma-separated origins; empty = same-origin only | empty |

When auth is enabled, protect the UI by storing credentials in the browser (`localStorage` keys `svidown_auth_token` or `svidown_auth_user` / `svidown_auth_pass`), or use a reverse proxy that injects auth.

### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `3000` |
| `URL_PREFIX` | Base path for reverse proxy | `/` |
| `HTTPS` | Enable HTTPS | `false` |
| `CERTFILE` | SSL certificate path | - |
| `KEYFILE` | SSL key path | - |

### System

| Variable | Description | Default |
|----------|-------------|---------|
| `UID` | User ID | `1000` |
| `GID` | Group ID | `1000` |
| `UMASK` | File creation mask | `022` |
| `DEFAULT_THEME` | UI theme (light/dark/auto) | `auto` |
| `LOGLEVEL` | Log level | `INFO` |

## Reverse Proxy Examples

### NGINX

```nginx
location /svidown/ {
    proxy_pass http://svidown:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### Caddy

```caddyfile
example.com {
  route /svidown/* {
    uri strip_prefix svidown
    reverse_proxy svidown:3000
  }
}
```

## Building from Source

Requirements: Node.js 22+, Python 3.11+

```bash
# Build frontend
cd frontend
npm ci
npm run build

# Install Python dependencies
cd ..
pip install .

# Run
python -m app.server
```

Or build the Docker image:

```bash
docker build -t svidown .
```

## Legal Notice

This software is intended for downloading publicly available content only. Users are responsible for ensuring they have the right to download any content and must comply with the terms of service of the respective platforms. Do not use this tool to:

- Download private or login-protected content
- Bypass paywalls or DRM protection
- Violate copyright laws

## License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) for the full license text.
