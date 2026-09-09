import { AppError } from "@/server/errors";
import { getMarketDataProvider } from "./provider";
import type { Timeframe } from "@/lib/timeframes";

export async function getCandles(symbol: string, timeframe: Parameters<NonNullable<ReturnType<typeof getMarketDataProvider>>["getCandles"]>[1], limit: number) {
  const provider = getMarketDataProvider(symbol);
  if (!provider) {
    throw new AppError("Market data provider is not configured", 503, "MARKET_DATA_NOT_CONNECTED");
  }

  return provider.getCandles(symbol, timeframe, limit);
}

export async function getTicker(symbol: string) {
  const provider = getMarketDataProvider(symbol);
  if (!provider) {
    throw new AppError("Market data provider is not configured", 503, "MARKET_DATA_NOT_CONNECTED");
  }

  return provider.getTicker(symbol);
}

export async function getCandlesForTimeframes(symbol: string, timeframes: Timeframe[], limit: number) {
  const results = await Promise.allSettled(
    timeframes.map(async (timeframe) => [timeframe, await getCandles(symbol, timeframe, limit)] as const)
  );
  const entries: Array<readonly [Timeframe, Awaited<ReturnType<typeof getCandles>>]> = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      entries.push(result.value);
    }
  }
  return Object.fromEntries(entries) as Record<Timeframe, Awaited<ReturnType<typeof getCandles>>>;
}
