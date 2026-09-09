import { describe, expect, it } from "vitest";
import { generateTradingSignal } from "@/server/technical/signal";

function candle(index: number, close: number) {
  return { timestamp: new Date(2026, 0, index + 1).toISOString(), open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 };
}

describe("trading signal", () => {
  it("returns wait when candle history is insufficient", () => {
    const result = generateTradingSignal({ candles: [candle(0, 100)], setup: null, structure: [], supportResistance: [] });

    expect(result.action).toBe("WAIT");
    expect(result.confidence).toBe(0);
  });

  it("returns buy when trend, structure, and support align", () => {
    const candles = Array.from({ length: 60 }, (_, index) => candle(index, 100 + index));
    const result = generateTradingSignal({
      candles,
      setup: {
        id: "test",
        symbol: "BTCUSDT",
        direction: "LONG",
        setupType: "Trend Continuation",
        timeframe: "1d",
        entryZone: { low: 155, high: 156 },
        invalidation: 150,
        targets: [170],
        riskReward: 2,
        score: 60,
        supportingFactors: [],
        contradictingFactors: [],
        timestamp: candles.at(-1)!.timestamp,
        state: "LONG",
      },
      structure: [{ type: "Higher High", timestamp: candles.at(-1)!.timestamp, price: 160, timeframe: "1d", strength: 2, source: "test" }],
      supportResistance: [
        { type: "support", price: 150, strength: 2, touchCount: 2, timeframe: "1d", lastReaction: candles.at(-2)!.timestamp, distanceFromCurrentPrice: 10 },
        { type: "resistance", price: 175, strength: 2, touchCount: 2, timeframe: "1d", lastReaction: candles.at(-3)!.timestamp, distanceFromCurrentPrice: 15 },
      ],
    });

    expect(result.action).toBe("BUY");
    expect(result.confidence).toBeGreaterThanOrEqual(55);
    expect(result.entryZone).not.toBeNull();
  });
});
