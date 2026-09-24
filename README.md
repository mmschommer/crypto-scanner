# Local Cryptocurrency Market Scanner — Version 1

A zero-install, read-only browser dashboard for Bybit public USDT perpetual market data. It monitors BTC, ETH, SOL, XRP, and SUI using 5-minute, 15-minute, and 1-hour candles. It needs no API key, account, paid service, package manager, runtime installation, build step, or command line.

The scanner performs paper monitoring only. It has no brokerage connection, order execution, trading signals, OpenAI API calls, or AI inference.

## Open it — no installation

### Option A: open the file directly

1. Download or clone this repository using GitHub's normal web interface. A ZIP download is fine.
2. If downloaded as a ZIP, extract it.
3. Double-click `index.html` (or use **Open With** and choose a current browser).
4. Leave the tab open while monitoring.
5. Close the tab to stop the scanner.

There is nothing to install and no local server to start. The application uses classic scripts rather than JavaScript modules specifically so its own files can load from `file://`.

### Option B: GitHub Pages if the browser blocks `file://` market data

Browser security, privacy extensions, corporate policies, or Bybit regional controls can reject cross-origin REST or WebSocket traffic from a local-file (`null`) origin. The application reports this honestly as a history or connection warning. If that happens, use GitHub Pages—the simplest zero-install hosted option already built into GitHub:

1. Push this existing branch to GitHub.
2. In the repository on GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select this branch, select the **`/ (root)`** folder, and click **Save**.
5. Open the HTTPS address GitHub displays after deployment (normally `https://<owner>.github.io/<repository>/`).

This requires no local web server, runtime, package manager, or paid service. GitHub Pages serves the same static files over HTTPS. Network access to Bybit is still required, and Bybit may be unavailable in some regions.

## What the dashboard shows

For each configured market:

- current public ticker price and 24-hour percentage change;
- most recent finalized 5m, 15m, and 1h candle close;
- latest ticker update time;
- overall connection state, latest market-data time, and current data age.

A prominent warning appears when the socket is disconnected or data becomes stale. The client sends Bybit JSON heartbeat pings, reconnects automatically with bounded exponential backoff, and resets a silent connection when no market data arrives.

## Closed-candle correctness

- WebSocket klines enter completed history only when Bybit supplies `confirm === true`.
- REST bootstrap candles enter history only when the response's Bybit server timestamp is at or beyond the candle's calculated end.
- Histories are chronological, deduplicated by candle start time, and bounded to 200 candles by default.

Historical candles and a bounded event log are stored in this browser's `localStorage`. **Clear local data** deletes only this application's locally saved candles and logs, then reloads the page. It does not affect Bybit or any account.

## Configuration and architecture

`config.js` contains the symbols, timeframes, endpoints, stale threshold, heartbeat timing, history limit, reconnect cap, and local-log limit. All endpoints are public and unauthenticated.

The code is intentionally separated:

- `core.js` — pure candle parsing, finalization, history, and freshness logic;
- `storage.js` — browser-local history and event-log persistence;
- `app.js` — Bybit REST/WebSocket transport and dashboard controller;
- `index.html` and `styles.css` — accessible presentation;
- `tests.js` and `tests.html` — browser-compatible tests.

Future deterministic strategy modules can be added separately for swing highs/lows, liquidity sweeps, break of structure, retests, VWAP, volume filters, risk/reward, or paper trades. Candidate-only Codex review may be designed later; it is not present or invoked in Version 1.

## Run the tests — no installation

Double-click `tests.html`. The page runs the browser-compatible suite and shows a green result for each test. It covers confirmed versus unconfirmed candles, duplicate prevention, chronological ordering, bounded histories, stale-data calculation, and the REST close boundary.

## Privacy and limitations

- The browser connects only to the public Bybit URLs in `config.js`; there are no credentials.
- Data and event logs remain in the current browser profile's local storage.
- Clearing site data, private browsing, or changing browser profiles removes persisted history.
- The scanner must bootstrap again after local data is cleared.
- Public endpoint availability, CORS policy, WebSocket policy, browser extensions, and regional availability remain outside this static application's control.
