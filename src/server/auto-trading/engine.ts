import { AppError } from "@/server/errors";
import { analyzeMarket } from "@/server/market-data/analysis";
import { getActiveBridgeUrl } from "@/server/market-data/bridges";
import { getCandles } from "@/server/market-data/service";
import { getSpreadContext } from "@/server/market-data/symbol-context";
import type { Timeframe } from "@/lib/timeframes";
import { addTrackedPosition, appendAutoTradeLog, flushPendingAutoTradeState, getTrackedPositions, loadAutoTradeState, recordAutoTrade, removeTrackedPosition, roundTo, saveAutoTradeState, syncAutoTradeStateFromDb } from "./state";
import { computeRiskLevels, resolveDirection, sizeFixedLot, sizeVolume, type SymbolSizingInfo } from "./risk";
import { evaluateEntry, evaluateExit, evaluateMoneyExit } from "./decision";
import { entryMinimums } from "@/server/technical/strictness";
import { DEFAULT_MARKET_UNIVERSE } from "@/server/market-data/universe";
import { AUTO_MAGIC, type AutoTradeClosedTrade, type AutoTradeMode, type AutoTradePosition, type AutoTradeState } from "./types";

const AUTO_MARKET_SYMBOL = "AUTO";
const AUTO_MARKET_CANDIDATES = DEFAULT_MARKET_UNIVERSE.map((item) => item.symbol);

let cycleRunning = false;

export function isAutoTradeCycleRunning() {
  return cycleRunning;
}

export async function runAutoTradeCycle(): Promise<{ cycled: boolean; message: string }> {
  if (cycleRunning) {
    return { cycled: false, message: "Cycle sebelumnya masih berjalan — skip." };
  }

  cycleRunning = true;
  try {
    return await executeCycle();
  } finally {
    cycleRunning = false;
  }
}

