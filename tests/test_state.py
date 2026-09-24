import unittest

from crypto_scanner.models import Candle
from crypto_scanner.state import MarketState


class ClosedCandleStateTests(unittest.TestCase):
    def setUp(self):
        self.state = MarketState(("BTCUSDT",), ("5",), 2)

    def test_history_is_ordered_and_bounded(self):
        candles = [Candle(i, 1, 1, 1, float(i), 1, 1) for i in (2, 1)]
        self.state.replace_history("BTCUSDT", "5", candles)
        self.assertEqual([c.start_ms for c in self.state.histories[("BTCUSDT", "5")]], [1, 2])
        self.state.add_closed_candle("BTCUSDT", "5", Candle(3, 1, 1, 1, 3, 1, 1))
        self.assertEqual([c.start_ms for c in self.state.histories[("BTCUSDT", "5")]], [2, 3])

    def test_duplicate_candle_updates_without_duplicate(self):
        candle = Candle(1, 1, 2, 1, 1.5, 10, 15)
        self.assertTrue(self.state.add_closed_candle("BTCUSDT", "5", candle))
        self.assertFalse(self.state.add_closed_candle("BTCUSDT", "5", candle))
        self.assertEqual(len(self.state.histories[("BTCUSDT", "5")]), 1)


if __name__ == "__main__":
    unittest.main()
