import type { AutoTradeAction } from "./types";

export type SymbolSizingInfo = {
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  contractSize: number;
  digits: number;
};

export type RiskLevels = {
  stopLoss: number;
  takeProfit: number;
  riskPerUnit: number;
};

export function computeRiskLevels(entry: number, atr14: number, action: AutoTradeAction, slAtrMultiplier: number, tpRiskReward: number): RiskLevels {
  const riskPerUnit = Math.max(atr14 * slAtrMultiplier, Number.EPSILON);
  const stopLoss = action === "BUY" ? entry - riskPerUnit : entry + riskPerUnit;
  const takeProfit = action === "BUY" ? entry + riskPerUnit * tpRiskReward : entry - riskPerUnit * tpRiskReward;
  return { stopLoss, takeProfit, riskPerUnit };
}

export type VolumeSizing = {
  volume: number;
  riskAmount: number;
  riskPerUnit: number;
  clipped: boolean;
};

export function sizeVolume(input: {
  equity: number;
  riskPercent: number;
  entry: number;
  stopLoss: number;
  symbol: SymbolSizingInfo;
}): VolumeSizing {
  const { equity, riskPercent, entry, stopLoss, symbol } = input;
  const riskPerUnit = Math.max(Math.abs(entry - stopLoss), Number.EPSILON);
  const riskAmount = (equity * riskPercent) / 100;
  const rawVolume = riskAmount / (riskPerUnit * Math.max(symbol.contractSize, 1));

  const step = symbol.volumeStep > 0 ? symbol.volumeStep : 0.01;
  const volume = roundStep(Math.min(Math.max(rawVolume, symbol.volumeMin), symbol.volumeMax), step);
  const clipped = volume < symbol.volumeMin || volume > symbol.volumeMax || volume !== roundStep(rawVolume, step);

  return { volume, riskAmount, riskPerUnit, clipped };
}

export function roundStep(value: number, step: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const digits = Math.max(0, stepDecimalDigits(step));
  return Number((Math.round(value / step) * step).toFixed(digits));
}

function stepDecimalDigits(step: number): number {
  const text = step.toString();
  const index = text.indexOf(".");
  return index === -1 ? 0 : text.length - index - 1;
}

export function resolveDirection(action: AutoTradeAction, bid?: number, ask?: number, fallbackPrice?: number): number {
  if (action === "BUY") {
    return Number.isFinite(ask) && (ask ?? 0) > 0 ? (ask as number) : Number.isFinite(fallbackPrice) ? (fallbackPrice as number) : Number.NaN;
  }
  return Number.isFinite(bid) && (bid ?? 0) > 0 ? (bid as number) : Number.isFinite(fallbackPrice) ? (fallbackPrice as number) : Number.NaN;
}