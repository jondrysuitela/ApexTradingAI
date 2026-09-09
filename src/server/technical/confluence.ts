import type { CandleInput } from "./indicators";
import { adx, atr, atrPercentile, bollingerBands, ema, emaSlope, macd, rsi, stochastic } from "./indicators";
import { detectCandlePatterns, scorePatterns } from "./patterns";
import { detectStructure } from "./structure";
import { detectSupportResistance } from "./support-resistance";
import { detectBOSAndChoCH, detectTrendlines, detectDivergence } from "./advanced-structure";
import { detectSRZones } from "./sr-zones";
import { detectHarmonics } from "./harmonic";
import { analyzeMomentum } from "./momentum";
import { voteOnStrategies, type StrategyVote } from "./strategy-vote";
import { backtestConfluenceEdges, type StrategyBacktest } from "./backtest";
import { readScalping, type ScalpingRead } from "./strategies";
import { getMarketSession } from "./sessions";
import { sessionVwap, type VwapRead } from "./vwap";
import { sessionVolumeProfile, priceZoneOf, type VolumeProfile } from "./volume-profile";
import { analyzeOrderFlow, type OrderFlowRead } from "./order-flow";
import { detectFvgs, detectLiquiditySweeps, detectOrderBlocks, type Fvg, type LiquiditySweep, type OrderBlock } from "./liquidity";
import { fibonacciLevels, type FibonacciRead } from "./fibonacci";
import { learnStrategyWeights, learningWeightsLookup, type StrategyLearnStats } from "./learning-loop";

export type ConfluenceFactor = {
  name: string;
  weight: number;
  score: number;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  detail: string;
};

export type VolatilityRegime = "COMPRESSED" | "NORMAL" | "EXPANDED" | "EXTREME";

export type MarketRegime = {
  trend: "STRONG_UP" | "UP" | "RANGING" | "DOWN" | "STRONG_DOWN";
  volatility: VolatilityRegime;
  momentum: "ACCELERATING" | "STEADY" | "DECELERATING" | "REVERSING";
  regimeLabel: string;
};

export type OrderFlowConfluence = {
  vwap: VwapRead;
  volumeProfile: VolumeProfile | null;
  delta: {
    buyVolume: number;
    sellVolume: number;
    totalVolume: number;
    imbalance: number;
    cvd: number;
    cvdDirection: OrderFlowRead["cvdDirection"];
    aggressiveMomentum: OrderFlowRead["aggressiveMomentum"];
  } | null;
  sweeps: LiquiditySweep[];
  fvgs: Fvg[];
  orderBlocks: OrderBlock[];
  fib: FibonacciRead | null;
};

export type ConfluenceResult = {
  score: number;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  factors: ConfluenceFactor[];
  regime: MarketRegime;
  patterns: ReturnType<typeof detectCandlePatterns>;
  narrative: string;
  strategyVote: StrategyVote;
  backtest: StrategyBacktest;
  scalping: ScalpingRead;
  orderFlow: OrderFlowConfluence;
  learning: StrategyLearnStats[];
};

export type ConfluenceOptions = {
  includeBacktest?: boolean;
  spread?: { points: number | null; point?: number | null } | null;
  date?: Date;
};

