import { getMarketDataProvider } from "./provider";
import { DEFAULT_MARKET_UNIVERSE } from "./universe";

export async function getMarketDataHealth() {
  const checks = await Promise.all(
    DEFAULT_MARKET_UNIVERSE.map(async (market) => {
      const provider = getMarketDataProvider(market.symbol);
      if (!provider) return { symbol: market.symbol, status: "not_connected" as const, connected: false, provider: "none" };

      try {
        await provider.getTicker(market.symbol);
        return { symbol: market.symbol, status: "ok" as const, connected: true, provider: provider.name };
      } catch (error) {
        return { symbol: market.symbol, status: "offline" as const, connected: false, provider: provider.name, error: error instanceof Error ? error.message : "Unknown error" };
      }
    }),
  );

  const connected = checks.filter((check) => check.connected);
  if (connected.length === 0) {
    return { status: "not_connected", connected: false, provider: "none" };
  }

  return {
    status: connected.length === checks.length ? "ok" : "partial",
    connected: true,
    provider: Array.from(new Set(connected.map((check) => check.provider))).join(", "),
    connectedMarkets: connected.length,
    totalMarkets: checks.length,
    checks,
  };
}
