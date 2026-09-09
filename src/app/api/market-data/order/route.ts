import { NextResponse } from "next/server";
import { checkApiToken } from "@/server/api-token";
import { getActiveBridgeUrl } from "@/server/market-data/bridges";

type OrderPayload = {
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  sl?: number | null;
  tp?: number | null;
  deviation?: number;
  magic?: number;
  comment?: string;
};

export async function GET(request: Request) {
  const bridge = getActiveBridgeUrl();
  if (!bridge) {
    return NextResponse.json({ configured: false, status: "not_configured", account: null, symbol: null, errors: { bridge: "MT5 bridge is not configured" } });
  }

  const url = new URL(request.url);
  const symbol = encodeURIComponent(url.searchParams.get("symbol") ?? "XAUUSD");

  const [account, symbolResult] = await Promise.all([fetchJson(`${bridge}/account`), fetchJson(`${bridge}/symbol?symbol=${symbol}`)]);

  const errors: Record<string, string> = {};
  if (!account.ok) errors.account = `${account.status}: ${account.error}`;
  if (!symbolResult.ok) errors.symbol = `${symbolResult.status}: ${symbolResult.error}`;

  let status: "ready" | "symbol_not_found" | "bridge_offline" | "not_configured" = "bridge_offline";
  if (account.ok && symbolResult.ok) status = "ready";
  else if (account.ok && symbolResult.status === 404) status = "symbol_not_found";

  return NextResponse.json({
    configured: true,
    status,
    account: account.data ?? null,
    symbol: symbolResult.data ?? null,
    errors: errors as Record<string, string>,
  });
}

export async function POST(request: Request) {
  const tokenCheck = checkApiToken(request);
  if (!tokenCheck.allowed) {
    return NextResponse.json({ error: "Token akses tidak valid", code: tokenCheck.reason }, { status: 401 });
  }

  const bridge = getActiveBridgeUrl();
  if (!bridge) {
    return NextResponse.json({ error: "MT5 bridge is not configured", code: "BRIDGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<OrderPayload> & { symbol?: string };

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const side = String(body.side ?? "").toLowerCase();
  const volume = Number(body.volume);
  if (!symbol) return NextResponse.json({ error: "symbol is required", code: "INVALID_INPUT" }, { status: 400 });
  if (side !== "buy" && side !== "sell") return NextResponse.json({ error: "side must be buy or sell", code: "INVALID_INPUT" }, { status: 400 });
  if (!Number.isFinite(volume) || volume <= 0) return NextResponse.json({ error: "volume must be a positive number", code: "INVALID_INPUT" }, { status: 400 });

  const payload: OrderPayload = {
    symbol,
    side,
    volume,
    deviation: Number.isFinite(Number(body.deviation)) ? Number(body.deviation) : 20,
  };
  if (body.sl !== undefined && body.sl !== null && Number.isFinite(Number(body.sl))) payload.sl = Number(body.sl);
  if (body.tp !== undefined && body.tp !== null && Number.isFinite(Number(body.tp))) payload.tp = Number(body.tp);
  if (body.magic !== undefined && Number.isFinite(Number(body.magic))) payload.magic = Number(body.magic);
  if (typeof body.comment === "string" && body.comment.trim()) payload.comment = body.comment.trim().slice(0, 64);

  try {
    const response = await fetch(`${bridge}/order`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as {
      retcode?: number;
      retcodeLabel?: string;
      filled?: boolean;
      price?: number | null;
      volume?: number | null;
      order?: { ticket?: number; type?: number } | null;
      detail?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      return NextResponse.json({ error: data?.detail ?? data?.error ?? `Bridge order failed (${response.status})`, code: "BRIDGE_ORDER_REJECTED" }, { status: response.status });
    }

    const status = data?.filled ? 201 : 200;
    return NextResponse.json({ order: data }, { status });
  } catch {
    return NextResponse.json({ error: "MT5 bridge unreachable", code: "BRIDGE_UNREACHABLE" }, { status: 503 });
  }
}

async function fetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null; error: string }> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      return { ok: false, status: response.status, data: null, error: body?.detail ?? `HTTP ${response.status}` };
    }
    return { ok: true, status: response.status, data: (await response.json()) as T, error: "" };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : "fetch failed" };
  }
}