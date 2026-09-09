import type { CandleInput } from "./indicators";
import { adx, atr, bollingerBands, ema, emaSeries, emaSlope, macd, rsi, stochastic } from "./indicators";
import { detectBOSAndChoCH } from "./advanced-structure";
import type { MarketRegime } from "./confluence";
import { getMarketSession, type MarketSession } from "./sessions";

export type StrategyName = "TrendFollowing" | "MeanReversion" | "Breakout" | "Scalping";

export type StrategySignal = {
  name: StrategyName;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  score: number;
  reasoning: string[];
};

export function detectRegimeTrend(regime: MarketRegime): "TRENDING" | "RANGING" {
  return regime.trend === "STRONG_UP" || regime.trend === "STRONG_DOWN" || regime.trend === "UP" || regime.trend === "DOWN" ? "TRENDING" : "RANGING";
}

export function runTrendFollowing(candles: CandleInput[], regime: MarketRegime): StrategySignal {
  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema100 = ema(closes, 100);
  const rsi14 = rsi(closes, 14);
  const adxState = adx(candles, 14);
  const slope = emaSlope(closes, 20);
  const reasons: string[] = [];
  let score = 0;
  let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";

  if (ema20 && ema50 && ema100) {
    if (closes.at(-1)! > ema20 && ema20 > ema50 && ema50 > ema100) {
      direction = "LONG";
      score += 35;
      reasons.push("Full bullish EMA stack (price > EMA20 > EMA50 > EMA100)");
    } else if (closes.at(-1)! < ema20 && ema20 < ema50 && ema50 < ema100) {
      direction = "SHORT";
      score += 35;
      reasons.push("Full bearish EMA stack (price < EMA20 < EMA50 < EMA100)");
    } else if (closes.at(-1)! > ema20 && ema20 > ema50) {
      direction = "LONG";
      score += 15;
      reasons.push("Partial bullish EMA alignment");
    } else if (closes.at(-1)! < ema20 && ema20 < ema50) {
      direction = "SHORT";
      score += 15;
      reasons.push("Partial bearish EMA alignment");
    }
  }

  if (adxState && adxState.adx > 25) {
    score += 20;
    reasons.push(`Strong trend (ADX=${adxState.adx.toFixed(1)})`);
    if (adxState.plusDi > adxState.minusDi) { direction = direction === "NEUTRAL" ? "LONG" : direction; score += 10; }
    else if (adxState.minusDi > adxState.plusDi) { direction = direction === "NEUTRAL" ? "SHORT" : direction; score += 10; }
  }

  if (slope !== null && Math.abs(slope) > 2) {
    if (slope > 0 && direction === "LONG") score += 10;
    if (slope < 0 && direction === "SHORT") score += 10;
    reasons.push(`EMA20 slope ${slope.toFixed(1)}bps confirms trend`);
  }

  if (rsi14 !== null && rsi14 > 55 && direction === "LONG") score += 5;
  if (rsi14 !== null && rsi14 < 45 && direction === "SHORT") score += 5;

  if (regime.trend === "RANGING") {
    score *= 0.5;
    reasons.push("Reduced conviction — market is ranging, trend-following weaker");
  }

  const confidence = Math.min(100, score);
  if (direction === "NEUTRAL") reasons.push("No clear trend alignment");

  return { name: "TrendFollowing", direction, confidence, score, reasoning: reasons.slice(0, 4) };
}

