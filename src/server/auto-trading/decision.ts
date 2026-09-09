export type EntryEvaluation = {
  allowed: boolean;
  reason: string;
  direction?: "LONG" | "SHORT";
};

export function evaluateEntry(input: {
  scalping: { direction: string; gated: boolean; confidence: number } | null;
  confluence: { direction: string; score: number } | null;
  config: { minConfluenceScore: number; minScalpingConfidence: number };
}): EntryEvaluation {
  const { scalping, confluence, config } = input;
  if (!scalping) return { allowed: false, reason: "Belum ada scalping read (data kurang)." };
  if (scalping.direction === "NEUTRAL") return { allowed: false, reason: "Scalping tidak punya arah (NEUTRAL)." };
  if (scalping.gated) return { allowed: false, reason: "Scalping digate (sesi/spread) — skip." };
  if (!confluence) return { allowed: false, reason: "Confluence engine kosong." };
  if (confluence.direction !== scalping.direction) return { allowed: false, reason: `Confluence ${confluence.direction} tidak searah dengan scalping ${scalping.direction}.` };
  if (confluence.score < config.minConfluenceScore) return { allowed: false, reason: `Confluence score ${confluence.score} < ${config.minConfluenceScore}.` };
  if (scalping.confidence < config.minScalpingConfidence) return { allowed: false, reason: `Scalping confidence ${scalping.confidence} < ${config.minScalpingConfidence}.` };
  return { allowed: true, reason: "Scalping + confluence searah.", direction: scalping.direction as "LONG" | "SHORT" };
}

export function evaluateExit(position: { action: "BUY" | "SELL"; stopLoss: number; takeProfit: number }, price: number): "TP" | "SL" | null {
  if (position.action === "BUY") {
    if (price >= position.takeProfit) return "TP";
    if (price <= position.stopLoss) return "SL";
    return null;
  }
  if (price <= position.takeProfit) return "TP";
  if (price >= position.stopLoss) return "SL";
  return null;
}

export type MoneyExit = {
  reason: "TP" | "SL";
  target: number;
  unrealized: number;
};

export function evaluateMoneyExit(unrealized: number, targetProfitUsd: number, maxLossUsd: number): MoneyExit | null {
  if (targetProfitUsd > 0 && unrealized >= targetProfitUsd) {
    return { reason: "TP", target: targetProfitUsd, unrealized };
  }
  if (maxLossUsd > 0 && unrealized <= -maxLossUsd) {
    return { reason: "SL", target: maxLossUsd, unrealized };
  }
  return null;
}