import { describe, expect, it } from "vitest";
import { calculateRisk } from "@/server/technical/risk";

describe("risk", () => {
  it("calculates position size from risk budget", () => {
    const result = calculateRisk({ equity: 10000, riskPercent: 1, entry: 100, stop: 95, target: 115 });

    expect(result.riskAmount).toBe(100);
    expect(result.positionSize).toBe(20);
    expect(result.potentialLoss).toBe(100);
    expect(result.potentialProfit).toBe(300);
    expect(result.riskReward).toBe(3);
  });
});
