import type { CandleInput } from "@/server/technical/indicators";
import { atr, ema, rsi, sma } from "@/server/technical/indicators";
import { detectSetup } from "@/server/technical/setups";
import { generateTradingSignal } from "@/server/technical/signal";
import { computeConfluence } from "@/server/technical/confluence";
import { detectStructure } from "@/server/technical/structure";
import { detectSupportResistance } from "@/server/technical/support-resistance";
import type { Timeframe } from "@/lib/timeframes";
import { env } from "@/server/env";
import { getCandlesForTimeframes } from "./service";
import { getSpreadContext, type SpreadContext } from "./symbol-context";

const CONFIRMATION_TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h"];

type TimeframeConfirmation = {
  timeframe: Timeframe;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  latestClose: number | null;
};

type MultiTimeframeAlignment = {
  alignment: "LONG" | "SHORT" | "NEUTRAL";
  longVotes: number;
  shortVotes: number;
  neutralVotes: number;
};

export function analyzeMarket(symbol: string, timeframe: string, candles: CandleInput[], spread?: SpreadContext | null) {
  const closes = candles.map((candle) => candle.close);
  const setup = candles.length >= 5 ? detectSetup(symbol, candles, timeframe) : null;
  const structure = detectStructure(candles, timeframe);
  const supportResistance = detectSupportResistance(candles, timeframe);
  const signal = generateTradingSignal({ candles, setup, structure, supportResistance, spread: spread ?? null, timeframe });

  return {
    symbol,
    timeframe,
    status: candles.length > 0 ? "LIVE" : "OFFLINE",
    latestClose: candles.at(-1)?.close ?? null,
    indicators: {
      sma20: sma(closes, 20),
      ema20: ema(closes, 20),
      rsi14: rsi(closes, 14),
      atr14: atr(candles, 14),
    },
    structure,
    supportResistance,
    setup,
    signal,
  };
}

export async function analyzeMarketWithConfirmation(symbol: string, timeframe: Timeframe, limit: number): Promise<ReturnType<typeof analyzeMarket> & { confirmations: TimeframeConfirmation[]; multiTimeframe: MultiTimeframeAlignment }> {
  const candlesByTimeframe = await getCandlesForTimeframes(symbol, CONFIRMATION_TIMEFRAMES, limit);
  const spread = await getSpreadContext(symbol, env.MT5_BRIDGE_URL);
  const primary = analyzeMarket(symbol, timeframe, candlesByTimeframe[timeframe] ?? [], spread);
  const confirmations = CONFIRMATION_TIMEFRAMES.map((tf) => summarizeTimeframe(tf, candlesByTimeframe[tf] ?? [], spread));
  const longVotes = confirmations.filter((item) => item.bias === "LONG").length;
  const shortVotes = confirmations.filter((item) => item.bias === "SHORT").length;
  const alignment: MultiTimeframeAlignment["alignment"] = longVotes > shortVotes ? "LONG" : shortVotes > longVotes ? "SHORT" : "NEUTRAL";

  // Confidence-weighted directional strength across timeframes
  const longWeight = confirmations.filter((c) => c.bias === "LONG").reduce((s, c) => s + c.confidence, 0);
  const shortWeight = confirmations.filter((c) => c.bias === "SHORT").reduce((s, c) => s + c.confidence, 0);
  const dominantAlignment: MultiTimeframeAlignment["alignment"] =
    longWeight > shortWeight + 20 ? "LONG" : shortWeight > longWeight + 20 ? "SHORT" : alignment;

  return {
    ...primary,
    confirmations,
    multiTimeframe: {
      alignment: dominantAlignment,
      longVotes,
      shortVotes,
      neutralVotes: confirmations.length - longVotes - shortVotes,
    },
  };
}

function summarizeTimeframe(timeframe: Timeframe, candles: CandleInput[], spread?: SpreadContext | null): TimeframeConfirmation {
  if (candles.length < 20) {
    return { timeframe, bias: "NEUTRAL" as const, confidence: 0, latestClose: candles.at(-1)?.close ?? null };
  }

  const confluence = computeConfluence(candles, { spread: spread ?? null });
  const latest = candles.at(-1)?.close ?? 0;
  const bias = confluence.direction;
  const confidence = confluence.confidence;

  // Weight confluence direction with a higher minimum to avoid flagging weak setups as confirmations
  const confirmedBias = confidence >= 40 ? bias : "NEUTRAL";

  return { timeframe, bias: confirmedBias, confidence, latestClose: latest };
}
