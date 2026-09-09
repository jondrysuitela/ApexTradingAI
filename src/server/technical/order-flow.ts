import type { CandleInput } from "./indicators";

export type CvdDirection = "UP" | "DOWN" | "FLAT";

export type OrderFlowRead = {
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  imbalance: number;
  cvd: number;
  cvdDirection: CvdDirection;
  perBarDelta: Array<{ delta: number; volume: number }>;
  aggressiveMomentum: "BULLISH" | "BEARISH" | "NEUTRAL";
};

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function analyzeOrderFlow(candles: CandleInput[], deltaLookback = 8): OrderFlowRead {
  const perBarDelta: Array<{ delta: number; volume: number }> = [];
  let buyVolume = 0;
  let sellVolume = 0;
  let totalVolume = 0;
  let cvd = 0;

  for (const c of candles) {
    if (c.volume <= 0) continue;
    totalVolume += c.volume;
    const body = c.close - c.open;
    const isUp = body > 0;
    const isDown = body < 0;
    let delta: number;
    if (isUp) {
      delta = c.volume;
      buyVolume += c.volume;
    } else if (isDown) {
      delta = -c.volume;
      sellVolume += c.volume;
    } else {
      delta = c.volume / 2 - c.volume / 2;
      buyVolume += c.volume / 2;
      sellVolume += c.volume / 2;
    }
    cvd += delta;
    perBarDelta.push({ delta, volume: c.volume });
  }

  const imbalance = totalVolume > 0 ? clamp((buyVolume - sellVolume) / totalVolume) : 0;

  const recentDeltas = perBarDelta.slice(-deltaLookback).map((item) => item.delta);
  const recentSum = recentDeltas.reduce((sum, value) => sum + value, 0);
  const cvdDirection: CvdDirection = recentSum > 0.0000001 ? "UP" : recentSum < -0.0000001 ? "DOWN" : "FLAT";

  let aggressiveMomentum: OrderFlowRead["aggressiveMomentum"] = "NEUTRAL";
  if (recentDeltas.length >= 3) {
    const last = recentDeltas[recentDeltas.length - 1];
    const prior = recentDeltas[recentDeltas.length - 2];
    const prior2 = recentDeltas[recentDeltas.length - 3];
    const recentStrength = (last + prior + prior2) / 3;
    const average = recentDeltas.reduce((sum, value) => sum + value, 0) / recentDeltas.length;
    if (recentStrength > average * 1.5 && recentStrength > 0) aggressiveMomentum = "BULLISH";
    else if (recentStrength < average * 1.5 && recentStrength < 0) aggressiveMomentum = "BEARISH";
  }

  return { buyVolume, sellVolume, totalVolume, imbalance, cvd, cvdDirection, perBarDelta, aggressiveMomentum };
}