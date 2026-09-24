/* Bounded browser-local persistence and event logging. */
(function (global) {
  "use strict";
  const HISTORY_KEY = "crypto-scanner-v1-histories";
  const LOG_KEY = "crypto-scanner-v1-logs";

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function loadHistories() { return read(HISTORY_KEY, {}); }
  function saveHistories(histories) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(histories)); }
    catch (error) { console.warn("Could not persist candle history", error); }
  }
  function getLogs() { return read(LOG_KEY, []); }
  function log(level, event, details) {
    const logs = getLogs();
    logs.push({ time: new Date().toISOString(), level, event, details: details || "" });
    logs.splice(0, Math.max(0, logs.length - window.ScannerConfig.maximumLocalLogs));
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); }
    catch (error) { console.warn("Could not persist scanner log", error); }
  }
  function clear() {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LOG_KEY);
  }

  global.ScannerStorage = Object.freeze({ clear, getLogs, loadHistories, log, saveHistories });
}(window));
