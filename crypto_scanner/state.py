"""Thread-safe bounded in-memory market state."""
from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass

from .models import Candle


@dataclass
class Ticker:
    price: float | None = None
    change_24h_pct: float | None = None
    updated_at: float | None = None


class MarketState:
    def __init__(self, symbols: tuple[str, ...], timeframes: tuple[str, ...], limit: int):
        self.lock = threading.RLock()
        self.histories = {(s, t): deque(maxlen=limit) for s in symbols for t in timeframes}
        self.tickers = {symbol: Ticker() for symbol in symbols}
        self.connected = False
        self.status_message = "STARTING"
        self.last_data_at: float | None = None

    def replace_history(self, symbol: str, timeframe: str, candles: list[Candle]) -> None:
        with self.lock:
            self.histories[(symbol, timeframe)].clear()
            self.histories[(symbol, timeframe)].extend(sorted(candles))

    def add_closed_candle(self, symbol: str, timeframe: str, candle: Candle) -> bool:
        with self.lock:
            history = self.histories[(symbol, timeframe)]
            if history and history[-1].start_ms == candle.start_ms:
                history[-1] = candle
                return False
            if not history or candle.start_ms > history[-1].start_ms:
                history.append(candle)
                return True
            return False

    def update_ticker(self, symbol: str, price: float, change_fraction: float) -> None:
        with self.lock:
            self.tickers[symbol] = Ticker(price, change_fraction * 100, time.time())
            self.last_data_at = time.time()

    def latest_close(self, symbol: str, timeframe: str) -> float | None:
        history = self.histories[(symbol, timeframe)]
        return history[-1].close if history else None
