export type MarketUniverseItem = {
  symbol: string;
  label: string;
  market: string;
  providerHint?: "binance" | "twelve-data" | "yahoo" | "mt5";
};

export const DEFAULT_MARKET_UNIVERSE: MarketUniverseItem[] = [
  { symbol: "BTCUSDT", label: "Bitcoin / USDT", market: "crypto", providerHint: "mt5" },
  { symbol: "ETHUSDT", label: "Ethereum / USDT", market: "crypto", providerHint: "mt5" },
  { symbol: "SOLUSDT", label: "Solana / USDT", market: "crypto", providerHint: "mt5" },
  { symbol: "BNBUSDT", label: "BNB / USDT", market: "crypto", providerHint: "mt5" },
  { symbol: "XRPUSDT", label: "XRP / USDT", market: "crypto", providerHint: "mt5" },
  { symbol: "USDIDR", label: "US Dollar / Indonesian Rupiah", market: "fx", providerHint: "mt5" },
  { symbol: "EURUSD", label: "Euro / US Dollar", market: "fx", providerHint: "mt5" },
  { symbol: "GBPUSD", label: "British Pound / US Dollar", market: "fx", providerHint: "mt5" },
  { symbol: "USDJPY", label: "US Dollar / Japanese Yen", market: "fx", providerHint: "mt5" },
  { symbol: "XAUUSD", label: "Gold Spot / US Dollar", market: "metal", providerHint: "mt5" },
  { symbol: "XAGUSD", label: "Silver Spot / US Dollar", market: "metal", providerHint: "mt5" },
  { symbol: "SPX", label: "S&P 500 Index", market: "index", providerHint: "mt5" },
  { symbol: "IXIC", label: "Nasdaq Composite", market: "index", providerHint: "mt5" },
];

export function findMarketUniverseItem(symbol: string) {
  const normalized = symbol.replace(/[^A-Za-z0-9=^]/g, "").toUpperCase();
  return DEFAULT_MARKET_UNIVERSE.find((item) => item.symbol.toUpperCase() === normalized);
}
