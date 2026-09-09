import type { CandleInput } from "./indicators";

export type StructureEventType =
  | "Swing High"
  | "Swing Low"
  | "Higher High"
  | "Higher Low"
  | "Lower High"
  | "Lower Low"
  | "Break of Structure"
  | "Change of Character"
  | "Range"
  | "Breakout"
  | "Breakdown"
  | "Consolidation"
  | "Expansion";

export type StructureEvent = {
  type: StructureEventType;
  timestamp: string;
  price: number;
  timeframe: string;
  strength: number;
  source: string;
};

export function detectStructure(candles: CandleInput[], timeframe: string): StructureEvent[] {
  if (candles.length < 5) return [];

  const events: StructureEvent[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    const prev = candles[i - 1];
    const current = candles[i];
    const next = candles[i + 1];

    if (current.high > prev.high && current.high > next.high) {
      events.push({ type: "Swing High", timestamp: current.timestamp, price: current.high, timeframe, strength: 1, source: "swing-pivot" });
    }
    if (current.low < prev.low && current.low < next.low) {
      events.push({ type: "Swing Low", timestamp: current.timestamp, price: current.low, timeframe, strength: 1, source: "swing-pivot" });
    }
  }

  const swingHighs = events.filter((event) => event.type === "Swing High");
  const swingLows = events.filter((event) => event.type === "Swing Low");

  if (swingHighs.length >= 2 && swingHighs.at(-1) && swingHighs.at(-2) && swingHighs.at(-1)!.price > swingHighs.at(-2)!.price) {
    events.push({ type: "Higher High", timestamp: swingHighs.at(-1)!.timestamp, price: swingHighs.at(-1)!.price, timeframe, strength: 2, source: "swing-comparison" });
  }

  if (swingLows.length >= 2 && swingLows.at(-1) && swingLows.at(-2) && swingLows.at(-1)!.price > swingLows.at(-2)!.price) {
    events.push({ type: "Higher Low", timestamp: swingLows.at(-1)!.timestamp, price: swingLows.at(-1)!.price, timeframe, strength: 2, source: "swing-comparison" });
  }

  return events;
}
