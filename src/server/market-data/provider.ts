import type { MarketDataProvider } from "./types";
import { MT5BridgeProvider } from "./providers/mt5";
import { getActiveBridgeUrl, isBridgeConfigured } from "./bridges";

export function getMarketDataProvider(_symbol?: string): MarketDataProvider | null {
  const activeBridge = getActiveBridgeUrl();
  if (isBridgeConfigured() && activeBridge) {
    return new MT5BridgeProvider(activeBridge);
  }

  return null;
}
