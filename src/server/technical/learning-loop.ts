import type { CandleInput } from "./indicators";
import { adx, atr, ema } from "./indicators";
import { evaluateStrategies, type StrategyName } from "./strategies";
import type { MarketRegime } from "./confluence";

export type StrategyLearnStats = {
  name: StrategyName;
  samples: number;
  winRate: number;
  edge: number;
  weight: number;
  directionBias: "LONG" | "SHORT" | "NEUTRAL";
};

const WINDOW = 60;
const FORWARD = 6;
const MIN_SAMPLES = 6;
const REWARD_R = 1.0;
const RISK_R = 0.8;

const STRATEGY_NAMES: StrategyName[] = ["TrendFollowing", "MeanReversion", "Breakout", "Scalping"];

function simpleRegime(candles: CandleInput[]): MarketRegime {
  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const adxState = adx(candles, 14);
  const last = closes.at(-1) ?? 0;

  let trend: MarketRegime["trend"] = "RANGING";
  if (ema20 && ema50) {
    if (adxState && adxState.adx > 25) {
      if (ema20 > ema50 && last > ema20) trend = "STRONG_UP";
      else if (ema20 < ema50 && last < ema20) trend = "STRONG_DOWN";
      else if (ema20 > ema50) trend = "UP";
      else trend = "DOWN";
    } else if (ema20 > ema50) trend = "UP";
    else if (ema20 < ema50) trend = "DOWN";
  }

  return { trend, volatility: "NORMAL", momentum: "STEADY", regimeLabel: "learning-window" };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function learnStrategyWeights(candles: CandleInput[]): StrategyLearnStats[] {
  const trackers = new Map<string, { wins: number; total: number; edgeR: number }>([...STRATEGY_NAMES].map((name) => [name, { wins: 0, total: 0, edgeR: 0 }]));

  if (candles.length >= WINDOW + FORWARD + 10) {
    for (let i = 40; i + FORWARD < candles.length - 1; i += 3) {
      const window = candles.slice(i - WINDOW, i);
      if (window.length < WINDOW) continue;

      const entry = window.at(-1)!;
      const future = candles.slice(i, i + FORWARD);
      if (future.length < FORWARD) continue;

      const atrValue = atr(window, 14) ?? entry.high - entry.low;
      if (!atrValue || atrValue <= 0) continue;

      const maxUp = Math.max(...future.map((c) => c.high)) - entry.close;
      const maxDown = entry.close - Math.min(...future.map((c) => c.low));
      const netMove = future.at(-1)!.close - entry.close;

      const regime = simpleRegime(window);
      const strategies = evaluateStrategies(window, regime);
      for (const s of strategies) {
        const tracker = trackers.get(s.name);
        if (!tracker) continue;
        tracker.total += 1;
        if (s.direction === "LONG") tracker.edgeR += netMove / atrValue;
        else if (s.direction === "SHORT") tracker.edgeR += -netMove / atrValue;

        if (s.direction === "NEUTRAL" || s.confidence <= 0) continue;
        const favorable = s.direction === "LONG" ? maxUp : maxDown;
        const adverse = s.direction === "LONG" ? maxDown : maxUp;
        const hitReward = favorable >= atrValue * REWARD_R;
        const hitRisk = adverse >= atrValue * RISK_R;
        if (hitReward && !hitRisk) tracker.wins += 1;
        else if (hitRisk && !hitReward) tracker.wins += 0;
        else tracker.wins += 0.5;
      }
    }
  }

  return STRATEGY_NAMES.map((name) => {
    const tracker = trackers.get(name)!;
    if (tracker.total < MIN_SAMPLES) {
      return { name, samples: tracker.total, winRate: 0, edge: 0, weight: 1, directionBias: "NEUTRAL" as const };
    }
    const winRate = (tracker.wins / tracker.total) * 100;
    const edge = tracker.edgeR / tracker.total;
    const weight = clamp(1 + edge * 2.4, 0.35, 1.75);
    const directionBias: "LONG" | "SHORT" | "NEUTRAL" = edge > 0.05 ? "LONG" : edge < -0.05 ? "SHORT" : "NEUTRAL";
    return { name, samples: tracker.total, winRate, edge, weight, directionBias };
  });
}

export function learningWeightsLookup(learning: StrategyLearnStats[]): Record<StrategyName, number> {
  const lookup = {} as Record<StrategyName, number>;
  for (const stats of learning) {
    lookup[stats.name] = stats.weight;
  }
  return lookup;
}