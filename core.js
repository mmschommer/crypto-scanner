/* Pure market-data functions. This file intentionally contains no UI or strategy logic. */
(function (global) {
  "use strict";

  function timestamp(value) {
    if (typeof value === "number") return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number(value);
  }

  function normalizeCandle(value) {
    return {
      start: timestamp(value.start),
      open: Number(value.open), high: Number(value.high), low: Number(value.low),
      close: Number(value.close), volume: Number(value.volume),
      vwap: Number(value.vwap), trades: Number(value.trades)
    };
  }

  function parseRestCandle(row) {
    if (!Array.isArray(row) || row.length < 8) throw new Error("Invalid Kraken REST candle");
    return normalizeCandle({
      start: Number(row[0]) * 1000, open: row[1], high: row[2], low: row[3], close: row[4],
      vwap: row[5], volume: row[6], trades: row[7]
    });
  }

  // Kraken guarantees that the last REST OHLC row is the current, uncommitted interval.
  function parseRestHistory(rows) {
    if (!Array.isArray(rows) || rows.length < 1) return [];
    return rows.slice(0, -1).map(parseRestCandle);
  }

  function parseTicker(message) {
    if (!message || message.channel !== "ticker" || !Array.isArray(message.data)) return [];
    return message.data.map((item) => ({
      symbol: String(item.symbol || ""), price: Number(item.last),
      change24h: Number(item.change_pct), updatedAt: timestamp(item.timestamp)
    })).filter((item) => item.symbol && Number.isFinite(item.price));
  }

  function parseOhlc(message) {
    if (!message || message.channel !== "ohlc" || !Array.isArray(message.data)) return [];
    return message.data.map((item) => ({
      symbol: String(item.symbol || ""), timeframe: Number(item.interval),
      candle: normalizeCandle({ ...item, start: item.interval_begin })
    })).filter((item) => item.symbol && [5, 15, 60].includes(item.timeframe) && Number.isFinite(item.candle.start));
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

  /* Advance one stream's forming candle. Only a later interval closes the previous one. */
  function advanceForming(forming, update, history, limit) {
    const next = normalizeCandle(update);
    if (!forming) return { forming: next, closed: null, inserted: false };
    if (next.start === forming.start) return { forming: next, closed: null, inserted: false };
    if (next.start < forming.start) return { forming, closed: null, inserted: false };
    const closed = normalizeCandle(forming);
    return { forming: next, closed, inserted: upsertCandle(history, closed, limit) };
  }

  function isStale(lastDataTime, staleAfterMs, now) {
    return !Number.isFinite(lastDataTime) || (now ?? Date.now()) - lastDataTime > staleAfterMs;
  }

  global.CryptoScannerCore = Object.freeze({
    advanceForming, isStale, normalizeCandle, parseOhlc, parseRestCandle,
    parseRestHistory, parseTicker, upsertCandle
  });
}(window));
