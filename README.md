# svidown

[![Docker Hub](https://img.shields.io/docker/pulls/sahinurdev/svidown)](https://hub.docker.com/r/sahinurdev/svidown)
[![Docker Image Version](https://img.shields.io/docker/v/sahinurdev/svidown/latest)](https://hub.docker.com/r/sahinurdev/svidown)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Download videos from 1000+ websites** - A modern, self-hosted video downloader with a clean web interface.

**Supported Architectures:** `linux/amd64` · `linux/arm64`

## Supported Platforms

svidown supports downloading **public videos only** from:

| Platform | Support |
|----------|---------|
| YouTube | Full support (videos, playlists, channels) |
| Facebook | Public videos, pages, watch links |
| Instagram | Public posts and reels |
| Twitter / X | Public tweets with video |
| TikTok | Public videos |
| Vimeo | Public videos |
| Dailymotion | Public videos |
| **1000+ more** | [See full list](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) |

> **Note**: This application only supports publicly accessible content. Private videos, login-protected content, and paywalled media are not supported.

## Features

- Single URL input with automatic platform detection
- Multiple format options (MP4, MP3, MKV, etc.)
- Quality selection (Best, 1080p, 720p, 480p, Audio only)
- Download speed limiting
- Playlist support with item limits
- Real-time progress and ETA display
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
    volumes:
      - ./downloads:/downloads
```

Run with:
```bash
docker compose up -d
```

## Configuration

All configuration is done via environment variables.

### Download Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_CONCURRENT_DOWNLOADS` | Maximum simultaneous downloads | `3` |
| `DELETE_FILE_ON_TRASHCAN` | Delete files when removed from UI | `false` |
| `DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT` | Max playlist items (0 = unlimited) | `0` |

### Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `DOWNLOAD_DIR` | Video download directory | `/downloads` |
| `AUDIO_DOWNLOAD_DIR` | Audio download directory | Same as `DOWNLOAD_DIR` |
| `CUSTOM_DIRS` | Enable custom subdirectories | `true` |
| `CREATE_CUSTOM_DIRS` | Auto-create directories | `true` |
| `STATE_DIR` | Queue persistence location | `/downloads/.svidown` |
| `TEMP_DIR` | Temporary files location | `/downloads` |

### File Naming

| Variable | Description | Default |
|----------|-------------|---------|
| `OUTPUT_TEMPLATE` | Filename template | `%(title)s.%(ext)s` |
| `OUTPUT_TEMPLATE_CHAPTER` | Chapter filename template | `%(title)s - %(section_number)s %(section_title)s.%(ext)s` |
| `OUTPUT_TEMPLATE_PLAYLIST` | Playlist filename template | `%(playlist_title)s/%(title)s.%(ext)s` |
| `YTDL_OPTIONS` | Additional yt-dlp options (JSON) | `{}` |
| `YTDL_OPTIONS_FILE` | Path to yt-dlp options file | - |

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
npm install
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
