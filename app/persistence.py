"""JSON-based persistence for download state."""

import asyncio
import json
import logging
import os
import time
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
        """Load data from JSON file, falling back to backup if corrupted."""
        loaded = self._try_load_file(self.filepath)
        if loaded is not None:
            self._data = loaded
            log.info(f"Store {self.name}: Loaded {len(self._data)} items")
            return

        # Try backup file
        backup_path = self.filepath + ".bak"
        if os.path.exists(backup_path):
            log.warning(f"Store {self.name}: Main file failed, trying backup")
            loaded = self._try_load_file(backup_path)
            if loaded is not None:
                self._data = loaded
                log.info(f"Store {self.name}: Loaded {len(self._data)} items from backup")
                # Restore main file from backup
                self._save()
                return

        if os.path.exists(self.filepath):
            log.error(f"Store {self.name}: Failed to load from both main and backup")
        else:
            log.debug(f"Store {self.name}: No existing file found")

    def _try_load_file(self, path: str) -> OrderedDict | None:
        """Try to load data from a specific file path.

        Returns:
            OrderedDict of downloads, or None on failure
        """
        if not os.path.exists(path):
            return None

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if not isinstance(data, list):
                log.warning(f"Store {self.name}: Invalid format in {path}, expected list")
                return None

            result: OrderedDict[str, Download] = OrderedDict()
            for item in data:
                try:
                    download = Download.from_dict(item)
                    result[download.url] = download
                except (KeyError, TypeError, ValueError) as e:
                    log.warning(f"Store {self.name}: Skipping invalid item: {e}")

            # Sort by timestamp
            result = OrderedDict(
                sorted(result.items(), key=lambda x: x[1].timestamp)
            )
            return result

        except json.JSONDecodeError as e:
            log.error(f"Store {self.name}: JSON decode error in {path}: {e}")
            return None
        except OSError as e:
            log.error(f"Store {self.name}: File read error in {path}: {e}")
            return None

    def _save(self) -> None:
        """Save data to JSON file atomically with backup."""
        tmp_path = self.filepath + ".tmp"
        backup_path = self.filepath + ".bak"
        try:
            data = [download.to_dict() for download in self._data.values()]
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            # Backup current file before replacing
            if os.path.exists(self.filepath):
                try:
                    os.replace(self.filepath, backup_path)
                except OSError:
                    pass
            os.replace(tmp_path, self.filepath)
            log.debug(f"Store {self.name}: Saved {len(self._data)} items")
        except OSError as e:
            log.error(f"Store {self.name}: File write error: {e}")
            try:
                os.remove(tmp_path)
            except OSError:
                pass

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

    def put_sync(self, download: Download, save: bool = True) -> None:
        """Synchronous put (use with caution)."""
        self._data[download.url] = download
        if save:
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

    def prune(self, max_items: int = 0, ttl_days: int = 0) -> int:
        """Remove old items by TTL and cap. Returns number removed. Sync."""
        removed = 0
        if ttl_days and ttl_days > 0:
            cutoff_ns = time.time_ns() - int(ttl_days * 86400 * 1_000_000_000)
            to_del = [url for url, dl in self._data.items() if getattr(dl, "timestamp", 0) < cutoff_ns]
            for url in to_del:
                del self._data[url]
                removed += 1

        if max_items and max_items > 0 and len(self._data) > max_items:
            # Keep newest (highest timestamp)
            ordered = sorted(self._data.items(), key=lambda x: x[1].timestamp, reverse=True)
            keep = dict(ordered[:max_items])
            removed += len(self._data) - len(keep)
            self._data = __import__("collections").OrderedDict(
                sorted(keep.items(), key=lambda x: x[1].timestamp)
            )

        if removed:
            self._save()
            log.info(f"Store {self.name}: Pruned {removed} items")
        return removed

    async def prune_async(self, max_items: int = 0, ttl_days: int = 0) -> int:
        async with self._lock:
            return self.prune(max_items, ttl_days)
