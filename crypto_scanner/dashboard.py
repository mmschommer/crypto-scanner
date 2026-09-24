"""Dependency-free ANSI terminal dashboard."""
from __future__ import annotations

import datetime as dt
import logging
import sys
import time

from .config import Config
from .state import MarketState


def _number(value: float | None, signed: bool = False) -> str:
    return "--" if value is None else f"{value:+.2f}" if signed else f"{value:.8g}"


def render(config: Config, state: MarketState) -> str:
    now = time.time()
    with state.lock:
        age = None if state.last_data_at is None else now - state.last_data_at
        stale = age is None or age > config.stale_data_seconds
        overall = "\033[31;1mWARNING: DATA STALE/DISCONNECTED\033[0m" if stale or not state.connected else "\033[32;1mLIVE\033[0m"
        lines = ["CRYPTO MARKET SCANNER v1 — READ ONLY / NO TRADING", f"Status: {overall}  Last message age: {'--' if age is None else f'{age:.1f}s'}", "", f"{'SYMBOL':<10} {'PRICE':>14} {'24H %':>9} {'5m CLOSE':>14} {'15m CLOSE':>14} {'1h CLOSE':>14} {'UPDATED (UTC)':>20} {'STATUS':>12}"]
        for symbol in config.symbols:
            ticker = state.tickers[symbol]
            updated = "--" if ticker.updated_at is None else dt.datetime.fromtimestamp(ticker.updated_at, dt.UTC).strftime("%H:%M:%S")
            status = "STALE" if stale or ticker.updated_at is None or now - ticker.updated_at > config.stale_data_seconds else "OK"
            lines.append(f"{symbol:<10} {_number(ticker.price):>14} {_number(ticker.change_24h_pct, True):>9} {_number(state.latest_close(symbol, '5')):>14} {_number(state.latest_close(symbol, '15')):>14} {_number(state.latest_close(symbol, '60')):>14} {updated:>20} {status:>12}")
        return "\n".join(lines)


def run_dashboard(config: Config, state: MarketState, stop_event, logger: logging.Logger) -> None:
    was_stale = False
    while not stop_event.wait(config.dashboard_refresh_seconds):
        with state.lock:
            stale = state.last_data_at is None or time.time() - state.last_data_at > config.stale_data_seconds
        if stale and not was_stale:
            logger.warning("Market data is stale or has not arrived")
        elif was_stale and not stale:
            logger.info("Market data freshness recovered")
        was_stale = stale
        sys.stdout.write("\033[2J\033[H" + render(config, state) + "\n")
        sys.stdout.flush()
