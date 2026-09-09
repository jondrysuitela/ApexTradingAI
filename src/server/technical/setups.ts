import type { CandleInput } from "./indicators";
import { detectStructure } from "./structure";
import { detectSupportResistance } from "./support-resistance";

export type SetupState = "STRONG_LONG" | "LONG" | "NEUTRAL" | "WAIT" | "SHORT" | "STRONG_SHORT" | "NO_TRADE";

export type Setup = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  setupType: string;
  timeframe: string;
  entryZone: { low: number; high: number } | null;
  invalidation: number | null;
  targets: number[];
  riskReward: number | null;
  score: number;
  supportingFactors: string[];
  contradictingFactors: string[];
  timestamp: string;
  state: SetupState;
};

export function detectSetup(symbol: string, candles: CandleInput[], timeframe: string): Setup {
  const structures = detectStructure(candles, timeframe);
  const supportResistance = detectSupportResistance(candles, timeframe);
  const close = candles.at(-1)?.close ?? 0;
  const bullishStructure = structures.some((item) => item.type === "Higher High" || item.type === "Higher Low");
  const resistance = supportResistance.find((item) => item.type === "resistance");
  const support = supportResistance.find((item) => item.type === "support");

  const supportingFactors = [
    bullishStructure ? "Trend alignment" : "No trend confirmation",
    support ? "Nearby support detected" : "No nearby support",
    resistance ? "Nearby resistance detected" : "No nearby resistance",
  ];

  const score = (bullishStructure ? 35 : 0) + (support ? 20 : 0) + (resistance ? 10 : 0);
  const state: SetupState = score >= 50 ? "LONG" : score >= 30 ? "WAIT" : "NO_TRADE";

  return {
    id: `${symbol}-${timeframe}-${candles.at(-1)?.timestamp ?? "na"}`,
    symbol,
    direction: bullishStructure ? "LONG" : "NEUTRAL",
    setupType: bullishStructure ? "Trend Continuation" : "No Clear Setup",
    timeframe,
    entryZone: support ? { low: support.price, high: support.price * 1.002 } : null,
    invalidation: support ? support.price * 0.995 : null,
    targets: resistance ? [resistance.price] : [],
    riskReward: support && resistance ? Math.abs((resistance.price - close) / Math.max(close - support.price, 0.000001)) : null,
    score,
    supportingFactors,
    contradictingFactors: bullishStructure ? [] : ["No higher-high / higher-low confirmation"],
    timestamp: candles.at(-1)?.timestamp ?? new Date().toISOString(),
    state,
  };
}
