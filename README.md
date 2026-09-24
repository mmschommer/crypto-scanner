# Local Cryptocurrency Market Scanner — Version 1.1

A zero-install, read-only browser dashboard for Kraken public USD spot data. It monitors BTC/USD, ETH/USD, SOL/USD, XRP/USD, and SUI/USD while keeping the dashboard labels short. It needs no API key, account, paid service, package manager, runtime, build step, command line, or local server.

This is market monitoring only: there is no brokerage connection, authentication, trade execution, strategy signal, OpenAI API call, or AI inference.

## Open it locally — no installation

1. Download or clone the repository (a GitHub ZIP is fine).
2. Extract the ZIP if needed.
3. Double-click `index.html`, or choose **Open With** and select a current browser.
4. Leave the tab open while monitoring; close it to stop.

Do not start a local server. Classic scripts allow application files to load directly from `file://`. The Kraken WebSocket will still be attempted if the browser blocks cross-origin REST requests. In that case the dashboard displays an honest history warning and does not claim that bootstrap succeeded.

Browser security settings, extensions, or corporate network policies can also block WebSocket traffic. The dashboard exposes disconnection, staleness, REST failures, and the exact market/channel for subscription failures rather than silently ignoring them.

## Data sources and behavior

The app uses only Kraken's unauthenticated public endpoints:

- Spot WebSocket API v2 at `wss://ws.kraken.com/v2`: ticker last price, 24-hour percentage change and timestamp, plus 5-, 15-, and 60-minute OHLC updates.
- REST OHLC at `https://api.kraken.com/0/public/OHLC`: recent history for every market and interval, requested with `assetVersion=1`.

Kraken documents the final REST OHLC row as the current, not-yet-committed candle, so Version 1.1 always removes that final row before adding history. A WebSocket OHLC update is also never assumed to be closed. Each market/timeframe has a separate forming candle. Updates for its interval replace it; only an update with a later `interval_begin` finalizes and persists the prior candle.

Completed histories are chronological, deduplicated by interval start, and bounded to 200 entries by default. Histories and a bounded event log stay in this browser's `localStorage`. **Clear local data** removes only this app's saved history and log, then reloads.

## Resilience and status

The dashboard shows connection state, latest data time, data age, REST bootstrap status, and local events. It handles Kraken status, subscription acknowledgments, heartbeat messages, protocol ping/pong, stale data, automatic reconnect, and bounded exponential backoff. A silent socket is reset after twice the configured stale threshold.

## Files

- `config.js` — display/exchange symbols, intervals, public endpoints, and limits.
- `core.js` — pure Kraken parsing, forming-candle transitions, history, and freshness logic.
- `storage.js` — browser-local persistence and bounded event logging.
- `app.js` — Kraken REST/WebSocket transport and dashboard controller.
- `index.html` and `styles.css` — accessible static dashboard.
- `tests.js` and `tests.html` — direct-open browser tests.

## Run tests — no installation

Double-click `tests.html`. A green **10/10 tests passed** confirms ticker and OHLC parsing, forming-candle handling, exactly-once finalization, deduplication, ordering, bounds, exclusion of the final REST row, and stale-data behavior. The tests use local fixtures and make no network requests.

## Privacy and limitations

- Only public Kraken market-data endpoints are contacted; there are no credentials.
- Data and events remain in the current browser profile's local storage.
- Clearing site data, private browsing, or changing profiles removes saved history.
- Public endpoint availability, browser CORS/WebSocket policies, extensions, and network policy are outside this static app's control.
