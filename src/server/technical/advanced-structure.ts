import type { CandleInput } from "./indicators";

export type FractalPoint = {
  index: number;
  timestamp: string;
  price: number;
  type: "HIGH" | "LOW";
  strength: number;
};

export type TrendlineDirection = "UP" | "DOWN" | "FLAT";

export type Trendline = {
  direction: TrendlineDirection;
  start: FractalPoint;
  end: FractalPoint;
  touches: number;
  slope: number;
  validity: number;
};

export type DivergenceType = "BULLISH" | "BEARISH" | "NONE";

export type StructureBreak = {
  type: "BOS" | "ChoCH" | "RangeBreak";
  direction: "LONG" | "SHORT";
  price: number;
  timestamp: string;
  strength: number;
};

export function detectFractals(candles: CandleInput[]): FractalPoint[] {
  if (candles.length < 5) return [];
  const fractals: FractalPoint[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    const c = candles[i];
    const prev1 = candles[i - 1];
    const prev2 = candles[i - 2];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];
    if (c.high > prev1.high && c.high > prev2.high && c.high > next1.high && c.high > next2.high) {
      fractals.push({ index: i, timestamp: c.timestamp, price: c.high, type: "HIGH", strength: 1 });
    }
    if (c.low < prev1.low && c.low < prev2.low && c.low < next1.low && c.low < next2.low) {
      fractals.push({ index: i, timestamp: c.timestamp, price: c.low, type: "LOW", strength: 1 });
    }
  }
  return fractals;
}

export function detectBOSAndChoCH(candles: CandleInput[]): StructureBreak[] {
  if (candles.length < 10) return [];
  const fractals = detectFractals(candles);
  const breaks: StructureBreak[] = [];
  const last = candles.at(-1)!;

  const lastHigh = fractals.filter((f) => f.type === "HIGH").at(-1);
  const lastLow = fractals.filter((f) => f.type === "LOW").at(-1);
  const prevHigh = fractals.filter((f) => f.type === "HIGH").at(-2);
  const prevLow = fractals.filter((f) => f.type === "LOW").at(-2);

  // Break of Structure: close/high clearing the most recent swing
  if (lastHigh) {
    if (last.close > lastHigh.price) {
      breaks.push({ type: "BOS", direction: "LONG", price: lastHigh.price, timestamp: last.timestamp, strength: 25 });
    } else if (last.high > lastHigh.price) {
      breaks.push({ type: "BOS", direction: "LONG", price: lastHigh.price, timestamp: last.timestamp, strength: 20 });
    }
  }

  if (lastLow) {
    if (last.close < lastLow.price) {
      breaks.push({ type: "BOS", direction: "SHORT", price: lastLow.price, timestamp: last.timestamp, strength: 25 });
    } else if (last.low < lastLow.price) {
      breaks.push({ type: "BOS", direction: "SHORT", price: lastLow.price, timestamp: last.timestamp, strength: 20 });
    }
  }

  // Change of Character (ChoCH): breaking the prior opposing swing after a counter-trend swing
  if (prevHigh && last.close > prevHigh.price && lastHigh && lastHigh.price > prevHigh.price) {
    breaks.push({ type: "ChoCH", direction: "LONG", price: prevHigh.price, timestamp: last.timestamp, strength: 30 });
  }
  if (prevLow && last.close < prevLow.price && lastLow && lastLow.price < prevLow.price) {
    breaks.push({ type: "ChoCH", direction: "SHORT", price: prevLow.price, timestamp: last.timestamp, strength: 30 });
  }

  // Range break: recent consolidation then expansion
  const recent = candles.slice(-20);
  if (recent.length >= 20) {
    const high = Math.max(...recent.map((c) => c.high));
    const low = Math.min(...recent.map((c) => c.low));
    const rangePct = ((high - low) / ((high + low) / 2)) * 100;
    if (rangePct < 3 && last.close > high) {
      breaks.push({ type: "RangeBreak", direction: "LONG", price: high, timestamp: last.timestamp, strength: 35 });
    } else if (rangePct < 3 && last.close < low) {
      breaks.push({ type: "RangeBreak", direction: "SHORT", price: low, timestamp: last.timestamp, strength: 35 });
    }
  }

  return breaks;
}