export function runMeanReversion(candles: CandleInput[], regime: MarketRegime): StrategySignal {
  const closes = candles.map((c) => c.close);
  const bb = bollingerBands(closes, 20, 2);
  const rsi14 = rsi(closes, 14);
  const stoch = stochastic(candles, 14, 3);
  const reasons: string[] = [];
  let score = 0;
  let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";

  if (bb) {
    const pos = (closes.at(-1)! - bb.lower) / (bb.upper - bb.lower);
    if (pos < 0.15) {
      direction = "LONG";
      score += 35;
      reasons.push(`Price near Bollinger lower band (position ${(pos * 100).toFixed(0)}%) — stretched`);
    } else if (pos > 0.85) {
      direction = "SHORT";
      score += 35;
      reasons.push(`Price near Bollinger upper band (position ${(pos * 100).toFixed(0)}%) — stretched`);
    }
  }

  if (rsi14 !== null) {
    if (rsi14 < 30 && direction === "LONG") {
      score += 25;
      reasons.push(`RSI oversold (${rsi14.toFixed(1)})`);
    } else if (rsi14 > 70 && direction === "SHORT") {
      score += 25;
      reasons.push(`RSI overbought (${rsi14.toFixed(1)})`);
    }
  }

  if (stoch) {
    if (stoch.k < 20 && direction === "LONG") { score += 15; reasons.push("Stochastic oversold"); }
    if (stoch.k > 80 && direction === "SHORT") { score += 15; reasons.push("Stochastic overbought"); }
  }

  if (regime.trend === "STRONG_UP" || regime.trend === "STRONG_DOWN") {
    score *= 0.5;
    reasons.push("Strong trend — mean-reversion counter-trend is risky");
  }

  const confidence = Math.min(100, score);
  if (direction === "NEUTRAL") reasons.push("Price in neutral band — no reversion edge");

  return { name: "MeanReversion", direction, confidence, score, reasoning: reasons.slice(0, 4) };
}

export function runBreakout(candles: CandleInput[], regime: MarketRegime): StrategySignal {
  const breaks = detectBOSAndChoCH(candles);
  const reasons: string[] = [];
  let score = 0;
  let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";

  if (breaks.length > 0) {
    const last = breaks.at(-1)!;
    if (last.direction === "LONG") {
      direction = "LONG";
      score += last.strength + 20;
      reasons.push(`${last.type} bullish detected at ${last.price.toFixed(5)}`);
    } else if (last.direction === "SHORT") {
      direction = "SHORT";
      score += last.strength + 20;
      reasons.push(`${last.type} bearish detected at ${last.price.toFixed(5)}`);
    }
  }

  // Volatility expansion confirms breakout
  const bbWidth = bollingerWidth(candles);
  if (bbWidth !== null && bbWidth > 0.03) {
    score += 10;
    reasons.push("Bollinger bands expanding — volatility breakout");
  }

  if (regime.volatility === "COMPRESSED") {
    reasons.push("Volatility compressed — possible upcoming breakout");
    score += 5;
  }

  const confidence = Math.min(100, score);
  if (direction === "NEUTRAL") reasons.push("No structural break detected");

  return { name: "Breakout", direction, confidence, score, reasoning: reasons.slice(0, 4) };
}

