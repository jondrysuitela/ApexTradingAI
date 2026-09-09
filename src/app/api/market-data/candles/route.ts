import { NextResponse } from "next/server";
import { getCandles } from "@/server/market-data/service";
import { marketDataQuerySchema } from "@/server/market-data/validation";
import { AppError, handleApiError } from "@/server/errors";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = marketDataQuerySchema.parse({
      symbol: url.searchParams.get("symbol") ?? undefined,
      timeframe: url.searchParams.get("timeframe") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const candles = await getCandles(input.symbol, input.timeframe, input.limit);
    return NextResponse.json({ candles });
  } catch (error) {
    if (isMarketDataRuntimeError(error)) {
      return NextResponse.json({ candles: [], status: "NOT_CONNECTED" });
    }

    return handleApiError(error);
  }
}

function isMarketDataRuntimeError(error: unknown) {
  return error instanceof AppError || error instanceof TypeError || (error instanceof Error && error.message.includes("Market data provider is not configured"));
}
