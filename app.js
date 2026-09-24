/* Kraken public Spot transport and dashboard controller. No strategy or trading logic. */
(function () {
  "use strict";
  const config = window.ScannerConfig;
  const core = window.CryptoScannerCore;
  const store = window.ScannerStorage;
  const state = {
    histories: {}, forming: {}, tickers: {}, failedMarkets: new Map(),
    connection: "STARTING", lastMarketDataTime: NaN, lastSocketActivityTime: NaN,
    socket: null, reconnectTimer: null,
    reconnectDelay: 1_000, heartbeatTimer: null, staleLogged: false,
    nextRequestId: 1, subscriptions: new Map()
  };

  for (const market of config.symbols) {
    state.tickers[market.kraken] = { price: null, change24h: null, updatedAt: NaN };
    for (const timeframe of config.timeframes) {
      const key = `${market.kraken}:${timeframe}`;
      state.histories[key] = [];
      state.forming[key] = null;
    }
  }

  const saved = store.loadHistories();
  for (const key of Object.keys(state.histories)) {
    if (Array.isArray(saved[key])) {
      for (const candle of saved[key]) core.upsertCandle(state.histories[key], candle, config.historyLimit);
    }
  }

  function clean(value) { return String(value).replace(/[<>&]/g, ""); }
  function log(level, event, details) { store.log(level, event, details); renderLogs(); }
  function formatPrice(value) {
    if (!Number.isFinite(value)) return "—";
    return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
  }
  function formatTime(value) { return Number.isFinite(value) ? new Date(value).toLocaleTimeString() : "—"; }
  function latestClose(symbol, timeframe) {
    const history = state.histories[`${symbol}:${timeframe}`];
    return history.length ? history[history.length - 1].close : null;
  }
  function currentAge() { return Number.isFinite(state.lastMarketDataTime) ? Math.max(0, Date.now() - state.lastMarketDataTime) : NaN; }

  function render() {
    const stale = core.isStale(state.lastMarketDataTime, config.staleAfterMs);
    const disconnected = state.connection !== "CONNECTED";
    const failures = [...state.failedMarkets.entries()];
    const warning = document.getElementById("warning");
    warning.hidden = !(stale || disconnected || failures.length);
    warning.textContent = failures.length
      ? `KRAKEN SUBSCRIPTION FAILED — ${failures.map(([market, reason]) => `${market}: ${reason}`).join("; ")}`
      : disconnected ? `MARKET DATA DISCONNECTED — ${state.connection}`
        : `MARKET DATA STALE — last update ${Math.round(currentAge() / 1000)}s ago`;
    const badge = document.getElementById("connection");
    badge.textContent = stale && !disconnected ? "STALE" : state.connection;
    badge.className = `badge ${stale || disconnected || failures.length ? "bad" : "good"}`;
    document.getElementById("latest-time").textContent = formatTime(state.lastMarketDataTime);
    document.getElementById("data-age").textContent = Number.isFinite(currentAge()) ? `${(currentAge() / 1000).toFixed(1)}s` : "—";

    document.getElementById("markets").innerHTML = config.symbols.map((market) => {
      const ticker = state.tickers[market.kraken];
      const changeClass = ticker.change24h >= 0 ? "positive" : "negative";
      const failed = failures.some(([name]) => name.startsWith(market.kraken));
      return `<tr${failed ? ' class="market-failed"' : ""}><th scope="row"><strong>${market.display}</strong><small>${market.kraken}${failed ? " · subscription failed" : ""}</small></th>
        <td>${formatPrice(ticker.price)}</td>
        <td class="${Number.isFinite(ticker.change24h) ? changeClass : ""}">${Number.isFinite(ticker.change24h) ? `${ticker.change24h >= 0 ? "+" : ""}${ticker.change24h.toFixed(2)}%` : "—"}</td>
        <td>${formatPrice(latestClose(market.kraken, 5))}</td><td>${formatPrice(latestClose(market.kraken, 15))}</td>
        <td>${formatPrice(latestClose(market.kraken, 60))}</td><td>${formatTime(ticker.updatedAt)}</td></tr>`;
    }).join("");

    if ((stale || disconnected) && !state.staleLogged) {
      log("WARN", "stale-data", `${state.connection}; age=${currentAge()}ms`); state.staleLogged = true;
    } else if (!stale && !disconnected && state.staleLogged) {
      log("INFO", "data-recovered", "Market data is current"); state.staleLogged = false;
    }
  }

  function renderLogs() {
    const logs = store.getLogs().slice(-8).reverse();
    document.getElementById("events").innerHTML = logs.map((item) =>
      `<li><time>${new Date(item.time).toLocaleTimeString()}</time><strong>${clean(item.level)}</strong> ${clean(item.event)}${item.details ? ` — ${clean(item.details)}` : ""}</li>`
    ).join("") || "<li>No locally stored events yet.</li>";
  }

  function persistHistories() { store.saveHistories(state.histories); }
  function acceptClosed(symbol, timeframe, candle, source) {
    const history = state.histories[`${symbol}:${timeframe}`];
    if (!history) return false;
    const inserted = core.upsertCandle(history, candle, config.historyLimit);
    if (inserted && source !== "REST") {
      persistHistories(); log("INFO", "closed-candle", `${source} ${symbol} ${timeframe}m ${candle.start}`);
    }
    return inserted;
  }

  async function fetchHistory(market, timeframe) {
    const query = new URLSearchParams({ pair: market.rest, interval: String(timeframe), assetVersion: "1" });
    const response = await fetch(`${config.restUrl}?${query}`);
    if (!response.ok) throw new Error(`${market.kraken} ${timeframe}m: HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error && payload.error.length) throw new Error(`${market.kraken} ${timeframe}m: ${payload.error.join(", ")}`);
    const resultKey = Object.keys(payload.result || {}).find((key) => key !== "last");
    if (!resultKey || !Array.isArray(payload.result[resultKey])) throw new Error(`${market.kraken} ${timeframe}m: malformed response`);
    for (const candle of core.parseRestHistory(payload.result[resultKey]).slice(-config.historyLimit)) {
      acceptClosed(market.kraken, timeframe, candle, "REST");
    }
  }

  async function bootstrap() {
    document.getElementById("bootstrap").textContent = "Loading closed-candle history…";
    const results = await Promise.allSettled(config.symbols.flatMap((market) =>
      config.timeframes.map((timeframe) => fetchHistory(market, timeframe))));
    const failures = results.filter((result) => result.status === "rejected");
    persistHistories();
    if (failures.length) {
      const localHint = location.protocol === "file:" ? " Your browser may block Kraken REST from file://; live WebSocket monitoring continues." : " Live monitoring continues.";
      document.getElementById("bootstrap").textContent = `History warning: ${failures.length} request(s) failed.${localHint}`;
      log("ERROR", "history-bootstrap", failures[0].reason.message);
    } else {
      document.getElementById("bootstrap").textContent = "Closed-candle history loaded (forming REST rows excluded).";
      log("INFO", "history-bootstrap", "All histories loaded");
    }
    render();
  }

  function markSubscriptionResult(message) {
    if (message.method !== "subscribe" || message.req_id === undefined) return false;
    const requested = state.subscriptions.get(message.req_id);
    state.subscriptions.delete(message.req_id);
    if (!requested) return true;
    if (message.success === false) {
      const reason = message.error || "Unknown Kraken subscription error";
      state.failedMarkets.set(requested.label, reason);
      log("ERROR", "subscription-failed", `${requested.label}: ${reason}`);
    } else {
      state.failedMarkets.delete(requested.label);
      log("INFO", "subscription-acknowledged", requested.label);
    }
    return true;
  }

  function handleMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    const activityTimes = core.updateActivityTimes(state, message, Date.now());
    state.lastSocketActivityTime = activityTimes.lastSocketActivityTime;
    state.lastMarketDataTime = activityTimes.lastMarketDataTime;
    if (message.channel === "heartbeat" || message.method === "pong") return;
    if (message.channel === "status") {
      const status = message.data && message.data[0] && message.data[0].system;
      if (status) { state.connection = status === "online" ? "CONNECTED" : `KRAKEN ${String(status).toUpperCase()}`; render(); }
      return;
    }
    if (markSubscriptionResult(message)) { render(); return; }

    const tickers = core.parseTicker(message);
    const candles = core.parseOhlc(message);
    if (!tickers.length && !candles.length) return;
    for (const update of tickers) {
      const ticker = state.tickers[update.symbol];
      if (!ticker) continue;
      ticker.price = update.price; ticker.change24h = update.change24h;
      ticker.updatedAt = Number.isFinite(update.updatedAt) ? update.updatedAt : state.lastMarketDataTime;
    }
    for (const update of candles) {
      const key = `${update.symbol}:${update.timeframe}`;
      if (!(key in state.forming)) continue;
      const result = core.advanceForming(state.forming[key], update.candle, state.histories[key], config.historyLimit);
      state.forming[key] = result.forming;
      if (result.inserted) {
        persistHistories(); log("INFO", "closed-candle", `WebSocket ${update.symbol} ${update.timeframe}m ${result.closed.start}`);
      }
    }
    render();
  }

  function subscribe(socket, channel, symbol, interval) {
    const reqId = state.nextRequestId++;
    const label = `${symbol} ${channel}${interval ? ` ${interval}m` : ""}`;
    state.subscriptions.set(reqId, { label });
    const params = { channel, symbol: [symbol], snapshot: true };
    if (interval) params.interval = interval;
    socket.send(JSON.stringify({ method: "subscribe", params, req_id: reqId }));
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    const delay = state.reconnectDelay;
    state.connection = `RECONNECTING IN ${Math.ceil(delay / 1000)}s`;
    log("WARN", "reconnect-scheduled", `${delay}ms`);
    state.reconnectTimer = setTimeout(() => { state.reconnectTimer = null; connect(); }, delay);
    state.reconnectDelay = Math.min(delay * 2, config.reconnectMaximumMs); render();
  }

  function connect() {
    if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) return;
    state.connection = "CONNECTING"; state.subscriptions.clear(); render();
    log("INFO", "connection-attempt", config.websocketUrl);
    const socket = new WebSocket(config.websocketUrl); state.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== state.socket) return;
      state.connection = "CONNECTED"; state.reconnectDelay = 1_000;
      state.lastSocketActivityTime = Date.now();
      for (const market of config.symbols) {
        subscribe(socket, "ticker", market.kraken);
        for (const timeframe of config.timeframes) subscribe(socket, "ohlc", market.kraken, timeframe);
      }
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ method: "ping", req_id: state.nextRequestId++ }));
      }, config.heartbeatMs);
      log("INFO", "connected", "Kraken WebSocket open; subscriptions requested"); render();
    });
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", () => log("ERROR", "websocket-error", "Kraken public feed error"));
    socket.addEventListener("close", (event) => {
      if (socket !== state.socket) return;
      clearInterval(state.heartbeatTimer); state.connection = "DISCONNECTED";
      log("WARN", "disconnected", `code=${event.code}`); scheduleReconnect();
    });
  }

  document.getElementById("clear-data").addEventListener("click", () => {
    if (window.confirm("Clear saved candle histories and scanner event logs?")) { store.clear(); window.location.reload(); }
  });
  window.addEventListener("online", connect);
  window.addEventListener("offline", () => { state.connection = "OFFLINE"; render(); });
  window.addEventListener("beforeunload", () => {
    clearTimeout(state.reconnectTimer); clearInterval(state.heartbeatTimer);
    if (state.socket) state.socket.close(1000, "Page closing");
  });

  renderLogs(); render(); connect(); bootstrap();
  setInterval(() => {
    if (state.socket && state.socket.readyState === WebSocket.OPEN
      && core.socketIsSilent(state.lastSocketActivityTime, config.staleAfterMs * 2)) {
      log("WARN", "silent-connection-reset", "No Kraken WebSocket activity received");
      state.socket.close(4000, "Socket silence");
    }
    render();
  }, 1_000);
}());
