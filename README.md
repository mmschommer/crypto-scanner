# Local Cryptocurrency Market Scanner — Version 1

A local, terminal-based monitoring foundation for Bybit USDT perpetual markets. It loads historical candles, consumes public live ticker and kline streams, retains bounded in-memory candle history, and displays BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, and SUIUSDT across 5-minute, 15-minute, and 1-hour timeframes.

This version is deliberately **read only**. It performs paper analysis only, has no brokerage integration, does not place trades, and contains no OpenAI or AI analysis. It uses Bybit's unauthenticated public REST and WebSocket market-data interfaces, so **no exchange API key or paid service is needed**.

## Requirements

- Python 3.10 or newer
- Internet access to `api.bybit.com` and `stream.bybit.com`

## Install

Run these exact commands from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

## Start

From the repository root, with the virtual environment activated:

```bash
python3 -m crypto_scanner --config config.json
```

The initial REST bootstrap may take several seconds. The terminal is then refreshed once per second. Application/connection events are written to `data/logs/scanner.log`; newly received closed candles are written as JSON Lines to `data/logs/closed_candles.jsonl`.

## Stop

Press **Ctrl+C** in the terminal running the scanner. The exact terminal key sequence is:

```text
Ctrl+C
```

This requests a graceful WebSocket shutdown. No background service is installed.

## Configuration

Edit `config.json` to configure symbols, minute-based timeframes (`60` means one hour), history depth, stale-data threshold, endpoints, dashboard refresh rate, and rotating-log settings. The defaults request 200 entries per symbol/timeframe and keep only candles proven closed:

- REST bootstrap candles are accepted only when the exchange server time is at or beyond the candle end.
- Live WebSocket candles are accepted only when Bybit sends `confirm: true`.
- The current forming candle is never inserted into completed-candle history.

The dashboard marks the feed stale when no data message arrives within the configured threshold. The WebSocket client logs disconnects and errors, then reconnects with bounded exponential backoff.

## Tests

Tests require no network connection:

```bash
python3 -m unittest discover -s tests -v
```

## Scope and future extension

The package separates configuration, immutable models, parsing, state, exchange transport, logging, and presentation. Future versions can add swing points, liquidity sweeps, break of structure, retests, VWAP, volume analysis, risk/reward, paper-trade tracking, or review modules without mixing them into the transport layer. None of those strategy or automation features is implemented in Version 1.

## Operational limitations

- Data is held in memory and resets at restart; logs persist locally.
- Availability depends on Bybit public endpoints, network access, and any regional endpoint restrictions.
- This is a monitor, not financial advice or an execution system.
