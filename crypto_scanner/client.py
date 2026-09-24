"""Read-only Bybit V5 REST and public WebSocket market-data client."""
from __future__ import annotations

import json
import logging
import ssl
import threading
import time
import urllib.parse
import urllib.request
from typing import Any

import websocket

from .config import Config
from .logging_setup import log_candle
from .parsing import parse_closed_ws_candles, parse_rest_candle
from .state import MarketState


class BybitMarketClient:
    def __init__(self, config: Config, state: MarketState, logger: logging.Logger, candle_logger: logging.Logger):
        self.config, self.state = config, state
        self.logger, self.candle_logger = logger, candle_logger
        self.stop_event = threading.Event()
        self.ws: websocket.WebSocketApp | None = None

    def _get(self, path: str, params: dict[str, str]) -> dict[str, Any]:
        url = f"{self.config.rest_base_url}{path}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=15) as response:
            payload = json.load(response)
        if payload.get("retCode") != 0:
            raise RuntimeError(f"Bybit error {payload.get('retCode')}: {payload.get('retMsg')}")
        return payload

    def bootstrap(self) -> None:
        self.logger.info("Starting historical data bootstrap")
        server_ms = int(self._get("/v5/market/time", {})["time"])
        for symbol in self.config.symbols:
            ticker = self._get("/v5/market/tickers", {"category": "linear", "symbol": symbol})["result"]["list"][0]
            self.state.update_ticker(symbol, float(ticker["lastPrice"]), float(ticker["price24hPcnt"]))
            for timeframe in self.config.timeframes:
                rows = self._get("/v5/market/kline", {"category": "linear", "symbol": symbol, "interval": timeframe, "limit": str(self.config.history_limit)})["result"]["list"]
                candles = [parse_rest_candle(row) for row in rows]
                closed = [c for c in candles if c.is_closed_at(server_ms, int(timeframe))]
                self.state.replace_history(symbol, timeframe, closed)
                self.logger.info("Loaded %d closed candles for %s %sm", len(closed), symbol, timeframe)
        self.logger.info("Historical data bootstrap complete")

    def _on_open(self, ws: websocket.WebSocketApp) -> None:
        topics = [f"tickers.{s}" for s in self.config.symbols]
        topics += [f"kline.{t}.{s}" for s in self.config.symbols for t in self.config.timeframes]
        ws.send(json.dumps({"op": "subscribe", "args": topics}))
        with self.state.lock:
            self.state.connected = True
            self.state.status_message = "LIVE"
        self.logger.info("WebSocket connected; subscribed to %d topics", len(topics))

    def _on_message(self, _ws: websocket.WebSocketApp, raw: str) -> None:
        try:
            message = json.loads(raw)
            topic = str(message.get("topic", ""))
            with self.state.lock:
                self.state.last_data_at = time.time()
            if topic.startswith("tickers."):
                symbol = topic.split(".", 1)[1]
                data = message.get("data", {})
                items = data if isinstance(data, list) else [data]
                for item in items:
                    current = self.state.tickers[symbol]
                    price = float(item.get("lastPrice", current.price)) if item.get("lastPrice", current.price) is not None else 0.0
                    change = float(item.get("price24hPcnt", (current.change_24h_pct or 0) / 100))
                    self.state.update_ticker(symbol, price, change)
            for symbol, timeframe, candle in parse_closed_ws_candles(message):
                if self.state.add_closed_candle(symbol, timeframe, candle):
                    log_candle(self.candle_logger, symbol, timeframe, candle)
                    self.logger.info("Closed candle %s %sm at %d", symbol, timeframe, candle.start_ms)
        except Exception:
            self.logger.exception("Failed to process WebSocket message")

    def _on_error(self, _ws: websocket.WebSocketApp, error: object) -> None:
        self.logger.error("WebSocket error: %s", error)
        with self.state.lock:
            self.state.status_message = "CONNECTION ERROR"

    def _on_close(self, _ws: websocket.WebSocketApp, code: int | None, message: str | None) -> None:
        with self.state.lock:
            self.state.connected = False
            self.state.status_message = "RECONNECTING"
        self.logger.warning("WebSocket closed (%s): %s", code, message)

    def run(self) -> None:
        delay = 1
        while not self.stop_event.is_set():
            self.logger.info("Opening WebSocket connection")
            self.ws = websocket.WebSocketApp(self.config.websocket_url, on_open=self._on_open, on_message=self._on_message, on_error=self._on_error, on_close=self._on_close)
            self.ws.run_forever(ping_interval=20, ping_timeout=10, sslopt={"cert_reqs": ssl.CERT_REQUIRED})
            if self.stop_event.wait(delay):
                break
            self.logger.warning("Reconnecting after %d seconds", delay)
            delay = min(delay * 2, 30)

    def stop(self) -> None:
        self.stop_event.set()
        if self.ws:
            self.ws.close()
