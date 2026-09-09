import { NextResponse } from "next/server";
import { checkApiToken } from "@/server/api-token";
import { getActiveBridgeUrl, getConfiguredBridges, setActiveBridgeUrl } from "@/server/market-data/bridges";

type BridgeSymbolStatus = { symbol: string; resolvedSymbol: string; available: boolean };
type BridgeAccount = {
  login: number | null;
  name: string | null;
  server: string | null;
  accountType: string | null;
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
  return NextResponse.json(await buildBridgeStatus(symbols ?? undefined));
}

export async function POST(request: Request) {
  const tokenCheck = checkApiToken(request);
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: "Token akses tidak valid", code: tokenCheck.reason }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { url?: string };
  if (!body.url) {
    return NextResponse.json({ error: "url bridge diperlukan", code: "BRIDGE_URL_REQUIRED" }, { status: 400 });
  }

  const chosen = setActiveBridgeUrl(body.url);
  if (!chosen) {
    return NextResponse.json({ error: "Bridge tidak terdaftar", code: "BRIDGE_NOT_REGISTERED" }, { status: 400 });
  }

  return NextResponse.json(await buildBridgeStatus());
}

async function buildBridgeStatus(symbols?: string) {
  const active = getActiveBridgeUrl();
  const configured = getConfiguredBridges();
  const activeSymbols = active ? await fetchBridgeSymbols(active, symbols) : null;
  const activeAccount = active ? await fetchBridgeAccount(active) : null;
  const bridges = await Promise.all(
    configured.map(async (url) => ({
      url,
      active: url === active,
      account: await fetchBridgeAccount(url),
    })),
  );

  return {
    configured: configured.length > 0,
    active,
    bridges,
    status: active && (activeSymbols || activeAccount) ? "ready" : configured.length > 0 ? "not_connected" : "not_configured",
    symbols: activeSymbols?.symbols ?? [],
    account: activeAccount,
  };
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