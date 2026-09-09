import type { CandleInput } from "./indicators";
import { detectFractals } from "./advanced-structure";

export type FibLevel = {
  ratio: number;
  price: number;
  kind: "RETRACE" | "EXTENSION";
};

export type FibonacciRead = {
  direction: "UP" | "DOWN";
  swingLow: number;
  swingHigh: number;
  levels: FibLevel[];
  nearest: { level: FibLevel; distancePct: number } | null;
};

const RETRACE_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];
const EXTENSION_RATIOS = [1.272, 1.618];

export function fibonacciLevels(candles: CandleInput[]): FibonacciRead | null {
  if (candles.length < 8) return null;

  const fractals = detectFractals(candles);
  const highs = fractals.filter((point) => point.type === "HIGH");
  const lows = fractals.filter((point) => point.type === "LOW");
  if (highs.length === 0 || lows.length === 0) return null;

  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  const upward = lastLow.index > lastHigh.index;
  const swingLow = upward ? lastLow.price : lastHigh.price;
  const swingHigh = upward ? lastHigh.price : lastLow.price;
  const range = Math.abs(swingHigh - swingLow);
  if (range <= 0) return null;

  const direction: "UP" | "DOWN" = upward ? "UP" : "DOWN";
  const levels: FibLevel[] = [];
  for (const ratio of RETRACE_RATIOS) {
    const price = upward ? swingHigh - range * ratio : swingLow + range * ratio;
    levels.push({ ratio, price, kind: "RETRACE" });
  }
  for (const ratio of EXTENSION_RATIOS) {
    const price = upward ? swingLow - range * (ratio - 1) : swingHigh + range * (ratio - 1);
    levels.push({ ratio, price, kind: "EXTENSION" });
  }

  const lastPrice = candles[candles.length - 1].close;
  let nearest: { level: FibLevel; distancePct: number } | null = null;
  for (const level of levels) {
    const distancePct = lastPrice > 0 ? (Math.abs(lastPrice - level.price) / lastPrice) * 100 : Infinity;
    if (!nearest || distancePct < nearest.distancePct) {
      nearest = { level, distancePct };
    }
  }

  return { direction, swingLow, swingHigh, levels, nearest };
}