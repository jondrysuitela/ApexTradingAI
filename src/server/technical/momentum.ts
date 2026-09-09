import type { CandleInput } from "./indicators";
import { ema, rsi, atr } from "./indicators";

export type MomentumState = {
  velocity: "ACCELERATING" | "DECELERATING" | "REVERSING" | "STEADY";
  direction: "LONG" | "SHORT" | "NEUTRAL";
  roc5: number | null;
  roc20: number | null;
  macdHistPrev: number | null;
  macdHistCurr: number | null;
  velocityScore: number;
  detail: string;
};

export function analyzeMomentum(candles: CandleInput[]): MomentumState {
  if (candles.length < 30) {
    return { velocity: "STEADY", direction: "NEUTRAL", roc5: null, roc20: null, macdHistPrev: null, macdHistCurr: null, velocityScore: 0, detail: "Insufficient data" };
  }

  const closes = candles.map((c) => c.close);
  const lastClose = closes.at(-1)!;

  // Rate of change over different periods
  const roc5 = closes.length >= 6 ? ((lastClose - closes.at(-6)!) / closes.at(-6)!) * 100 : null;
  const roc20 = closes.length >= 21 ? ((lastClose - closes.at(-21)!) / closes.at(-21)!) * 100 : null;

  // Acceleration: ROC difference
  const roc5Prev = closes.length >= 11 ? ((closes.at(-6)! - closes.at(-11)!) / closes.at(-11)!) * 100 : null;
  const roc20Prev = closes.length >= 26 ? ((closes.at(-21)! - closes.at(-26)!) / closes.at(-26)!) * 100 : null;

  // MACD histogram trend
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdVal = ema12 && ema26 ? ema12 - ema26 : 0;
  const closesPrev = closes.slice(0, -1);
  const ema12Prev = ema(closesPrev, 12);
  const ema26Prev = ema(closesPrev, 26);
  const macdPrev = ema12Prev && ema26Prev ? ema12Prev - ema26Prev : 0;
  const macdHistCurr = macdVal - (macdVal * 0.731); // smoothed signal, approx
  const macdHistPrev = macdPrev - (macdPrev * 0.731);

  // ATR-based: velocity of price movement relative to volatility
  const atr14 = atr(candles, 14);
  const avgMove = closes.length >= 5
    ? Math.abs(lastClose - closes.at(-5)!)
    : null;
  const atrMoveRatio = atr14 && avgMove ? avgMove / atr14 : null;

  let velocity: MomentumState["velocity"] = "STEADY";
  let direction: MomentumState["direction"] = "NEUTRAL";
  let velocityScore = 0;
  let detail = "";

  // ROC acceleration logic
  if (roc5 !== null && roc5Prev !== null) {
    const accel = roc5 - roc5Prev;
    if (Math.abs(accel) > 0.3) {
      velocity = "ACCELERATING";
      if (accel > 0) { direction = "LONG"; velocityScore += 20; }
      else { direction = "SHORT"; velocityScore += 20; }
      detail += `ROC5 accelerating ${accel > 0 ? "+" : ""}${accel.toFixed(2)}% in last bar. `;
    } else if (Math.abs(accel) < 0.1 && Math.abs(roc5) < 0.5) {
      velocity = "DECELERATING";
      detail += "ROC5 near zero - momentum dying. ";
    }
  }

  // Longer-term ROC
  if (roc20 !== null && roc20Prev !== null) {
    const longerAccel = roc20 - roc20Prev;
    if (Math.abs(longerAccel) > 0.2) {
      velocityScore += 10;
      detail += `ROC20 momentum ${longerAccel > 0 ? "increasing" : "decreasing"}. `;
    }
  }

  // MACD histogram momentum
  if (macdHistPrev !== null) {
    const histDelta = macdHistCurr - macdHistPrev;
    if (Math.abs(histDelta) > Math.abs(macdHistPrev) * 0.2 && Math.abs(macdHistCurr) > Math.abs(macdHistPrev) * 1.1) {
      velocity = "ACCELERATING";
      velocityScore += 15;
      detail += `MACD histogram expanding. `;
    }
  }

  // Reversal detection
  if (roc5 !== null && roc20 !== null && Math.sign(roc5) !== Math.sign(roc20)) {
    velocity = "REVERSING";
    detail += `Short-term ${roc5 > 0 ? "up" : "down"} but long-term ${roc20 > 0 ? "up" : "down"} - potential reversal. `;
  }

  // ATR-relative velocity
  if (atrMoveRatio !== null) {
    if (atrMoveRatio > 1.5) {
      velocityScore += 10;
      detail += `Move is ${atrMoveRatio.toFixed(2)}x ATR - strong directional velocity. `;
    } else if (atrMoveRatio < 0.3) {
      detail += "Move is muted relative to ATR. ";
    }
  }

  // RSI-based velocity check
  const rsi14 = rsi(closes, 14);
  if (rsi14 !== null) {
    if (rsi14 > 65 && direction === "LONG") velocityScore += 8;
    if (rsi14 < 35 && direction === "SHORT") velocityScore += 8;
  }

  return { velocity, direction, roc5, roc20, macdHistPrev, macdHistCurr, velocityScore: Math.min(velocityScore, 50), detail: detail.trim() || "Normal momentum" };
}