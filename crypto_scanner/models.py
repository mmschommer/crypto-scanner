"""Core immutable market-data models."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, order=True)
class Candle:
    start_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    turnover: float

    def is_closed_at(self, timestamp_ms: int, interval_minutes: int) -> bool:
        return timestamp_ms >= self.start_ms + interval_minutes * 60_000
