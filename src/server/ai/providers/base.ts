import type { AIAnalysisInput, AIAnalysisOutput } from "../types";

export function buildFactsOnlyAnalysis(provider: string, connected: boolean, input: AIAnalysisInput): AIAnalysisOutput {
  const bullishFactors = [
    input.setup?.direction === "LONG" ? `Setup state is ${input.setup.state}` : null,
    input.indicators.rsi14 !== null && input.indicators.rsi14 < 55 ? `RSI is ${input.indicators.rsi14.toFixed(2)}` : null,
    input.supportResistance.find((level) => level.type === "support") ? "Support levels are present" : null,
  ].filter(Boolean) as string[];

  const bearishFactors = [
    input.setup?.direction === "SHORT" ? `Setup state is ${input.setup.state}` : null,
    input.indicators.rsi14 !== null && input.indicators.rsi14 > 70 ? `RSI is ${input.indicators.rsi14.toFixed(2)}` : null,
    input.supportResistance.find((level) => level.type === "resistance") ? "Resistance levels are present" : null,
  ].filter(Boolean) as string[];

  const riskFactors = [
    input.setup?.invalidation ? `Invalidation at ${input.setup.invalidation.toFixed(2)}` : "No invalidation level available",
    input.indicators.atr14 !== null ? `ATR is ${input.indicators.atr14.toFixed(2)}` : "ATR unavailable",
    input.setup?.state === "NO_TRADE" ? "No-trade state is active" : null,
    input.confluence?.regime?.volatility === "EXTREME" ? "Volatility regime is EXTREME - elevated risk" : null,
    input.confluence?.regime?.volatility === "COMPRESSED" ? "Volatility regime is COMPRESSED - breakout risk" : null,
  ].filter(Boolean) as string[];

  const scenarioAnalysis = [
    input.confluence?.narrative ?? "No confluence analysis available",
    input.confluence?.regime?.regimeLabel ? `Market regime: ${input.confluence.regime.regimeLabel}` : null,
    ...(input.confluence?.factors?.length
      ? input.confluence.factors.filter((f) => f.score > 0).slice(0, 5).map((f) => `Confluence factor ${f.name}: ${f.detail}`)
      : []),
    input.setup?.entryZone ? `Entry zone ranges from ${input.setup.entryZone.low.toFixed(2)} to ${input.setup.entryZone.high.toFixed(2)}` : "No entry zone detected",
    input.setup?.targets?.length ? `Targets detected: ${input.setup.targets.map((value) => value.toFixed(2)).join(", ")}` : "No targets detected",
    input.structure.length ? `${input.structure.length} structure events detected` : "No structure events detected",
  ].filter(Boolean) as string[];

  const summary = connected
    ? input.confluence?.narrative
      ? `${input.confluence.narrative} Confluence score ${input.confluence.score}/100 (${input.confluence.direction}).`
      : `Structured market facts were analyzed for ${input.symbol} on ${input.timeframe}.`
    : "NOT CONNECTED";

  return {
    provider,
    connected,
    summary,
    bullishFactors,
    bearishFactors,
    riskFactors,
    scenarioAnalysis,
    invalidation: input.setup?.invalidation ? `Invalidation level: ${input.setup.invalidation.toFixed(2)}` : "NOT CONNECTED",
    status: connected ? "CONNECTED" : "NOT CONNECTED",
  };
}
