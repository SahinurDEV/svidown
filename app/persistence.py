"""JSON-based persistence for download state."""

import asyncio
import json
import logging
import os
from collections import OrderedDict
from pathlib import Path
from typing import Iterator

from .models import Download

log = logging.getLogger("persistence")


class DownloadStore:
    """Thread-safe JSON-based storage for downloads."""

    def __init__(self, name: str, directory: str):
        """Initialize the store.

        Args:
            name: Store name (used for filename: {name}.json)
            directory: Directory to store the JSON file
        """
        self.name = name
        self.directory = directory
        self.filepath = os.path.join(directory, f"{name}.json")
        self._data: OrderedDict[str, Download] = OrderedDict()
        self._lock = asyncio.Lock()

        # Ensure directory exists
        Path(directory).mkdir(parents=True, exist_ok=True)

        # Load existing data
        self._load()

    def _load(self) -> None:
        """Load data from JSON file."""
        if not os.path.exists(self.filepath):
            log.debug(f"Store {self.name}: No existing file found")
            return

        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            if not isinstance(data, list):
                log.warning(f"Store {self.name}: Invalid format, expected list")
                return

            for item in data:
                try:
                    download = Download.from_dict(item)
                    self._data[download.url] = download
                except (KeyError, TypeError, ValueError) as e:
                    log.warning(f"Store {self.name}: Skipping invalid item: {e}")

            # Sort by timestamp
            self._data = OrderedDict(
                sorted(self._data.items(), key=lambda x: x[1].timestamp)
            )
            log.info(f"Store {self.name}: Loaded {len(self._data)} items")

        except json.JSONDecodeError as e:
            log.error(f"Store {self.name}: JSON decode error: {e}")
        except OSError as e:
            log.error(f"Store {self.name}: File read error: {e}")

    def _save(self) -> None:
        """Save data to JSON file."""
        try:
            data = [download.to_dict() for download in self._data.values()]
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            log.debug(f"Store {self.name}: Saved {len(self._data)} items")
        except OSError as e:
            log.error(f"Store {self.name}: File write error: {e}")

    async def put(self, download: Download) -> None:
        """Add or update a download."""
        async with self._lock:
            self._data[download.url] = download
            self._save()
            log.debug(f"Store {self.name}: Put {download.url}")

    async def get(self, url: str) -> Download | None:
        """Get a download by URL."""
        async with self._lock:
            return self._data.get(url)

    async def delete(self, url: str) -> bool:
        """Delete a download by URL."""
        async with self._lock:
            if url in self._data:
                del self._data[url]
                self._save()
                log.debug(f"Store {self.name}: Deleted {url}")
                return True
            return False

    async def exists(self, url: str) -> bool:
        """Check if a URL exists in the store."""
        async with self._lock:
            return url in self._data

    async def items(self) -> list[tuple[str, Download]]:
        """Get all items as (url, download) pairs."""
        async with self._lock:
            return list(self._data.items())

    async def values(self) -> list[Download]:
        """Get all downloads."""
        async with self._lock:
            return list(self._data.values())

    async def next(self) -> tuple[str, Download] | None:
        """Get the next (first) item in queue order."""
        async with self._lock:
            if self._data:
                url = next(iter(self._data))
                return url, self._data[url]
            return None

    async def empty(self) -> bool:
        """Check if the store is empty."""
        async with self._lock:
            return len(self._data) == 0

    async def count(self) -> int:
        """Get the number of items."""
        async with self._lock:
            return len(self._data)

    def exists_sync(self, url: str) -> bool:
        """Synchronous check if URL exists (use with caution)."""
        return url in self._data

    def get_sync(self, url: str) -> Download | None:
        """Synchronous get (use with caution)."""
        return self._data.get(url)

    def put_sync(self, download: Download) -> None:
        """Synchronous put (use with caution)."""
        self._data[download.url] = download
        self._save()

    def delete_sync(self, url: str) -> bool:
        """Synchronous delete (use with caution)."""
        if url in self._data:
            del self._data[url]
            self._save()
            return True
        return False

    def items_sync(self) -> list[tuple[str, Download]]:
        """Synchronous items (use with caution)."""
        return list(self._data.items())
