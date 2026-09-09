import { describe, expect, it } from "vitest";
import { evaluateEntry, evaluateExit, evaluateMoneyExit, shouldApplyMoneyCap } from "@/server/auto-trading/decision";

const CONFIG = { minConfluenceScore: 40, minScalpingConfidence: 40 };
const scalping = (overrides: Partial<{ direction: string; gated: boolean; confidence: number }> = {}) => ({ direction: "LONG", gated: false, confidence: 55, ...overrides });
const confluence = (overrides: Partial<{ direction: string; score: number }> = {}) => ({ direction: "LONG", score: 55, ...overrides });

describe("evaluateEntry", () => {
  it("allows when scalping and confluence agree", () => {
    const result = evaluateEntry({ scalping: scalping(), confluence: confluence(), config: CONFIG });
    expect(result.allowed).toBe(true);
    expect(result.direction).toBe("LONG");
  });

  it("blocks without a scalping read", () => {
    expect(evaluateEntry({ scalping: null, confluence: confluence(), config: CONFIG }).allowed).toBe(false);
  });

  it("blocks neutral direction", () => {
    expect(evaluateEntry({ scalping: scalping({ direction: "NEUTRAL" }), confluence: confluence(), config: CONFIG }).allowed).toBe(false);
  });

  it("blocks gated scalping (session/spread)", () => {
    expect(evaluateEntry({ scalping: scalping({ gated: true }), confluence: confluence(), config: CONFIG }).allowed).toBe(false);
  });

  it("blocks direction mismatch", () => {
    expect(evaluateEntry({ scalping: scalping({ direction: "SHORT" }), confluence: confluence(), config: CONFIG }).allowed).toBe(false);
  });

  it("blocks low confluence score", () => {
    expect(evaluateEntry({ scalping: scalping(), confluence: confluence({ score: 30 }), config: CONFIG }).allowed).toBe(false);
  });

  it("blocks low scalping confidence", () => {
    expect(evaluateEntry({ scalping: scalping({ confidence: 35 }), confluence: confluence(), config: CONFIG }).allowed).toBe(false);
  });
});

describe("evaluateExit", () => {
  const position = { action: "BUY" as const, stopLoss: 1992.5, takeProfit: 2037.5 };

  it("hits TP when price rises to target", () => {
    expect(evaluateExit(position, 2038)).toBe("TP");
  });

  it("hits SL when price falls to stop", () => {
    expect(evaluateExit(position, 1991)).toBe("SL");
  });

  it("stays open between levels", () => {
    expect(evaluateExit(position, 2010)).toBeNull();
  });

  it("mirrors for sell positions", () => {
    const sell = { action: "SELL" as const, stopLoss: 2007.5, takeProfit: 1962.5 };
    expect(evaluateExit(sell, 1960)).toBe("TP");
    expect(evaluateExit(sell, 2010)).toBe("SL");
  });
});

describe("evaluateMoneyExit", () => {
  it("closes TP when profit cap reached", () => {
    const exit = evaluateMoneyExit(0.62, 0.5, 0.5);
    expect(exit?.reason).toBe("TP");
    expect(exit?.target).toBe(0.5);
  });

  it("closes SL when loss cap reached", () => {
    const exit = evaluateMoneyExit(-0.75, 0.5, 0.5);
    expect(exit?.reason).toBe("SL");
    expect(exit?.target).toBe(0.5);
  });

  it("keeps position between caps", () => {
    expect(evaluateMoneyExit(0.2, 0.5, 0.5)).toBeNull();
    expect(evaluateMoneyExit(-0.3, 0.5, 0.5)).toBeNull();
  });

  it("ignores disabled caps", () => {
    expect(evaluateMoneyExit(5, 0, 0)).toBeNull();
    expect(evaluateMoneyExit(-5, 0, 0)).toBeNull();
    expect(evaluateMoneyExit(5, 0, 0.5)).toBeNull();
  });
});

describe("shouldApplyMoneyCap", () => {
  it("applies for 5m and 15m", () => {
    expect(shouldApplyMoneyCap("5m")).toBe(true);
    expect(shouldApplyMoneyCap("15m")).toBe(true);
  });

  it("does not apply for other timeframes", () => {
    expect(shouldApplyMoneyCap("1m")).toBe(false);
    expect(shouldApplyMoneyCap("30m")).toBe(false);
    expect(shouldApplyMoneyCap("1h")).toBe(false);
    expect(shouldApplyMoneyCap("4h")).toBe(false);
  });
});