export function computeConfluence(candles: CandleInput[], options: ConfluenceOptions = {}): ConfluenceResult {
  if (candles.length < 30) {
    return emptyConfluence("Insufficient candle data for analysis");
  }

  const { includeBacktest = true } = options;

  const closes = candles.map((c) => c.close);
  const last = candles.at(-1)!;
  const close = last.close;
  const factors: ConfluenceFactor[] = [];

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const bb = bollingerBands(closes, 20, 2);
  const macdState = macd(closes);
  const adxState = adx(candles, 14);
  const stoch = stochastic(candles, 14, 3);
  const ema20Slope = emaSlope(closes, 20);
  const atrPct = atrPercentile(candles, 14, 100);
  const patterns = detectCandlePatterns(candles);
  const patternScore = scorePatterns(patterns);
  const structure = detectStructure(candles, "primary");
  const srLevels = detectSupportResistance(candles, "primary");

  const regime = detectRegime(closes, candles, ema20, ema50, rsi14, atrPct, adxState, ema20Slope, macdState);

  let longScore = 0;
  let shortScore = 0;

  if (ema20 && ema50) {
    if (close > ema20 && ema20 > ema50) {
      const diff = ((ema20 - ema50) / ema50) * 100;
      const weight = Math.min(30, 15 + diff * 10);
      longScore += weight;
      factors.push({ name: "EMA Stack", weight: 30, score: weight, direction: "LONG", detail: `Price > EMA20 > EMA50 (spread ${diff.toFixed(3)}%)` });
    } else if (close < ema20 && ema20 < ema50) {
      const diff = ((ema50 - ema20) / ema50) * 100;
      const weight = Math.min(30, 15 + diff * 10);
      shortScore += weight;
      factors.push({ name: "EMA Stack", weight: 30, score: weight, direction: "SHORT", detail: `Price < EMA20 < EMA50 (spread ${diff.toFixed(3)}%)` });
    } else {
      factors.push({ name: "EMA Stack", weight: 30, score: 0, direction: "NEUTRAL", detail: "EMA alignment is mixed" });
    }
  }

  if (ema20Slope !== null) {
    if (ema20Slope > 2) {
      longScore += 10;
      factors.push({ name: "EMA Slope", weight: 10, score: 10, direction: "LONG", detail: `EMA20 slope is positive at ${ema20Slope.toFixed(2)} bps` });
    } else if (ema20Slope < -2) {
      shortScore += 10;
      factors.push({ name: "EMA Slope", weight: 10, score: 10, direction: "SHORT", detail: `EMA20 slope is negative at ${ema20Slope.toFixed(2)} bps` });
    } else {
      factors.push({ name: "EMA Slope", weight: 10, score: 0, direction: "NEUTRAL", detail: `EMA20 slope is flat at ${ema20Slope.toFixed(2)} bps` });
    }
  }

  if (adxState) {
    const trendStrength = adxState.adx;
    const dirBonus = trendStrength > 20 ? Math.min(20, trendStrength / 2) : 0;
    if (adxState.plusDi > adxState.minusDi && trendStrength > 20) {
      longScore += dirBonus;
      factors.push({ name: "ADX Trend", weight: 20, score: dirBonus, direction: "LONG", detail: `ADX ${trendStrength.toFixed(1)} with +DI > -DI (strong bullish trend)` });
    } else if (adxState.minusDi > adxState.plusDi && trendStrength > 20) {
      shortScore += dirBonus;
      factors.push({ name: "ADX Trend", weight: 20, score: dirBonus, direction: "SHORT", detail: `ADX ${trendStrength.toFixed(1)} with -DI > +DI (strong bearish trend)` });
    } else {
      factors.push({ name: "ADX Trend", weight: 20, score: 0, direction: "NEUTRAL", detail: `ADX ${trendStrength.toFixed(1)} (weak or no directional trend)` });
    }
  }

  if (rsi14 !== null) {
    if (rsi14 >= 50 && rsi14 <= 70) {
      longScore += 12;
      factors.push({ name: "RSI", weight: 15, score: 12, direction: "LONG", detail: `RSI ${rsi14.toFixed(1)} - bullish momentum zone` });
    } else if (rsi14 >= 30 && rsi14 < 50) {
      shortScore += 12;
      factors.push({ name: "RSI", weight: 15, score: 12, direction: "SHORT", detail: `RSI ${rsi14.toFixed(1)} - bearish momentum zone` });
    } else if (rsi14 > 70) {
      shortScore += 8;
      factors.push({ name: "RSI", weight: 15, score: 8, direction: "SHORT", detail: `RSI ${rsi14.toFixed(1)} - overbought, potential reversal` });
    } else if (rsi14 < 30) {
      longScore += 8;
      factors.push({ name: "RSI", weight: 15, score: 8, direction: "LONG", detail: `RSI ${rsi14.toFixed(1)} - oversold, potential bounce` });
    } else {
      factors.push({ name: "RSI", weight: 15, score: 0, direction: "NEUTRAL", detail: `RSI ${rsi14.toFixed(1)} - neutral` });
    }
  }

  if (macdState) {
    if (macdState.macd > macdState.signal && macdState.histogram > 0) {
      const strength = Math.min(15, Math.abs(macdState.histogram) > Math.abs(macdState.signal) * 0.5 ? 15 : 8);
      longScore += strength;
      factors.push({ name: "MACD", weight: 15, score: strength, direction: "LONG", detail: `MACD bullish (histogram ${macdState.histogram.toFixed(5)})` });
    } else if (macdState.macd < macdState.signal && macdState.histogram < 0) {
      const strength = Math.min(15, Math.abs(macdState.histogram) > Math.abs(macdState.signal) * 0.5 ? 15 : 8);
      shortScore += strength;
      factors.push({ name: "MACD", weight: 15, score: strength, direction: "SHORT", detail: `MACD bearish (histogram ${macdState.histogram.toFixed(5)})` });
    } else {
      factors.push({ name: "MACD", weight: 15, score: 0, direction: "NEUTRAL", detail: "MACD signal is mixed" });
    }
  }

  if (bb) {
    const bbPos = (close - bb.lower) / (bb.upper - bb.lower);
    if (bbPos < 0.2) {
      longScore += 10;
      factors.push({ name: "Bollinger Bands", weight: 10, score: 10, direction: "LONG", detail: `Price near lower band (position ${(bbPos * 100).toFixed(0)}%)` });
    } else if (bbPos > 0.8) {
      shortScore += 10;
      factors.push({ name: "Bollinger Bands", weight: 10, score: 10, direction: "SHORT", detail: `Price near upper band (position ${(bbPos * 100).toFixed(0)}%)` });
    } else {
      factors.push({ name: "Bollinger Bands", weight: 10, score: 0, direction: "NEUTRAL", detail: `Price in middle zone (position ${(bbPos * 100).toFixed(0)}%)` });
    }
  }

  if (stoch) {
    if (stoch.k < 20 && stoch.d < 20) {
      longScore += 8;
      factors.push({ name: "Stochastic", weight: 8, score: 8, direction: "LONG", detail: `Stochastic oversold (K=${stoch.k.toFixed(1)}, D=${stoch.d.toFixed(1)})` });
    } else if (stoch.k > 80 && stoch.d > 80) {
      shortScore += 8;
      factors.push({ name: "Stochastic", weight: 8, score: 8, direction: "SHORT", detail: `Stochastic overbought (K=${stoch.k.toFixed(1)}, D=${stoch.d.toFixed(1)})` });
    } else {
      factors.push({ name: "Stochastic", weight: 8, score: 0, direction: "NEUTRAL", detail: `Stochastic neutral (K=${stoch.k.toFixed(1)}, D=${stoch.d.toFixed(1)})` });
    }
  }

  longScore += patternScore.longBonus;
  shortScore += patternScore.shortBonus;
  if (patternScore.topPatterns.length > 0) {
    const dominant = patternScore.longBonus > patternScore.shortBonus ? "LONG" : patternScore.shortBonus > patternScore.longBonus ? "SHORT" : "NEUTRAL";
    factors.push({ name: "Candle Patterns", weight: 15, score: Math.max(patternScore.longBonus, patternScore.shortBonus), direction: dominant, detail: patternScore.topPatterns.join("; ") });
  }

  const recentStructure = structure.slice(-5);
  const bullStruct = recentStructure.some((e) => e.type === "Higher High" || e.type === "Higher Low");
  const bearStruct = recentStructure.some((e) => e.type === "Lower High" || e.type === "Lower Low");
  if (bullStruct && !bearStruct) {
    longScore += 12;
    factors.push({ name: "Market Structure", weight: 12, score: 12, direction: "LONG", detail: "Bullish structure (Higher Highs/Lows)" });
  } else if (bearStruct && !bullStruct) {
    shortScore += 12;
    factors.push({ name: "Market Structure", weight: 12, score: 12, direction: "SHORT", detail: "Bearish structure (Lower Highs/Lows)" });
  } else if (bullStruct && bearStruct) {
    factors.push({ name: "Market Structure", weight: 12, score: 0, direction: "NEUTRAL", detail: "Conflicting structure signals" });
  }

  const support = srLevels.find((l) => l.type === "support" && l.distanceFromCurrentPrice / close < 0.01);
  const resistance = srLevels.find((l) => l.type === "resistance" && l.distanceFromCurrentPrice / close < 0.01);
  if (support && close > support.price) {
    longScore += 8;
    factors.push({ name: "S/R Proximity", weight: 8, score: 8, direction: "LONG", detail: `Trading above support at ${support.price.toFixed(5)}` });
  }
  if (resistance && close < resistance.price) {
    shortScore += 8;
    factors.push({ name: "S/R Proximity", weight: 8, score: 8, direction: "SHORT", detail: `Trading below resistance at ${resistance.price.toFixed(5)}` });
  }

  // ==================== Advanced Pattern Intelligence ====================

  // BOS / ChoCH / Range break detection
  const structureBreaks = detectBOSAndChoCH(candles);
  if (structureBreaks.length > 0) {
    const lastBreak = structureBreaks.at(-1)!;
    const factorScore = Math.min(20, lastBreak.strength);
    if (lastBreak.direction === "LONG") {
      longScore += factorScore;
      factors.push({ name: "Structure Break", weight: 20, score: factorScore, direction: "LONG", detail: `${lastBreak.type} detected at ${lastBreak.price.toFixed(5)} - bullish structure break` });
    } else if (lastBreak.direction === "SHORT") {
      shortScore += factorScore;
      factors.push({ name: "Structure Break", weight: 20, score: factorScore, direction: "SHORT", detail: `${lastBreak.type} detected at ${lastBreak.price.toFixed(5)} - bearish structure break` });
    }
  }

  // Trendline proximity
  const trendlines = detectTrendlines(candles);
  const ascendingTrendline = trendlines.find((t) => t.direction === "UP");
  const descendingTrendline = trendlines.find((t) => t.direction === "DOWN");
  if (ascendingTrendline && ascendingTrendline.touches >= 2) {
    longScore += 10;
    factors.push({ name: "Trendline", weight: 10, score: 10, direction: "LONG", detail: `Ascending trendline with ${ascendingTrendline.touches} touches - dynamic support` });
  }
  if (descendingTrendline && descendingTrendline.touches >= 2) {
    shortScore += 10;
    factors.push({ name: "Trendline", weight: 10, score: 10, direction: "SHORT", detail: `Descending trendline with ${descendingTrendline.touches} touches - dynamic resistance` });
  }

  // RSI divergence
  const rsiDiv = detectDivergence(candles, (c) => c.close, (_i) => rsi(candles.map((c) => c.close), 14));
  if (rsiDiv === "BULLISH") {
    longScore += 15;
    factors.push({ name: "RSI Divergence", weight: 15, score: 15, direction: "LONG", detail: "Bullish RSI divergence - price making lower lows but RSI making higher lows" });
  } else if (rsiDiv === "BEARISH") {
    shortScore += 15;
    factors.push({ name: "RSI Divergence", weight: 15, score: 15, direction: "SHORT", detail: "Bearish RSI divergence - price making higher highs but RSI making lower highs" });
  }

  // MACD divergence
  const macdDiv = detectDivergence(candles, (c) => c.close, (index) => {
    const ema12 = ema(closes.slice(0, index + 1), 12);
    const ema26 = ema(closes.slice(0, index + 1), 26);
    return ema12 && ema26 ? ema12 - ema26 : null;
  });
  if (macdDiv === "BULLISH") {
    longScore += 12;
    factors.push({ name: "MACD Divergence", weight: 12, score: 12, direction: "LONG", detail: "Bullish MACD divergence - momentum shifting bullish" });
  } else if (macdDiv === "BEARISH") {
    shortScore += 12;
    factors.push({ name: "MACD Divergence", weight: 12, score: 12, direction: "SHORT", detail: "Bearish MACD divergence - momentum shifting bearish" });
  }

  // Advanced S/R zones (clustering, role flips)
  const srZones = detectSRZones(candles, "primary");
  const nearSupport = srZones.find((z) => z.type === "support" && Math.abs(z.center - close) / close < 0.005);
  const nearResistance = srZones.find((z) => z.type === "resistance" && Math.abs(z.center - close) / close < 0.005);
  if (nearSupport && close > nearSupport.center) {
    const zoneBonus = Math.min(12, nearSupport.touchCount * 4 + (nearSupport.roleFlip ? 4 : 0));
    longScore += zoneBonus;
    factors.push({ name: "SR Zone", weight: 12, score: zoneBonus, direction: "LONG", detail: `Strong support zone ${nearSupport.center.toFixed(5)} (${nearSupport.touchCount} touches${nearSupport.roleFlip ? ", role flip" : ""})` });
  }
  if (nearResistance && close < nearResistance.center) {
    const zoneBonus = Math.min(12, nearResistance.touchCount * 4 + (nearResistance.roleFlip ? 4 : 0));
    shortScore += zoneBonus;
    factors.push({ name: "SR Zone", weight: 12, score: zoneBonus, direction: "SHORT", detail: `Strong resistance zone ${nearResistance.center.toFixed(5)} (${nearResistance.touchCount} touches${nearResistance.roleFlip ? ", role flip" : ""})` });
  }

  // Harmonic patterns
  const harmonics = detectHarmonics(candles);
  if (harmonics.length > 0) {
    const bestHarmonic = harmonics[0];
    const factorScore = Math.min(15, bestHarmonic.quality);
    if (bestHarmonic.direction === "LONG") {
      longScore += factorScore;
      factors.push({ name: "Harmonic Pattern", weight: 15, score: factorScore, direction: "LONG", detail: `${bestHarmonic.type} pattern detected - entry zone ${bestHarmonic.entry.toFixed(5)}` });
    } else if (bestHarmonic.direction === "SHORT") {
      shortScore += factorScore;
      factors.push({ name: "Harmonic Pattern", weight: 15, score: factorScore, direction: "SHORT", detail: `${bestHarmonic.type} pattern detected - entry zone ${bestHarmonic.entry.toFixed(5)}` });
    }
  }

  // Momentum velocity
  const momentumState = analyzeMomentum(candles);
  if (momentumState.velocity === "ACCELERATING" && momentumState.direction !== "NEUTRAL") {
    const velocityBonus = Math.min(15, momentumState.velocityScore);
    if (momentumState.direction === "LONG") {
      longScore += velocityBonus;
      factors.push({ name: "Momentum Velocity", weight: 15, score: velocityBonus, direction: "LONG", detail: `Momentum accelerating LONG (ROC5=${momentumState.roc5 !== null ? momentumState.roc5.toFixed(2) : "n/a"}%, ROC20=${momentumState.roc20 !== null ? momentumState.roc20.toFixed(2) : "n/a"}%)` });
    } else if (momentumState.direction === "SHORT") {
      shortScore += velocityBonus;
      factors.push({ name: "Momentum Velocity", weight: 15, score: velocityBonus, direction: "SHORT", detail: `Momentum accelerating SHORT (ROC5=${momentumState.roc5 !== null ? momentumState.roc5.toFixed(2) : "n/a"}%, ROC20=${momentumState.roc20 !== null ? momentumState.roc20.toFixed(2) : "n/a"}%)` });
    }
  }
  if (momentumState.velocity === "REVERSING") {
    factors.push({ name: "Momentum Velocity", weight: 15, score: 0, direction: "NEUTRAL", detail: `Momentum reversing: ${momentumState.detail}` });
  }

  // ==================== End Advanced Intelligence ====================

  // ==================== Order Flow & Volume Intelligence ====================

  const vwap = sessionVwap(candles);
  if (vwap.vwap !== null) {
    if (vwap.position === "ABOVE_1") {
      longScore += 9;
      factors.push({ name: "VWAP", weight: 10, score: 9, direction: "LONG", detail: `Price di atas VWAP +1σ (${vwap.deviationPct!.toFixed(3)}%) — buyer menguasai sesi` });
    } else if (vwap.position === "BELOW_1") {
      shortScore += 9;
      factors.push({ name: "VWAP", weight: 10, score: 9, direction: "SHORT", detail: `Price di bawah VWAP -1σ (${vwap.deviationPct!.toFixed(3)}%) — seller menguasai sesi` });
    } else if (vwap.position === "ABOVE_2") {
      shortScore += 7;
      factors.push({ name: "VWAP", weight: 10, score: 7, direction: "SHORT", detail: `Price ekstrem di atas VWAP +2σ — overextended, koreksi berpeluang` });
    } else if (vwap.position === "BELOW_2") {
      longScore += 7;
      factors.push({ name: "VWAP", weight: 10, score: 7, direction: "LONG", detail: `Price ekstrem di bawah VWAP -2σ — overextended, rebound berpeluang` });
    } else {
      factors.push({ name: "VWAP", weight: 10, score: 0, direction: "NEUTRAL", detail: "Price dekat VWAP — sesi seimbang" });
    }
  }

  const volumeProfile = sessionVolumeProfile(candles);
  if (volumeProfile) {
    const zone = priceZoneOf(close, volumeProfile);
    if (zone === "ABOVE_VAH") {
      longScore += 6;
      factors.push({ name: "Volume Profile", weight: 8, score: 6, direction: "LONG", detail: `Price di atas VAH ${volumeProfile.vah.toFixed(5)} — acceptance lanjutan` });
    } else if (zone === "BELOW_VAL") {
      shortScore += 6;
      factors.push({ name: "Volume Profile", weight: 8, score: 6, direction: "SHORT", detail: `Price di bawah VAL ${volumeProfile.val.toFixed(5)} — rejection lanjutan` });
    } else {
      factors.push({ name: "Volume Profile", weight: 8, score: 0, direction: "NEUTRAL", detail: `Price dalam Value Area (POC ${volumeProfile.poc.toFixed(5)}, VAH ${volumeProfile.vah.toFixed(5)}, VAL ${volumeProfile.val.toFixed(5)})` });
    }
  }

  const orderFlow = analyzeOrderFlow(candles);
  if (orderFlow.totalVolume > 0) {
    const imbalance = orderFlow.imbalance;
    let flowScore = 0;
    let flowDirection: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    let flowDetail = `Delta ${imbalance >= 0 ? "+" : ""}${(imbalance * 100).toFixed(0)}% (beli ${orderFlow.buyVolume.toFixed(0)} vs jual ${orderFlow.sellVolume.toFixed(0)}), CVD ${orderFlow.cvdDirection}`;
    if (imbalance >= 0.4) {
      flowScore = 14;
      flowDirection = "LONG";
      flowDetail += " — agresif beli";
    } else if (imbalance >= 0.15) {
      flowScore = 8;
      flowDirection = "LONG";
      flowDetail += " — beli mendominasi";
    } else if (imbalance <= -0.4) {
      flowScore = 14;
      flowDirection = "SHORT";
      flowDetail += " — agresif jual";
    } else if (imbalance <= -0.15) {
      flowScore = 8;
      flowDirection = "SHORT";
      flowDetail += " — jual mendominasi";
    }
    if (orderFlow.aggressiveMomentum === "BULLISH" && flowDirection === "LONG") flowScore = Math.min(16, flowScore + 4);
    if (orderFlow.aggressiveMomentum === "BEARISH" && flowDirection === "SHORT") flowScore = Math.min(16, flowScore + 4);
    if (flowDirection === "LONG") longScore += flowScore;
    else if (flowDirection === "SHORT") shortScore += flowScore;
    factors.push({ name: "Order Flow", weight: 16, score: flowScore, direction: flowDirection, detail: flowDetail });
  }

  const sweeps = detectLiquiditySweeps(candles);
  if (sweeps.length > 0) {
    const lastSweep = sweeps[sweeps.length - 1];
    const sweepScore = Math.round(lastSweep.strength * 16);
    if (lastSweep.direction === "SHORT") {
      longScore += sweepScore;
      factors.push({ name: "Liquidity Sweep", weight: 18, score: sweepScore, direction: "LONG", detail: `Sweep likuiditas atas (${lastSweep.levelPrice.toFixed(5)}) ditolak — stop hunt SELL, pembalikan LONG` });
    } else if (lastSweep.direction === "LONG") {
      shortScore += sweepScore;
      factors.push({ name: "Liquidity Sweep", weight: 18, score: sweepScore, direction: "SHORT", detail: `Sweep likuiditas bawah (${lastSweep.levelPrice.toFixed(5)}) ditolak — stop hunt BUY, pembalikan SHORT` });
    }
  }

  const fvgs = detectFvgs(candles);
  const freshFvg = fvgs.filter((item) => item.fresh);
  if (freshFvg.length > 0) {
    const lastFvg = freshFvg[freshFvg.length - 1];
    if (lastFvg.direction === "BULLISH" && close >= lastFvg.bottom) {
      longScore += 8;
      factors.push({ name: "FVG", weight: 10, score: 8, direction: "LONG", detail: `Bullish FVG bermain (gap ${lastFvg.bottom.toFixed(5)} → ${lastFvg.top.toFixed(5)}) — imbalance demand` });
    } else if (lastFvg.direction === "BEARISH" && close <= lastFvg.top) {
      shortScore += 8;
      factors.push({ name: "FVG", weight: 10, score: 8, direction: "SHORT", detail: `Bearish FVG bermain (gap ${lastFvg.top.toFixed(5)} → ${lastFvg.bottom.toFixed(5)}) — imbalance supply` });
    }
  }

  const orderBlocks = detectOrderBlocks(candles);
  if (orderBlocks.length > 0) {
    const lastBlock = orderBlocks[orderBlocks.length - 1];
    if (lastBlock.direction === "BULLISH" && close >= lastBlock.low && close <= lastBlock.high * 1.005) {
      longScore += 8;
      factors.push({ name: "Order Block", weight: 10, score: 8, direction: "LONG", detail: `Kembali ke bullish order block (${lastBlock.low.toFixed(5)}-${lastBlock.high.toFixed(5)}) — demand zone` });
    } else if (lastBlock.direction === "BEARISH" && close <= lastBlock.high && close >= lastBlock.low * 0.995) {
      shortScore += 8;
      factors.push({ name: "Order Block", weight: 10, score: 8, direction: "SHORT", detail: `Kembali ke bearish order block (${lastBlock.low.toFixed(5)}-${lastBlock.high.toFixed(5)}) — supply zone` });
    }
  }

  const fib = fibonacciLevels(candles);
  if (fib?.nearest) {
    const { level, distancePct } = fib.nearest;
    const nearRetrace = level.kind === "RETRACE" && level.ratio >= 0.382 && level.ratio <= 0.618 && distancePct <= 0.25;
    if (fib.direction === "UP" && nearRetrace && close >= level.price) {
      longScore += 9;
      factors.push({ name: "Fibonacci", weight: 10, score: 9, direction: "LONG", detail: `Retracement ${(level.ratio * 100).toFixed(1)}% (${level.price.toFixed(5)}) memegang pullback — target lanjut naik` });
    } else if (fib.direction === "DOWN" && nearRetrace && close <= level.price) {
      shortScore += 9;
      factors.push({ name: "Fibonacci", weight: 10, score: 9, direction: "SHORT", detail: `Retracement ${(level.ratio * 100).toFixed(1)}% (${level.price.toFixed(5)}) menahan rebound — target lanjut turun` });
    }
  }

  // ==================== Multi-Strategy Vote (with Learning Loop) ====================
  const learning = learnStrategyWeights(candles);
  const strategyVote = voteOnStrategies(candles, regime, learningWeightsLookup(learning));
  if (strategyVote.totalWeight > 0) {
    const longShare = strategyVote.longWeight / strategyVote.totalWeight;
    const shortShare = strategyVote.shortWeight / strategyVote.totalWeight;
    const voteNet = longShare - shortShare;
    const voteFactorScore = Math.min(20, Math.abs(voteNet) * 40);
    if (voteNet > 0.1) {
      longScore += voteFactorScore;
      factors.push({
        name: "Strategy Vote",
        weight: 20,
        score: voteFactorScore,
        direction: "LONG",
        detail: `${strategyVote.agreeingCount}/${strategyVote.strategyCount} strategies agree LONG (top: ${strategyVote.topStrategy ?? "n/a"}) — ${strategyVote.detail}`,
      });
    } else if (voteNet < -0.1) {
      shortScore += voteFactorScore;
      factors.push({
        name: "Strategy Vote",
        weight: 20,
        score: voteFactorScore,
        direction: "SHORT",
        detail: `${strategyVote.agreeingCount}/${strategyVote.strategyCount} strategies agree SHORT (top: ${strategyVote.topStrategy ?? "n/a"}) — ${strategyVote.detail}`,
      });
    } else {
      factors.push({ name: "Strategy Vote", weight: 20, score: 0, direction: "NEUTRAL", detail: `Strategies disagree — ${strategyVote.detail}` });
    }
  }

  const learnedTop = [...learning].sort((a, b) => b.weight - a.weight)[0];
  if (learnedTop && learnedTop.samples >= 6 && Math.abs(learnedTop.weight - 1) > 0.2) {
    const learningScore = Math.min(12, Math.round(Math.abs(learnedTop.weight - 1) * 20));
    if (learnedTop.directionBias === "LONG" && learnedTop.weight > 1) {
      longScore += learningScore;
      factors.push({
        name: "Learning Loop",
        weight: 12,
        score: learningScore,
        direction: "LONG",
        detail: `${learnedTop.name} menunjukkan edge positif ${learnedTop.edge.toFixed(2)}R (win-rate ${learnedTop.winRate.toFixed(0)}%, n=${learnedTop.samples}) — bobot strategi dinaikkan x${learnedTop.weight.toFixed(2)}`,
      });
    } else if (learnedTop.directionBias === "SHORT" && learnedTop.weight > 1) {
      shortScore += learningScore;
      factors.push({
        name: "Learning Loop",
        weight: 12,
        score: learningScore,
        direction: "SHORT",
        detail: `${learnedTop.name} menunjukkan edge negatif ${learnedTop.edge.toFixed(2)}R (win-rate ${learnedTop.winRate.toFixed(0)}%, n=${learnedTop.samples}) — bobot strategi dinaikkan untuk arah SHORT x${learnedTop.weight.toFixed(2)}`,
      });
    }
  }

  // ==================== Backtest Edge ====================
  const backtest = includeBacktest ? backtestConfluenceEdges(candles, 120)
    : { winRate: null, avgProfitPct: null, avgLossPct: null, expectancyPct: null, totalSignals: 0, samples: [], edge: "INSUFFICIENT" as const };
  if (backtest.edge !== "INSUFFICIENT" && backtest.expectancyPct !== null) {
    const edgeFactorScore = Math.min(12, Math.abs(backtest.expectancyPct) * 100);
    const backtestDirection = backtest.expectancyPct > 0 ? "LONG" : "SHORT";
    if (backtestDirection === "LONG") {
      longScore += edgeFactorScore;
      factors.push({
        name: "Backtest Edge",
        weight: 12,
        score: edgeFactorScore,
        direction: "LONG",
        detail: `Historical edge positive (${backtest.winRate?.toFixed(0)}% win-rate, ${backtest.expectancyPct.toFixed(3)}% expectancy over ${backtest.totalSignals} signals)`,
      });
    } else {
      shortScore += edgeFactorScore;
      factors.push({
        name: "Backtest Edge",
        weight: 12,
        score: edgeFactorScore,
        direction: "SHORT",
        detail: `Historical edge negative (${backtest.winRate?.toFixed(0)}% win-rate, ${backtest.expectancyPct.toFixed(3)}% expectancy over ${backtest.totalSignals} signals)`,
      });
    }
  }

  const voted = longScore + shortScore;
  const longShare = voted > 0 ? longScore / voted : 0;
  const shortShare = voted > 0 ? shortScore / voted : 0;
  const netScore = (longShare - shortShare) * 100;
  const direction = netScore > 10 ? "LONG" : netScore < -10 ? "SHORT" : "NEUTRAL";
  const confidence = Math.min(100, Math.round(Math.max(longShare, shortShare) * 100));
  const score = Math.round(Math.abs(netScore));

  const scalping = readScalping(candles, regime, { spread: options.spread ?? null, date: options.date });

  const orderFlowData: OrderFlowConfluence = {
    vwap,
    volumeProfile,
    delta: orderFlow.totalVolume > 0 ? { buyVolume: orderFlow.buyVolume, sellVolume: orderFlow.sellVolume, totalVolume: orderFlow.totalVolume, imbalance: orderFlow.imbalance, cvd: orderFlow.cvd, cvdDirection: orderFlow.cvdDirection, aggressiveMomentum: orderFlow.aggressiveMomentum } : null,
    sweeps,
    fvgs,
    orderBlocks,
    fib,
  };

  const narrative = buildNarrative(direction, confidence, regime, factors, patterns, atr14, strategyVote, backtest, scalping, orderFlowData, learning);

  return { score, direction, confidence, factors, regime, patterns, narrative, strategyVote, backtest, scalping, orderFlow: orderFlowData, learning };
}

