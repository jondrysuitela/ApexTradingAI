import { AppError } from "@/server/errors";
import type { Timeframe } from "@/lib/timeframes";
import type { MarketCandle, MarketDataProvider, MarketOrderBook, MarketTicker } from "../types";

const BASE_URL = "https://api.twelvedata.com";

type TimeSeriesResponse = {
  status?: string;
  message?: string;
  values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
};

type QuoteResponse = {
  status?: string;
  message?: string;
  symbol?: string;
  close?: string;
  datetime?: string;
  timestamp?: number;
};

export class TwelveDataProvider implements MarketDataProvider {
  name = "twelve-data";

  constructor(private readonly apiKey: string) {}

  async getTicker(symbol: string): Promise<MarketTicker> {
    const data = await this.fetchJson<QuoteResponse>(`/quote?symbol=${encodeURIComponent(toTwelveDataSymbol(symbol))}`);
    if (data.status === "error" || !data.close) {
      throw new AppError(data.message ?? `No Twelve Data quote returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return {
      symbol,
      price: Number(data.close),
      timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : data.datetime ? new Date(data.datetime).toISOString() : new Date().toISOString(),
      provider: this.name,
      source: BASE_URL,
      freshness: "LIVE",
    };
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 100): Promise<MarketCandle[]> {
    const interval = mapTimeframe(timeframe);
    const data = await this.fetchJson<TimeSeriesResponse>(`/time_series?symbol=${encodeURIComponent(toTwelveDataSymbol(symbol))}&interval=${interval}&outputsize=${limit}`);
    if (data.status === "error") {
      throw new AppError(data.message ?? `No Twelve Data candles returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return (data.values ?? [])
      .map((row) => ({
        symbol,
        timeframe,
        timestamp: new Date(row.datetime).toISOString(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0),
        provider: this.name,
        source: BASE_URL,
        freshness: "LIVE" as const,
      }))
      .filter((candle) => Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low) && Number.isFinite(candle.close))
      .reverse();
  }

  async getVolume(symbol: string, timeframe: Timeframe) {
    const candles = await this.getCandles(symbol, timeframe, 2);
    const candle = candles.at(-1);
    if (!candle) throw new AppError(`No Twelve Data candles returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    return { symbol, timeframe, volume: candle.volume, timestamp: candle.timestamp, provider: this.name, source: BASE_URL, freshness: candle.freshness };
  }

  async getOrderBook(_symbol: string, _limit = 20): Promise<MarketOrderBook> {
    throw new AppError("Twelve Data order book is not available for this integration", 503, "MARKET_DATA_NOT_CONNECTED");
  }

  async getTrades(): ReturnType<MarketDataProvider["getTrades"]> {
    throw new AppError("Twelve Data trade feed is not available for this integration", 503, "MARKET_DATA_NOT_CONNECTED");
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

  private async fetchJson<T>(path: string): Promise<T> {
    if (!this.apiKey) {
      throw new AppError("Twelve Data API key is not configured", 503, "MARKET_DATA_NOT_CONNECTED");
    }

    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${BASE_URL}${path}${separator}apikey=${encodeURIComponent(this.apiKey)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new AppError(`Twelve Data request failed: ${response.status} ${response.statusText}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return response.json() as Promise<T>;
  }
}

function toTwelveDataSymbol(symbol: string) {
  const normalized = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const map: Record<string, string> = {
    USDIDR: "USD/IDR",
    EURUSD: "EUR/USD",
    GBPUSD: "GBP/USD",
    USDJPY: "USD/JPY",
    XAUUSD: "XAU/USD",
    XAGUSD: "XAG/USD",
  };

  return map[normalized] ?? symbol;
}

function mapTimeframe(timeframe: Timeframe) {
  const map: Record<Timeframe, string> = {
    "1m": "1min",
    "3m": "5min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "6h": "4h",
    "12h": "1day",
    "1d": "1day",
    "1w": "1week",
  };

  return map[timeframe];
}
