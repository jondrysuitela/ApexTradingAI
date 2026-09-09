import type { CandleInput } from "./indicators";

export type SupportResistanceLevel = {
  price: number;
  type: "support" | "resistance";
  strength: number;
  touchCount: number;
  timeframe: string;
  lastReaction: string;
  distanceFromCurrentPrice: number;
};

export function detectSupportResistance(candles: CandleInput[], timeframe: string): SupportResistanceLevel[] {
  if (candles.length < 3) return [];

  const currentPrice = candles.at(-1)?.close ?? 0;
  const levels = candles.flatMap((candle, index) => {
    const prev = candles[index - 1];
    const next = candles[index + 1];
    const result: SupportResistanceLevel[] = [];

    if (prev && next && candle.low < prev.low && candle.low < next.low) {
      result.push({ price: candle.low, type: "support", strength: 1, touchCount: 1, timeframe, lastReaction: candle.timestamp, distanceFromCurrentPrice: Math.abs(currentPrice - candle.low) });
    }
    if (prev && next && candle.high > prev.high && candle.high > next.high) {
      result.push({ price: candle.high, type: "resistance", strength: 1, touchCount: 1, timeframe, lastReaction: candle.timestamp, distanceFromCurrentPrice: Math.abs(currentPrice - candle.high) });
    }

    return result;
  });

  return clusterLevels(levels);
}

function clusterLevels(levels: SupportResistanceLevel[]) {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clustered: SupportResistanceLevel[] = [];

  for (const level of sorted) {
    const last = clustered.at(-1);
    if (last && Math.abs(last.price - level.price) / level.price < 0.002 && last.type === level.type) {
      last.price = (last.price + level.price) / 2;
      last.strength += level.strength;
      last.touchCount += level.touchCount;
      last.lastReaction = level.lastReaction;
      last.distanceFromCurrentPrice = level.distanceFromCurrentPrice;
    } else {
      clustered.push({ ...level });
    }
  }

  return clustered;
}
