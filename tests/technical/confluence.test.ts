import { describe, expect, it } from "vitest";
import { computeConfluence } from "@/server/technical/confluence";
import { detectCandlePatterns } from "@/server/technical/patterns";
import type { CandleInput } from "@/server/technical/indicators";

function candle(index: number, close: number, open?: number, high?: number, low?: number) {
  return {
    timestamp: new Date(2026, 0, index + 1).toISOString(),
    open: open ?? close - 0.5,
    high: high ?? close + 1,
    low: low ?? close - 1,
    close,
    volume: 1000,
  };
}

describe("confluence engine", () => {
  it("returns neutral when insufficient data", () => {
    const result = computeConfluence([candle(0, 100)]);
    expect(result.direction).toBe("NEUTRAL");
    expect(result.confidence).toBe(0);
  });

  it("detects strong uptrend confluence on rising candles", () => {
    const candles = Array.from({ length: 80 }, (_, i) => candle(i, 100 + i * 2));
    const result = computeConfluence(candles);
    expect(result.direction).toBe("LONG");
    expect(result.confidence).toBeGreaterThanOrEqual(50);
    expect(result.factors.length).toBeGreaterThan(0);
    expect(result.regime.trend).toMatch(/UP/);
  });

  it("detects strong downtrend confluence on falling candles", () => {
    const candles = Array.from({ length: 80 }, (_, i) => candle(i, 300 - i * 2));
    const result = computeConfluence(candles);
    expect(result.direction).toBe("SHORT");
    expect(result.confidence).toBeGreaterThanOrEqual(50);
    expect(result.regime.trend).toMatch(/DOWN/);
  });

  it("produces a narrative summary", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100 + i));
    const result = computeConfluence(candles);
    expect(result.narrative.length).toBeGreaterThan(20);
  });
});

describe("candlestick patterns", () => {
  it("detects bullish engulfing", () => {
    const candles: CandleInput[] = [
      candle(0, 100, 101, 102, 99),
      candle(1, 98, 100, 101, 97),
      candle(2, 103, 97, 104, 96),
    ];
    const patterns = detectCandlePatterns(candles);
    expect(patterns.some((p) => p.name === "Bullish Engulfing")).toBe(true);
  });

  it("detects bearish pin bar", () => {
    const candles: CandleInput[] = [
      candle(0, 100, 99, 101, 98),
      candle(1, 101, 100, 102, 99),
      candle(2, 100, 99.5, 105, 97),
    ];
    const patterns = detectCandlePatterns(candles);
    expect(patterns.some((p) => p.name === "Bearish Pin Bar")).toBe(true);
  });

  it("detects doji", () => {
    const candles: CandleInput[] = [
      candle(0, 100, 99, 101, 98),
      candle(1, 100, 99, 101, 98),
      candle(2, 100, 100, 100.5, 99.5),
    ];
    const patterns = detectCandlePatterns(candles);
    expect(patterns.some((p) => p.name === "Doji")).toBe(true);
  });
});
