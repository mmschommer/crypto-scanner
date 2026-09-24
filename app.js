/* Bybit transport and dashboard controller. Future strategy code belongs in separate modules. */
(function () {
  "use strict";
  const config = window.ScannerConfig;
  const core = window.CryptoScannerCore;
  const store = window.ScannerStorage;
  const state = {
    histories: {}, tickers: {}, connection: "STARTING", lastDataTime: NaN,
    socket: null, reconnectTimer: null, reconnectDelay: 1_000, heartbeatTimer: null,
    staleLogged: false
  };

  for (const symbol of config.symbols) {
    state.tickers[symbol] = { price: null, change24h: null, updatedAt: NaN };
    for (const timeframe of config.timeframes) state.histories[`${symbol}:${timeframe}`] = [];
  }

  const saved = store.loadHistories();
  for (const key of Object.keys(state.histories)) {
    if (Array.isArray(saved[key])) {
      for (const candle of saved[key]) core.upsertCandle(state.histories[key], candle, config.historyLimit);
    }
  }

  function log(level, event, details) {
    store.log(level, event, details);
    renderLogs();
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) return "—";
    return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
  }
  function formatTime(value) {
    return Number.isFinite(value) ? new Date(value).toLocaleTimeString() : "—";
  }
  function latestClose(symbol, timeframe) {
    const history = state.histories[`${symbol}:${timeframe}`];
    return history.length ? history[history.length - 1].close : null;
  }
  function currentAge() {
    return Number.isFinite(state.lastDataTime) ? Math.max(0, Date.now() - state.lastDataTime) : NaN;
  }

  function render() {
    const stale = core.isStale(state.lastDataTime, config.staleAfterMs);
    const disconnected = state.connection !== "CONNECTED";
    const warning = document.getElementById("warning");
    warning.hidden = !(stale || disconnected);
    warning.textContent = disconnected
      ? `MARKET DATA DISCONNECTED — ${state.connection}`
      : `MARKET DATA STALE — last update ${Math.round(currentAge() / 1000)}s ago`;
    const badge = document.getElementById("connection");
    badge.textContent = stale && !disconnected ? "STALE" : state.connection;
    badge.className = `badge ${stale || disconnected ? "bad" : "good"}`;
    document.getElementById("latest-time").textContent = formatTime(state.lastDataTime);
    document.getElementById("data-age").textContent = Number.isFinite(currentAge()) ? `${(currentAge() / 1000).toFixed(1)}s` : "—";

    document.getElementById("markets").innerHTML = config.symbols.map((symbol) => {
      const ticker = state.tickers[symbol];
      const changeClass = ticker.change24h >= 0 ? "positive" : "negative";
      const shortName = symbol.replace("USDT", "");
      return `<tr><th scope="row"><strong>${shortName}</strong><small>${symbol}</small></th>
        <td>${formatPrice(ticker.price)}</td>
        <td class="${Number.isFinite(ticker.change24h) ? changeClass : ""}">${Number.isFinite(ticker.change24h) ? `${ticker.change24h >= 0 ? "+" : ""}${ticker.change24h.toFixed(2)}%` : "—"}</td>
        <td>${formatPrice(latestClose(symbol, "5"))}</td><td>${formatPrice(latestClose(symbol, "15"))}</td>
        <td>${formatPrice(latestClose(symbol, "60"))}</td><td>${formatTime(ticker.updatedAt)}</td></tr>`;
    }).join("");

    if ((stale || disconnected) && !state.staleLogged) {
      log("WARN", "stale-data", `${state.connection}; age=${currentAge()}ms`);
      state.staleLogged = true;
    } else if (!stale && !disconnected && state.staleLogged) {
      log("INFO", "data-recovered", "Market data is current");
      state.staleLogged = false;
    }
  }

  function renderLogs() {
    const logs = store.getLogs().slice(-8).reverse();
    document.getElementById("events").innerHTML = logs.map((item) =>
      `<li><time>${new Date(item.time).toLocaleTimeString()}</time><strong>${item.level}</strong> ${item.event}${item.details ? ` — ${String(item.details).replace(/[<>&]/g, "")}` : ""}</li>`
    ).join("") || "<li>No locally stored events yet.</li>";
  }

  function persistHistories() { store.saveHistories(state.histories); }
  function acceptClosed(symbol, timeframe, candle, source) {
    if (!state.histories[`${symbol}:${timeframe}`]) return;
    const inserted = core.upsertCandle(state.histories[`${symbol}:${timeframe}`], candle, config.historyLimit);
    if (inserted && source !== "REST") {
      persistHistories();
      log("INFO", "closed-candle", `${source} ${symbol} ${timeframe}m ${candle.start}`);
    }
  }

  async function fetchHistory(symbol, timeframe) {
    const query = new URLSearchParams({ category: "linear", symbol, interval: timeframe, limit: String(config.historyLimit) });
    const response = await fetch(`${config.restBaseUrl}/v5/market/kline?${query}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.retCode !== 0) throw new Error(`Bybit ${payload.retCode}: ${payload.retMsg}`);
    const serverTime = Number(payload.time);
    for (const row of payload.result.list) {
      const candle = core.parseRestCandle(row);
      if (core.restCandleIsClosed(candle, timeframe, serverTime)) acceptClosed(symbol, timeframe, candle, "REST");
    }
  }

  async function bootstrap() {
    document.getElementById("bootstrap").textContent = "Loading closed-candle history…";
    const results = await Promise.allSettled(config.symbols.flatMap((symbol) =>
      config.timeframes.map((timeframe) => fetchHistory(symbol, timeframe))));
    const failures = results.filter((result) => result.status === "rejected");
    persistHistories();
    if (failures.length) {
      document.getElementById("bootstrap").textContent = `History warning: ${failures.length} request(s) failed. Live monitoring continues.`;
      log("ERROR", "history-bootstrap", failures[0].reason.message);
    } else {
      document.getElementById("bootstrap").textContent = "Closed-candle history loaded.";
      log("INFO", "history-bootstrap", "All histories loaded");
    }
    render();
  }

  function handleMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (message.op === "pong" || message.ret_msg === "pong") return;
    if (!message.topic) return;
    state.lastDataTime = Number(message.ts) || Date.now();
    if (message.topic.startsWith("tickers.")) {
      const symbol = message.topic.slice(8);
      const data = Array.isArray(message.data) ? message.data[0] : message.data;
      const ticker = state.tickers[symbol];
      if (ticker && data) {
        if (data.lastPrice !== undefined) ticker.price = Number(data.lastPrice);
        if (data.price24hPcnt !== undefined) ticker.change24h = Number(data.price24hPcnt) * 100;
        ticker.updatedAt = state.lastDataTime;
      }
    }
    for (const item of core.parseConfirmedKlines(message)) acceptClosed(item.symbol, item.timeframe, item.candle, "WebSocket");
    render();
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    const delay = state.reconnectDelay;
    state.connection = `RECONNECTING IN ${Math.ceil(delay / 1000)}s`;
    log("WARN", "reconnect-scheduled", `${delay}ms`);
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, delay);
    state.reconnectDelay = Math.min(delay * 2, config.reconnectMaximumMs);
    render();
  }

  function connect() {
    if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) return;
    state.connection = "CONNECTING";
    render();
    log("INFO", "connection-attempt", config.websocketUrl);
    const socket = new WebSocket(config.websocketUrl);
    state.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== state.socket) return;
      state.connection = "CONNECTED";
      state.reconnectDelay = 1_000;
      const topics = config.symbols.flatMap((symbol) => [
        `tickers.${symbol}`, ...config.timeframes.map((timeframe) => `kline.${timeframe}.${symbol}`)
      ]);
      socket.send(JSON.stringify({ op: "subscribe", args: topics }));
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: "ping" }));
      }, config.heartbeatMs);
      log("INFO", "connected", `${topics.length} topics subscribed`);
      render();
    });
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", () => log("ERROR", "websocket-error", "Public feed error"));
    socket.addEventListener("close", (event) => {
      if (socket !== state.socket) return;
      clearInterval(state.heartbeatTimer);
      state.connection = "DISCONNECTED";
      log("WARN", "disconnected", `code=${event.code}`);
      scheduleReconnect();
    });
  }

  document.getElementById("clear-data").addEventListener("click", () => {
    if (window.confirm("Clear saved candle histories and scanner event logs?")) {
      store.clear();
      window.location.reload();
    }
  });
  window.addEventListener("online", connect);
  window.addEventListener("offline", () => { state.connection = "OFFLINE"; render(); });
  window.addEventListener("beforeunload", () => {
    clearTimeout(state.reconnectTimer); clearInterval(state.heartbeatTimer);
    if (state.socket) state.socket.close(1000, "Page closing");
  });

  renderLogs();
  render();
  connect();
  bootstrap();
  setInterval(() => {
    if (state.socket && state.socket.readyState === WebSocket.OPEN && core.isStale(state.lastDataTime, config.staleAfterMs * 2)) {
      log("WARN", "silent-connection-reset", "No market data received");
      state.socket.close(4000, "Stale data");
    }
    render();
  }, 1_000);
}());
