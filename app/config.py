"""Configuration management for Svidown."""

from dataclasses import dataclass, field
from pathlib import Path
import json
import logging
import os
import sys

from .cookies_util import sanitize_ytdl_options

log = logging.getLogger("config")


def parse_log_level(level: str) -> int:
    """Parse log level string to logging constant."""
    levels = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }
    return levels.get(level.upper(), logging.INFO)


def parse_bool(value: str) -> bool:
    """Parse boolean string to bool."""
    return value.lower() in ("true", "on", "1", "yes")


def parse_cors_origins(value: str) -> list[str]:
    """Parse CORS origins: '*' or comma-separated list. Empty = same-origin only (no *)."""
    value = (value or "").strip()
    if not value:
        return []
    if value == "*":
        return ["*"]
    return [o.strip() for o in value.split(",") if o.strip()]


@dataclass
class Config:
    """Application configuration loaded from environment variables."""

    # Directory settings
    DOWNLOAD_DIR: str = "."
    AUDIO_DOWNLOAD_DIR: str = ""  # Defaults to DOWNLOAD_DIR
    TEMP_DIR: str = ""  # Defaults to DOWNLOAD_DIR/.svidown-tmp
    STATE_DIR: str = "."

    # Custom directories
    DOWNLOAD_DIRS_INDEXABLE: bool = False
    CUSTOM_DIRS: bool = True
    CREATE_CUSTOM_DIRS: bool = True
    CUSTOM_DIRS_EXCLUDE_REGEX: str = r"(^|/)[.@].*$"
    DELETE_FILE_ON_TRASHCAN: bool = False

    # URL and host settings
    URL_PREFIX: str = "/"
    PUBLIC_HOST_URL: str = "download/"
    PUBLIC_HOST_AUDIO_URL: str = "audio_download/"

    # Output templates
    OUTPUT_TEMPLATE: str = "%(title)s.%(ext)s"
    OUTPUT_TEMPLATE_CHAPTER: str = "%(title)s - %(section_number)02d - %(section_title)s.%(ext)s"
    OUTPUT_TEMPLATE_PLAYLIST: str = "%(playlist_title)s/%(title)s.%(ext)s"
    DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT: int = 0

    # yt-dlp options
    YTDL_OPTIONS: dict = field(default_factory=dict)
    YTDL_OPTIONS_FILE: str = ""

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 3000
    HTTPS: bool = False
    CERTFILE: str = ""
    KEYFILE: str = ""
    BASE_DIR: str = ""

    # UI settings
    DEFAULT_THEME: str = "auto"
    ROBOTS_TXT: str = ""

    # Performance settings
    MAX_CONCURRENT_DOWNLOADS: int = 3

    # Logging
    LOGLEVEL: str = "INFO"
    ENABLE_ACCESSLOG: bool = False

    # Auth (optional)
    AUTH_USERNAME: str = ""
    AUTH_PASSWORD: str = ""
    AUTH_TOKEN: str = ""

    # CORS: empty = reflect disabled / no ACAO; "*" = allow all; comma list = allowlist
    CORS_ORIGINS: list = field(default_factory=list)

    # yt-dlp auto-update
    YTDLP_AUTO_UPDATE: bool = True
    YTDLP_UPDATE_ON_START: bool = True
    YTDLP_UPDATE_INTERVAL_HOURS: float = 24.0
    YTDLP_STALE_AFTER_DAYS: int = 60

    # Ops
    HISTORY_MAX_ITEMS: int = 500
    HISTORY_TTL_DAYS: int = 30
    MIN_FREE_DISK_MB: int = 512
    TEMP_MAX_AGE_HOURS: float = 24.0
    ENABLE_IMPERSONATE: bool = True

    def __post_init__(self):
        """Apply defaults and resolve paths after initialization."""
        if not self.AUDIO_DOWNLOAD_DIR:
            self.AUDIO_DOWNLOAD_DIR = self.DOWNLOAD_DIR

        if not self.TEMP_DIR:
            self.TEMP_DIR = os.path.join(self.DOWNLOAD_DIR, ".svidown-tmp")

        if not self.URL_PREFIX.endswith("/"):
            self.URL_PREFIX += "/"

        if self.YTDL_OPTIONS_FILE and self.YTDL_OPTIONS_FILE.startswith("."):
            self.YTDL_OPTIONS_FILE = str(Path(self.YTDL_OPTIONS_FILE).resolve())

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        env = os.environ.get

        default_temp = ""
        download_dir = env("DOWNLOAD_DIR", ".")
        if not env("TEMP_DIR"):
            default_temp = os.path.join(download_dir, ".svidown-tmp")

        config = cls(
            DOWNLOAD_DIR=download_dir,
            AUDIO_DOWNLOAD_DIR=env("AUDIO_DOWNLOAD_DIR", ""),
            TEMP_DIR=env("TEMP_DIR", default_temp),
            STATE_DIR=env("STATE_DIR", "."),
            DOWNLOAD_DIRS_INDEXABLE=parse_bool(env("DOWNLOAD_DIRS_INDEXABLE", "false")),
            CUSTOM_DIRS=parse_bool(env("CUSTOM_DIRS", "true")),
            CREATE_CUSTOM_DIRS=parse_bool(env("CREATE_CUSTOM_DIRS", "true")),
            CUSTOM_DIRS_EXCLUDE_REGEX=env("CUSTOM_DIRS_EXCLUDE_REGEX", r"(^|/)[.@].*$"),
            DELETE_FILE_ON_TRASHCAN=parse_bool(env("DELETE_FILE_ON_TRASHCAN", "false")),
            URL_PREFIX=env("URL_PREFIX", "/"),
            PUBLIC_HOST_URL=env("PUBLIC_HOST_URL", "download/"),
            PUBLIC_HOST_AUDIO_URL=env("PUBLIC_HOST_AUDIO_URL", "audio_download/"),
            OUTPUT_TEMPLATE=env("OUTPUT_TEMPLATE", "%(title)s.%(ext)s"),
            OUTPUT_TEMPLATE_CHAPTER=env(
                "OUTPUT_TEMPLATE_CHAPTER",
                "%(title)s - %(section_number)02d - %(section_title)s.%(ext)s"
            ),
            OUTPUT_TEMPLATE_PLAYLIST=env(
                "OUTPUT_TEMPLATE_PLAYLIST",
                "%(playlist_title)s/%(title)s.%(ext)s"
            ),
            DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT=int(env("DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT", "0")),
            YTDL_OPTIONS={},
            YTDL_OPTIONS_FILE=env("YTDL_OPTIONS_FILE", ""),
            HOST=env("HOST", "0.0.0.0"),
            PORT=int(env("PORT", "3000")),
            HTTPS=parse_bool(env("HTTPS", "false")),
            CERTFILE=env("CERTFILE", ""),
            KEYFILE=env("KEYFILE", ""),
            BASE_DIR=env("BASE_DIR", ""),
            DEFAULT_THEME=env("DEFAULT_THEME", "auto"),
            ROBOTS_TXT=env("ROBOTS_TXT", ""),
            MAX_CONCURRENT_DOWNLOADS=int(env("MAX_CONCURRENT_DOWNLOADS", "3")),
            LOGLEVEL=env("LOGLEVEL", "INFO"),
            ENABLE_ACCESSLOG=parse_bool(env("ENABLE_ACCESSLOG", "false")),
            AUTH_USERNAME=env("AUTH_USERNAME", ""),
            AUTH_PASSWORD=env("AUTH_PASSWORD", ""),
            AUTH_TOKEN=env("AUTH_TOKEN", ""),
            CORS_ORIGINS=parse_cors_origins(env("CORS_ORIGINS", "")),
            YTDLP_AUTO_UPDATE=parse_bool(env("YTDLP_AUTO_UPDATE", "true")),
            YTDLP_UPDATE_ON_START=parse_bool(env("YTDLP_UPDATE_ON_START", "true")),
            YTDLP_UPDATE_INTERVAL_HOURS=float(env("YTDLP_UPDATE_INTERVAL_HOURS", "24")),
            YTDLP_STALE_AFTER_DAYS=int(env("YTDLP_STALE_AFTER_DAYS", "60")),
            HISTORY_MAX_ITEMS=int(env("HISTORY_MAX_ITEMS", "500")),
            HISTORY_TTL_DAYS=int(env("HISTORY_TTL_DAYS", "30")),
            MIN_FREE_DISK_MB=int(env("MIN_FREE_DISK_MB", "512")),
            TEMP_MAX_AGE_HOURS=float(env("TEMP_MAX_AGE_HOURS", "24")),
            ENABLE_IMPERSONATE=parse_bool(env("ENABLE_IMPERSONATE", "true")),
        )

        if config.AUDIO_DOWNLOAD_DIR == "%%DOWNLOAD_DIR" or not config.AUDIO_DOWNLOAD_DIR:
            config.AUDIO_DOWNLOAD_DIR = config.DOWNLOAD_DIR
        if config.TEMP_DIR == "%%DOWNLOAD_DIR":
            config.TEMP_DIR = config.DOWNLOAD_DIR
        if not config.TEMP_DIR:
            config.TEMP_DIR = os.path.join(config.DOWNLOAD_DIR, ".svidown-tmp")

        success, msg = config.load_ytdl_options()
        if not success:
            log.error(msg)
            sys.exit(1)

        # Ensure temp dir exists
        try:
            Path(config.TEMP_DIR).mkdir(parents=True, exist_ok=True)
        except OSError as e:
            log.warning(f"Could not create TEMP_DIR {config.TEMP_DIR}: {e}")

        return config

    def load_ytdl_options(self) -> tuple[bool, str]:
        """Load yt-dlp options from environment and file; sanitize cookiefile."""
        ytdl_opts_str = os.environ.get("YTDL_OPTIONS", "{}")
        try:
            self.YTDL_OPTIONS = json.loads(ytdl_opts_str)
            if not isinstance(self.YTDL_OPTIONS, dict):
                raise ValueError("YTDL_OPTIONS must be a JSON object")
        except (json.JSONDecodeError, ValueError) as e:
            return False, f"Invalid YTDL_OPTIONS environment variable: {e}"

        if self.YTDL_OPTIONS_FILE:
            log.info(f"Loading yt-dlp options from {self.YTDL_OPTIONS_FILE}")
            if not os.path.exists(self.YTDL_OPTIONS_FILE):
                return False, f"YTDL_OPTIONS_FILE not found: {self.YTDL_OPTIONS_FILE}"
            try:
                with open(self.YTDL_OPTIONS_FILE, encoding="utf-8") as f:
                    file_opts = json.load(f)
                if not isinstance(file_opts, dict):
                    raise ValueError("YTDL_OPTIONS_FILE must contain a JSON object")
                self.YTDL_OPTIONS.update(file_opts)
            except (json.JSONDecodeError, ValueError) as e:
                return False, f"Invalid YTDL_OPTIONS_FILE: {e}"

        self.YTDL_OPTIONS = sanitize_ytdl_options(self.YTDL_OPTIONS)

        # Default browser impersonation when curl_cffi is available and not set by user
        if self.ENABLE_IMPERSONATE and "impersonate" not in self.YTDL_OPTIONS:
            try:
                import curl_cffi  # noqa: F401
                self.YTDL_OPTIONS["impersonate"] = "chrome"
                log.info("Enabled yt-dlp impersonate=chrome (curl_cffi available)")
            except ImportError:
                log.debug("curl_cffi not available; skipping impersonate")

        return True, ""

    def to_dict(self) -> dict:
        """Convert config to dictionary for serialization (safe for clients)."""
        return {
            "DOWNLOAD_DIR": self.DOWNLOAD_DIR,
            "AUDIO_DOWNLOAD_DIR": self.AUDIO_DOWNLOAD_DIR,
            "TEMP_DIR": self.TEMP_DIR,
            "STATE_DIR": self.STATE_DIR,
            "DOWNLOAD_DIRS_INDEXABLE": self.DOWNLOAD_DIRS_INDEXABLE,
            "CUSTOM_DIRS": self.CUSTOM_DIRS,
            "CREATE_CUSTOM_DIRS": self.CREATE_CUSTOM_DIRS,
            "CUSTOM_DIRS_EXCLUDE_REGEX": self.CUSTOM_DIRS_EXCLUDE_REGEX,
            "DELETE_FILE_ON_TRASHCAN": self.DELETE_FILE_ON_TRASHCAN,
            "URL_PREFIX": self.URL_PREFIX,
            "PUBLIC_HOST_URL": self.PUBLIC_HOST_URL,
            "PUBLIC_HOST_AUDIO_URL": self.PUBLIC_HOST_AUDIO_URL,
            "OUTPUT_TEMPLATE": self.OUTPUT_TEMPLATE,
            "OUTPUT_TEMPLATE_CHAPTER": self.OUTPUT_TEMPLATE_CHAPTER,
            "OUTPUT_TEMPLATE_PLAYLIST": self.OUTPUT_TEMPLATE_PLAYLIST,
            "DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT": self.DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT,
            "YTDL_OPTIONS_FILE": self.YTDL_OPTIONS_FILE,
            "HOST": self.HOST,
            "PORT": self.PORT,
            "HTTPS": self.HTTPS,
            "BASE_DIR": self.BASE_DIR,
            "DEFAULT_THEME": self.DEFAULT_THEME,
            "MAX_CONCURRENT_DOWNLOADS": self.MAX_CONCURRENT_DOWNLOADS,
            "AUTH_REQUIRED": bool(self.AUTH_TOKEN or (self.AUTH_USERNAME and self.AUTH_PASSWORD)),
            "YTDLP_STALE_AFTER_DAYS": self.YTDLP_STALE_AFTER_DAYS,
            "HISTORY_MAX_ITEMS": self.HISTORY_MAX_ITEMS,
            "HISTORY_TTL_DAYS": self.HISTORY_TTL_DAYS,
        }
