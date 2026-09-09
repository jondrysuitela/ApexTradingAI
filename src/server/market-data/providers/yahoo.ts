import { AppError } from "@/server/errors";
import type { Timeframe } from "@/lib/timeframes";
import type { MarketCandle, MarketDataProvider, MarketOrderBook, MarketTicker } from "../types";

const DEFAULT_BASE_URL = "https://query1.finance.yahoo.com";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
    }>;
    error?: { description?: string } | null;
  };
};

export class YahooPublicProvider implements MarketDataProvider {
  name = "yahoo";

  constructor(private readonly baseUrl = DEFAULT_BASE_URL) {}

  async getTicker(symbol: string): Promise<MarketTicker> {
    const data = await this.fetchChart(symbol, "1d", "1d");
    const result = data.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const close = findLastNumber(quote?.close) ?? result?.meta?.regularMarketPrice;
    const timestamp = result?.meta?.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString() : new Date().toISOString();

    if (!Number.isFinite(close)) {
      throw new AppError(`No Yahoo ticker returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return { symbol, price: Number(close), timestamp, provider: this.name, source: this.baseUrl, freshness: "DELAYED" };
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 100): Promise<MarketCandle[]> {
    const mapped = mapTimeframe(timeframe);
    const data = await this.fetchChart(symbol, mapped.interval, mapped.range);
    const result = data.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];

    if (!quote) return [];

    const candles: MarketCandle[] = [];
    for (const [index, timestamp] of timestamps.entries()) {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];

      if (open === null || open === undefined || high === null || high === undefined || low === null || low === undefined || close === null || close === undefined) {
        continue;
      }

      candles.push({
        symbol,
        timeframe,
        timestamp: new Date(timestamp * 1000).toISOString(),
        open,
        high,
        low,
        close,
        volume: quote.volume?.[index] ?? 0,
        provider: this.name,
        source: this.baseUrl,
        freshness: "DELAYED",
      });
    }

    return candles.slice(-limit);
  }

  async getVolume(symbol: string, timeframe: Timeframe) {
    const candles = await this.getCandles(symbol, timeframe, 2);
    const candle = candles.at(-1);
    if (!candle) throw new AppError(`No Yahoo candles returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    return { symbol, timeframe, volume: candle.volume, timestamp: candle.timestamp, provider: this.name, source: this.baseUrl, freshness: candle.freshness };
  }

  async getOrderBook(_symbol: string, _limit = 20): Promise<MarketOrderBook> {
    throw new AppError("Yahoo order book is not available", 503, "MARKET_DATA_NOT_CONNECTED");
  }

  async getTrades(): ReturnType<MarketDataProvider["getTrades"]> {
    throw new AppError("Yahoo trade feed is not available", 503, "MARKET_DATA_NOT_CONNECTED");
  }

  async subscribeTicker(): Promise<() => void> {
    return async () => undefined;
  }

  async subscribeCandles(): Promise<() => void> {
    return async () => undefined;
  }

  async subscribeOrderBook(): Promise<() => void> {
    return async () => undefined;
  }

  private async fetchChart(symbol: string, interval: string, range: string) {
    const response = await fetch(`${this.baseUrl}/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}?interval=${interval}&range=${range}`, { cache: "no-store" });
    if (!response.ok) {
      throw new AppError(`Yahoo request failed: ${response.status} ${response.statusText}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    const data = (await response.json()) as YahooChartResponse;
    const error = data.chart?.error;
    if (error) {
      throw new AppError(error.description ?? "Yahoo request failed", 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return data;
  }
}

function findLastNumber(values: Array<number | null> | undefined) {
  if (!values) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === "number") return value;
  }
  return null;
}

function toYahooSymbol(symbol: string) {
  const normalized = symbol.replace(/\//g, "").toUpperCase();
  const map: Record<string, string> = {
    USDIDR: "IDR=X",
    EURUSD: "EURUSD=X",
    GBPUSD: "GBPUSD=X",
    USDJPY: "JPY=X",
    XAUUSD: "GC=F",
    XAGUSD: "SI=F",
  };

  return map[normalized] ?? symbol;
}

function mapTimeframe(timeframe: Timeframe) {
  if (["1m", "3m", "5m", "15m", "30m"].includes(timeframe)) return { interval: timeframe, range: "5d" };
  if (["1h", "2h", "4h", "6h", "12h"].includes(timeframe)) return { interval: "60m", range: "1mo" };
  if (timeframe === "1w") return { interval: "1wk", range: "5y" };
  return { interval: "1d", range: "1y" };
}
