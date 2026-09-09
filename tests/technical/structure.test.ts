import { describe, expect, it } from "vitest";
import { detectStructure } from "@/server/technical/structure";

describe("structure", () => {
  it("detects swing events from actual candles", () => {
    const events = detectStructure(
      [
        { timestamp: "2024-01-01T00:00:00Z", open: 1, high: 2, low: 1, close: 1.5, volume: 10 },
        { timestamp: "2024-01-01T01:00:00Z", open: 1.5, high: 3, low: 1.4, close: 2.5, volume: 10 },
        { timestamp: "2024-01-01T02:00:00Z", open: 2.5, high: 5, low: 2.2, close: 4, volume: 10 },
        { timestamp: "2024-01-01T03:00:00Z", open: 4, high: 4.2, low: 2, close: 2.5, volume: 10 },
        { timestamp: "2024-01-01T04:00:00Z", open: 2.5, high: 3, low: 2.2, close: 2.8, volume: 10 },
      ],
      "1h",
    );

    expect(events.some((event) => event.type === "Swing High")).toBe(true);
  });
});
