import type { CandleInput } from "./indicators";
import { atr, bollingerBands, ema, macd, rsi, sma } from "./indicators";
import type { Setup } from "./setups";
import type { StructureEvent } from "./structure";
import type { SupportResistanceLevel } from "./support-resistance";
import { computeConfluence, type ConfluenceResult } from "./confluence";
import { isScalpingTimeframe, signalActionThreshold, SIGNAL_ACTION_THRESHOLD_DEFAULT } from "./strictness";

export type TradingSignal = {
  action: "BUY" | "SELL" | "WAIT";
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  entryZone: { low: number; high: number } | null;
  stopLoss: number | null;
  targets: number[];
  riskReward: number | null;
  reasons: string[];
  warnings: string[];
  confluence?: ConfluenceResult;
};

export function generateTradingSignal(input: {
  candles: CandleInput[];
  setup: Setup | null;
  structure: StructureEvent[];
  supportResistance: SupportResistanceLevel[];
  spread?: { points: number | null; point?: number | null } | null;
  date?: Date;
  timeframe?: string | null;
}): TradingSignal {
  const { candles, setup, structure, supportResistance, timeframe } = input;
  const close = candles.at(-1)?.close ?? null;
  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const bollinger = bollingerBands(closes, 20, 2);
  const macdState = macd(closes);
  const support = supportResistance.find((level) => level.type === "support");
  const resistance = supportResistance.find((level) => level.type === "resistance");
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!close || candles.length < 30) {
    return emptySignal("Need more candle history before issuing a signal");
  }

  const confluence = computeConfluence(candles, { spread: input.spread ?? null, date: input.date });
  let longScore = 0;
  let shortScore = 0;

  const cDir = confluence.direction;
  const cConf = confluence.confidence;
  if (cDir === "LONG") longScore += Math.round(cConf * 0.4);
  else if (cDir === "SHORT") shortScore += Math.round(cConf * 0.4);

  if (confluence.factors.length > 0) {
    reasons.push(`Confluence engine: ${confluence.direction} at ${confluence.confidence}% confidence`);
  }
  if (confluence.regime.regimeLabel) {
    reasons.push(`Market regime: ${confluence.regime.regimeLabel}`);
  }
  if (confluence.patterns.length > 0) {
    const topPat = confluence.patterns.sort((a, b) => b.strength - a.strength).slice(0, 2);
    for (const p of topPat) {
      reasons.push(`Pattern: ${p.name} (${p.bias}, strength ${p.strength})`);
    }
  }

  if (ema20 && ema50) {
    if (close > ema20 && ema20 > ema50) {
      longScore += 20;
      reasons.push("Price above EMA20 > SMA50 - bullish trend alignment");
    } else if (close < ema20 && ema20 < ema50) {
      shortScore += 20;
      reasons.push("Price below EMA20 < SMA50 - bearish trend alignment");
    } else {
      warnings.push("Trend averages are mixed - no clear directional alignment");
    }
  }

  if (macdState) {
    if (macdState.macd > macdState.signal && macdState.histogram > 0) {
      longScore += 12;
      reasons.push("MACD bullish crossover with positive histogram");
    } else if (macdState.macd < macdState.signal && macdState.histogram < 0) {
      shortScore += 12;
      reasons.push("MACD bearish crossover with negative histogram");
    } else {
      warnings.push("MACD signal is neutral or transitioning");
    }
  }

  if (bollinger) {
    if (close <= bollinger.lower) {
      longScore += 8;
      reasons.push("Price at Bollinger lower band - potential mean reversion long");
    } else if (close >= bollinger.upper) {
      shortScore += 8;
      reasons.push("Price at Bollinger upper band - potential mean reversion short");
    }
  }

  if (rsi14 !== null) {
    if (rsi14 >= 45 && rsi14 <= 68) longScore += 10;
    else if (rsi14 >= 32 && rsi14 <= 55) shortScore += 10;
    else if (rsi14 > 75) { shortScore += 5; warnings.push("RSI overbought - avoid chasing longs"); }
    else if (rsi14 < 25) { longScore += 5; warnings.push("RSI oversold - avoid chasing shorts"); }
  }

  const recentStructure = structure.slice(-5);
  const bullishStructure = recentStructure.some((event) => event.type === "Higher High" || event.type === "Higher Low");
  const bearishStructure = recentStructure.some((event) => event.type === "Lower High" || event.type === "Lower Low");
  if (bullishStructure) { longScore += 15; reasons.push("Bullish market structure detected"); }
  if (bearishStructure) { shortScore += 15; reasons.push("Bearish market structure detected"); }

  if (setup?.direction === "LONG") longScore += Math.min(setup.score, 20);
  if (setup?.direction === "SHORT") shortScore += Math.min(setup.score, 20);

  if (support && close > support.price) { longScore += 8; reasons.push("Trading above support level"); }
  if (resistance && close < resistance.price) { shortScore += 8; reasons.push("Trading below resistance level"); }

  // ==================== Advanced Pattern Intelligence Reasons ====================
  const advFactors = confluence.factors.filter((f) => ["Structure Break", "Trendline", "RSI Divergence", "MACD Divergence", "Harmonic Pattern", "Momentum Velocity", "SR Zone", "Strategy Vote", "Backtest Edge"].includes(f.name));
  for (const f of advFactors) {
    if (f.score > 0) reasons.push(`${f.name}: ${f.detail}`);
    if (f.name === "Momentum Velocity" && f.direction === "NEUTRAL" && f.detail.includes("reversing")) {
      warnings.push("Momentum is reversing - potential trend change imminent");
    }
    if (f.name.includes("Divergence") && f.score > 0) {
      reasons.push(`Advanced: ${f.detail}`);
    }
  }
  // ==================== End Advanced Reasons ====================

  const volume = candles.at(-1)?.volume ?? null;
  const avgVol = candles.length >= 20 ? candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20 : null;
  if (volume && avgVol && volume > avgVol * 1.3) {
    reasons.push(`Volume surge detected (${(volume / avgVol).toFixed(2)}x average)`);
  }

  const bias = longScore > shortScore + 10 ? "LONG" : shortScore > longScore + 10 ? "SHORT" : "NEUTRAL";
  const totalScore = Math.max(longScore, shortScore);
  const confidence = Math.min(100, totalScore);
  const actionThreshold = signalActionThreshold(timeframe);
  const action = confidence >= actionThreshold && bias === "LONG" ? "BUY" : confidence >= actionThreshold && bias === "SHORT" ? "SELL" : "WAIT";

  const entryZone = buildEntryZone(action, close, support, resistance, atr14);
  const stopLoss = buildStopLoss(action, close, support, resistance, atr14);
  const targets = buildTargets(action, close, support, resistance, atr14);
  const riskReward = stopLoss && targets[0] ? Math.abs((targets[0] - close) / Math.max(Math.abs(close - stopLoss), 0.000001)) : null;

  if (riskReward !== null && riskReward < 1.5) warnings.push(`Risk/reward below 1.5R (${riskReward.toFixed(2)}R)`);
  if (action === "WAIT") warnings.push("No high-confidence directional edge - WAIT recommended");
  if (isScalpingTimeframe(timeframe) && action === "WAIT" && confidence >= SIGNAL_ACTION_THRESHOLD_DEFAULT && confidence < actionThreshold) {
    warnings.push(`Analisis scalping ${timeframe} diperketat: confidence ${confidence} < ambang ${actionThreshold} — WAIT.`);
  }
  if (Math.abs(longScore - shortScore) <= 10) warnings.push("Scores are too close - no strong directional conviction");
  if (confluence.regime.volatility === "COMPRESSED") warnings.push("Volatility is compressed - breakout imminent, consider waiting");
  if (confluence.regime.volatility === "EXTREME") warnings.push("Volatility is extreme - higher slippage and wider stops expected");

  return { action, bias, confidence, entryZone, stopLoss, targets, riskReward, reasons: reasons.slice(0, 8), warnings, confluence };
}

