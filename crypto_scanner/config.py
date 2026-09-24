"""Configuration loading and validation."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class LoggingConfig:
    directory: Path
    level: str
    max_bytes: int
    backup_count: int


@dataclass(frozen=True)
class Config:
    symbols: tuple[str, ...]
    timeframes: tuple[str, ...]
    history_limit: int
    stale_data_seconds: float
    dashboard_refresh_seconds: float
    rest_base_url: str
    websocket_url: str
    logging: LoggingConfig


def load_config(path: str | Path) -> Config:
    config_path = Path(path)
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    timeframes = tuple(str(value) for value in raw["timeframes"])
    if not timeframes or any(not value.isdigit() for value in timeframes):
        raise ValueError("timeframes must be minute intervals expressed as numbers")
    symbols = tuple(str(value).upper() for value in raw["symbols"])
    if not symbols:
        raise ValueError("at least one symbol is required")
    log = raw["logging"]
    log_dir = Path(log["directory"])
    if not log_dir.is_absolute():
        log_dir = (config_path.resolve().parent / log_dir).resolve()
    return Config(
        symbols=symbols,
        timeframes=timeframes,
        history_limit=int(raw["history_limit"]),
        stale_data_seconds=float(raw["stale_data_seconds"]),
        dashboard_refresh_seconds=float(raw["dashboard_refresh_seconds"]),
        rest_base_url=str(raw["rest_base_url"]).rstrip("/"),
        websocket_url=str(raw["websocket_url"]),
        logging=LoggingConfig(
            directory=log_dir,
            level=str(log["level"]).upper(),
            max_bytes=int(log["max_bytes"]),
            backup_count=int(log["backup_count"]),
        ),
    )
