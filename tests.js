(function () {
  "use strict";
  const core = window.CryptoScannerCore;
  const tests = [];
  function test(name, callback) { tests.push({ name, callback }); }
  function equal(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  const candle = (start, close) => ({ start, open: 1, high: 2, low: 0.5, close, volume: 10, vwap: 1.5, trades: 3 });

  test("parses Kraken ticker price, 24h change, and timestamp", () => {
    const [ticker] = core.parseTicker({ channel: "ticker", data: [{ symbol: "BTC/USD", last: 65000.5, change_pct: -1.25, timestamp: "2026-01-02T03:04:05.000Z" }] });
    equal({ symbol: ticker.symbol, price: ticker.price, change24h: ticker.change24h, updatedAt: ticker.updatedAt },
      { symbol: "BTC/USD", price: 65000.5, change24h: -1.25, updatedAt: 1767323045000 });
  });
  test("parses Kraken OHLC updates", () => {
    const [update] = core.parseOhlc({ channel: "ohlc", data: [{ symbol: "ETH/USD", interval: 15, interval_begin: "2026-01-02T03:00:00Z", open: 1, high: 3, low: 0.5, close: 2, volume: 4, vwap: 1.8, trades: 8 }] });
    equal([update.symbol, update.timeframe, update.candle.start, update.candle.close], ["ETH/USD", 15, 1767322800000, 2]);
  });
  test("first forming candle is not added to closed history", () => {
    const history = []; const result = core.advanceForming(null, candle(1000, 1), history, 10);
    equal([history.length, result.forming.start, result.inserted], [0, 1000, false]);
  });
  test("same interval updates the forming candle", () => {
    const history = []; const result = core.advanceForming(candle(1000, 1), candle(1000, 2), history, 10);
    equal([history.length, result.forming.close, result.inserted], [0, 2, false]);
  });
  test("next interval finalizes the previous candle exactly once", () => {
    const history = []; let result = core.advanceForming(candle(1000, 2), candle(2000, 3), history, 10);
    result = core.advanceForming(result.forming, candle(2000, 4), history, 10);
    equal([history.length, history[0].start, history[0].close, result.inserted], [1, 1000, 2, false]);
  });
  test("prevents duplicate closed candles", () => {
    const history = []; core.upsertCandle(history, candle(1, 1), 10); core.upsertCandle(history, candle(1, 2), 10);
    equal([history.length, history[0].close], [1, 2]);
  });
  test("keeps histories chronological", () => {
    const history = []; [3, 1, 2].forEach((start) => core.upsertCandle(history, candle(start, start), 10));
    equal(history.map((item) => item.start), [1, 2, 3]);
  });
  test("keeps histories bounded", () => {
    const history = []; [1, 2, 3].forEach((start) => core.upsertCandle(history, candle(start, start), 2));
    equal(history.map((item) => item.start), [2, 3]);
  });
  test("REST bootstrap always excludes final forming row", () => {
    const rows = [[1, "1", "2", ".5", "1.5", "1.4", "10", 3], [2, "2", "3", "1", "2.5", "2.4", "20", 4]];
    const parsed = core.parseRestHistory(rows);
    equal([parsed.length, parsed[0].start, parsed[0].close], [1, 1000, 1.5]);
  });
  test("stale data boundary still works", () => {
    equal(core.isStale(1000, 500, 1500), false); equal(core.isStale(1000, 500, 1501), true); equal(core.isStale(NaN, 500, 1500), true);
  });
  test("heartbeat updates socket activity", () => {
    const times = core.updateActivityTimes({ lastSocketActivityTime: 100, lastMarketDataTime: 200 }, { channel: "heartbeat" }, 1000);
    equal(times.lastSocketActivityTime, 1000);
  });
  test("heartbeat does not update market-data time", () => {
    const times = core.updateActivityTimes({ lastSocketActivityTime: 100, lastMarketDataTime: 200 }, { channel: "heartbeat" }, 1000);
    equal(times.lastMarketDataTime, 200);
  });
  test("market update updates socket and market-data activity", () => {
    const times = core.updateActivityTimes({ lastSocketActivityTime: 100, lastMarketDataTime: 200 }, { channel: "ticker", data: [{ symbol: "BTC/USD" }] }, 1000);
    equal(times, { lastSocketActivityTime: 1000, lastMarketDataTime: 1000 });
  });
  test("recent heartbeat prevents reset despite stale market data", () => {
    const times = core.updateActivityTimes({ lastSocketActivityTime: 100, lastMarketDataTime: 100 }, { channel: "heartbeat" }, 950);
    equal([core.isStale(times.lastMarketDataTime, 500, 1000), core.socketIsSilent(times.lastSocketActivityTime, 500, 1000)], [true, false]);
  });
  test("old socket activity triggers connection-stale behavior", () => {
    equal(core.socketIsSilent(100, 500, 601), true);
  });

  let passed = 0;
  const list = document.getElementById("results");
  for (const item of tests) {
    const row = document.createElement("li");
    try { item.callback(); row.className = "pass"; row.textContent = `PASS — ${item.name}`; passed += 1; }
    catch (error) { row.className = "fail"; row.textContent = `FAIL — ${item.name}: ${error.message}`; }
    list.appendChild(row);
  }
  const summary = document.getElementById("summary");
  summary.textContent = `${passed}/${tests.length} tests passed`;
  summary.className = passed === tests.length ? "pass" : "fail";
  document.title = `${passed === tests.length ? "PASS" : "FAIL"}: Scanner Tests`;
}());
