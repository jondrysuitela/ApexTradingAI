import { env } from "@/server/env";
import type { MarketDataProvider } from "./types";
import { MT5BridgeProvider } from "./providers/mt5";

export function getMarketDataProvider(_symbol?: string): MarketDataProvider | null {
  if (env.MT5_BRIDGE_URL) {
    return new MT5BridgeProvider(env.MT5_BRIDGE_URL);
  }

  return null;
}
