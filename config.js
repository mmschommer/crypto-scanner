/* User-editable scanner settings. All endpoints are public and unauthenticated. */
window.ScannerConfig = Object.freeze({
  symbols: Object.freeze(["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "SUIUSDT"]),
  timeframes: Object.freeze(["5", "15", "60"]),
  historyLimit: 200,
  staleAfterMs: 45_000,
  restBaseUrl: "https://api.bybit.com",
  websocketUrl: "wss://stream.bybit.com/v5/public/linear",
  heartbeatMs: 20_000,
  reconnectMaximumMs: 30_000,
  maximumLocalLogs: 500
});
