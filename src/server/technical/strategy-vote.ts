import type { CandleInput } from "./indicators";
import type { MarketRegime } from "./confluence";
import { evaluateStrategies, type StrategyName } from "./strategies";

export type StrategyVote = {
  longWeight: number;
  shortWeight: number;
  totalWeight: number;
  strategyCount: number;
  agreeingCount: number;
  topStrategy: StrategyName | null;
  detail: string;
};

// Regime-specific strategy relevance (higher = trust more in that regime)
const REGIME_STRATEGY_WEIGHT: Record<string, Record<StrategyName, number>> = {
  TRENDING: { TrendFollowing: 1.0, Breakout: 0.7, MeanReversion: 0.2, Scalping: 0.4 },
  RANGING: { TrendFollowing: 0.25, Breakout: 0.6, MeanReversion: 0.9, Scalping: 0.8 },
};

export function voteOnStrategies(
  candles: CandleInput[],
  regime: MarketRegime,
  learning?: Record<StrategyName, number>,
): StrategyVote {
  const strategies = evaluateStrategies(candles, regime);
  const regimeKey = regime.trend === "STRONG_UP" || regime.trend === "STRONG_DOWN" || regime.trend === "UP" || regime.trend === "DOWN" ? "TRENDING" : "RANGING";
  const weights = REGIME_STRATEGY_WEIGHT[regimeKey];

  let longWeight = 0;
  let shortWeight = 0;
  let totalWeight = 0;
  let agreeingCount = 0;

  for (const s of strategies) {
    const w = (weights[s.name] ?? 0.5) * (learning?.[s.name] ?? 1);
    const contribution = s.confidence * w;
    totalWeight += contribution;
    if (s.direction === "LONG") longWeight += contribution;
    else if (s.direction === "SHORT") shortWeight += contribution;
    else agreeingCount += 0; // neutral doesn't add agreement
  }

  // Agreement = strategies that agree with the net direction
  const netDirection = longWeight > shortWeight ? "LONG" : shortWeight > longWeight ? "SHORT" : "NEUTRAL";
  if (netDirection !== "NEUTRAL") {
    agreeingCount = strategies.filter((s) => s.direction === netDirection).length;
  }

  // Top strategy = highest weighted contribution
  let topStrategy: StrategyName | null = null;
  let topVal = -1;
  for (const s of strategies) {
    const val = s.confidence * weights[s.name] * (learning?.[s.name] ?? 1);
    if (val > topVal) {
      topVal = val;
      topStrategy = s.name;
    }
  }

  const detail = strategies
    .map((s) => `${s.name}: ${s.direction}(${s.confidence})`)
    .join(" | ");

  return { longWeight, shortWeight, totalWeight, strategyCount: strategies.length, agreeingCount, topStrategy, detail };
}
