import { NextResponse } from "next/server";
import { AppError, handleApiError } from "@/server/errors";
import { getTicker } from "@/server/market-data/service";
import { tickerQuerySchema } from "@/server/market-data/validation";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = tickerQuerySchema.parse({ symbol: url.searchParams.get("symbol") ?? undefined });
    return NextResponse.json({ ticker: await getTicker(input.symbol) });
  } catch (error) {
    if (isMarketDataRuntimeError(error)) {
      return NextResponse.json({ ticker: null, status: "NOT_CONNECTED" });
    }

    return handleApiError(error);
  }
}

function isMarketDataRuntimeError(error: unknown) {
  return error instanceof AppError || error instanceof TypeError || (error instanceof Error && error.message.includes("Market data provider is not configured"));
}
