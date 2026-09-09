import { NextResponse } from "next/server";
import { env } from "@/server/env";

type BridgeSymbolStatus = { symbol: string; resolvedSymbol: string; available: boolean };
type BridgeAccount = {
  login: number | null;
  name: string | null;
  server: string | null;
  currency: string | null;
  balance: number | null;
  equity: number | null;
  marginFree: number | null;
  leverage: number | null;
  tradeAllowed: boolean | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbols = url.searchParams.get("symbols");
  const bridgeUrl = env.MT5_BRIDGE_URL;
  const bridgeStatus = bridgeUrl ? await fetchBridgeSymbols(bridgeUrl, symbols ?? undefined) : null;
  const account = bridgeUrl ? await fetchBridgeAccount(bridgeUrl) : null;

  return NextResponse.json({
    configured: Boolean(bridgeUrl),
    bridgeUrl: bridgeUrl ?? null,
    status: bridgeStatus ? "ready" : bridgeUrl ? "not_connected" : "not_configured",
    symbols: bridgeStatus?.symbols ?? [],
    account,
  });
}

async function fetchBridgeSymbols(bridgeUrl: string, symbols?: string) {
  try {
    const query = symbols ? `?symbols=${encodeURIComponent(symbols)}` : "";
    const response = await fetch(`${bridgeUrl}/symbols${query}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as { symbols: BridgeSymbolStatus[] };
  } catch {
    return null;
  }
}

async function fetchBridgeAccount(bridgeUrl: string): Promise<BridgeAccount | null> {
  try {
    const response = await fetch(`${bridgeUrl}/account`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as BridgeAccount;
  } catch {
    return null;
  }
}
