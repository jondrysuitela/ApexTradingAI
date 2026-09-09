import { describe, expect, it } from "vitest";
import { computeRiskLevels, resolveDirection, roundStep, sizeVolume } from "@/server/auto-trading/risk";

describe("computeRiskLevels", () => {
  it("sizes a 5R target with a small ATR stop for BUY", () => {
    const levels = computeRiskLevels(2000, 10, "BUY", 0.75, 5);
    expect(levels.riskPerUnit).toBeCloseTo(7.5);
    expect(levels.stopLoss).toBeCloseTo(1992.5);
    expect(levels.takeProfit).toBeCloseTo(2037.5);
    expect(Math.abs(levels.takeProfit - 2000)).toBeCloseTo(Math.abs(2000 - levels.stopLoss) * 5);
  });

  it("mirrors levels for SELL", () => {
    const levels = computeRiskLevels(2000, 10, "SELL", 0.75, 5);
    expect(levels.stopLoss).toBeCloseTo(2007.5);
    expect(levels.takeProfit).toBeCloseTo(1962.5);
  });
});

describe("sizeVolume", () => {
  const symbol = { volumeMin: 0.01, volumeMax: 100, volumeStep: 0.01, contractSize: 100, digits: 2 };

  it("sizes volume so loss at SL equals ~1% of equity", () => {
    const result = sizeVolume({ equity: 10000, riskPercent: 1, entry: 2000, stopLoss: 1992.5, symbol });
    expect(result.riskAmount).toBeCloseTo(100);
    expect(result.volume).toBeCloseTo(0.13);
    expect(result.clipped).toBe(false);
  });

  it("clamps to minimum volume when risk is small relative to equity", () => {
    const result = sizeVolume({ equity: 10000, riskPercent: 1, entry: 2000, stopLoss: 1500, symbol });
    expect(result.volume).toBe(0.01);
    expect(result.clipped).toBe(true);
  });
});

describe("roundStep", () => {
  it("rounds to the step", () => {
    expect(roundStep(0.1333, 0.01)).toBe(0.13);
    expect(roundStep(0.155, 0.01)).toBe(0.16);
    expect(roundStep(0.25, 0.1)).toBe(0.3);
  });
});

describe("resolveDirection", () => {
  it("uses ask for buys and bid for sells", () => {
    expect(resolveDirection("BUY", 1999.5, 2000.2, 2000)).toBe(2000.2);
    expect(resolveDirection("SELL", 1999.5, 2000.2, 2000)).toBe(1999.5);
  });

  it("falls back to last price when book is empty", () => {
    expect(resolveDirection("BUY", undefined, undefined, 2000)).toBe(2000);
  });
});