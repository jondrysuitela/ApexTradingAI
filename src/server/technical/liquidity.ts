import type { CandleInput } from "./indicators";
import { detectFractals, type FractalPoint } from "./advanced-structure";

export type SweepDirection = "LONG" | "SHORT";

export type LiquiditySweep = {
  direction: SweepDirection;
  levelPrice: number;
  extremePrice: number;
  index: number;
  timestamp: string;
  strength: number;
};

export type Fvg = {
  direction: "BULLISH" | "BEARISH";
  top: number;
  bottom: number;
  index: number;
  timestamp: string;
  sizePct: number;
  fresh: boolean;
};

export type OrderBlock = {
  direction: "BULLISH" | "BEARISH";
  high: number;
  low: number;
  index: number;
  timestamp: string;
  strength: number;
};

const matchFractals = (candles: CandleInput[], fractals: FractalPoint[]): LiquiditySweep[] => {
  const highs = fractals.filter((point) => point.type === "HIGH");
  const lows = fractals.filter((point) => point.type === "LOW");
  if (highs.length === 0 && lows.length === 0) return [];

  const lastPrice = candles[candles.length - 1].close;

  let shortSweep: LiquiditySweep | null = null;
  let longSweep: LiquiditySweep | null = null;

  const lookRecentHighs = highs.slice(-3);
  if (lookRecentHighs.length >= 2) {
    const highest = lookRecentHighs[lookRecentHighs.length - 1];
    const twin = lookRecentHighs.slice(0, -1).find((point) => Math.abs(point.price - highest.price) / highest.price < 0.0005);
    if (twin) {
      const extreme = Math.max(
        ...candles.slice(Math.max(0, twin.index), candles.length).map((c) => c.high),
      );
      const levelPrice = Math.max(twin.price, highest.price);
      const bodyLow = candles[candles.length - 1].low;
      if (extreme > levelPrice && bodyLow < levelPrice) {
        shortSweep = {
          direction: "SHORT",
          levelPrice,
          extremePrice: extreme,
          index: candles.length - 1,
          timestamp: candles[candles.length - 1].timestamp,
          strength: Math.min(1, ((extreme - levelPrice) / levelPrice) * 500),
        };
      }
    }
  }

  const lookRecentLows = lows.slice(-3);
  if (lookRecentLows.length >= 2) {
    const lowest = lookRecentLows[lookRecentLows.length - 1];
    const twin = lookRecentLows.slice(0, -1).find((point) => Math.abs(point.price - lowest.price) / lowest.price < 0.0005);
    if (twin) {
      const extreme = Math.min(
        ...candles.slice(Math.max(0, twin.index), candles.length).map((c) => c.low),
      );
      const levelPrice = Math.min(twin.price, lowest.price);
      const bodyHigh = candles[candles.length - 1].high;
      if (extreme < levelPrice && bodyHigh > levelPrice) {
        longSweep = {
          direction: "LONG",
          levelPrice,
          extremePrice: extreme,
          index: candles.length - 1,
          timestamp: candles[candles.length - 1].timestamp,
          strength: Math.min(1, ((levelPrice - extreme) / levelPrice) * 500),
        };
      }
    }
  }

  const filtered: LiquiditySweep[] = [];
  if (shortSweep) filtered.push(shortSweep);
  if (longSweep) filtered.push(longSweep);
  if (lastPrice !== undefined && lastPrice === lastPrice) return filtered;
  return filtered;
};

export function detectLiquiditySweeps(candles: CandleInput[]): LiquiditySweep[] {
  if (candles.length < 8) return [];
  const fractals = detectFractals(candles);
  return matchFractals(candles, fractals);
}

export function detectFvgs(candles: CandleInput[]): Fvg[] {
  const result: Fvg[] = [];
  if (candles.length < 5) return result;

  const start = Math.max(1, candles.length - 24);
  for (let i = start; i < candles.length - 2; i += 1) {
    const first = candles[i];
    const third = candles[i + 2];
    const bullGap = third.low - first.high;
    const bearGap = first.low - third.high;
    const base = candles[candles.length - 1].close;

    if (bullGap > 0) {
      const sizePct = base > 0 ? (bullGap / base) * 100 : 0;
      result.push({
        direction: "BULLISH",
        top: third.low,
        bottom: first.high,
        index: i + 2,
        timestamp: third.timestamp,
        sizePct,
        fresh: candles.length - 1 - (i + 2) <= 5,
      });
    }

    if (bearGap > 0) {
      const sizePct = base > 0 ? (bearGap / base) * 100 : 0;
      result.push({
        direction: "BEARISH",
        top: first.low,
        bottom: third.high,
        index: i + 2,
        timestamp: third.timestamp,
        sizePct,
        fresh: candles.length - 1 - (i + 2) <= 5,
      });
    }
  }

  return result;
}

export function detectOrderBlocks(candles: CandleInput[], lookback = 20): OrderBlock[] {
  const result: OrderBlock[] = [];
  if (candles.length < 5) return result;

  const end = candles.length - 1;
  const start = Math.max(2, end - lookback);

  for (let i = start; i < end - 1; i += 1) {
    const block = candles[i];
    const moveAhead = candles[i + 1].close - candles[i + 1].open;
    const blockBody = block.close - block.open;
    if (blockBody === 0) continue;

    const isBullishBlock = blockBody < 0 && moveAhead > 0;
    const isBearishBlock = blockBody > 0 && moveAhead < 0;
    if (!isBullishBlock && !isBearishBlock) continue;

    const displacement = Math.abs(moveAhead) / Math.max(0.000001, Math.abs(blockBody));
    if (displacement < 1.5) continue;

    result.push({
      direction: isBullishBlock ? "BULLISH" : "BEARISH",
      high: block.high,
      low: block.low,
      index: i,
      timestamp: block.timestamp,
      strength: Math.min(1, displacement / 4),
    });
  }

  return result;
}