export function runScalping(candles: CandleInput[], regime: MarketRegime): StrategySignal {
  const closes = candles.map((c) => c.close);
  const atr14 = atr(candles, 14);
  const macdState = macd(closes);
  const stoch = stochastic(candles, 14, 3);
  const reasons: string[] = [];
  let score = 0;
  let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";

  // Fast EMA9/21 cross — scalper's bread and butter
  const emaFast = emaSeries(closes, 9);
  const emaSlow = emaSeries(closes, 21);
  if (emaFast.length >= 2 && emaSlow.length >= 2) {
    const f1 = emaFast.at(-1)!;
    const s1 = emaSlow.at(-1)!;
    const f0 = emaFast.at(-2)!;
    const s0 = emaSlow.at(-2)!;
    if (f0 !== null && s0 !== null && f1 !== null && s1 !== null) {
      if (f0 <= s0 && f1 > s1) {
        direction = "LONG";
        score += 30;
        reasons.push("EMA9/21 bullish cross (fresh)");
      } else if (f0 >= s0 && f1 < s1) {
        direction = "SHORT";
        score += 30;
        reasons.push("EMA9/21 bearish cross (fresh)");
      } else if (f1 > s1 && direction === "NEUTRAL") {
        direction = "LONG";
        score += 15;
        reasons.push("EMA9 above EMA21 — bull micro-trend");
      } else if (f1 < s1 && direction === "NEUTRAL") {
        direction = "SHORT";
        score += 15;
        reasons.push("EMA9 below EMA21 — bear micro-trend");
      }
    }
  }

  // Short-term MACD cross
  if (macdState) {
    if (macdState.macd > macdState.signal && macdState.histogram > 0) {
      if (direction === "NEUTRAL") direction = "LONG";
      score += direction === "LONG" ? 20 : 10;
      if (direction === "LONG") reasons.push("MACD bullish cross with positive histogram");
    } else if (macdState.macd < macdState.signal && macdState.histogram < 0) {
      if (direction === "NEUTRAL") direction = "SHORT";
      score += direction === "SHORT" ? 20 : 10;
      if (direction === "SHORT") reasons.push("MACD bearish cross with negative histogram");
    }
  }

  // Stoch cross momentum
  if (stoch) {
    if (stoch.k > stoch.d && stoch.k > 50 && direction === "LONG") {
      score += 20;
      reasons.push("Stoch K above D and above 50");
    } else if (stoch.k < stoch.d && stoch.k < 50 && direction === "SHORT") {
      score += 20;
      reasons.push("Stoch K below D and below 50");
    }
  }

  // Recent candle bias (last 3 closes)
  const recent = closes.slice(-3);
  const up = recent.filter((_, i) => i === 0 || recent[i] > recent[i - 1]).length - 1;
  const down = 2 - up;
  if (up > down && direction === "LONG") { score += 10; reasons.push("Short-term momentum rising"); }
  if (down > up && direction === "SHORT") { score += 10; reasons.push("Short-term momentum falling"); }

  // Wick rejection — pin bars favor quick counter-scalps off levels
  const pinBias = wickRejection(candles);
  if (pinBias !== "NEUTRAL") {
    score += pinBias === direction ? 10 : 5;
    reasons.push(pinBias === "LONG" ? "Bullish wick rejection on recent candles" : "Bearish wick rejection on recent candles");
  }

  // Regime plays: range → bounce; trend → pullback continuation
  if (regime.trend === "RANGING") {
    score += 5;
    reasons.push("Range conditions favorable for scalping");
  } else if (direction !== "NEUTRAL") {
    score += 10;
    reasons.push("Trend regime — prefer pullback scalp in trend direction");
  }

  // ATR width gate: per-bar move too wide for a tight scalp → reduce score
  if (atr14 && closes.at(-1)) {
    const atrPct = (atr14 / closes.at(-1)!) * 100;
    if (atrPct > 0.8) {
      score -= 10;
      reasons.push(`ATR wide (${atrPct.toFixed(2)}%) — large stop needed, scalp edge reduced`);
    } else if (atrPct < 0.05) {
      score -= 10;
      reasons.push("ATR too thin — price may not cover costs, scalp edge reduced");
    }
  }

  const confidence = Math.min(100, Math.max(5, score));
  if (direction === "NEUTRAL") reasons.push("No short-term edge");

  return { name: "Scalping", direction, confidence, score, reasoning: reasons.slice(0, 4) };
}

function wickRejection(candles: CandleInput[]): "LONG" | "SHORT" | "NEUTRAL" {
  const last = candles.slice(-4);
  if (last.length < 3) return "NEUTRAL";
  const scored = last.map((c) => {
    const range = c.high - c.low;
    if (range <= 0) return 0;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const body = Math.abs(c.close - c.open);
    if (lowerWick > body * 1.5 && lowerWick > upperWick) return 1;
    if (upperWick > body * 1.5 && upperWick > lowerWick) return -1;
    return 0;
  });
  const sum = scored.reduce<number>((acc, value) => acc + value, 0);
  if (sum >= 2) return "LONG";
  if (sum <= -2) return "SHORT";
  return "NEUTRAL";
}