function emptyScalping(): ScalpingRead {
  return {
    direction: "NEUTRAL",
    confidence: 0,
    score: 0,
    reasoning: [],
    entryType: "NO_EDGE",
    volatility: "SCALPABLE",
    atrPercent: null,
    session: getMarketSession(),
    spread: { points: null, price: null, atrCoverPct: null, block: false, note: "Data spread tidak tersedia." },
    gated: false,
    suggestion: "Data tidak cukup untuk membaca kondisi scalping.",
  };
}

function detectRegime(
  closes: number[],
  candles: CandleInput[],
  ema20: number | null,
  ema50: number | null,
  rsi14: number | null,
  atrPct: number | null,
  adxState: ReturnType<typeof adx>,
  emaSlopeVal: number | null,
  macdState: ReturnType<typeof macd>,
): MarketRegime {
  let trend: MarketRegime["trend"] = "RANGING";
  if (ema20 && ema50) {
    if (adxState && adxState.adx > 25) {
      if (ema20 > ema50 && lastClose(closes) > ema20) trend = "STRONG_UP";
      else if (ema20 < ema50 && lastClose(closes) < ema20) trend = "STRONG_DOWN";
      else if (ema20 > ema50) trend = "UP";
      else trend = "DOWN";
    } else if (ema20 > ema50) trend = "UP";
    else if (ema20 < ema50) trend = "DOWN";
  }

  let volatility: VolatilityRegime = "NORMAL";
  if (atrPct !== null) {
    if (atrPct > 90) volatility = "EXTREME";
    else if (atrPct > 70) volatility = "EXPANDED";
    else if (atrPct < 25) volatility = "COMPRESSED";
  }

  let momentum: MarketRegime["momentum"] = "STEADY";
  if (emaSlopeVal !== null) {
    if (Math.abs(emaSlopeVal) > 5) momentum = "ACCELERATING";
    else if (Math.abs(emaSlopeVal) < 1) momentum = "DECELERATING";
  }
  if (macdState) {
    const histChange = macdState.histogram;
    if (Math.abs(histChange) > Math.abs(macdState.signal) * 0.8) momentum = "ACCELERATING";
  }

  const trendLabel = trend.replace("_", " ");
  const regimeLabel = `${trendLabel} trend, ${volatility.toLowerCase()} volatility, ${momentum.toLowerCase()} momentum`;

  return { trend, volatility, momentum, regimeLabel };
}

