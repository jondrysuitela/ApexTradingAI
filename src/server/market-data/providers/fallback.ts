import type { Timeframe } from "@/lib/timeframes";
import type { MarketDataProvider } from "../types";

export class FallbackMarketDataProvider implements MarketDataProvider {
  name: string;

  constructor(private readonly providers: MarketDataProvider[]) {
    this.name = providers.map((provider) => provider.name).join("->");
  }

  async getTicker(symbol: string) {
    return this.tryProviders((provider) => provider.getTicker(symbol));
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit?: number) {
    return this.tryProviders((provider) => provider.getCandles(symbol, timeframe, limit));
  }

  async getVolume(symbol: string, timeframe: Timeframe) {
    return this.tryProviders((provider) => provider.getVolume(symbol, timeframe));
  }

  async getOrderBook(symbol: string, limit?: number) {
    return this.tryProviders((provider) => provider.getOrderBook(symbol, limit));
  }

  async getTrades(symbol: string, limit?: number) {
    return this.tryProviders((provider) => provider.getTrades(symbol, limit));
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

  private async tryProviders<T>(call: (provider: MarketDataProvider) => Promise<T>) {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await call(provider);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }
}
