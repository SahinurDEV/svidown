FROM node:lts-alpine AS builder

WORKDIR /svidown
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build


FROM rust:1.93-slim AS bgutil-builder

WORKDIR /src

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      build-essential \
      pkg-config \
      libssl-dev \
      python3 && \
    BGUTIL_TAG="$(curl -Ls -o /dev/null -w '%{url_effective}' https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest | sed 's#.*/tag/##')" && \
    curl -L "https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/archive/refs/tags/${BGUTIL_TAG}.tar.gz" \
      | tar -xz --strip-components=1 && \
    cargo build --release


FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml uv.lock docker-entrypoint.sh ./

# Use sed to strip carriage-return characters from the entrypoint script (in case building on Windows)
# Install dependencies
RUN sed -i 's/\r$//g' docker-entrypoint.sh && \
    chmod +x docker-entrypoint.sh && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      ffmpeg \
      unzip \
      aria2 \
      coreutils \
      gosu \
      curl \
      tini && \
    curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh && \
    UV_PROJECT_ENVIRONMENT=/usr/local uv sync --frozen --no-dev --compile-bytecode && \
    uv cache clean && \
    rm -f /usr/local/bin/uv /usr/local/bin/uvx /usr/local/bin/uvw && \
    curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y && \
    apt-get purge -y --auto-remove && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir /.cache && chmod 777 /.cache

COPY --from=bgutil-builder /src/target/release/bgutil-pot /usr/local/bin/bgutil-pot

RUN BGUTIL_TAG="$(curl -Ls -o /dev/null -w '%{url_effective}' https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest | sed 's#.*/tag/##')" && \
    PLUGIN_DIR="$(python3 -c 'import site; print(site.getsitepackages()[0])')" && \
    curl -L -o /tmp/bgutil-ytdlp-pot-provider-rs.zip \
      "https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/${BGUTIL_TAG}/bgutil-ytdlp-pot-provider-rs.zip" && \
    unzip -q /tmp/bgutil-ytdlp-pot-provider-rs.zip -d "${PLUGIN_DIR}" && \
    rm /tmp/bgutil-ytdlp-pot-provider-rs.zip

COPY app ./app
COPY --from=builder /svidown/out ./ui/dist/svidown/browser

ENV UID=1000
ENV GID=1000
ENV UMASK=022

ENV DOWNLOAD_DIR=/downloads
ENV STATE_DIR=/downloads/.svidown
ENV TEMP_DIR=/downloads/.svidown-tmp
ENV YTDLP_AUTO_UPDATE=true
ENV YTDLP_UPDATE_ON_START=true
ENV YTDLP_UPDATE_INTERVAL_HOURS=24
VOLUME /downloads
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3   CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/health" >/dev/null || exit 1

# Add build-time argument for version
ARG VERSION=dev
ENV SVIDOWN_VERSION=$VERSION

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "./docker-entrypoint.sh"]
