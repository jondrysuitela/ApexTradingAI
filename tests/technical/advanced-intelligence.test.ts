import { describe, expect, it } from "vitest";
import { detectBOSAndChoCH, detectFractals, detectTrendlines } from "@/server/technical/advanced-structure";
import { detectSRZones } from "@/server/technical/sr-zones";
import { analyzeMomentum } from "@/server/technical/momentum";
import type { CandleInput } from "@/server/technical/indicators";

function candle(index: number, close: number, open?: number, high?: number, low?: number, volume = 1000): CandleInput {
  return {
    timestamp: new Date(2026, 0, index + 1).toISOString(),
    open: open ?? close - 0.5,
    high: high ?? close + 1,
    low: low ?? close - 1,
    close,
    volume,
  };
}

describe("fractals", () => {
  it("detects swing highs and lows", () => {
    // Each 5-bar group around a pivot forms a fractal
    const candles: CandleInput[] = [
      candle(0, 100, 99, 101, 98),
      candle(1, 101, 100, 102, 99),
      candle(2, 101, 100, 105, 99), // swing high (fractal HIGH)
      candle(3, 100, 101, 103, 100),
      candle(4, 99, 100, 102, 98),
      candle(5, 98, 99, 101, 95), // swing low (fractal LOW)
      candle(6, 99, 98, 100, 96),
      candle(7, 100, 99, 101, 98),
    ];
    const fractals = detectFractals(candles);
    expect(fractals.some((f) => f.type === "HIGH")).toBe(true);
    expect(fractals.some((f) => f.type === "LOW")).toBe(true);
  });
});

describe("trendlines", () => {
  it("detects an ascending trendline on rising swing lows", () => {
    // Build candles with punctuated swing lows that climb
    const base = 100;
    const candles: CandleInput[] = [];
    for (let i = 0; i < 8; i += 1) {
      const lowLevel = base + i * 0.5;
      // each group: down into the low, spike up, small pullback
      candles.push(candle(candles.length, lowLevel + 3, lowLevel + 4, lowLevel + 5, lowLevel + 1));
      candles.push(candle(candles.length, lowLevel + 2, lowLevel + 3, lowLevel + 4, lowLevel));
      candles.push(candle(candles.length, lowLevel + 4, lowLevel + 2, lowLevel + 6, lowLevel + 1));
    }
    const lines = detectTrendlines(candles);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.direction === "UP")).toBe(true);
  });
});

describe("BOS / ChoCH", () => {
  it("detects a bullish break of structure on the final close above prior swing high", () => {
    // Swing high at index 3 (high=106) confirmed by lower highs around it,
    // then a pullback and a rally that closes above 106.
    const candles: CandleInput[] = [
      candle(0, 101, 100, 103, 99),  // rising into the high
      candle(1, 104, 101, 105, 100),
      candle(2, 105, 104, 105.5, 103),
      candle(3, 105, 105, 106, 101), // swing high = 106
      candle(4, 103, 105, 105, 102), // lower high confirmer
      candle(5, 101, 103, 104, 100), // lower high confirmer + pullback
      candle(6, 99, 101, 100, 97),   // swing low = 97 (confirmers below)
      candle(7, 101, 99, 102, 99),
      candle(8, 104, 101, 105, 100),
      candle(9, 107, 104, 108, 103), // close (107) above prior swing high (106)
    ];
    const breaks = detectBOSAndChoCH(candles);
    expect(breaks.some((b) => b.direction === "LONG")).toBe(true);
  });
});

describe("SR zones", () => {
  it("clusters swing lows into support zones", () => {
    const candles = Array.from({ length: 50 }, (_, i) => candle(i, 100 + (i % 5) * 0.1));
    const zones = detectSRZones(candles, "1h");
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.some((z) => z.type === "support")).toBe(true);
  });
});

describe("momentum", () => {
  it("detects accelerating bullish momentum", () => {
    const candles = Array.from({ length: 40 }, (_, i) => candle(i, 100 + i * i * 0.01));
    const momentum = analyzeMomentum(candles);
    expect(momentum.velocity).toBe("ACCELERATING");
  });

  it("handles insufficient data gracefully", () => {
    const momentum = analyzeMomentum([candle(0, 100)]);
    expect(momentum.velocity).toBe("STEADY");
    expect(momentum.velocityScore).toBe(0);
  });
});
