(function () {
  "use strict";
  const core = window.CryptoScannerCore;
  const tests = [];
  function test(name, callback) { tests.push({ name, callback }); }
  function equal(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  const candle = (start, close) => ({ start, open: 1, high: 2, low: 0.5, close, volume: 10, turnover: 15 });

  test("accepts confirmed and rejects unconfirmed candles", () => {
    const base = { start: 1000, open: "1", high: "2", low: ".5", close: "1.5", volume: "10", turnover: "15" };
    equal(core.parseConfirmedKlines({ topic: "kline.5.BTCUSDT", data: [{ ...base, confirm: false }] }).length, 0);
    equal(core.parseConfirmedKlines({ topic: "kline.5.BTCUSDT", data: [{ ...base, confirm: true }] }).length, 1);
  });
  test("replaces duplicate candle without growing history", () => {
    const history = []; core.upsertCandle(history, candle(1, 1), 10); core.upsertCandle(history, candle(1, 2), 10);
    equal([history.length, history[0].close], [1, 2]);
  });
  test("keeps out-of-order candles chronological", () => {
    const history = []; [3, 1, 2].forEach((start) => core.upsertCandle(history, candle(start, start), 10));
    equal(history.map((item) => item.start), [1, 2, 3]);
  });
  test("bounds histories and removes oldest candles", () => {
    const history = []; [1, 2, 3].forEach((start) => core.upsertCandle(history, candle(start, start), 2));
    equal(history.map((item) => item.start), [2, 3]);
  });
  test("calculates stale state at the configured boundary", () => {
    equal(core.isStale(1000, 500, 1500), false); equal(core.isStale(1000, 500, 1501), true); equal(core.isStale(NaN, 500, 1500), true);
  });
  test("REST candle is final only at or after interval end", () => {
    equal(core.restCandleIsClosed(candle(1000, 1), 5, 300999), false);
    equal(core.restCandleIsClosed(candle(1000, 1), 5, 301000), true);
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
