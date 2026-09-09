import { describe, expect, it } from "vitest";
import type { CandleInput } from "@/server/technical/indicators";
import { sessionVwap } from "@/server/technical/vwap";
import { sessionVolumeProfile, priceZoneOf } from "@/server/technical/volume-profile";
import { analyzeOrderFlow } from "@/server/technical/order-flow";
import { detectFvgs, detectLiquiditySweeps, detectOrderBlocks } from "@/server/technical/liquidity";
import { fibonacciLevels } from "@/server/technical/fibonacci";
import { learnStrategyWeights } from "@/server/technical/learning-loop";
import { computeConfluence } from "@/server/technical/confluence";

function candle(index: number, price: number, volume = 1000, high?: number, low?: number): CandleInput {
  return {
    timestamp: new Date(2026, 0, index + 1).toISOString(),
    open: price - 0.5,
    high: high ?? price + 1,
    low: low ?? price - 1,
    close: price,
    volume,
  };
}

function makeSeries(count: number, from: number, step: number, volume = 1000): CandleInput[] {
  return Array.from({ length: count }, (_, index) => candle(index, from + index * step, volume));
}

describe("vwap", () => {
  it("computes vwap and position for a clean uptrend", () => {
    const candles = makeSeries(20, 100, 1);
    const read = sessionVwap(candles);
    expect(read.vwap).not.toBeNull();
    expect(read.position).toBe("ABOVE_1");
    expect(read.upper1).toBeGreaterThan(read.vwap!);
    expect(read.lower1).toBeLessThan(read.vwap!);
    expect(read.deviationFromVwap).toBeGreaterThan(0);
  });

  it("detects over-extension above 2 sigma", () => {
    const candles = [...makeSeries(20, 100, 0.2, 500), ...makeSeries(5, 104, 1.4, 500)];
    const read = sessionVwap(candles);
    expect(read.position).toBe("ABOVE_2");
  });

  it("returns empty result for a single candle", () => {
    const read = sessionVwap([candle(0, 100)]);
    expect(read.vwap).toBeNull();
    expect(read.position).toBe("UNKNOWN");
  });
});

describe("volume profile", () => {
  it("builds buckets and POC within the range", () => {
    const candles = makeSeries(40, 100, 0.5, 1000);
    const profile = sessionVolumeProfile(candles);
    expect(profile).not.toBeNull();
    expect(profile!.poc).toBeGreaterThanOrEqual(profile!.low);
    expect(profile!.poc).toBeLessThanOrEqual(profile!.high);
    expect(profile!.vah).toBeGreaterThanOrEqual(profile!.val);
    expect(profile!.valueAreaPct).toBeGreaterThanOrEqual(70);
    expect(profile!.priceBuckets.length).toBeGreaterThan(0);
  });

  it("classifies price relative to value area", () => {
    const candles = makeSeries(40, 100, 0.5, 1000);
    const profile = sessionVolumeProfile(candles)!;
    expect(priceZoneOf(profile.val - 1, profile)).toBe("BELOW_VAL");
    expect(priceZoneOf(profile.vah + 1, profile)).toBe("ABOVE_VAH");
    expect(priceZoneOf(profile.poc, profile)).toBe("INSIDE_VA");
  });

  it("returns null without enough data", () => {
    expect(sessionVolumeProfile([candle(0, 100)])).toBeNull();
  });
});

describe("order flow", () => {
  it("measures positive imbalance for a buy-heavy series", () => {
    const buyCandles = Array.from({ length: 12 }, (_, index) => candle(index, 100 + index, 1500, 102 + index, 99 + index));
    buyCandles[5].open = buyCandles[5].close - 2;
    const read = analyzeOrderFlow(buyCandles);
    expect(read.imbalance).toBeGreaterThan(0.2);
    expect(read.buyVolume).toBeGreaterThan(read.sellVolume);
    expect(read.cvd).toBeGreaterThan(0);
  });

  it("reports bearish sell dominance", () => {
    const sellCandles = Array.from({ length: 12 }, (_, index) => candle(index, 100 - index, 1500, 102 - index, 98 - index));
    sellCandles[5].open = sellCandles[5].close + 2;
    for (const item of sellCandles) {
      item.open = item.close + 1;
    }
    const read = analyzeOrderFlow(sellCandles);
    expect(read.imbalance).toBeLessThan(-0.2);
    expect(read.sellVolume).toBeGreaterThan(read.buyVolume);
    expect(read.cvdDirection).toBe("DOWN");
  });

  it("clamps imbalance to [-1, 1]", () => {
    const allDown = Array.from({ length: 10 }, (_, index) => ({ ...candle(index, 100 - index), open: 102 - index, close: 100 - index, high: 103 - index, low: 99 - index }));
    const read = analyzeOrderFlow(allDown);
    expect(read.imbalance).toBeGreaterThanOrEqual(-1);
  });
});

