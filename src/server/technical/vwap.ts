import type { CandleInput } from "./indicators";

export type VwapPosition = "ABOVE_2" | "ABOVE_1" | "INSIDE" | "BELOW_1" | "BELOW_2" | "UNKNOWN";

export type VwapRead = {
  vwap: number | null;
  upper1: number | null;
  lower1: number | null;
  upper2: number | null;
  lower2: number | null;
  standardDeviation: number | null;
  deviationFromVwap: number | null;
  deviationPct: number | null;
  position: VwapPosition;
};

export function sessionVwap(candles: CandleInput[]): VwapRead {
  const empty: VwapRead = {
    vwap: null,
    upper1: null,
    lower1: null,
    upper2: null,
    lower2: null,
    standardDeviation: null,
    deviationFromVwap: null,
    deviationPct: null,
    position: "UNKNOWN",
  };

  if (candles.length < 2) return empty;

  let sumPv = 0;
  let sumV = 0;
  const typicalPrices: number[] = [];
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    typicalPrices.push(tp);
    sumPv += tp * c.volume;
    sumV += c.volume;
  }
  if (sumV <= 0) return empty;

  const vwap = sumPv / sumV;
  const variance = typicalPrices.reduce((sum, tp) => sum + (tp - vwap) ** 2, 0) / typicalPrices.length;
  const standardDeviation = Math.sqrt(variance);

  const lastPrice = candles[candles.length - 1].close;
  const deviationFromVwap = lastPrice - vwap;
  const deviationPct = vwap !== 0 ? (deviationFromVwap / vwap) * 100 : 0;

  let position: VwapPosition = "INSIDE";
  if (lastPrice >= vwap + 2 * standardDeviation) position = "ABOVE_2";
  else if (lastPrice >= vwap + standardDeviation) position = "ABOVE_1";
  else if (lastPrice >= vwap) position = "INSIDE";
  else if (lastPrice >= vwap - standardDeviation) position = "BELOW_1";
  else position = "BELOW_2";

  return {
    vwap,
    upper1: vwap + standardDeviation,
    lower1: vwap - standardDeviation,
    upper2: vwap + 2 * standardDeviation,
    lower2: vwap - 2 * standardDeviation,
    standardDeviation,
    deviationFromVwap,
    deviationPct,
    position,
  };
}