async function executeCycle(): Promise<{ cycled: boolean; message: string }> {
  await syncAutoTradeStateFromDb();
  const state = loadAutoTradeState();
  if (!state.enabled) {
    return { cycled: false, message: "Auto-trade disabled." };
  }

  const bridge = getActiveBridgeUrl() ?? "";
  if (!bridge) {
    markError(state, "Bridge MT5 belum dikonfigurasi.");
    void flushPendingAutoTradeState();
    return { cycled: false, message: "Bridge tidak dikonfigurasi." };
  }

  try {
    const managedClosed = await manageTrackedPositions(state, bridge);
    const positions = getTrackedPositions(state);
    const effectiveMax = state.config.tradeMode === "multi" ? Math.max(1, Math.floor(state.config.maxOpenPositions)) : 1;
    const openCount = await countRealAutoPositions(bridge);

    let message: string;
    if (openCount >= effectiveMax) {
      message =
        state.config.tradeMode === "multi"
          ? `${openCount}/${effectiveMax} posisi berjalan — menunggu slot kosong.`
          : managedClosed || positions.length === 0
            ? "Posisi auto-trade ditutup (TP/SL)."
            : `Posisi ${positions[0]?.action ?? "?"} dipantau (last ${positions[0]?.lastPrice?.toFixed(5) ?? "n/a"}).`;
    } else {
      const opened = await evaluateAndOpen(state, bridge);
      message = opened.message;
    }

    state.status = getTrackedPositions(state).length > 0 ? "position_open" : "enabled";
    state.lastError = null;
    state.lastCycle = { at: new Date().toISOString(), message };
    saveAutoTradeState(state);
    void flushPendingAutoTradeState();
    return { cycled: true, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    appendAutoTradeLog(state, "error", `Cycle error: ${message}`);
    state.lastCycle = { at: new Date().toISOString(), message };
    state.status = "error";
    state.lastError = message;
    saveAutoTradeState(state);
    void flushPendingAutoTradeState();
    return { cycled: false, message };
  }
}

function markError(state: AutoTradeState, message: string) {
  appendAutoTradeLog(state, "error", message);
  state.lastCycle = { at: new Date().toISOString(), message };
  state.status = "error";
  state.lastError = message;
  saveAutoTradeState(state);
}

type SymbolQuote = SymbolSizingInfo & { bid: number | null; ask: number | null; point: number | null; spread: number | null };

async function fetchSymbolQuote(bridge: string, symbol: string): Promise<SymbolQuote> {
  const response = await fetch(`${bridge}/symbol?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new AppError(`Symbol ${symbol} tidak tersedia di bridge.`, 503, "MARKET_DATA_NOT_CONNECTED");
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    volumeMin: toNumber(data.volumeMin, 0.01),
    volumeMax: toNumber(data.volumeMax, 100),
    volumeStep: toNumber(data.volumeStep, 0.01),
    contractSize: toNumber(data.contractSize, 100),
    digits: toNumber(data.digits, 2),
    bid: toFinite(data.bid),
    ask: toFinite(data.ask),
    point: toFinite(data.point),
    spread: toFinite(data.spread),
  };
}

async function fetchAccountEquity(bridge: string): Promise<{ equity: number; balance: number; tradeAllowed: boolean; accountType: string | null; login: number | null; server: string | null }> {
  const response = await fetch(`${bridge}/account`, { cache: "no-store" });
  if (!response.ok) {
    throw new AppError("Akun MT5 tidak tersedia.", 503, "MARKET_DATA_NOT_CONNECTED");
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    equity: toNumber(data.equity, 0),
    balance: toNumber(data.balance, 0),
    tradeAllowed: data.tradeAllowed !== false,
    accountType: typeof data.accountType === "string" ? data.accountType : null,
    login: typeof data.login === "number" ? data.login : null,
    server: typeof data.server === "string" ? data.server : null,
  };
}

async function manageTrackedPositions(state: AutoTradeState, bridge: string): Promise<boolean> {
  const positions = getTrackedPositions(state);
  if (positions.length === 0) return false;

  const livePositions = await fetchBridgePositions(bridge, "");
  const byTicket = new Map(livePositions.map((item) => [String(item.ticket), item]));
  const closedThisCycle = new Set<string>();
  let closedAny = false;

  for (const position of [...positions]) {
    if (!state.positions.some((item) => item.ticket === position.ticket)) continue;
    const live = byTicket.get(position.ticket);
    if (!live) {
      const lastPrice = position.lastPrice;
      const exitReason = lastPrice !== null ? (evaluateExit(position, lastPrice) ?? "MANUAL") : "MANUAL";
      const exitPrice = lastPrice ?? position.entryPrice;
      closeTrackedPosition(state, position, exitPrice, exitReason);
      closedThisCycle.add(position.ticket);
      closedAny = true;
      continue;
    }
    position.lastPrice = toFinite(live.priceCurrent) ?? position.lastPrice;
    position.stopLoss = toFinite(live.sl) ?? position.stopLoss;
    position.takeProfit = toFinite(live.tp) ?? position.takeProfit;
    const unrealized = computeRealizedPnl(position.action, position.entryPrice, position.lastPrice ?? position.entryPrice, position.volume, position.contractSize);
    const moneyExit = evaluateMoneyExit(unrealized, state.config.targetProfitUsd, state.config.maxLossUsd);
    if (moneyExit) {
      const closed = await closeMoneyExit(state, bridge, position, moneyExit);
      if (closed) {
        closedThisCycle.add(position.ticket);
        closedAny = true;
        continue;
      }
    }
    const rMultiple = computeR(position, position.lastPrice ?? position.entryPrice);
    appendAutoTradeLog(state, "info", `Posisi real ${live.typeLabel} ${position.volume} (${position.symbol}) berjalan (unrealized ${roundTo(unrealized, 2)}, ${rMultiple.toFixed(2)}R).`);
  }

  for (const live of livePositions) {
    if (live.magic !== AUTO_MAGIC) continue;
    if (closedThisCycle.has(String(live.ticket))) continue;
    if (state.positions.some((item) => String(item.ticket) === String(live.ticket))) continue;
    const adopted = await adoptBridgePosition(state, bridge, live);
    if (adopted) {
      addTrackedPosition(state, adopted);
      appendAutoTradeLog(state, "info", `Posisi real ${live.typeLabel} ${adopted.symbol} (${adopted.ticket}) diadopsi untuk dipantau.`);
    }
  }
  return closedAny;
}

async function closeMoneyExit(state: AutoTradeState, bridge: string, position: AutoTradePosition, exit: { reason: "TP" | "SL"; target: number; unrealized: number }): Promise<boolean> {
  const response = await fetch(`${bridge}/close`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket: Number(position.ticket), deviation: 20 }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.filled !== true) {
    const label = String(data.retcodeLabel ?? data.detail ?? "rejected");
    appendAutoTradeLog(state, "warn", `Close ${exit.reason === "TP" ? "profit cap" : "loss cap"} ${position.ticket} gagal: ${label}`);
    return false;
  }
  const exitPrice = toFinite(data.price) ?? position.lastPrice ?? position.entryPrice;
  closeTrackedPosition(state, position, exitPrice, exit.reason);
  appendAutoTradeLog(
    state,
    "info",
    `${exit.reason === "TP" ? "Profit cap" : "Loss cap"} tercapai: unrealized $${roundTo(exit.unrealized, 2)} (target $${exit.target.toFixed(2)}) — posisi ${position.ticket} ditutup @ ${exitPrice.toFixed(5)}.`,
  );
  return true;
}

async function adoptBridgePosition(state: AutoTradeState, bridge: string, live: BridgePosition): Promise<AutoTradePosition | null> {
  try {
    const quote = await fetchSymbolQuote(bridge, live.symbol);
    return {
      ticket: String(live.ticket),
      mode: state.config.mode,
      symbol: live.symbol,
      timeframe: state.config.timeframe,
      action: live.type === 0 ? "BUY" : "SELL",
      entryPrice: live.priceOpen,
      stopLoss: live.sl ?? 0,
      takeProfit: live.tp ?? 0,
      volume: live.volume,
      contractSize: quote.contractSize,
      riskPerUnit: Math.abs(live.priceOpen - (live.sl ?? live.priceOpen)),
      riskAmount: 0,
      openedAt: new Date().toISOString(),
      lastPrice: live.priceCurrent,
    };
  } catch {
    return null;
  }
}

type SymbolCandidateEvaluation =
  | { symbol: string; allowed: false; reason: string; score: number; confidence: number }
  | { symbol: string; allowed: true; reason: string; score: number; confidence: number; direction: "LONG" | "SHORT"; entry: number; stopLoss: number; takeProfit: number; symbolQuote: SymbolQuote };

async function evaluateAndOpen(state: AutoTradeState, bridge: string): Promise<{ message: string }> {
  const cfg = state.config;
  const autoMode = cfg.symbol === AUTO_MARKET_SYMBOL;
  const candidates = autoMode ? AUTO_MARKET_CANDIDATES : [cfg.symbol];

  let bestTried: SymbolCandidateEvaluation | null = null;
  const qualifying: Array<Extract<SymbolCandidateEvaluation, { allowed: true }>> = [];

  for (const symbol of candidates) {
    let evaluated: SymbolCandidateEvaluation;
    try {
      evaluated = await evaluateSymbolEntry(state, bridge, symbol, cfg.timeframe as Timeframe);
    } catch {
      continue;
    }
    if (!bestTried || evaluated.score > bestTried.score) bestTried = evaluated;
    if (evaluated.allowed) qualifying.push(evaluated);
  }

  if (!autoMode) {
    const single = bestTried;
    const reason = single?.reason ?? "Evaluasi entri gagal.";
    if (!single?.allowed) {
      const skipLog = `Skip entry: ${reason}`;
      if (state.lastSkipReason !== skipLog) {
        state.lastSkipReason = skipLog;
        appendAutoTradeLog(state, "info", skipLog);
      }
      state.lastError = null;
      return { message: reason };
    }
    return openEvaluatedEntry(state, bridge, cfg, single);
  }

  if (qualifying.length === 0) {
    const reason = bestTried ? (bestTried.allowed ? "data tidak lengkap" : bestTried.reason) : "tidak ada data pasar";
    const skipLog = bestTried
      ? `Auto market: pasar terbaik ${bestTried.symbol} (score ${bestTried.score.toFixed(0)}) gagal — ${reason}.`
      : "Auto market: tidak ada pasar tersedia.";
    if (state.lastSkipReason !== skipLog) {
      state.lastSkipReason = skipLog;
      appendAutoTradeLog(state, "info", skipLog);
    }
    state.lastError = null;
    return { message: skipLog };
  }

  const best = qualifying.reduce((top, item) => {
    if (item.score > top.score) return item;
    if (item.score === top.score && item.confidence > top.confidence) return item;
    return top;
  }, qualifying[0]);

  appendAutoTradeLog(state, "info", `Auto market: memilih ${best.symbol} (score ${best.score.toFixed(0)}, ${best.direction}).`);
  return openEvaluatedEntry(state, bridge, cfg, best);
}

async function evaluateSymbolEntry(state: AutoTradeState, bridge: string, symbol: string, timeframe: Timeframe): Promise<SymbolCandidateEvaluation> {
  const cfg = state.config;
  const [candles, spread] = await Promise.all([
    getCandles(symbol, timeframe, 220),
    getSpreadContext(symbol, bridge).catch(() => null),
  ]);
  const analysis = analyzeMarket(symbol, timeframe, candles, spread);
  const confluence = analysis.signal?.confluence ?? null;
  const scalping = confluence?.scalping ?? null;
  const atr14 = analysis.indicators.atr14;
  const score = Math.round(confluence?.score ?? 0);
  const confidence = scalping?.confidence ?? confluence?.score ?? 0;

  if (atr14 === null || atr14 <= 0) {
    return { symbol, allowed: false, score, confidence, reason: "ATR tidak tersedia — tidak bisa proses SL/TP." };
  }

  const mins = entryMinimums(timeframe);
  const decision = evaluateEntry({
    scalping,
    confluence,
    config: {
      minConfluenceScore: Math.max(cfg.minConfluenceScore, mins.minConfluenceScore),
      minScalpingConfidence: Math.max(cfg.minScalpingConfidence, mins.minScalpingConfidence),
    },
  });
  if (!decision.allowed) {
    return { symbol, allowed: false, score, confidence, reason: decision.reason };
  }

  const direction = decision.direction as "LONG" | "SHORT";
  if ((cfg.direction === "BUY" && direction !== "LONG") || (cfg.direction === "SELL" && direction !== "SHORT")) {
    return { symbol, allowed: false, score, confidence, reason: `Arah dipaksa ${cfg.direction}, tapi sinyal ${direction} — skip.` };
  }

  const symbolQuote = await fetchSymbolQuote(bridge, symbol);
  const entry = resolveDirection(direction === "LONG" ? "BUY" : "SELL", symbolQuote.bid ?? undefined, symbolQuote.ask ?? undefined, candles.at(-1)?.close);
  if (!Number.isFinite(entry)) {
    return { symbol, allowed: false, score, confidence, reason: "Entry price tidak valid — data quote/candle kosong." };
  }

  const { stopLoss, takeProfit } = computeRiskLevels(entry, atr14, direction === "LONG" ? "BUY" : "SELL", cfg.slAtrMultiplier, cfg.tpRiskReward);
  return { symbol, allowed: true, reason: "OK", score, confidence, direction, entry, stopLoss, takeProfit, symbolQuote };
}

async function openEvaluatedEntry(state: AutoTradeState, bridge: string, cfg: AutoTradeState["config"], evaluated: Extract<SymbolCandidateEvaluation, { allowed: true }>): Promise<{ message: string }> {
  const { symbol, direction, entry, stopLoss, takeProfit, symbolQuote } = evaluated;

  const account = await fetchAccountEquity(bridge);
  const equity = Math.max(account.equity, account.balance);
  if (equity <= 0) {
    throw new Error(`Equity tidak valid: ${equity}`);
  }

  const sizing =
    cfg.fixedLot > 0
      ? sizeFixedLot({ lot: cfg.fixedLot, entry, stopLoss, symbol: symbolQuote })
      : sizeVolume({ equity, riskPercent: cfg.riskPercent, entry, stopLoss, symbol: symbolQuote });

  if (!account.tradeAllowed) {
    appendAutoTradeLog(state, "warn", "Auto trading MT5 mati (tradeAllowed=false) — entry batal.");
    return { message: "Algo trading MT5 nonaktif — entry batal." };
  }
  const accountType = account.accountType;
  if (accountType) {
    const mismatch = cfg.mode === "real" ? accountType !== "real" : accountType === "real";
    if (mismatch) {
      const msg = `Mode ${cfg.mode.toUpperCase()} tetapi terminal terkoneksi akun ${accountType.toUpperCase()} (${account.login ?? "?"}@${account.server ?? "?"}) — entry dibatalkan demi keamanan.`;
      appendAutoTradeLog(state, "error", msg);
      return { message: msg };
    }
  }
  if (await hasReachedPositionLimit(cfg, bridge)) {
    return { message: cfg.tradeMode === "multi" ? "Jumlah posisi auto-trade sudah mencapai batas (multi)." : "Jumlah posisi auto-trade real sudah mencapai batas maksimal." };
  }
  return openRealPosition(state, bridge, { symbol, timeframe: cfg.timeframe }, entry, stopLoss, takeProfit, sizing.volume, sizing.riskAmount, direction, cfg.mode, symbolQuote.contractSize);
}

async function hasReachedPositionLimit(cfg: AutoTradeState["config"], bridge: string): Promise<boolean> {
  const effectiveMax = cfg.tradeMode === "multi" ? Math.max(1, Math.floor(cfg.maxOpenPositions)) : 1;
  const openCount = await countRealAutoPositions(bridge);
  return openCount >= effectiveMax;
}

async function countRealAutoPositions(bridge: string): Promise<number> {
  const positions = await fetchBridgePositions(bridge, "");
  return positions.filter((item) => item.magic === AUTO_MAGIC).length;
}

async function openRealPosition(
  state: AutoTradeState,
  bridge: string,
  cfg: { symbol: string; timeframe: string },
  entry: number,
  stopLoss: number,
  takeProfit: number,
  volume: number,
  riskAmount: number,
  direction: "LONG" | "SHORT",
  mode: AutoTradeMode,
  contractSize: number,
) {
  const response = await fetch(`${bridge}/order`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      symbol: cfg.symbol,
      side: direction === "LONG" ? "buy" : "sell",
      volume,
      sl: stopLoss,
      tp: takeProfit,
      deviation: 20,
      magic: AUTO_MAGIC,
      comment: `auto:${cfg.timeframe}`,
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail = String(data.detail ?? data.error ?? `HTTP ${response.status}`);
    appendAutoTradeLog(state, "error", `Order real ditolak: ${detail}`);
    throw new AppError(detail, 400, "BRIDGE_ORDER_REJECTED");
  }
  if (data.filled !== true) {
    const label = String(data.retcodeLabel ?? data.retcode ?? "rejected");
    appendAutoTradeLog(state, "warn", `Order real tidak terisi: ${label}`);
    return { message: `Order real ditolak: ${label}` };
  }

  const price = toFinite(data.price) ?? entry;
  const order = (data.order ?? {}) as Record<string, unknown>;
  const deal = (data.deal ?? {}) as Record<string, unknown>;
  const ticket = String(order.ticket ?? deal.deal ?? `real-${Date.now()}`);

  const position: AutoTradePosition = {
    ticket,
    mode,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    action: direction === "LONG" ? "BUY" : "SELL",
    entryPrice: price,
    stopLoss,
    takeProfit,
    volume: toFinite(data.volume) ?? volume,
    contractSize,
    riskPerUnit: Math.abs(price - stopLoss),
    riskAmount,
    openedAt: new Date().toISOString(),
    lastPrice: price,
  };
  addTrackedPosition(state, position);
  appendAutoTradeLog(state, "trade", `Real ${direction} ${position.volume} ticket ${ticket} @ ${price.toFixed(5)} (SL ${stopLoss.toFixed(5)}, TP ${takeProfit.toFixed(5)}, risiko $${roundTo(riskAmount, 2)}).`);

  return { message: `${direction} real (${ticket}) @ ${price.toFixed(5)} — SL ${stopLoss.toFixed(5)}, TP ${takeProfit.toFixed(5)}.` };
}

function closeTrackedPosition(state: AutoTradeState, position: AutoTradePosition, exitPrice: number, exitReason: "TP" | "SL" | "MANUAL") {
  const realizedPnl = computeRealizedPnl(position.action, position.entryPrice, exitPrice, position.volume, position.contractSize);
  const rMultiple = computeR(position, exitPrice);
  const closedAt = new Date().toISOString();

  const trade: AutoTradeClosedTrade = {
    ticket: position.ticket,
    mode: position.mode,
    symbol: position.symbol,
    timeframe: position.timeframe,
    action: position.action,
    entryPrice: position.entryPrice,
    exitPrice,
    exitReason,
    volume: position.volume,
    contractSize: position.contractSize,
    riskPerUnit: position.riskPerUnit,
    rMultiple,
    realizedPnl,
    openedAt: position.openedAt,
    closedAt,
  };
  recordAutoTrade(state, trade);
  appendAutoTradeLog(state, "trade", `Closed ${position.action} ${position.symbol} @ ${exitPrice.toFixed(5)} (${exitReason}) → ${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R, PnL $${roundTo(realizedPnl, 2)}.`);
  removeTrackedPosition(state, position.ticket);
  return true;
}

export function computeR(position: Pick<AutoTradePosition, "action" | "entryPrice" | "stopLoss">, exitPrice: number): number {
  const riskPerUnit = Math.abs(position.entryPrice - position.stopLoss);
  if (riskPerUnit <= 0) return 0;
  return position.action === "BUY" ? (exitPrice - position.entryPrice) / riskPerUnit : (position.entryPrice - exitPrice) / riskPerUnit;
}

export function computeRealizedPnl(action: "BUY" | "SELL", entry: number, exitPrice: number, volume: number, contractSize: number): number {
  const signed = action === "BUY" ? 1 : -1;
  return (exitPrice - entry) * volume * contractSize * signed;
}

export async function forceCloseAutoTrade(): Promise<{ closed: boolean; message: string }> {
  await syncAutoTradeStateFromDb();
  const state = loadAutoTradeState();
  const positions = getTrackedPositions(state);
  if (positions.length === 0) {
    return { closed: false, message: "Tidak ada posisi auto-trade untuk ditutup." };
  }
  const bridge = getActiveBridgeUrl() ?? "";
  let closedCount = 0;
  let lastError: string | null = null;

  for (const position of [...positions]) {
    if (!state.positions.some((item) => item.ticket === position.ticket)) continue;
    const response = await fetch(`${bridge}/close`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: Number(position.ticket), deviation: 20 }),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || data.filled !== true) {
      const label = String(data.retcodeLabel ?? data.detail ?? "rejected");
      lastError = `Tutup posisi real ${position.ticket} gagal: ${label}`;
      appendAutoTradeLog(state, "error", lastError);
      continue;
    }
    const price = toFinite(data.price) ?? position.lastPrice ?? position.entryPrice;
    closeTrackedPosition(state, position, price, "MANUAL");
    closedCount += 1;
  }

  if (closedCount === 0) {
    throw new AppError(lastError ?? "Semua posisi gagal ditutup.", 400, "BRIDGE_ORDER_REJECTED");
  }
  state.lastCycle = {
    at: new Date().toISOString(),
    message: closedCount > 1 ? `${closedCount} posisi ditutup manual.` : `Posisi ${positions[0].action} ditutup manual.`,
  };
  saveAutoTradeState(state);
  await flushPendingAutoTradeState();
  return { closed: true, message: closedCount > 1 ? `${closedCount} posisi ditutup manual.` : `Posisi ${positions[0].action} (${positions[0].ticket}) ditutup @ ${positions[0].lastPrice?.toFixed(5) ?? "n/a"}.` };
}

type BridgePosition = { ticket: number; symbol: string; type: number; typeLabel: string; volume: number; priceOpen: number; priceCurrent: number; sl: number | null; tp: number | null; profit: number; magic: number; comment: string };

async function fetchBridgePositions(bridge: string, symbol: string): Promise<BridgePosition[]> {
  const response = await fetch(`${bridge}/positions?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new AppError("Tidak bisa membaca posisi MT5.", 503, "MARKET_DATA_NOT_CONNECTED");
  }
  const data = (await response.json()) as { positions?: Array<Partial<BridgePosition>> };
  return (data.positions ?? []).map((item) => ({
    ticket: Number(item.ticket ?? 0),
    symbol: String(item.symbol ?? symbol),
    type: Number(item.type ?? 0),
    typeLabel: String(item.typeLabel ?? ""),
    volume: Number(item.volume ?? 0),
    priceOpen: Number(item.priceOpen ?? 0),
    priceCurrent: Number(item.priceCurrent ?? 0),
    sl: toFinite(item.sl),
    tp: toFinite(item.tp),
    profit: Number(item.profit ?? 0),
    magic: Number(item.magic ?? 0),
    comment: String(item.comment ?? ""),
  }));
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFinite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}