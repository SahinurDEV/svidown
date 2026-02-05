"""Configuration management for Svidown."""

from dataclasses import dataclass, field
from pathlib import Path
import json
import logging
import os
import sys

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


@dataclass
class Config:
    """Application configuration loaded from environment variables."""

    # Directory settings
    DOWNLOAD_DIR: str = "."
    AUDIO_DOWNLOAD_DIR: str = ""  # Defaults to DOWNLOAD_DIR
    TEMP_DIR: str = ""  # Defaults to DOWNLOAD_DIR
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

    def __post_init__(self):
        """Apply defaults and resolve paths after initialization."""
        # Default AUDIO_DOWNLOAD_DIR to DOWNLOAD_DIR
        if not self.AUDIO_DOWNLOAD_DIR:
            self.AUDIO_DOWNLOAD_DIR = self.DOWNLOAD_DIR

        # Default TEMP_DIR to DOWNLOAD_DIR
        if not self.TEMP_DIR:
            self.TEMP_DIR = self.DOWNLOAD_DIR

        # Ensure URL_PREFIX ends with /
        if not self.URL_PREFIX.endswith("/"):
            self.URL_PREFIX += "/"

        # Resolve relative YTDL_OPTIONS_FILE path
        if self.YTDL_OPTIONS_FILE and self.YTDL_OPTIONS_FILE.startswith("."):
            self.YTDL_OPTIONS_FILE = str(Path(self.YTDL_OPTIONS_FILE).resolve())

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        env = os.environ.get

        config = cls(
            DOWNLOAD_DIR=env("DOWNLOAD_DIR", "."),
            AUDIO_DOWNLOAD_DIR=env("AUDIO_DOWNLOAD_DIR", ""),
            TEMP_DIR=env("TEMP_DIR", ""),
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
            YTDL_OPTIONS={},  # Loaded separately
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
        )

        # Handle %%DOWNLOAD_DIR references
        if config.AUDIO_DOWNLOAD_DIR == "%%DOWNLOAD_DIR" or not config.AUDIO_DOWNLOAD_DIR:
            config.AUDIO_DOWNLOAD_DIR = config.DOWNLOAD_DIR
        if config.TEMP_DIR == "%%DOWNLOAD_DIR" or not config.TEMP_DIR:
            config.TEMP_DIR = config.DOWNLOAD_DIR

        # Load YTDL_OPTIONS
        success, msg = config.load_ytdl_options()
        if not success:
            log.error(msg)
            sys.exit(1)

        return config

    def load_ytdl_options(self) -> tuple[bool, str]:
        """Load yt-dlp options from environment and file."""
        # Load from environment variable
        ytdl_opts_str = os.environ.get("YTDL_OPTIONS", "{}")
        try:
            self.YTDL_OPTIONS = json.loads(ytdl_opts_str)
            if not isinstance(self.YTDL_OPTIONS, dict):
                raise ValueError("YTDL_OPTIONS must be a JSON object")
        except (json.JSONDecodeError, ValueError) as e:
            return False, f"Invalid YTDL_OPTIONS environment variable: {e}"

        # Load from file if specified
        if not self.YTDL_OPTIONS_FILE:
            return True, ""

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

        return True, ""

    def to_dict(self) -> dict:
        """Convert config to dictionary for serialization."""
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
        }
