import { describe, expect, it } from "vitest";
import { applyPaperAccountFill, applyPaperTrade, determinePaperFillPrice } from "@/server/paper-trading/repository";

describe("paper trading accounting", () => {
  it("updates weighted average when adding to a long position", () => {
    const result = applyPaperTrade(1, 100, 1, 120);

    expect(result.quantity).toBe(2);
    expect(result.averagePrice).toBe(110);
    expect(result.realizedPnl).toBe(0);
  });

  it("realizes P/L when partially closing a long position", () => {
    const result = applyPaperTrade(2, 100, -1, 130);

    expect(result.quantity).toBe(1);
    expect(result.averagePrice).toBe(100);
    expect(result.realizedPnl).toBe(30);
  });

  it("realizes P/L and flips average price when reversing from long to short", () => {
    const result = applyPaperTrade(1, 100, -2, 90);

    expect(result.quantity).toBe(-1);
    expect(result.averagePrice).toBe(90);
    expect(result.realizedPnl).toBe(-10);
  });

  it("carries account balance and realized P/L across multiple fills", () => {
    const first = applyPaperAccountFill({ balance: 1000, realizedPnl: 0 }, 1, 100, 0);
    const second = applyPaperAccountFill(first, -1, 130, 30);

    expect(first.balance).toBe(900);
    expect(second.balance).toBe(1030);
    expect(second.realizedPnl).toBe(30);
    expect(second.equity).toBe(1060);
  });

  it("does not fill limit and stop orders unless live price satisfies the trigger", () => {
    expect(determinePaperFillPrice("limit", "buy", 101, "100", null)).toBeNull();
    expect(determinePaperFillPrice("limit", "buy", 99, "100", null)).toBe(99);
    expect(determinePaperFillPrice("stop", "sell", 101, null, "100")).toBeNull();
    expect(determinePaperFillPrice("stop", "sell", 99, null, "100")).toBe(99);
  });
});
