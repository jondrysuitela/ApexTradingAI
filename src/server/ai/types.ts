export type AIProviderName = "openai" | "anthropic" | "google" | "openrouter" | "local";

export type AIAnalysisInput = {
  symbol: string;
  timeframe: string;
  latestClose: number | null;
  indicators: {
    sma20: number | null;
    ema20: number | null;
    rsi14: number | null;
    atr14: number | null;
  };
  structure: Array<{ type: string; timestamp: string; price: number; strength: number; source: string }>;
  supportResistance: Array<{ price: number; type: "support" | "resistance"; strength: number; touchCount: number; lastReaction: string; distanceFromCurrentPrice: number }>;
  setup: { state: string; score: number; setupType: string; direction: "LONG" | "SHORT" | "NEUTRAL"; entryZone: { low: number; high: number } | null; invalidation: number | null; targets: number[]; timestamp: string } | null;
  confirmations?: Array<{ timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; latestClose: number | null }>;
  multiTimeframe?: { alignment: "LONG" | "SHORT" | "NEUTRAL"; longVotes: number; shortVotes: number; neutralVotes: number };
  signal?: { action: "BUY" | "SELL" | "WAIT"; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; entryZone: { low: number; high: number } | null; stopLoss: number | null; targets: number[]; riskReward: number | null; reasons: string[]; warnings: string[] };
  confluence?: {
    score: number;
    direction: "LONG" | "SHORT" | "NEUTRAL";
    confidence: number;
    factors: Array<{ name: string; weight: number; score: number; direction: "LONG" | "SHORT" | "NEUTRAL"; detail: string }>;
    regime: { trend: string; volatility: string; momentum: string; regimeLabel: string };
    narrative: string;
    orderFlow?: {
      vwap: {
        vwap: number | null;
        upper1: number | null;
        lower1: number | null;
        position: string;
        deviationPct: number | null;
      };
      volumeProfile: { poc: number | null; vah: number | null; val: number | null; valueAreaPct: number | null } | null;
      delta: { buyVolume: number; sellVolume: number; totalVolume: number; imbalance: number; cvd: number; cvdDirection: string; aggressiveMomentum: string } | null;
      sweeps: Array<{ direction: "LONG" | "SHORT"; levelPrice: number; strength: number }>;
      fvgs: Array<{ direction: "BULLISH" | "BEARISH"; top: number; bottom: number; fresh: boolean }>;
      orderBlocks: Array<{ direction: "BULLISH" | "BEARISH"; high: number; low: number }>;
      fib: { direction: "UP" | "DOWN"; swingLow: number; swingHigh: number; nearest: { level: { ratio: number; price: number; kind: string }; distancePct: number } | null } | null;
    };
    learning?: Array<{
      name: string;
      samples: number;
      winRate: number;
      edge: number;
      weight: number;
      directionBias: "LONG" | "SHORT" | "NEUTRAL";
    }>;
  };
  strategyVote?: {
    longWeight: number;
    shortWeight: number;
    totalWeight: number;
    strategyCount: number;
    agreeingCount: number;
    topStrategy: string | null;
    detail: string;
  };
  backtest?: {
    winRate: number | null;
    avgProfitPct: number | null;
    avgLossPct: number | null;
    expectancyPct: number | null;
    totalSignals: number;
    edge: string;
  };
  scalping?: {
    direction: "LONG" | "SHORT" | "NEUTRAL";
    confidence: number;
    score: number;
    reasoning: string[];
    entryType: "PULLBACK" | "BREAKOUT" | "RANGE_BOUNCE" | "MOMENTUM" | "NO_EDGE";
    volatility: "COMPRESSED" | "SCALPABLE" | "WIDE" | "EXTREME";
    atrPercent: number | null;
    session?: {
      name: string;
      label: string;
      liquidity: "BEST" | "HIGH" | "GOOD" | "LOW" | "POOR";
      block: boolean;
      note: string;
    };
    spread?: {
      points: number | null;
      price: number | null;
      atrCoverPct: number | null;
      block: boolean;
      note: string;
    };
    gated?: boolean;
    suggestion: string;
  };
  newsContext?: {
    sentiment?: {
      count: number;
      bullShare: number;
      bearShare: number;
      net: number;
      label: "BULLISH" | "BEARISH" | "NEUTRAL";
    } | null;
    topHeadlines?: Array<{ title: string; sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"; url?: string }>;
    calendar?: {
      upcoming?: Array<{ date: string; event: string; country: string; currency: string; importance: string; forecast: string; previous: string; actual?: string | null; unit?: string }>;
      recent?: Array<{ date: string; event: string; country: string; currency: string; importance: string; forecast: string; previous: string; actual?: string | null; unit?: string }>;
      nextHighImpact: { date: string; event: string; country: string; currency: string; importance: string; forecast: string; previous: string; actual?: string | null; unit?: string } | null;
    };
    source?: string | null;
  };
};

export type AIAnalysisOutput = {
  provider: string;
  connected: boolean;
  summary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  riskFactors: string[];
  scenarioAnalysis: string[];
  invalidation: string;
  status: "CONNECTED" | "NOT CONNECTED";
  confirmations?: Array<{ timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; latestClose: number | null }>;
  multiTimeframe?: { alignment: "LONG" | "SHORT" | "NEUTRAL"; longVotes: number; shortVotes: number; neutralVotes: number };
  scalping?: {
    direction: "LONG" | "SHORT" | "NEUTRAL";
    confidence: number;
    score: number;
    reasoning: string[];
    entryType: "PULLBACK" | "BREAKOUT" | "RANGE_BOUNCE" | "MOMENTUM" | "NO_EDGE";
    volatility: "COMPRESSED" | "SCALPABLE" | "WIDE" | "EXTREME";
    atrPercent: number | null;
    session?: { name: string; label: string; liquidity: string; block: boolean; note: string };
    spread?: { points: number | null; price: number | null; atrCoverPct: number | null; block: boolean; note: string };
    gated?: boolean;
    suggestion: string;
  };
};

export interface AIProvider {
  name: AIProviderName;
  isConfigured(): boolean;
  analyzeMarket(input: AIAnalysisInput): Promise<AIAnalysisOutput>;
}