function emptySignal(reason: string): TradingSignal {
  return { action: "WAIT", bias: "NEUTRAL", confidence: 0, entryZone: null, stopLoss: null, targets: [], riskReward: null, reasons: [], warnings: [reason] };
}

function buildEntryZone(action: TradingSignal["action"], close: number, support: SupportResistanceLevel | undefined, resistance: SupportResistanceLevel | undefined, atr14: number | null) {
  const buffer = atr14 ? atr14 * 0.25 : close * 0.002;
  if (action === "BUY") {
    const anchor = support?.price && support.price < close ? Math.max(support.price, close - buffer) : close - buffer;
    return { low: anchor, high: close };
  }

  if (action === "SELL") {
    const anchor = resistance?.price && resistance.price > close ? Math.min(resistance.price, close + buffer) : close + buffer;
    return { low: close, high: anchor };
  }

  return null;
}

function buildStopLoss(action: TradingSignal["action"], close: number, support: SupportResistanceLevel | undefined, resistance: SupportResistanceLevel | undefined, atr14: number | null) {
  const buffer = atr14 ? atr14 * 0.75 : close * 0.005;
  if (action === "BUY") return support?.price ? support.price - buffer : close - buffer;
  if (action === "SELL") return resistance?.price ? resistance.price + buffer : close + buffer;
  return null;
}

function buildTargets(action: TradingSignal["action"], close: number, support: SupportResistanceLevel | undefined, resistance: SupportResistanceLevel | undefined, atr14: number | null) {
  const range = atr14 ?? close * 0.01;
  if (action === "BUY") return [resistance?.price && resistance.price > close ? resistance.price : close + range * 2, close + range * 3];
  if (action === "SELL") return [support?.price && support.price < close ? support.price : close - range * 2, close - range * 3];
  return [];
}
