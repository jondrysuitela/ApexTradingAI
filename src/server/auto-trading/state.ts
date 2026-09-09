import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { autoTradeState as autoTradeStateTable } from "@/server/db/schema";
import { AUTO_TRADE_DEFAULTS, type AutoTradeClosedTrade, type AutoTradeConfig, type AutoTradeLog, type AutoTradePosition, type AutoTradeState } from "./types";

const STATE_DIR = path.join(process.cwd(), "data", "auto-trade");
const STATE_FILE = path.join(STATE_DIR, "state.json");

const SINGLETON_ID = 1;
const MAX_LOGS = 80;
const MAX_TRADES = 50;
const FLUSH_DELAY_MS = 800;

let cache: AutoTradeState | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceError: string | null = null;
let flushInFlight: Promise<void> | null = null;
const FLUSH_RETRIES = 3;
const FLUSH_RETRY_DELAY_MS = 250;

export function loadAutoTradeState(): AutoTradeState {
  if (!cache) {
    cache = loadFromDisk();
  }
  return cache;
}

export async function syncAutoTradeStateFromDb(): Promise<void> {
  const db = getDb();
  if (!db) {
    if (!cache) cache = loadFromDisk();
    return;
  }

  try {
    const rows = await db.select().from(autoTradeStateTable).where(eq(autoTradeStateTable.id, SINGLETON_ID)).limit(1);
    if (rows[0]?.data) {
      cache = normalizeState(rows[0].data as Partial<AutoTradeState>);
      writeFile(cache);
    } else if (!cache) {
      cache = loadFromDisk();
    }
    persistenceError = null;
  } catch (error) {
    persistenceError = dbErrorMessage(error);
    if (!cache) cache = loadFromDisk();
  }
}

export function saveAutoTradeState(state: AutoTradeState) {
  cache = state;
  writeFile(state);
  scheduleFlush();
}

export async function flushPendingAutoTradeState(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushToDb();
}

export function getAutoTradePersistenceError(): string | null {
  return persistenceError;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushToDb();
  }, FLUSH_DELAY_MS);
}

async function flushToDb(): Promise<void> {
  if (flushInFlight) {
    return flushInFlight;
  }
  flushInFlight = doFlush();
  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

async function doFlush(): Promise<void> {
  const db = getDb();
  if (!db || !cache) return;

  for (let attempt = 0; attempt < FLUSH_RETRIES; attempt += 1) {
    try {
      await db
        .insert(autoTradeStateTable)
        .values({ id: SINGLETON_ID, data: cache as unknown as Record<string, unknown>, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: autoTradeStateTable.id,
          set: { data: cache as unknown as Record<string, unknown>, updatedAt: new Date() },
        });
      persistenceError = null;
      return;
    } catch (error) {
      persistenceError = dbErrorMessage(error);
      if (attempt < FLUSH_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, FLUSH_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
}

function loadFromDisk(): AutoTradeState {
  const fallback = freshState();
  if (!fs.existsSync(STATE_FILE)) {
    return fallback;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Partial<AutoTradeState>;
    return normalizeState(raw);
  } catch {
    return fallback;
  }
}

function normalizeState(raw: Partial<AutoTradeState>): AutoTradeState {
  const fallback = freshState();
  return {
    ...fallback,
    ...raw,
    config: { ...AUTO_TRADE_DEFAULTS, ...(raw.config ?? {}) },
    paper: { ...fallback.paper, ...(raw.paper ?? {}) },
    position: raw.position ?? null,
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    trades: Array.isArray(raw.trades) ? raw.trades : [],
  };
}

function writeFile(state: AutoTradeState) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // File is only a local fallback; DB is the source of truth when configured.
  }
}

function dbErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Auto-trade DB sync failed";
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
  if (trade.mode === "paper") {
    state.paper.trades += 1;
    if (trade.realizedPnl > 0) {
      state.paper.wins += 1;
    }
    state.paper.realizedPnl = roundTo(state.paper.realizedPnl + trade.realizedPnl, 2);
    state.paper.balance = roundTo(state.paper.balance + trade.realizedPnl, 2);
    state.paper.equity = roundTo(state.paper.equity + trade.realizedPnl, 2);
  }
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