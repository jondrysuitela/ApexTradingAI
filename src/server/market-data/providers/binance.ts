import type { Timeframe } from "@/lib/timeframes";
import type { MarketCandle, MarketDataProvider, MarketOrderBook, MarketTicker } from "../types";

const DEFAULT_BASE_URL = "https://api.binance.com";

export class BinancePublicProvider implements MarketDataProvider {
  name = "binance";

  constructor(private readonly baseUrl = DEFAULT_BASE_URL) {}

  async getTicker(symbol: string): Promise<MarketTicker> {
    const data = await this.fetchJson<{ symbol: string; lastPrice: string; closeTime: number }>(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(normalizeSymbol(symbol))}`);
    return {
      symbol,
      price: Number(data.lastPrice),
      timestamp: new Date(data.closeTime).toISOString(),
      provider: this.name,
      source: this.baseUrl,
      freshness: "LIVE",
    };
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 100): Promise<MarketCandle[]> {
    const rows = await this.fetchJson<Array<[number, string, string, string, string, string, number, string, number, string, string, string]>>(
      `/api/v3/klines?symbol=${encodeURIComponent(normalizeSymbol(symbol))}&interval=${mapTimeframe(timeframe)}&limit=${limit}`,
    );

    return rows.map((row) => ({
      symbol,
      timeframe,
      timestamp: new Date(row[0]).toISOString(),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      provider: this.name,
      source: this.baseUrl,
      freshness: "LIVE",
    }));
  }

  async getVolume(symbol: string, timeframe: Timeframe) {
    const candles = await this.getCandles(symbol, timeframe, 2);
    const candle = candles.at(-1);
    if (!candle) throw new Error(`No candles returned for ${symbol}`);
    return { symbol, timeframe, volume: candle.volume, timestamp: candle.timestamp, provider: this.name, source: this.baseUrl, freshness: candle.freshness };
  }

  async getOrderBook(symbol: string, limit = 20): Promise<MarketOrderBook> {
    const data = await this.fetchJson<{ lastUpdateId: number; bids: [string, string][]; asks: [string, string][] }>(
      `/api/v3/depth?symbol=${encodeURIComponent(normalizeSymbol(symbol))}&limit=${limit}`,
    );

    return {
      symbol,
      timestamp: new Date().toISOString(),
      bids: data.bids.map(([price, size]) => ({ price: Number(price), size: Number(size) })),
      asks: data.asks.map(([price, size]) => ({ price: Number(price), size: Number(size) })),
      provider: this.name,
      source: this.baseUrl,
      freshness: "LIVE",
    };
  }

  async getTrades(symbol: string, limit = 50) {
    const data = await this.fetchJson<Array<{ price: string; qty: string; time: number; isBuyerMaker: boolean }>>(
      `/api/v3/trades?symbol=${encodeURIComponent(normalizeSymbol(symbol))}&limit=${limit}`,
    );

    return data.map((trade) => ({
      price: Number(trade.price),
      size: Number(trade.qty),
      side: (trade.isBuyerMaker ? "sell" : "buy") as "buy" | "sell",
      timestamp: new Date(trade.time).toISOString(),
      provider: this.name,
      source: this.baseUrl,
      freshness: "LIVE" as const,
    }));
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
    const response = await fetch(`${this.baseUrl}${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Binance request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

function normalizeSymbol(symbol: string) {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function mapTimeframe(timeframe: Timeframe) {
  const map: Record<Timeframe, string> = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "6h": "6h",
    "12h": "12h",
    "1d": "1d",
    "1w": "1w",
  };

  return map[timeframe];
}
