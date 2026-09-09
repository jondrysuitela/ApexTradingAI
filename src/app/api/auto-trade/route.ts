import { NextResponse } from "next/server";
import { checkApiToken } from "@/server/api-token";
import { getActiveBridgeUrl } from "@/server/market-data/bridges";
import { forceCloseAutoTrade, runAutoTradeCycle } from "@/server/auto-trading/engine";
import { ensureAutoTradeLoop, getAutoTradeLoopHealth, startAutoTradeScheduler, stopAutoTradeScheduler } from "@/server/auto-trading/loop";
import { flushPendingAutoTradeState, loadAutoTradeState, saveAutoTradeState, syncAutoTradeStateFromDb } from "@/server/auto-trading/state";
import { AUTO_TRADE_DEFAULTS } from "@/server/auto-trading/types";

export async function GET() {
  await syncAutoTradeStateFromDb();
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
  await syncAutoTradeStateFromDb();
  const state = loadAutoTradeState();

  switch (action) {
    case "start": {
      applyConfigPatch(state.config, body as Record<string, unknown>);
      state.enabled = true;
      state.status = "enabled";
      state.lastError = null;
      saveAutoTradeState(state);
      await flushPendingAutoTradeState();
      startAutoTradeScheduler();
      const cycle = await runAutoTradeCycle();
      return NextResponse.json({ status: await buildStatusBody(loadAutoTradeState()), cycle });
    }
    case "stop": {
      state.enabled = false;
      state.status = "disabled";
      stopAutoTradeScheduler();
      saveAutoTradeState(state);
      await flushPendingAutoTradeState();
      return NextResponse.json({ status: await buildStatusBody(state) });
    }
    case "config": {
      applyConfigPatch(state.config, body as Record<string, unknown>);
      saveAutoTradeState(state);
      await flushPendingAutoTradeState();
      ensureAutoTradeLoop();
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
  if (typeof body.mode === "string" && (body.mode === "demo" || body.mode === "real")) patch.mode = body.mode;
  if (typeof body.tradeMode === "string" && (body.tradeMode === "single" || body.tradeMode === "multi")) patch.tradeMode = body.tradeMode;
  if (typeof body.direction === "string" && (body.direction === "AUTO" || body.direction === "BUY" || body.direction === "SELL")) patch.direction = body.direction;
  if (typeof body.symbol === "string" && /^[A-Za-z0-9_.=^-]+$/.test(body.symbol)) patch.symbol = body.symbol.toUpperCase();
  if (typeof body.timeframe === "string" && ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(body.timeframe)) patch.timeframe = body.timeframe;
  const numbers: Array<"riskPercent" | "fixedLot" | "slAtrMultiplier" | "tpRiskReward" | "minConfluenceScore" | "minScalpingConfidence" | "loopIntervalMs" | "maxOpenPositions"> = [
    "riskPercent",
    "fixedLot",
    "slAtrMultiplier",
    "tpRiskReward",
    "minConfluenceScore",
    "minScalpingConfidence",
    "loopIntervalMs",
    "maxOpenPositions",
  ];
  for (const key of numbers) {
    const value = Number(body[key]);
    if (Number.isFinite(value) && value > 0) patch[key] = value;
  }
  for (const key of ["targetProfitUsd", "maxLossUsd"] as const) {
    const value = Number(body[key]);
    if (Number.isFinite(value) && value >= 0) patch[key] = Math.min(value, 1000);
  }
  if (typeof patch.maxOpenPositions === "number") patch.maxOpenPositions = Math.max(1, Math.round(patch.maxOpenPositions));
  if (body.slSize != null && Number.isFinite(Number(body.slSize)) && Number(body.slSize) > 0) patch.slAtrMultiplier = Number(body.slSize);
  if (body.target != null && Number.isFinite(Number(body.target)) && Number(body.target) > 0) patch.tpRiskReward = Number(body.target);
  Object.assign(config, patch);
}

async function fetchBridgeAccountInfo() {
  const bridge = getActiveBridgeUrl();
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
  const balance = account?.balance ?? 0;
  const equity = account?.equity ?? 0;
  const closedTrades = state.trades.filter((trade) => trade.mode === mode);
  const closedWins = closedTrades.filter((trade) => trade.realizedPnl > 0).length;
  const closedPnl = closedTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  return {
    enabled: state.enabled,
    status: state.status,
    config: state.config,
    position: state.position,
    positions: state.positions,
    account,
    accountConflict,
    stats: {
      trades: closedTrades.length,
      wins: closedWins,
      winRate: closedTrades.length ? (closedWins / closedTrades.length) * 100 : 0,
      realizedPnl: Math.round(closedPnl * 100) / 100,
      balance,
      equity,
    },
    lastCycle: state.lastCycle,
    lastError: state.lastError,
    lastSkipReason: state.lastSkipReason ?? null,
    trades: state.trades.slice(-10).reverse(),
    logs: state.logs.slice(-25).reverse(),
    loop: getAutoTradeLoopHealth(),
  };
}