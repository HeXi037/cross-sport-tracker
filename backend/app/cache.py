from __future__ import annotations

from asyncio import Lock
from collections.abc import Iterable
import time
from typing import Any


class TTLCache:
    """A simple in-memory TTL cache with async-safe access."""

    def __init__(self, ttl_seconds: float = 300.0) -> None:
        self._ttl = ttl_seconds
        self._lock = Lock()
        self._store: dict[Any, tuple[Any, float]] = {}

    async def get(self, key: Any) -> Any | None:
        now = time.monotonic()
        async with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            value, expires_at = entry
            if expires_at <= now:
                self._store.pop(key, None)
                return None
            return value

    async def set(self, key: Any, value: Any, ttl_seconds: float | None = None) -> None:
        ttl = self._ttl if ttl_seconds is None else ttl_seconds
        expires_at = time.monotonic() + max(ttl, 0.0)
        async with self._lock:
            if ttl <= 0:
                self._store.pop(key, None)
            else:
                self._store[key] = (value, expires_at)

    async def invalidate(self, key: Any) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def invalidate_players(self, player_ids: Iterable[str]) -> None:
        ids = {pid for pid in player_ids if pid}
        if not ids:
            return
        async with self._lock:
            keys_to_remove = [
                key
                for key in self._store
                if isinstance(key, tuple) and key and key[0] in ids
            ]
            for key in keys_to_remove:
                self._store.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()


player_stats_cache = TTLCache(ttl_seconds=300.0)