describe("liquidity (sweeps, FVG, order blocks)", () => {
  it("detects a bearish liquidity sweep after a double-top rejection", () => {
    const candles: CandleInput[] = [
      candle(0, 100, 1000, 102, 99),
      candle(1, 102, 1000, 104, 101),
      candle(2, 104, 1000, 106, 103), // fractal HIGH ~106
      candle(3, 103, 1000, 104.5, 102),
      candle(4, 101, 1000, 103, 100),
      candle(5, 99, 1000, 101, 98),
      candle(6, 100, 1000, 105.98, 99), // twin high near 106 (liquidity cluster)
      candle(7, 99, 1000, 102, 98),
      candle(8, 98, 1000, 100, 97),
      candle(9, 100, 1000, 102, 99),
      candle(10, 101, 1000, 110, 100), // pierces above 106 then closes back below
      candle(11, 103, 1000, 104, 101), // reclaim inside
    ];
    const sweeps = detectLiquiditySweeps(candles);
    expect(sweeps.some((s) => s.direction === "SHORT")).toBe(true);
  });

  it("detects a bullish FVG from a 3-candle imbalance", () => {
    const candles: CandleInput[] = [
      candle(0, 100, 1000, 101, 99),
      candle(1, 101, 1000, 102, 100), // first candle of the pattern
      candle(2, 101.5, 2000, 102.5, 101), // middle impulse candle
      candle(3, 102.5, 1000, 103, 102.2), // third low clears candle1 high (102.2 > 102)
      candle(4, 102.4, 1000, 102.9, 102),
    ];
    const fvgs = detectFvgs(candles);
    expect(fvgs.some((f) => f.direction === "BULLISH")).toBe(true);
    const bull = fvgs.find((f) => f.direction === "BULLISH")!;
    expect(bull.bottom).toBe(102);
    expect(bull.top).toBeCloseTo(102.2, 1);
  });

  it("detects a bullish order block after displacement", () => {
    const candles: CandleInput[] = [
      candle(0, 100, 1000, 101, 99),
      candle(1, 102, 1000, 103, 101),
      { timestamp: new Date(2026, 0, 3).toISOString(), open: 101, high: 101, low: 99, close: 99, volume: 1000 }, // bearish block candle
      { timestamp: new Date(2026, 0, 4).toISOString(), open: 100, high: 105, low: 99, close: 104, volume: 2000 }, // strong bullish displacement (4x body)
      candle(4, 104.5, 1000, 105, 103.5),
    ];
    const blocks = detectOrderBlocks(candles);
    expect(blocks.some((b) => b.direction === "BULLISH")).toBe(true);
  });
});

describe("fibonacci", () => {
  it("builds retracement levels between swing high and low", () => {
    const candles: CandleInput[] = [
      candle(0, 100, 1000, 101, 99),
      candle(1, 103, 1000, 104, 100),
      candle(2, 105, 1000, 106, 103), // fractal HIGH 106
      candle(3, 104, 1000, 105.5, 102), // lower high (breaks the 106 tie)
      candle(4, 101, 1000, 103, 99),
      candle(5, 98, 1000, 100, 97), // fractal LOW 97
      candle(6, 99, 1000, 101, 97.5),
      candle(7, 101, 1000, 102, 98),
    ];
    const fib = fibonacciLevels(candles);
    expect(fib).not.toBeNull();
    expect(fib!.levels.some((level) => level.ratio === 0.5)).toBe(true);
    const low50 = fib!.levels.find((level) => level.ratio === 0.5)!;
    expect(low50.price).toBeGreaterThan(fib!.swingLow);
    expect(low50.price).toBeLessThan(fib!.swingHigh);
  });
});

describe("learning loop", () => {
  it("reports one stat per strategy with default weight when data is thin", () => {
    const stats = learnStrategyWeights(makeSeries(20, 100, 0.5));
    expect(stats).toHaveLength(4);
    for (const statsItem of stats) {
      expect(statsItem.weight).toBe(1);
      expect(statsItem.samples).toBeLessThan(6);
    }
  });

  it("finds a positive edge for trend strategies in a clean uptrend", () => {
    const stats = learnStrategyWeights(makeSeries(120, 100, 0.6, 1500));
    const trend = stats.find((statsItem) => statsItem.name === "TrendFollowing")!;
    expect(trend.samples).toBeGreaterThanOrEqual(6);
    expect(trend.weight).toBeGreaterThanOrEqual(1);
  });
});

describe("confluence integration", () => {
  it("exposes order flow and learning in the result", () => {
    const candles = makeSeries(80, 100, 0.4, 1200);
    const result = computeConfluence(candles);
    expect(result.orderFlow.vwap.vwap).not.toBeNull();
    expect(result.orderFlow.volumeProfile).not.toBeNull();
    expect(result.orderFlow.delta).not.toBeNull();
    expect(result.learning).toHaveLength(4);
    expect(result.factors.some((factor) => factor.name === "Order Flow")).toBe(true);
    expect(result.factors.some((factor) => factor.name === "VWAP")).toBe(true);
    expect(result.narrative).toContain("Order flow delta");
  });
});