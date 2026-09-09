import { describe, expect, it } from "vitest";
import { evaluateStrategies, runTrendFollowing, runMeanReversion, readScalping } from "@/server/technical/strategies";
import { voteOnStrategies } from "@/server/technical/strategy-vote";
import { backtestConfluenceEdges, expectationFactor } from "@/server/technical/backtest";
import type { CandleInput } from "@/server/technical/indicators";
import type { MarketRegime } from "@/server/technical/confluence";

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

const trendingRegime: MarketRegime = { trend: "STRONG_UP", volatility: "NORMAL", momentum: "ACCELERATING", regimeLabel: "test" };
const rangingRegime: MarketRegime = { trend: "RANGING", volatility: "NORMAL", momentum: "STEADY", regimeLabel: "test" };

describe("multi-strategy engine", () => {
  it("trend-following detects strong long in an uptrend", () => {
    const candles = Array.from({ length: 120 }, (_, i) => candle(i, 100 + i * 0.8));
    const signal = runTrendFollowing(candles, trendingRegime);
    expect(signal.direction).toBe("LONG");
    expect(signal.confidence).toBeGreaterThan(40);
  });

  it("mean-reversion detects short pressure near upper band", () => {
    // 25 candles around 100, then 24 candles around 106, then a final spike to 106.5
    // Last 20 closes are clustered around 106 with small std → Bollinger upper is slightly above 106
    // The final candle (106.5) sits near/above that upper band.
    const candles: CandleInput[] = Array.from({ length: 25 }, (_, i) => candle(i, 100 + (i % 3) * 0.1 - 0.1));
    for (let i = 25; i < 49; i += 1) candles.push(candle(i, 106 + (i % 3) * 0.1 - 0.1));
    candles.push(candle(49, 106.5)); // final close slightly above plateau
    const signal = runMeanReversion(candles, rangingRegime);
    expect(signal.direction).toBe("SHORT");
  });

  it("mean-reversion is dampened in strong trends", () => {
    const candles = Array.from({ length: 50 }, (_, i) => candle(i, 100 + i * 2));
    const signal = runMeanReversion(candles, trendingRegime);
    // Should be capped since strong trend reduces reversion conviction
    expect(signal.confidence).toBeLessThanOrEqual(50);
  });

  it("returns all four strategies", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100 + i));
    const strategies = evaluateStrategies(candles, trendingRegime);
    expect(strategies.map((s) => s.name)).toEqual(["TrendFollowing", "MeanReversion", "Breakout", "Scalping"]);
  });
});

describe("strategy voting", () => {
  it("produces a vote with weights in a strong uptrend", () => {
    const candles = Array.from({ length: 90 }, (_, i) => candle(i, 100 + i * 1.2));
    const vote = voteOnStrategies(candles, trendingRegime);
    expect(vote.strategyCount).toBe(4);
    expect(vote.longWeight).toBeGreaterThan(0);
    expect(vote.totalWeight).toBeGreaterThan(0);
    // Trend regime weights toward LONG
    expect(vote.longWeight).toBeGreaterThan(vote.shortWeight);
  });
});

describe("scalping read", () => {
  it("reads a bullish scalp on a fresh EMA9/21 cross in a rising market", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100 + i * 0.15));
    const read = readScalping(candles, trendingRegime);
    expect(read.direction).toBe("LONG");
    expect(read.entryType).not.toBe("NO_EDGE");
    expect(read.confidence).toBeGreaterThan(0);
    expect(read.suggestion.length).toBeGreaterThan(0);
  });

  it("flags extreme volatility as unfavorable for scalping", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100 + i * 0.1, 99, 110 + i * 0.1, 90 + i * 0.1));
    const read = readScalping(candles, rangingRegime);
    expect(read.volatility).toBe("EXTREME");
    expect(read.suggestion.toLowerCase()).toContain("lot");
  });

  it("reports no edge when candles are flat and quiet", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100));
    const read = readScalping(candles, rangingRegime);
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(read.direction);
    expect(read.atrPercent).not.toBeNull();
  });

  it("blocks scalping when spread is too large relative to ATR", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100, 99, 101, 99));
    const read = readScalping(candles, rangingRegime, { spread: { points: 80, point: 0.01 } });
    expect(read.spread.block).toBe(true);
    expect(read.gated).toBe(true);
    expect(read.confidence).toBeLessThanOrEqual(35);
    expect(read.suggestion.toLowerCase()).toContain("diblokir");
  });

  it("keeps scalping open when spread is small relative to ATR", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100, 99, 101, 99));
    const read = readScalping(candles, rangingRegime, { spread: { points: 10, point: 0.01 } });
    expect(read.spread.block).toBe(false);
    expect(read.gated).toBe(false);
    expect(read.spread.atrCoverPct).not.toBeNull();
    expect(read.spread.atrCoverPct).toBeLessThan(25);
  });

  it("blocks scalping on weekend regardless of spread", () => {
    const candles = Array.from({ length: 60 }, (_, i) => candle(i, 100 + i * 0.15));
    const read = readScalping(candles, trendingRegime, { date: new Date("2026-01-03T14:00:00Z") });
    expect(read.session.name).toBe("OFF_HOURS");
    expect(read.session.block).toBe(true);
    expect(read.gated).toBe(true);
  });

  it("recognizes the London-New York overlap as the best session", () => {
    const read = readScalping([], rangingRegime, { date: new Date("2026-01-05T13:30:00Z") });
    expect(read.session.name).toBe("OVERLAP");
    expect(read.session.liquidity).toBe("BEST");
    expect(read.session.block).toBe(false);
  });
});

describe("backtest engine", () => {
  it("returns insufficient for too little data", () => {
    const backtest = backtestConfluenceEdges([candle(0, 100)], 120);
    expect(backtest.edge).toBe("INSUFFICIENT");
    expect(backtest.totalSignals).toBe(0);
  });

  it("returns a valid edge on a persistent trend", () => {
    const candles = Array.from({ length: 200 }, (_, i) => candle(i, 100 + i * 0.5));
    const backtest = backtestConfluenceEdges(candles, 120);
    // A clean uptrend should generate some tradable signals
    expect(backtest.totalSignals).toBeGreaterThan(0);
    expect(["POSITIVE", "NEGATIVE", "ZERO"]).toContain(backtest.edge);
  });

  it("expectation factor is near 1", () => {
    const backtest = backtestConfluenceEdges(Array.from({ length: 150 }, (_, i) => candle(i, 100 + i * 0.3)), 120);
    const factor = expectationFactor(backtest);
    expect(factor).toBeGreaterThan(0.8);
    expect(factor).toBeLessThan(1.2);
  });
});