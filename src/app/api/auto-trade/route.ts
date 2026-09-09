import { NextResponse } from "next/server";
import { checkApiToken } from "@/server/api-token";
import { env } from "@/server/env";
import { forceCloseAutoTrade, runAutoTradeCycle } from "@/server/auto-trading/engine";
import { ensureAutoTradeLoop, getAutoTradeLoopHealth, startAutoTradeScheduler, stopAutoTradeScheduler } from "@/server/auto-trading/loop";
import { loadAutoTradeState, saveAutoTradeState } from "@/server/auto-trading/state";
import { AUTO_TRADE_DEFAULTS } from "@/server/auto-trading/types";

export async function GET() {
  ensureAutoTradeLoop();
  return NextResponse.json(await buildStatusBody());
}

export async function POST(request: Request) {
  const auth = checkApiToken(request);
  if (!auth.allowed) {
    return NextResponse.json({ error: "Token akses tidak valid", code: "INVALID_OR_MISSING_TOKEN" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid", code: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const action = (body as { action?: string }).action ?? "";
  const state = loadAutoTradeState();

  switch (action) {
    case "start": {
      applyConfigPatch(state.config, body as Record<string, unknown>);
      state.enabled = true;
      state.status = "enabled";
      state.lastError = null;
      saveAutoTradeState(state);
      startAutoTradeScheduler();
      void ensureAutoTradeLoop();
      const cycle = await runAutoTradeCycle();
      return NextResponse.json({ status: await buildStatusBody(loadAutoTradeState()), cycle });
    }
    case "stop": {
      state.enabled = false;
      state.status = "disabled";
      stopAutoTradeScheduler();
      saveAutoTradeState(state);
      return NextResponse.json({ status: await buildStatusBody(state) });
    }
    case "config": {
      applyConfigPatch(state.config, body as Record<string, unknown>);
      saveAutoTradeState(state);
      return NextResponse.json({ status: await buildStatusBody(state) });
    }
    case "run-now": {
      ensureAutoTradeLoop();
      const cycle = await runAutoTradeCycle();
      return NextResponse.json({ status: await buildStatusBody(loadAutoTradeState()), cycle });
    }
    case "close": {
      const result = await forceCloseAutoTrade();
      return NextResponse.json({ status: await buildStatusBody(loadAutoTradeState()), result });
    }
    default:
      return NextResponse.json({ error: `Aksi tidak dikenal: "${action}"`, code: "INVALID_ACTION" }, { status: 400 });
  }
}

function applyConfigPatch(config: typeof AUTO_TRADE_DEFAULTS, body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (typeof body.mode === "string" && (body.mode === "paper" || body.mode === "demo" || body.mode === "real")) patch.mode = body.mode;
  if (typeof body.symbol === "string" && /^[A-Za-z0-9_.-]+$/.test(body.symbol)) patch.symbol = body.symbol.toUpperCase();
  if (typeof body.timeframe === "string" && ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(body.timeframe)) patch.timeframe = body.timeframe;
  const numbers: Array<"riskPercent" | "slAtrMultiplier" | "tpRiskReward" | "minConfluenceScore" | "minScalpingConfidence" | "loopIntervalMs"> = [
    "riskPercent",
    "slAtrMultiplier",
    "tpRiskReward",
    "minConfluenceScore",
    "minScalpingConfidence",
    "loopIntervalMs",
  ];
  for (const key of numbers) {
    const value = Number(body[key]);
    if (Number.isFinite(value) && value > 0) patch[key] = value;
  }
  Object.assign(config, patch);
}

async function fetchBridgeAccountInfo() {
  const bridge = env.MT5_BRIDGE_URL;
  if (!bridge) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${bridge}/account`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    return {
      login: typeof data.login === "number" ? data.login : null,
      server: typeof data.server === "string" ? data.server : null,
      currency: typeof data.currency === "string" ? data.currency : null,
      accountType: typeof data.accountType === "string" ? data.accountType : null,
      tradeAllowed: data.tradeAllowed !== false,
      balance: typeof data.balance === "number" ? data.balance : null,
      equity: typeof data.equity === "number" ? data.equity : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function buildStatusBody(state = loadAutoTradeState()) {
  const account = await fetchBridgeAccountInfo();
  const mode = state.config.mode;
  const accountConflict =
    account?.accountType && (mode === "real" ? account.accountType !== "real" : account.accountType === "real");
  return {
    enabled: state.enabled,
    status: state.status,
    config: state.config,
    position: state.position,
    paper: state.paper,
    account,
    accountConflict,
    stats: {
      trades: state.paper.trades,
      wins: state.paper.wins,
      winRate: state.paper.trades ? (state.paper.wins / state.paper.trades) * 100 : 0,
      realizedPnl: state.paper.realizedPnl,
      balance: state.paper.balance,
      equity: state.paper.equity,
    },
    lastCycle: state.lastCycle,
    lastError: state.lastError,
    trades: state.trades.slice(-10).reverse(),
    logs: state.logs.slice(-25).reverse(),
    loop: getAutoTradeLoopHealth(),
  };
}