import { NextResponse } from "next/server";
import { AppError, handleApiError } from "@/server/errors";
import { analyzeMarket, analyzeMarketWithConfirmation } from "@/server/market-data/analysis";
import type { Timeframe } from "@/lib/timeframes";
import { marketDataQuerySchema } from "@/server/market-data/validation";
import { registerAlertSnapshot, type AlertSnapshot } from "@/server/ai/alerts";

export async function GET(request: Request) {
  const input = getMarketInput(request);

  try {
    const analysis = await analyzeMarketWithConfirmation(input.symbol, input.timeframe as Timeframe, input.limit);
    const alert = registerAlertSnapshot(input.symbol, input.timeframe, alertSnapshotFromAnalysis(analysis));
    return NextResponse.json({ analysis, alert });
  } catch (error) {
    if (isMarketDataRuntimeError(error)) {
      const analysis = analyzeMarket(input.symbol, input.timeframe, []);
      return NextResponse.json({ analysis });
    }

    return handleApiError(error);
  }
}

function alertSnapshotFromAnalysis(analysis: { signal?: { action?: string; bias?: string; confidence?: number; reasons?: string[] } | null }): AlertSnapshot {
  const signal = analysis.signal;
  return {
    action: signal?.action === "BUY" || signal?.action === "SELL" ? signal.action : "WAIT",
    bias: signal?.bias === "LONG" ? "LONG" : signal?.bias === "SHORT" ? "SHORT" : "NEUTRAL",
    confidence: typeof signal?.confidence === "number" ? signal.confidence : 0,
    reason: signal?.reasons?.[0] ?? "Belum ada setup valid saat ini.",
  };
}

function getMarketInput(request: Request) {
  const url = new URL(request.url);
  return marketDataQuerySchema.parse({
    symbol: url.searchParams.get("symbol") ?? undefined,
    timeframe: url.searchParams.get("timeframe") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
}

function isMarketDataRuntimeError(error: unknown) {
  return error instanceof AppError || error instanceof TypeError || (error instanceof Error && error.message.includes("Market data provider is not configured"));
}
