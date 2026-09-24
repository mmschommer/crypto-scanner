"""Pure parsers for Bybit REST and WebSocket payloads."""
from __future__ import annotations

from typing import Any

from .models import Candle


def parse_rest_candle(row: list[str]) -> Candle:
    if len(row) < 7:
        raise ValueError("Bybit candle row has fewer than seven fields")
    return Candle(int(row[0]), *(float(value) for value in row[1:7]))


def parse_closed_ws_candles(message: dict[str, Any]) -> list[tuple[str, str, Candle]]:
    """Return only candles explicitly confirmed closed by Bybit."""
    topic = str(message.get("topic", ""))
    parts = topic.split(".")
    if len(parts) != 3 or parts[0] != "kline":
        return []
    interval, symbol = parts[1], parts[2]
    result = []
    for item in message.get("data", []):
        if item.get("confirm") is True:
            result.append((symbol, interval, Candle(
                start_ms=int(item["start"]),
                open=float(item["open"]), high=float(item["high"]),
                low=float(item["low"]), close=float(item["close"]),
                volume=float(item["volume"]), turnover=float(item["turnover"]),
            )))
    return result
