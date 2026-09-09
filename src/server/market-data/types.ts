import type { Timeframe } from "@/lib/timeframes";

export type MarketDataStatus = "LIVE" | "DELAYED" | "STALE" | "OFFLINE";

export type MarketTicker = {
  symbol: string;
  price: number;
  timestamp: string;
  provider: string;
  source: string;
  freshness: MarketDataStatus;
};

export type MarketCandle = {
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
  source: string;
  freshness: MarketDataStatus;
};

export type MarketOrderBookLevel = { price: number; size: number };

export type MarketOrderBook = {
  symbol: string;
  timestamp: string;
  bids: MarketOrderBookLevel[];
  asks: MarketOrderBookLevel[];
  provider: string;
  source: string;
  freshness: MarketDataStatus;
};

export interface MarketDataProvider {
  name: string;
  getTicker(symbol: string): Promise<MarketTicker>;
  getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<MarketCandle[]>;
  getVolume(symbol: string, timeframe: Timeframe): Promise<{ symbol: string; timeframe: Timeframe; volume: number; timestamp: string; provider: string; source: string; freshness: MarketDataStatus }>;
  getOrderBook(symbol: string, limit?: number): Promise<MarketOrderBook>;
  getTrades(symbol: string, limit?: number): Promise<Array<{ price: number; size: number; side: "buy" | "sell"; timestamp: string; provider: string; source: string; freshness: MarketDataStatus }>>;
  subscribeTicker(_symbol: string, _onUpdate: (ticker: MarketTicker) => void): Promise<() => void>;
  subscribeCandles(_symbol: string, _timeframe: Timeframe, _onUpdate: (candles: MarketCandle[]) => void): Promise<() => void>;
  subscribeOrderBook(_symbol: string, _onUpdate: (orderBook: MarketOrderBook) => void): Promise<() => void>;
}
