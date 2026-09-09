import { describe, expect, it } from "vitest";
import {
  entryMinimums,
  isScalpingTimeframe,
  signalActionThreshold,
  ENTRY_MIN_CONFLUENCE_SCALPING,
  ENTRY_MIN_CONFLUENCE_DEFAULT,
  ENTRY_MIN_SCALPING_CONFIDENCE_SCALPING,
  ENTRY_MIN_SCALPING_CONFIDENCE_DEFAULT,
  SIGNAL_ACTION_THRESHOLD_SCALPING,
  SIGNAL_ACTION_THRESHOLD_DEFAULT,
} from "@/server/technical/strictness";

describe("strictness per timeframe", () => {
  it("marks only 5m and 15m as scalping timeframes", () => {
    expect(isScalpingTimeframe("5m")).toBe(true);
    expect(isScalpingTimeframe("15m")).toBe(true);
    expect(isScalpingTimeframe("1h")).toBe(false);
    expect(isScalpingTimeframe("4h")).toBe(false);
    expect(isScalpingTimeframe(undefined)).toBe(false);
    expect(isScalpingTimeframe(null)).toBe(false);
  });

  it("raises the action threshold for scalping timeframes", () => {
    expect(signalActionThreshold("5m")).toBe(SIGNAL_ACTION_THRESHOLD_SCALPING);
    expect(signalActionThreshold("15m")).toBe(SIGNAL_ACTION_THRESHOLD_SCALPING);
    expect(signalActionThreshold("1h")).toBe(SIGNAL_ACTION_THRESHOLD_DEFAULT);
  });

  it("raises entry minimums for scalping timeframes only", () => {
    expect(entryMinimums("5m")).toEqual({ minConfluenceScore: ENTRY_MIN_CONFLUENCE_SCALPING, minScalpingConfidence: ENTRY_MIN_SCALPING_CONFIDENCE_SCALPING });
    expect(entryMinimums("15m")).toEqual({ minConfluenceScore: ENTRY_MIN_CONFLUENCE_SCALPING, minScalpingConfidence: ENTRY_MIN_SCALPING_CONFIDENCE_SCALPING });
    expect(entryMinimums("1h")).toEqual({ minConfluenceScore: ENTRY_MIN_CONFLUENCE_DEFAULT, minScalpingConfidence: ENTRY_MIN_SCALPING_CONFIDENCE_DEFAULT });
    expect(entryMinimums("1d")).toEqual({ minConfluenceScore: ENTRY_MIN_CONFLUENCE_DEFAULT, minScalpingConfidence: ENTRY_MIN_SCALPING_CONFIDENCE_DEFAULT });
  });

  it("keeps scalping thresholds strictly above the defaults", () => {
    expect(SIGNAL_ACTION_THRESHOLD_SCALPING).toBeGreaterThan(SIGNAL_ACTION_THRESHOLD_DEFAULT);
    expect(ENTRY_MIN_CONFLUENCE_SCALPING).toBeGreaterThan(ENTRY_MIN_CONFLUENCE_DEFAULT);
    expect(ENTRY_MIN_SCALPING_CONFIDENCE_SCALPING).toBeGreaterThan(ENTRY_MIN_SCALPING_CONFIDENCE_DEFAULT);
  });
});