function bollingerWidth(candles: CandleInput[]): number | null {
  if (candles.length < 20) return null;
  const closes = candles.map((c) => c.close);
  const bb = bollingerBands(closes, 20, 2);
  if (!bb) return null;
  const mid = (bb.upper + bb.lower) / 2;
  if (mid === 0) return null;
  return (bb.upper - bb.lower) / mid;
}

export type ScalpingRead = {
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  score: number;
  reasoning: string[];
  entryType: "PULLBACK" | "BREAKOUT" | "RANGE_BOUNCE" | "MOMENTUM" | "NO_EDGE";
  volatility: "COMPRESSED" | "SCALPABLE" | "WIDE" | "EXTREME";
  atrPercent: number | null;
  session: MarketSession;
  spread: {
    points: number | null;
    price: number | null;
    atrCoverPct: number | null;
    block: boolean;
    note: string;
  };
  gated: boolean;
  suggestion: string;
};

export type ScalpingOptions = {
  spread?: { points: number | null; point?: number | null } | null;
  date?: Date;
};

const SPREAD_BLOCK_ATR_PCT = 25;

export function readScalping(candles: CandleInput[], regime: MarketRegime, options?: ScalpingOptions): ScalpingRead {
  const session = getMarketSession(options?.date ?? new Date());
  const closes = candles.map((c) => c.close);
  const atr14 = atr(candles, 14);
  const price = closes.at(-1) ?? null;
  const atrPercent = atr14 && price ? (atr14 / price) * 100 : null;

  let volatility: ScalpingRead["volatility"] = "SCALPABLE";
  if (atrPercent !== null) {
    if (atrPercent > 1.2) volatility = "EXTREME";
    else if (atrPercent > 0.6) volatility = "WIDE";
    else if (atrPercent < 0.05) volatility = "COMPRESSED";
  } else {
    volatility = "COMPRESSED";
  }

  const spread = buildSpreadRead(options?.spread ?? null);
  if (spread.price !== null && atr14 !== null && atr14 > 0) {
    spread.atrCoverPct = Math.min(999, (spread.price / atr14) * 100);
    if (spread.atrCoverPct > SPREAD_BLOCK_ATR_PCT) {
      spread.block = true;
      spread.note = `Spread ${spread.price.toFixed(spread.price < 1 ? 4 : 2)} ≈ ${spread.atrCoverPct.toFixed(0)}% ATR — menghabiskan terlalu banyak ruang target scalping.`;
    }
  }

  const signal = runScalping(candles, regime);
  const bw = bollingerWidth(candles);
  const bandsWide = bw !== null && bw > 0.03;

  let entryType: ScalpingRead["entryType"] = "NO_EDGE";
  if (signal.direction !== "NEUTRAL") {
    if (regime.trend === "RANGING") entryType = "RANGE_BOUNCE";
    else if (bandsWide) entryType = "BREAKOUT";
    else if (Math.abs(signal.score) >= 40) entryType = "MOMENTUM";
    else entryType = "PULLBACK";
  }

  const volatilityPenalty = volatility === "EXTREME" ? 20 : volatility === "WIDE" ? 10 : volatility === "COMPRESSED" ? 5 : 0;
  const sessionPenalty = session.liquidity === "LOW" ? 8 : session.liquidity === "POOR" ? 20 : 0;
  const spreadPenalty = spread.block ? 25 : 0;
  const gated = session.block || spread.block;

  let confidence = Math.max(0, signal.confidence - volatilityPenalty - sessionPenalty - spreadPenalty);
  if (gated) confidence = Math.min(confidence, 35);

  const reasoning = [...signal.reasoning];
  if (spread.price !== null && spread.atrCoverPct !== null) reasoning.unshift(`Spread ${spread.price.toFixed(spread.price < 1 ? 4 : 2)} ≈ ${spread.atrCoverPct.toFixed(1)}% ATR`);
  if (spread.block) reasoning.unshift(spread.note);
  if (session.block) reasoning.unshift(session.note);

  const suggestion = gated
    ? buildGatedSuggestion(session, spread)
    : buildScalpingSuggestion(signal.direction, entryType, volatility, confidence, atrPercent);

  return {
    direction: signal.direction,
    confidence,
    score: signal.score,
    reasoning: reasoning.slice(0, 5),
    entryType,
    volatility,
    atrPercent,
    session,
    spread,
    gated,
    suggestion,
  };
}

