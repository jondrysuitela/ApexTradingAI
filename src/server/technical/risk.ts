export type RiskInputs = {
  equity: number;
  riskPercent: number;
  entry: number;
  stop: number;
  target: number;
  fees?: number;
  slippage?: number;
  leverage?: number;
};

export function calculateRisk(inputs: RiskInputs) {
  const riskAmount = inputs.equity * (inputs.riskPercent / 100);
  const riskPerUnit = Math.abs(inputs.entry - inputs.stop);
  const positionSize = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;
  const potentialLoss = positionSize * riskPerUnit;
  const potentialProfit = Math.abs(inputs.target - inputs.entry) * positionSize;
  const rr = potentialLoss > 0 ? potentialProfit / potentialLoss : null;

  return {
    riskAmount,
    riskPerUnit,
    positionSize,
    potentialLoss,
    potentialProfit,
    riskReward: rr,
    exposure: inputs.entry * positionSize,
    liquidationRisk: inputs.leverage ? Math.min(100, Math.abs((inputs.entry - inputs.stop) / inputs.entry) * inputs.leverage * 100) : null,
  };
}
