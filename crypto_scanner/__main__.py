"""Scanner command-line entry point."""
from __future__ import annotations

import argparse
import threading

from .client import BybitMarketClient
from .config import load_config
from .dashboard import run_dashboard
from .logging_setup import configure_logging
from .state import MarketState


def main() -> int:
    parser = argparse.ArgumentParser(description="Local read-only Bybit market scanner")
    parser.add_argument("--config", default="config.json")
    args = parser.parse_args()
    config = load_config(args.config)
    logger, candle_logger = configure_logging(config.logging)
    state = MarketState(config.symbols, config.timeframes, config.history_limit)
    client = BybitMarketClient(config, state, logger, candle_logger)
    try:
        client.bootstrap()
        worker = threading.Thread(target=client.run, name="bybit-websocket", daemon=True)
        worker.start()
        run_dashboard(config, state, client.stop_event, logger)
    except KeyboardInterrupt:
        logger.info("Shutdown requested by user")
    except Exception:
        logger.exception("Fatal scanner error")
        return 1
    finally:
        client.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