function buildSpreadRead(spread: { points: number | null; point?: number | null } | null): ScalpingRead["spread"] {
  if (!spread) {
    return { points: null, price: null, atrCoverPct: null, block: false, note: "Data spread tidak tersedia." };
  }
  const points = Number.isFinite(Number(spread.points)) && (spread.points ?? 0) > 0 ? spread.points : null;
  const point = Number.isFinite(Number(spread.point)) && (spread.point ?? 0) > 0 ? (spread.point ?? null) : null;
  if (points === null) {
    return { points: null, price: null, atrCoverPct: null, block: false, note: "Data spread tidak tersedia." };
  }
  const price = point !== null ? points * point : points;
  return { points, price, atrCoverPct: null, block: false, note: `Spread terdeteksi ${price.toFixed(price < 1 ? 4 : 2)} (${points} poin).` };
}

function buildGatedSuggestion(session: MarketSession, spread: ScalpingRead["spread"]): string {
  if (session.block) return `Scalping diblokir — ${session.note}`;
  if (spread.block && spread.price !== null && spread.atrCoverPct !== null) {
    return `Scalping diblokir — spread ${spread.price.toFixed(spread.price < 1 ? 4 : 2)} menghabiskan ${spread.atrCoverPct.toFixed(0)}% ATR; biaya bisa memakan target. Tunggu spread lebih ketat.`;
  }
  return "Scalping diblokir — kondisi biaya/sesi tidak mendukung.";
}

function buildScalpingSuggestion(
  direction: ScalpingRead["direction"],
  entryType: ScalpingRead["entryType"],
  volatility: ScalpingRead["volatility"],
  confidence: number,
  atrPercent: number | null,
): string {
  if (direction === "NEUTRAL" || entryType === "NO_EDGE") return "Tidak ada edge short-term — tunggu range atau volatilitas yang lebih jelas sebelum scalping.";
  const side = direction === "LONG" ? "BUY" : "SELL";
  const atrNote = atrPercent !== null ? ` ATR per bar ${atrPercent.toFixed(2)}% (harga), ` : " ";
  if (volatility === "EXTREME") return `${side} bermasalah — volatilitas ekstrem, stop bisa ter-slippage. Turunkan lot & pakai batas deviasi lebar.`;
  if (volatility === "COMPRESSED") return "Volatilitas terlalu tipis — harga sulit menutup biaya spread. Tunggu ekspansi.";
  const size = confidence >= 65 ? "agam" : confidence >= 40 ? "kecil" : "mini";
  const type = entryType === "RANGE_BOUNCE" ? "pantulan dari batas range" : entryType === "BREAKOUT" ? "breakout dengan volatilitas membesar" : entryType === "MOMENTUM" ? "momentum cepat" : "pullback ke EMA";
  return `${side} scalping ${size} —${atrNote}pola ${type}, entry setelah konfirmasi candle berikutnya, target 2-3x ATR, stop di luar level.`;
}

export function evaluateStrategies(candles: CandleInput[], regime: MarketRegime): StrategySignal[] {
  return [
    runTrendFollowing(candles, regime),
    runMeanReversion(candles, regime),
    runBreakout(candles, regime),
    runScalping(candles, regime),
  ];
}