function lastClose(closes: number[]): number {
  return closes.at(-1) ?? 0;
}

function buildNarrative(
  direction: "LONG" | "SHORT" | "NEUTRAL",
  confidence: number,
  regime: MarketRegime,
  factors: ConfluenceFactor[],
  patterns: ReturnType<typeof detectCandlePatterns>,
  atr14: number | null,
  strategyVote: StrategyVote,
  backtest: StrategyBacktest,
  scalping: ScalpingRead,
  orderFlow: Pick<OrderFlowConfluence, "vwap" | "volumeProfile" | "delta">,
  learning: StrategyLearnStats[],
): string {
  const dir = direction === "LONG" ? "bullish" : direction === "SHORT" ? "bearish" : "neutral";
  const trend = regime.trend === "STRONG_UP" || regime.trend === "UP" ? "uptrend" : regime.trend === "STRONG_DOWN" || regime.trend === "DOWN" ? "downtrend" : "ranging market";

  const topFactors = [...factors].sort((a, b) => b.score - a.score).filter((f) => f.score > 0).slice(0, 5);
  const factorText = topFactors.length > 0 ? `Key drivers: ${topFactors.map((f) => f.detail).join("; ")}.` : "";

  const patternText = patterns.length > 0 ? `Candle patterns: ${patterns.map((p) => p.name).join(", ")}.` : "";

  const atrText = atr14 ? `ATR ${atr14.toFixed(5)} (volatility ${regime.volatility.toLowerCase()}).` : "";

  const advancedFactors = factors.filter((f) => ["Structure Break", "Trendline", "RSI Divergence", "MACD Divergence", "Harmonic Pattern", "Momentum Velocity"].includes(f.name) && f.score > 0);
  const advancedText = advancedFactors.length > 0 ? `Advanced: ${advancedFactors.map((f) => f.detail).join("; ")}.` : "";

  const strategyText = strategyVote.totalWeight > 0
    ? `Strategy consensus: ${strategyVote.agreeingCount}/${strategyVote.strategyCount} of the ${strategyVote.detail} strategies align (lead: ${strategyVote.topStrategy ?? "none"}).`
    : "";

  const backtestText = backtest.edge !== "INSUFFICIENT" && backtest.expectancyPct !== null
    ? `Backtested edge: ${backtest.winRate?.toFixed(0)}% win-rate, ${backtest.expectancyPct.toFixed(3)}% expectancy across ${backtest.totalSignals} simulated signals (${backtest.edge.toLowerCase()}).`
    : "";

  const scalpingText = scalping.entryType !== "NO_EDGE" && scalping.direction !== "NEUTRAL"
    ? `Scalping read: ${scalping.direction} (${scalping.entryType}, ${scalping.confidence}/100, volatility ${scalping.volatility.toLowerCase()}). ${scalping.suggestion}`
    : `Scalping read: no short-term edge (${scalping.volatility.toLowerCase()} volatility).`;

  const vwapText = orderFlow.vwap.vwap !== null
    ? `VWAP ${orderFlow.vwap.vwap.toFixed(5)} (price ${orderFlow.vwap.position.replace("_", " ")}).`
    : "";
  const profileText = orderFlow.volumeProfile
    ? `Volume profile: POC ${orderFlow.volumeProfile.poc.toFixed(5)}, VA ${orderFlow.volumeProfile.val.toFixed(3)}-${orderFlow.volumeProfile.vah.toFixed(3)} (${orderFlow.volumeProfile.valueAreaPct.toFixed(0)}% of volume).`
    : "";
  const deltaText = orderFlow.delta
    ? `Order flow delta ${orderFlow.delta.imbalance >= 0 ? "+" : ""}${(orderFlow.delta.imbalance * 100).toFixed(0)}% ${orderFlow.delta.cvdDirection} (agg momentum ${orderFlow.delta.aggressiveMomentum.toLowerCase()}).`
    : "";

  const learnedText = learning.filter((item) => item.samples >= 6 && Math.abs(item.weight - 1) > 0.2);
  const learningText = learnedText.length > 0
    ? `Learning loop: ${learnedText.map((item) => `${item.name} ${item.edge >= 0 ? "+" : ""}${item.edge.toFixed(2)}R x${item.weight.toFixed(2)}`).join(", ")}.`
    : "";

  const confidenceLabel = confidence >= 70 ? "high" : confidence >= 50 ? "moderate" : "low";

  return `The market is in a ${trend} with ${dir} confluence at ${confidenceLabel} confidence (${confidence}/100). ${factorText} ${patternText} ${advancedText} ${strategyText} ${backtestText} ${scalpingText} ${vwapText} ${profileText} ${deltaText} ${learningText} ${atrText} Net directional bias suggests ${direction === "NEUTRAL" ? "waiting for clearer signals" : `${dir} positioning`}.`;
}

function emptyConfluence(reason: string): ConfluenceResult {
  const emptyVwap: VwapRead = {
    vwap: null,
    upper1: null,
    lower1: null,
    upper2: null,
    lower2: null,
    standardDeviation: null,
    deviationFromVwap: null,
    deviationPct: null,
    position: "UNKNOWN",
  };
  return {
    score: 0,
    direction: "NEUTRAL",
    confidence: 0,
    factors: [],
    regime: { trend: "RANGING", volatility: "NORMAL", momentum: "STEADY", regimeLabel: "No data available" },
    patterns: [],
    narrative: reason,
    strategyVote: { longWeight: 0, shortWeight: 0, totalWeight: 0, strategyCount: 0, agreeingCount: 0, topStrategy: null, detail: "" },
    backtest: { winRate: null, avgProfitPct: null, avgLossPct: null, expectancyPct: null, totalSignals: 0, samples: [], edge: "INSUFFICIENT" },
    scalping: emptyScalping(),
    orderFlow: { vwap: emptyVwap, volumeProfile: null, delta: null, sweeps: [], fvgs: [], orderBlocks: [], fib: null },
    learning: [],
  };
}
