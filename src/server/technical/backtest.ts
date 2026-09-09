import type { CandleInput } from "./indicators";
import { computeConfluence } from "./confluence";

export type BacktestSample = {
  success: boolean;
  profitPct: number;
  holdBars: number;
};

export type StrategyBacktest = {
  winRate: number | null;
  avgProfitPct: number | null;
  avgLossPct: number | null;
  expectancyPct: number | null;
  totalSignals: number;
  samples: BacktestSample[];
  edge: "POSITIVE" | "NEGATIVE" | "ZERO" | "INSUFFICIENT";
};

// Simulates: for each historical window with a clear confluence direction,
// "enter" at that price and measure whether price moved in the chosen direction.
// Uses ATR-scaled targets (1R) and stops (1R) to mimic a real trade.
export function backtestConfluenceEdges(
  candles: CandleInput[],
  lookback: number,
  targetR = 1,
  stopR = 1,
): StrategyBacktest {
  const samples: BacktestSample[] = [];

  // Require enough history; step back through time creating analysis windows
  if (candles.length < 60) {
    return emptyBacktest();
  }

  const minWindow = 40;
  const maxSamples = 25;

  // Iterate from oldest feasible window to near the end
  for (let end = minWindow + 10; end < candles.length - 5 && samples.length < maxSamples; end += 6) {
    const window = candles.slice(0, end);
    const confluence = computeConfluence(window, { includeBacktest: false });
    if (confluence.direction === "NEUTRAL") continue;

    const entry = window.at(-1)!.close;
    const atr = atrOf(window, 14);
    if (!atr || !entry) continue;

    const direction = confluence.direction === "LONG" ? 1 : -1;
    let outcome: BacktestSample | null = null;

    // Walk forward up to 20 bars measuring if target (1R) or stop (1R) hit first
    for (let j = end; j < Math.min(end + 20, candles.length); j += 1) {
      const c = candles[j];
      if (direction > 0) {
        if (c.high >= entry + atr * targetR) {
          outcome = { success: true, profitPct: (atr * targetR / entry) * 100, holdBars: j - end };
          break;
        }
        if (c.low <= entry - atr * stopR) {
          outcome = { success: false, profitPct: (-atr * stopR / entry) * 100, holdBars: j - end };
          break;
        }
      } else {
        if (c.low <= entry - atr * targetR) {
          outcome = { success: true, profitPct: (atr * targetR / entry) * 100, holdBars: j - end };
          break;
        }
        if (c.high >= entry + atr * stopR) {
          outcome = { success: false, profitPct: (-atr * stopR / entry) * 100, holdBars: j - end };
          break;
        }
      }
    }

    if (outcome) {
      samples.push(outcome);
    }
  }

  if (samples.length < 5) {
    return emptyBacktest();
  }

  const wins = samples.filter((s) => s.success);
  const losses = samples.filter((s) => !s.success);
  const winRate = (wins.length / samples.length) * 100;
  const avgProfitPct = wins.length ? wins.reduce((s, w) => s + w.profitPct, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((s, l) => s + l.profitPct, 0) / losses.length : 0;
  const expectancyPct = samples.reduce((s, x) => s + x.profitPct, 0) / samples.length;

  const edge: StrategyBacktest["edge"] = samples.length < 10 ? "INSUFFICIENT" : expectancyPct > 0 ? "POSITIVE" : expectancyPct < 0 ? "NEGATIVE" : "ZERO";

  return { winRate, avgProfitPct, avgLossPct, expectancyPct, totalSignals: samples.length, samples, edge };
}

function atrOf(candles: CandleInput[], length: number): number | null {
  if (candles.length <= length) return null;
  const vals = candles.slice(-length - 1).slice(1).map((c, i) => {
    const prev = candles[candles.length - length - 1 + i];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function emptyBacktest(): StrategyBacktest {
  return { winRate: null, avgProfitPct: null, avgLossPct: null, expectancyPct: null, totalSignals: 0, samples: [], edge: "INSUFFICIENT" };
}

// Convenience: convert expectancy into a confidence multiplier used to adjust signal conviction
export function expectationFactor(backtest: StrategyBacktest): number {
  if (backtest.edge === "INSUFFICIENT" || backtest.expectancyPct === null) return 1;
  // Normalize expectancy (as % of price) into a 0.9 - 1.1 multiplier:
  // ~0.1% expectancy on a bar -> factor 1.0; stronger -> above 1; negative -> below 1
  const scaled = Math.min(0.15, Math.max(-0.15, backtest.expectancyPct));
  return 1 + scaled / 0.15 * 0.1;
}