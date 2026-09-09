export type AiAlertAction = "BUY" | "SELL" | "WAIT";

export type AiAlert = {
  id: string;
  symbol: string;
  timeframe: string;
  action: AiAlertAction;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  reason: string;
  timestamp: string;
};

export type AlertSnapshot = {
  action: AiAlertAction;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  reason: string;
};

export type AlertState = {
  action: AiAlertAction;
  confidence: number;
  updatedAt: string;
  lastAlertId: string | null;
  lastTransitionAt: string | null;
};

export type AlertContext = {
  state: AlertState;
  latest: AiAlert | null;
  history: AiAlert[];
};

const COOLDOWN_MS = 90_000;
const MIN_CONFIDENCE = 50;
const CONFIDENCE_JUMP = 15;
const CONFIDENCE_TIERS = [50, 70, 85];
const HISTORY_CAP = 10;

const store = new Map<string, AlertState>();
const history = new Map<string, AiAlert[]>();

function tierOf(confidence: number): number {
  return CONFIDENCE_TIERS.filter((tier) => confidence >= tier).length;
}

export function computeAlert(
  previous: AlertState | null,
  snapshot: AlertSnapshot,
  symbol: string,
  timeframe: string,
  now = Date.now(),
): AiAlert | null {
  if (previous !== null && previous.action === "WAIT" && snapshot.action === "WAIT" && snapshot.confidence < MIN_CONFIDENCE) {
    return null;
  }

  const isFirst = previous === null;
  const hardChange = previous !== null && previous.action !== snapshot.action;
  const confidenceJump = previous !== null && Math.abs(snapshot.confidence - previous.confidence) >= CONFIDENCE_JUMP;
  const tierBump = previous !== null && tierOf(snapshot.confidence) > tierOf(previous.confidence);

  if (!isFirst && !hardChange && !confidenceJump && !tierBump) {
    return null;
  }

  const lastTransition = previous?.lastTransitionAt ? Date.parse(previous.lastTransitionAt) : null;
  const cooldownOk = lastTransition === null || isFirst || now - lastTransition >= COOLDOWN_MS;
  if (!cooldownOk && !hardChange) {
    return null;
  }

  return {
    id: `alert-${now}-${Math.random().toString(36).slice(2, 7)}`,
    symbol,
    timeframe,
    action: snapshot.action,
    bias: snapshot.bias,
    confidence: snapshot.confidence,
    reason: snapshot.action === "WAIT" && !snapshot.reason ? "Tidak ada setup valid saat ini — tunggu." : snapshot.reason,
    timestamp: new Date(now).toISOString(),
  };
}

export function registerAlertSnapshot(symbol: string, timeframe: string, snapshot: AlertSnapshot, now = Date.now()): AlertContext {
  const key = alertKey(symbol, timeframe);
  const previous = store.get(key) ?? null;
  const alert = computeAlert(previous, snapshot, symbol, timeframe, now);

  const state: AlertState = {
    action: snapshot.action,
    confidence: snapshot.confidence,
    updatedAt: new Date(now).toISOString(),
    lastAlertId: previous?.lastAlertId ?? null,
    lastTransitionAt: previous?.lastTransitionAt ?? null,
  };
  if (alert) {
    state.lastAlertId = alert.id;
    state.lastTransitionAt = alert.timestamp;
    const list = history.get(key) ?? [];
    list.unshift(alert);
    history.set(key, list.slice(0, HISTORY_CAP));
  }
  store.set(key, state);

  return { state, latest: alert, history: history.get(key) ?? [] };
}

export function getAlertContext(symbol: string, timeframe: string): AlertContext {
  const key = alertKey(symbol, timeframe);
  return {
    state: store.get(key) ?? { action: "WAIT", confidence: 0, updatedAt: "", lastAlertId: null, lastTransitionAt: null },
    latest: history.get(key)?.[0] ?? null,
    history: history.get(key) ?? [],
  };
}

function alertKey(symbol: string, timeframe: string) {
  return `${symbol.toUpperCase()}:${timeframe}`;
}