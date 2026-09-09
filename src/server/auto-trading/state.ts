import fs from "node:fs";
import path from "node:path";
import { AUTO_TRADE_DEFAULTS, type AutoTradeClosedTrade, type AutoTradeConfig, type AutoTradeLog, type AutoTradePosition, type AutoTradeState } from "./types";

const STATE_DIR = path.join(process.cwd(), "data", "auto-trade");
const STATE_FILE = path.join(STATE_DIR, "state.json");

const MAX_LOGS = 80;
const MAX_TRADES = 50;

export function loadAutoTradeState(): AutoTradeState {
  const fallback = freshState();
  if (!fs.existsSync(STATE_FILE)) {
    return fallback;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Partial<AutoTradeState>;
    return {
      ...fallback,
      ...raw,
      config: { ...AUTO_TRADE_DEFAULTS, ...(raw.config ?? {}) },
      paper: { ...fallback.paper, ...(raw.paper ?? {}) },
      position: raw.position ?? null,
      logs: Array.isArray(raw.logs) ? raw.logs : [],
      trades: Array.isArray(raw.trades) ? raw.trades : [],
    };
  } catch {
    return fallback;
  }
}

export function saveAutoTradeState(state: AutoTradeState) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function freshState(): AutoTradeState {
  return {
    enabled: false,
    status: "disabled",
    config: { ...AUTO_TRADE_DEFAULTS },
    position: null,
    paper: { balance: 10000, equity: 10000, realizedPnl: 0, trades: 0, wins: 0 },
    lastCycle: null,
    lastError: null,
    logs: [],
    trades: [],
  };
}

export function appendAutoTradeLog(state: AutoTradeState, level: AutoTradeLog["level"], message: string) {
  const entry: AutoTradeLog = { ts: new Date().toISOString(), level, message };
  state.logs = [...state.logs, entry].slice(-MAX_LOGS);
}

export function recordAutoTrade(state: AutoTradeState, trade: AutoTradeClosedTrade) {
  state.trades = [...state.trades, trade].slice(-MAX_TRADES);
  state.paper.trades += 1;
  if (trade.realizedPnl > 0) {
    state.paper.wins += 1;
  }
  state.paper.realizedPnl = roundTo(state.paper.realizedPnl + trade.realizedPnl, 2);
  state.paper.balance = roundTo(state.paper.balance + trade.realizedPnl, 2);
  state.paper.equity = roundTo(state.paper.equity + trade.realizedPnl, 2);
}

export function setPosition(state: AutoTradeState, position: AutoTradePosition | null) {
  state.position = position;
  state.status = position ? "position_open" : "enabled";
}

export function roundTo(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function updateAutoTradeConfig(state: AutoTradeState, patch: Partial<AutoTradeConfig>) {
  state.config = { ...state.config, ...patch };
}

export type { AutoTradeConfig, AutoTradePosition, AutoTradeClosedTrade };