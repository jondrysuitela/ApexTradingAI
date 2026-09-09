const SCALPING_TIMEFRAMES = ["5m", "15m"];

export const SIGNAL_ACTION_THRESHOLD_DEFAULT = 55;
export const SIGNAL_ACTION_THRESHOLD_SCALPING = 62;
export const ENTRY_MIN_CONFLUENCE_DEFAULT = 40;
export const ENTRY_MIN_CONFLUENCE_SCALPING = 45;
export const ENTRY_MIN_SCALPING_CONFIDENCE_DEFAULT = 40;
export const ENTRY_MIN_SCALPING_CONFIDENCE_SCALPING = 50;

export function isScalpingTimeframe(timeframe: string | null | undefined): boolean {
  return timeframe !== null && timeframe !== undefined && SCALPING_TIMEFRAMES.includes(timeframe);
}

export function signalActionThreshold(timeframe: string | null | undefined): number {
  return isScalpingTimeframe(timeframe) ? SIGNAL_ACTION_THRESHOLD_SCALPING : SIGNAL_ACTION_THRESHOLD_DEFAULT;
}

export function entryMinimums(timeframe: string | null | undefined): { minConfluenceScore: number; minScalpingConfidence: number } {
  return isScalpingTimeframe(timeframe)
    ? { minConfluenceScore: ENTRY_MIN_CONFLUENCE_SCALPING, minScalpingConfidence: ENTRY_MIN_SCALPING_CONFIDENCE_SCALPING }
    : { minConfluenceScore: ENTRY_MIN_CONFLUENCE_DEFAULT, minScalpingConfidence: ENTRY_MIN_SCALPING_CONFIDENCE_DEFAULT };
}