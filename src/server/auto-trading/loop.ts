import { runAutoTradeCycle } from "./engine";
import { loadAutoTradeState, saveAutoTradeState } from "./state";

let timer: ReturnType<typeof setInterval> | null = null;
let lastTickAt: number | null = null;
let currentIntervalMs: number | null = null;

export function autoTradeLoopRunning() {
  return timer !== null;
}

export function ensureAutoTradeLoop() {
  const state = loadAutoTradeState();
  if (!state.enabled) {
    stopAutoTradeScheduler();
    return false;
  }

  const intervalMs = Math.max(Number(state.config.loopIntervalMs) || 15000, 5000);
  if (timer) {
    if (currentIntervalMs === intervalMs) {
      return true;
    }
    clearInterval(timer);
  }

  currentIntervalMs = intervalMs;
  timer = setInterval(() => {
    lastTickAt = Date.now();
    void runAutoTradeCycle();
  }, intervalMs);

  return true;
}

export function startAutoTradeScheduler() {
  const state = loadAutoTradeState();
  if (!state.enabled) {
    state.enabled = true;
    state.status = "enabled";
    saveAutoTradeState(state);
  }
  ensureAutoTradeLoop();
  return autoTradeLoopRunning();
}

export function stopAutoTradeScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  return true;
}

export function getAutoTradeLoopHealth() {
  return { running: autoTradeLoopRunning(), lastTickAt };
}