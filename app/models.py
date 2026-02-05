"""Data models for Svidown downloads."""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any
import time
import json


class DownloadStatus(str, Enum):
    """Status of a download."""
    PENDING = "pending"
    PREPARING = "preparing"
    DOWNLOADING = "downloading"
    FINISHED = "finished"
    ERROR = "error"


@dataclass
class ChapterFile:
    """Represents a chapter file from split chapters."""
    filename: str
    size: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"filename": self.filename, "size": self.size}


@dataclass
class Download:
    """Represents a download task."""
    id: str
    url: str
    title: str
    quality: str
    format: str

    # Optional fields with defaults
    folder: str = ""
    custom_name_prefix: str = ""
    status: DownloadStatus = DownloadStatus.PENDING
    msg: str | None = None
    percent: float | None = None
    speed: float | None = None
    eta: int | None = None
    size: int | None = None
    filename: str | None = None
    timestamp: int = field(default_factory=lambda: time.time_ns())
    error: str | None = None

    # Playlist and chapter options
    playlist_item_limit: int = 0
    split_by_chapters: bool = False
    chapter_template: str = ""
    chapter_files: list[ChapterFile] = field(default_factory=list)

    # Speed limit in bytes per second
    speed_limit: int | None = None

    # Entry data from yt-dlp extraction (used for playlist info)
    entry: dict[str, Any] | None = None

    def __post_init__(self):
        """Apply custom name prefix to id and title if provided."""
        if self.custom_name_prefix:
            if not self.id.startswith(f"{self.custom_name_prefix}."):
                self.id = f"{self.custom_name_prefix}.{self.id}"
            if not self.title.startswith(f"{self.custom_name_prefix}."):
                self.title = f"{self.custom_name_prefix}.{self.title}"

        # Ensure status is DownloadStatus enum
        if isinstance(self.status, str):
            self.status = DownloadStatus(self.status)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = asdict(self)
        result["status"] = self.status.value
        result["chapter_files"] = [cf if isinstance(cf, dict) else cf.to_dict()
                                   for cf in self.chapter_files]
        return result

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict())

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Download":
        """Create Download from dictionary."""
        data = data.copy()

        # Convert status string to enum
        if "status" in data and isinstance(data["status"], str):
            data["status"] = DownloadStatus(data["status"])

        # Convert chapter_files to ChapterFile objects
        if "chapter_files" in data:
            data["chapter_files"] = [
                ChapterFile(**cf) if isinstance(cf, dict) else cf
                for cf in data["chapter_files"]
            ]

        return cls(**data)

    @classmethod
    def from_json(cls, json_str: str) -> "Download":
        """Create Download from JSON string."""
        return cls.from_dict(json.loads(json_str))


class DownloadEncoder(json.JSONEncoder):
    """JSON encoder that handles Download objects and other special types."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, Download):
            return obj.to_dict()
        if isinstance(obj, ChapterFile):
            return obj.to_dict()
        if isinstance(obj, DownloadStatus):
            return obj.value
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        if hasattr(obj, "__iter__") and not isinstance(obj, (str, bytes)):
            try:
                return list(obj)
            except (TypeError, ValueError):
                pass
        return super().default(obj)
