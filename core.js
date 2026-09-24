/* Pure market-data functions. This file intentionally contains no UI or strategy logic. */
(function (global) {
  "use strict";

  function normalizeCandle(value) {
    return {
      start: Number(value.start),
      open: Number(value.open),
      high: Number(value.high),
      low: Number(value.low),
      close: Number(value.close),
      volume: Number(value.volume),
      turnover: Number(value.turnover)
    };
  }

  function parseRestCandle(row) {
    if (!Array.isArray(row) || row.length < 7) throw new Error("Invalid Bybit REST candle");
    return normalizeCandle({
      start: row[0], open: row[1], high: row[2], low: row[3],
      close: row[4], volume: row[5], turnover: row[6]
    });
  }

  function restCandleIsClosed(candle, intervalMinutes, serverTimeMs) {
    return serverTimeMs >= candle.start + Number(intervalMinutes) * 60_000;
  }

  function parseConfirmedKlines(message) {
    const match = /^kline\.(5|15|60)\.([A-Z0-9]+)$/.exec(String(message.topic || ""));
    if (!match) return [];
    return (Array.isArray(message.data) ? message.data : [])
      .filter((item) => item.confirm === true)
      .map((item) => ({ symbol: match[2], timeframe: match[1], candle: normalizeCandle(item) }));
  }

  function upsertCandle(history, candle, limit) {
    const normalized = normalizeCandle(candle);
    const existing = history.findIndex((item) => item.start === normalized.start);
    if (existing >= 0) history[existing] = normalized;
    else history.push(normalized);
    history.sort((a, b) => a.start - b.start);
    if (history.length > limit) history.splice(0, history.length - limit);
    return existing < 0;
  }

  function isStale(lastDataTime, staleAfterMs, now) {
    return !Number.isFinite(lastDataTime) || (now ?? Date.now()) - lastDataTime > staleAfterMs;
  }

  global.CryptoScannerCore = Object.freeze({
    isStale, normalizeCandle, parseConfirmedKlines, parseRestCandle,
    restCandleIsClosed, upsertCandle
  });
}(window));
