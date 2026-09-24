"""Application and candle event logging."""
from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import LoggingConfig
from .models import Candle


def configure_logging(config: LoggingConfig) -> tuple[logging.Logger, logging.Logger]:
    config.directory.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)sZ %(levelname)s %(message)s", "%Y-%m-%dT%H:%M:%S")
    app = logging.getLogger("crypto_scanner")
    app.setLevel(config.level)
    app.handlers.clear()
    handler = RotatingFileHandler(config.directory / "scanner.log", maxBytes=config.max_bytes, backupCount=config.backup_count)
    handler.setFormatter(formatter)
    app.addHandler(handler)

    candles = logging.getLogger("crypto_scanner.candles")
    candles.setLevel(logging.INFO)
    candles.propagate = False
    candles.handlers.clear()
    candle_handler = RotatingFileHandler(config.directory / "closed_candles.jsonl", maxBytes=config.max_bytes, backupCount=config.backup_count)
    candle_handler.setFormatter(logging.Formatter("%(message)s"))
    candles.addHandler(candle_handler)
    return app, candles


def log_candle(logger: logging.Logger, symbol: str, timeframe: str, candle: Candle) -> None:
    logger.info(json.dumps({"symbol": symbol, "timeframe": timeframe, **candle.__dict__}, separators=(",", ":")))
