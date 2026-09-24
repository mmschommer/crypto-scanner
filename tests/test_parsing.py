import unittest

from crypto_scanner.models import Candle
from crypto_scanner.parsing import parse_closed_ws_candles, parse_rest_candle


class ParsingTests(unittest.TestCase):
    def test_rest_candle_fields(self):
        candle = parse_rest_candle(["1000", "1", "2", "0.5", "1.5", "10", "15"])
        self.assertEqual(candle.start_ms, 1000)
        self.assertEqual(candle.close, 1.5)
        self.assertEqual(candle.turnover, 15.0)

    def test_candle_is_not_closed_before_exact_interval_end(self):
        candle = Candle(1_000, 1, 2, 0.5, 1.5, 10, 15)
        end = 1_000 + 5 * 60_000
        self.assertFalse(candle.is_closed_at(end - 1, 5))
        self.assertTrue(candle.is_closed_at(end, 5))

    def test_unconfirmed_websocket_candle_is_ignored(self):
        message = {"topic": "kline.5.BTCUSDT", "data": [{"start": 1000, "open": "1", "high": "2", "low": "0.5", "close": "1.5", "volume": "10", "turnover": "15", "confirm": False}]}
        self.assertEqual(parse_closed_ws_candles(message), [])

    def test_confirmed_websocket_candle_is_returned(self):
        item = {"start": 1000, "open": "1", "high": "2", "low": "0.5", "close": "1.5", "volume": "10", "turnover": "15", "confirm": True}
        parsed = parse_closed_ws_candles({"topic": "kline.15.ETHUSDT", "data": [item]})
        self.assertEqual((parsed[0][0], parsed[0][1], parsed[0][2].close), ("ETHUSDT", "15", 1.5))


if __name__ == "__main__":
    unittest.main()