export function detectTrendlines(candles: CandleInput[]): Trendline[] {
  if (candles.length < 12) return [];
  const fractals = detectFractals(candles);
  const highs = fractals.filter((f) => f.type === "HIGH").slice(-6);
  const lows = fractals.filter((f) => f.type === "LOW").slice(-6);
  const lines: Trendline[] = [];

  // Ascending trendline: connect lowest lows with increasing slope, touches >= 2
  if (lows.length >= 2) {
    const sorted = [...lows].sort((a, b) => a.index - b.index);
    let lowestLow = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
      const cur = sorted[i];
      const slope = cur.index > lowestLow.index ? (cur.price - lowestLow.price) / (cur.index - lowestLow.index) : 0;
      if (cur.price >= lowestLow.price && slope > 0) {
        const touches = countTouches(candles, lowestLow.index, cur.index, cur.price, lowestLow.price, "low");
        if (touches >= 2 && slope > 0) {
          lines.push({ direction: "UP", start: lowestLow, end: cur, touches, slope, validity: Math.min(100, touches * 30) });
        }
      } else if (cur.price < lowestLow.price) {
        lowestLow = cur;
      }
    }
  }

  // Descending trendline: connect highest highs with decreasing slope
  if (highs.length >= 2) {
    const sorted = [...highs].sort((a, b) => a.index - b.index);
    let highestHigh = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
      const cur = sorted[i];
      if (cur.price <= highestHigh.price) {
        const touches = countTouches(candles, highestHigh.index, cur.index, cur.price, highestHigh.price, "high");
        if (touches >= 2) {
          lines.push({ direction: "DOWN", start: highestHigh, end: cur, touches, slope: (cur.price - highestHigh.price) / Math.max(cur.index - highestHigh.index, 1), validity: Math.min(100, touches * 30) });
        }
      } else {
        highestHigh = cur;
      }
    }
  }

  return lines;
}

function countTouches(candles: CandleInput[], startIdx: number, endIdx: number, endPrice: number, startPrice: number, type: "high" | "low") {
  if (startIdx >= endIdx) return 0;
  const tolerance = Math.abs(endPrice - startPrice) > 0 ? Math.abs(endPrice - startPrice) * 0.1 : 0.0001;
  let touches = 0;
  for (let i = startIdx; i <= endIdx; i += 1) {
    const c = candles[i];
    if (type === "low" && Math.abs(c.low - interpolate(startPrice, endPrice, startIdx, endIdx, i)) < tolerance) touches += 1;
    if (type === "high" && Math.abs(c.high - interpolate(startPrice, endPrice, startIdx, endIdx, i)) < tolerance) touches += 1;
  }
  return touches;
}

function interpolate(startPrice: number, endPrice: number, startIdx: number, endIdx: number, i: number) {
  if (endIdx === startIdx) return startPrice;
  return startPrice + ((endPrice - startPrice) * (i - startIdx)) / (endIdx - startIdx);
}

export function detectDivergence(
  candles: CandleInput[],
  priceToUse: (c: CandleInput) => number,
  indicator: (index: number) => number | null,
): DivergenceType {
  if (candles.length < 30) return "NONE";
  const latest = candles.at(-1)!;
  const latestPrice = priceToUse(latest);
  const latestIndicator = indicator(candles.length - 1);

  // Find last two swing highs and swing lows in recent data
  let prevHighPrice: number | null = null;
  let prevHighIdx: number | null = null;
  let prevLowPrice: number | null = null;
  let prevLowIdx: number | null = null;

  for (let i = candles.length - 2; i >= 5; i -= 1) {
    const c = candles[i];
    if (c.high > candles[i - 1].high && c.high > candles[i + 1].high) {
      if (prevHighIdx === null) {
        const ind = indicator(i);
        if (ind !== null) {
          prevHighPrice = c.high;
          prevHighIdx = i;
          if (latestPrice > prevHighPrice && latestIndicator !== null && latestIndicator < ind) {
            return "BEARISH";
          }
        }
      }
    }
    if (c.low < candles[i - 1].low && c.low < candles[i + 1].low) {
      if (prevLowIdx === null) {
        const ind = indicator(i);
        if (ind !== null) {
          prevLowPrice = c.low;
          prevLowIdx = i;
          if (latestPrice < prevLowPrice && latestIndicator !== null && latestIndicator > ind) {
            return "BULLISH";
          }
        }
      }
    }
    if (prevHighIdx !== null && prevLowIdx !== null) break;
  }

  return "NONE";
}
