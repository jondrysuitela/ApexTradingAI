import type { CandleInput } from "./indicators";

export type ClusteredLevel = {
  center: number;
  low: number;
  high: number;
  type: "support" | "resistance";
  touchCount: number;
  strength: number;
  lastReactionTotal: number;
  roleFlip: boolean;
  timeframe: string;
};

export function detectSRZones(candles: CandleInput[], timeframe: string): ClusteredLevel[] {
  if (candles.length < 30) return [];

  // Collect swing highs and lows as candidate levels
  const pivots: Array<{ price: number; type: "support" | "resistance"; index: number }> = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    const c = candles[i];
    const prev = candles[i - 1];
    const prev2 = candles[i - 2];
    const next = candles[i + 1];
    const next2 = candles[i + 2];
    if (c.high > prev.high && c.high > prev2.high && c.high > next.high && c.high > next2.high) {
      pivots.push({ price: c.high, type: "resistance", index: i });
    }
    if (c.low < prev.low && c.low < prev2.low && c.low < next.low && c.low < next2.low) {
      pivots.push({ price: c.low, type: "support", index: i });
    }
  }

  pivots.sort((a, b) => a.price - b.price);

  const clusters: ClusteredLevel[] = [];
  for (const pivot of pivots) {
    const proximityBijec = clusterDistance(pivot.price, pivot.type);
    const last = clusters.at(-1);
    if (last && last.type === pivot.type && Math.abs(last.center - pivot.price) / pivot.price < proximityBijec) {
      const w = (last.touchCount / (last.touchCount + 1));
      last.center = last.center * w + pivot.price * (1 - w);
      last.touchCount += 1;
      last.low = Math.min(last.low, pivot.price);
      last.high = Math.max(last.high, pivot.price);
      last.strength = Math.round((last.touchCount * 20) + Math.min(Math.abs(last.high - last.low), 100));
      last.lastReactionTotal += 1;
    } else {
      clusters.push({
        center: pivot.price,
        low: pivot.price,
        high: pivot.price,
        type: pivot.type,
        touchCount: 1,
        strength: 20,
        lastReactionTotal: 1,
        roleFlip: false,
        timeframe,
      });
    }
  }

  // Check role flips (support that price closed below becomes resistance, etc.)
  const lastClose = candles.at(-1)!.close;
  for (const cluster of clusters) {
    if (cluster.type === "support" && lastClose < cluster.low) cluster.roleFlip = true;
    if (cluster.type === "resistance" && lastClose > cluster.high) cluster.roleFlip = true;
  }

  // Return stronger clusters first
  return clusters.sort((a, b) => b.strength - a.strength).slice(0, 8);
}

function clusterDistance(price: number, _type: "support" | "resistance") {
  // Volatility-sensitive: gold (XAU) has small % moves, crypto larger
  if (price < 1) return 0.0005;
  if (price < 10) return 0.001;
  if (price < 100) return 0.002;
  return 0.005;
}

export function findNearestZone(
  price: number,
  zones: ClusteredLevel[],
  direction: "LONG" | "SHORT",
): ClusteredLevel | null {
  const relevant = zones.filter((z) => (direction === "LONG" ? z.type === "support" && z.center <= price : z.type === "resistance" && z.center >= price));
  if (relevant.length === 0) return null;
  return relevant.sort((a, b) => Math.abs(a.center - price) - Math.abs(b.center - price))[0];
}