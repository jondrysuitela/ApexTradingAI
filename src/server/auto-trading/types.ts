export type AutoTradeMode = "paper" | "demo" | "real";
export type AutoTradeAction = "BUY" | "SELL";
export type AutoTradeDirection = "AUTO" | "BUY" | "SELL";
export type AutoTradeStatus = "disabled" | "enabled" | "position_open" | "error";

export type AutoTradeConfig = {
  mode: AutoTradeMode;
  symbol: string;
  timeframe: string;
  direction: AutoTradeDirection;
  riskPercent: number;
  fixedLot: number;
  slAtrMultiplier: number;
  tpRiskReward: number;
  maxOpenPositions: number;
  minConfluenceScore: number;
  minScalpingConfidence: number;
  loopIntervalMs: number;
};

export type AutoTradePosition = {
  ticket: string;
  mode: AutoTradeMode;
  symbol: string;
  timeframe: string;
  action: AutoTradeAction;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  volume: number;
  contractSize: number;
  riskPerUnit: number;
  riskAmount: number;
  openedAt: string;
  lastPrice: number | null;
};

export type AutoTradeClosedTrade = {
  ticket: string;
  mode: AutoTradeMode;
  symbol: string;
  timeframe: string;
  action: AutoTradeAction;
  entryPrice: number;
  exitPrice: number;
  exitReason: "TP" | "SL" | "MANUAL";
  volume: number;
  contractSize: number;
  riskPerUnit: number;
  rMultiple: number;
  realizedPnl: number;
  openedAt: string;
  closedAt: string;
};

export type AutoTradeLog = {
  ts: string;
  level: "info" | "warn" | "error" | "trade";
  message: string;
};

export type AutoTradeState = {
  enabled: boolean;
  status: AutoTradeStatus;
  config: AutoTradeConfig;
  position: AutoTradePosition | null;
  paper: {
    balance: number;
    equity: number;
    realizedPnl: number;
    trades: number;
    wins: number;
  };
  lastCycle: { at: string; message: string } | null;
  lastError: string | null;
  lastSkipReason?: string;
  logs: AutoTradeLog[];
  trades: AutoTradeClosedTrade[];
};

export const AUTO_TRADE_DEFAULTS: AutoTradeConfig = {
  mode: "paper",
  symbol: "XAUUSD",
  timeframe: "5m",
  direction: "AUTO",
  riskPercent: 1,
  fixedLot: 0.01,
  slAtrMultiplier: 0.75,
  tpRiskReward: 5,
  maxOpenPositions: 1,
  minConfluenceScore: 40,
  minScalpingConfidence: 40,
  loopIntervalMs: 15000,
};

export const AUTO_MAGIC = 424242;