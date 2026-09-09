import type { CandleInput } from "./indicators";
import { bodyRatio, lowerWickRatio, upperWickRatio } from "./indicators";

export type CandlePattern = {
  name: string;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  strength: number;
  description: string;
};

export function detectCandlePatterns(candles: CandleInput[]): CandlePattern[] {
  if (candles.length < 3) return [];
  const patterns: CandlePattern[] = [];
  const last = candles.at(-1)!;
  const prev = candles.at(-2)!;
  const prev2 = candles.at(-3)!;

  const lastBody = Math.abs(last.close - last.open);
  const lastRange = last.high - last.low;
  const prevBody = Math.abs(prev.close - prev.open);

  if (lastRange > 0 && lastBody / lastRange < 0.1) {
    patterns.push({ name: "Doji", bias: "NEUTRAL", strength: 15, description: "Candle indecision - small body relative to range" });
  }

  if (prevBody > 0 && lastBody > prevBody * 2) {
    const lastBullish = last.close > last.open;
    const prevBullish = prev.close > prev.open;
    if (lastBullish && !prevBullish && last.close > prev.open && last.open <= prev.close) {
      patterns.push({ name: "Bullish Engulfing", bias: "LONG", strength: 40, description: "Bullish candle fully engulfs previous bearish candle" });
    }
    if (!lastBullish && prevBullish && last.open > prev.close && last.close <= prev.open) {
      patterns.push({ name: "Bearish Engulfing", bias: "SHORT", strength: 40, description: "Bearish candle fully engulfs previous bullish candle" });
    }
  }

  if (lastRange > 0) {
    const lwr = lowerWickRatio(last);
    const uwr = upperWickRatio(last);
    const br = bodyRatio(last);
    if (lwr > 0.55 && br < 0.25) {
      const atSupport = last.low <= Math.min(...candles.slice(-10).map((c) => c.low));
      patterns.push({ name: "Bullish Pin Bar", bias: "LONG", strength: atSupport ? 45 : 30, description: `Long lower wick (${(lwr * 100).toFixed(0)}% of range) rejection` });
    }
    if (uwr > 0.55 && br < 0.25) {
      const atResistance = last.high >= Math.max(...candles.slice(-10).map((c) => c.high));
      patterns.push({ name: "Bearish Pin Bar", bias: "SHORT", strength: atResistance ? 45 : 30, description: `Long upper wick (${(uwr * 100).toFixed(0)}% of range) rejection` });
    }
  }

  if (last.high <= prev.high && last.low >= prev.low) {
    patterns.push({ name: "Inside Bar", bias: "NEUTRAL", strength: 15, description: "Current candle range contained within previous candle" });
  }
  if (prev.high <= prev2.high && prev.low >= prev2.low) {
    patterns.push({ name: "Inside Bar (prev)", bias: "NEUTRAL", strength: 10, description: "Previous candle range contained within candle before" });
  }

  if (prev2.close < prev2.open && prev.close > prev.open && last.close > last.open) {
    if (last.close > prev2.open) {
      patterns.push({ name: "Morning Star", bias: "LONG", strength: 50, description: "Three-candle bullish reversal pattern" });
    }
  }
  if (prev2.close > prev2.open && prev.close < prev.open && last.close < last.open) {
    if (last.close < prev2.open) {
      patterns.push({ name: "Evening Star", bias: "SHORT", strength: 50, description: "Three-candle bearish reversal pattern" });
    }
  }

  const threeUp = last.close > last.open && prev.close > prev.open && prev2.close > prev2.open;
  const threeDown = last.close < last.open && prev.close < prev.open && prev2.close < prev2.open;
  if (threeUp) {
    const increasing = lastBody > prevBody && prevBody > Math.abs(prev2.close - prev2.open);
    if (increasing) patterns.push({ name: "Three White Soldiers", bias: "LONG", strength: 35, description: "Three consecutive bullish candles with increasing bodies" });
  }
  if (threeDown) {
    const decreasing = lastBody > prevBody && prevBody > Math.abs(prev2.close - prev2.open);
    if (decreasing) patterns.push({ name: "Three Black Crows", bias: "SHORT", strength: 35, description: "Three consecutive bearish candles with increasing bodies" });
  }

  const recentCloses = candles.slice(-6).map((c) => c.close);
  const allRising = recentCloses.every((c, i) => i === 0 || c > recentCloses[i - 1]);
  const allFalling = recentCloses.every((c, i) => i === 0 || c < recentCloses[i - 1]);
  if (allRising && recentCloses.length >= 5) {
    patterns.push({ name: "Rising Steps", bias: "LONG", strength: 25, description: "5+ consecutive higher closes showing steady buying" });
  }
  if (allFalling && recentCloses.length >= 5) {
    patterns.push({ name: "Falling Steps", bias: "SHORT", strength: 25, description: "5+ consecutive lower closes showing steady selling" });
  }

  return patterns;
}

export function scorePatterns(patterns: CandlePattern[]): { longBonus: number; shortBonus: number; topPatterns: string[] } {
  let longBonus = 0;
  let shortBonus = 0;
  const sorted = [...patterns].sort((a, b) => b.strength - a.strength);
  const topPatterns = sorted.slice(0, 3).map((p) => `${p.name} (${p.bias})`);

  for (const p of patterns) {
    if (p.bias === "LONG") longBonus += p.strength;
    if (p.bias === "SHORT") shortBonus += p.strength;
  }

  return { longBonus, shortBonus, topPatterns };
}
