import { analyzeMarket } from "./analysis";
import { DEFAULT_MARKET_UNIVERSE } from "./universe";
import { getCandles } from "./service";

export type ScannerResult = {
  symbol: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  setup: string;
  score: number;
  risk: string;
  timeframe: string;
  freshness: string;
};

export async function scanMarketUniverse(timeframe: "1h" | "4h" | "1d" = "1h") {
  const results: ScannerResult[] = [];

  for (const item of DEFAULT_MARKET_UNIVERSE) {
    try {
      const candles = await getCandles(item.symbol, timeframe, 120);
      const analysis = analyzeMarket(item.symbol, timeframe, candles);
      results.push({
        symbol: item.symbol,
        direction: analysis.setup?.direction ?? "NEUTRAL",
        setup: analysis.setup?.setupType ?? "No Clear Setup",
        score: analysis.setup?.score ?? 0,
        risk: analysis.setup?.state ?? "NO_TRADE",
        timeframe,
        freshness: analysis.status,
      });
    } catch {
      results.push({
        symbol: item.symbol,
        direction: "NEUTRAL",
        setup: "NOT CONNECTED",
        score: 0,
        risk: "NOT CONNECTED",
        timeframe,
        freshness: "OFFLINE",
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
