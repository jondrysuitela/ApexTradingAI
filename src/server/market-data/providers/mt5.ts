import { AppError } from "@/server/errors";
import type { Timeframe } from "@/lib/timeframes";
import type { MarketCandle, MarketDataProvider, MarketOrderBook, MarketTicker } from "../types";

type BridgeTickerResponse = {
  symbol?: string;
  price?: number;
  bid?: number;
  ask?: number;
  last?: number;
  close?: number;
  timestamp?: string;
  time?: string;
  provider?: string;
  source?: string;
};

type BridgeCandlesResponse = {
  symbol?: string;
  candles?: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume?: number }>;
  provider?: string;
  source?: string;
};

export class MT5BridgeProvider implements MarketDataProvider {
  name = "mt5";

  constructor(private readonly bridgeUrl: string) {}

  async getTicker(symbol: string): Promise<MarketTicker> {
    const data = await this.fetchJson<BridgeTickerResponse>(`/ticker?symbol=${encodeURIComponent(symbol)}`);
    const price = data.price ?? data.last ?? data.close ?? midpoint(data.bid, data.ask);
    if (!Number.isFinite(price)) {
      throw new AppError(`No MT5 ticker returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return {
      symbol,
      price: Number(price),
      timestamp: data.timestamp ?? data.time ?? new Date().toISOString(),
      provider: normalizeProvider(data.provider),
      source: data.source ?? this.bridgeUrl,
      freshness: "LIVE",
    };
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 100): Promise<MarketCandle[]> {
    const data = await this.fetchJson<BridgeCandlesResponse>(`/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`);
    const candles = data.candles ?? [];
    if (candles.length === 0) {
      throw new AppError(`No MT5 candles returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return candles.map((candle) => ({
      symbol,
      timeframe,
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume ?? 0,
      provider: normalizeProvider(data.provider),
      source: data.source ?? this.bridgeUrl,
      freshness: "LIVE",
    }));
  }

  async getVolume(symbol: string, timeframe: Timeframe) {
    const candles = await this.getCandles(symbol, timeframe, 2);
    const candle = candles.at(-1);
    if (!candle) throw new AppError(`No MT5 candles returned for ${symbol}`, 503, "MARKET_DATA_NOT_CONNECTED");
    return { symbol, timeframe, volume: candle.volume, timestamp: candle.timestamp, provider: this.name, source: this.bridgeUrl, freshness: candle.freshness };
  }

  async getOrderBook(_symbol: string, _limit = 20): Promise<MarketOrderBook> {
    throw new AppError("MT5 bridge order book is not available yet", 503, "MARKET_DATA_NOT_CONNECTED");
  }

  async getTrades(): ReturnType<MarketDataProvider["getTrades"]> {
    throw new AppError("MT5 bridge trades feed is not available yet", 503, "MARKET_DATA_NOT_CONNECTED");
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
    const response = await fetch(`${this.bridgeUrl}${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new AppError(`MT5 bridge request failed: ${response.status} ${response.statusText}`, 503, "MARKET_DATA_NOT_CONNECTED");
    }

    return response.json() as Promise<T>;
  }
}

function normalizeProvider(provider?: string) {
  if (provider === "mt5-ea") return "mt5-cache";
  if (provider === "mt5") return "mt5-live";
  return provider ?? "mt5";
}

function midpoint(bid?: number, ask?: number) {
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return Number.NaN;
  return (Number(bid) + Number(ask)) / 2;
}
