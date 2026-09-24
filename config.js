/* User-editable scanner settings. All endpoints are public and unauthenticated. */
window.ScannerConfig = Object.freeze({
  symbols: Object.freeze([
    Object.freeze({ display: "BTC", kraken: "BTC/USD", rest: "XBTUSD" }),
    Object.freeze({ display: "ETH", kraken: "ETH/USD", rest: "ETHUSD" }),
    Object.freeze({ display: "SOL", kraken: "SOL/USD", rest: "SOLUSD" }),
    Object.freeze({ display: "XRP", kraken: "XRP/USD", rest: "XRPUSD" }),
    Object.freeze({ display: "SUI", kraken: "SUI/USD", rest: "SUIUSD" })
  ]),
  timeframes: Object.freeze([5, 15, 60]),
  historyLimit: 200,
  staleAfterMs: 45_000,
  restUrl: "https://api.kraken.com/0/public/OHLC",
  websocketUrl: "wss://ws.kraken.com/v2",
  heartbeatMs: 20_000,
  reconnectMaximumMs: 30_000,
  maximumLocalLogs: 500
});
