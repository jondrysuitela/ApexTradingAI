import { describe, expect, it } from "vitest";
import { buildPaperTradingSummary } from "@/server/paper-trading/repository";

describe("paper trading summary", () => {
  it("counts wins from realized pnl instead of fill price", () => {
    const summary = buildPaperTradingSummary(
      { balance: 1000, equity: 1010, realizedPnl: 10 },
      [
        { side: "sell", quantity: "1", filledPrice: 130, realizedPnl: 30, filledAt: "2026-01-01T00:00:00.000Z" },
        { side: "sell", quantity: "1", filledPrice: 90, realizedPnl: -10, filledAt: "2026-01-02T00:00:00.000Z" },
      ],
    );

    expect(summary.wins).toBe(1);
    expect(summary.winRate).toBe("50.00");
  });
});
