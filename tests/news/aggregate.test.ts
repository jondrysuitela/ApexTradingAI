import { describe, expect, it } from "vitest";
import { aggregateHeuristicNews, aggregateNewsSentiment, currencyForSymbol, filterCalendarEvents, heuristicSentiment, type CalendarEvent, type NewsItem } from "@/server/news/aggregate";

describe("heuristicSentiment", () => {
  it("maps strong bullish phrasings", () => {
    expect(heuristicSentiment("Gold rally continues as demand surges")).toBe("BULLISH");
    expect(heuristicSentiment("Gold holds highs amid safe haven bidding")).toBe("BULLISH");
    expect(heuristicSentiment("China adds 650,000 ounces of gold in biggest monthly buy")).toBe("BULLISH");
    expect(heuristicSentiment("Central banks boost gold reserves to record high")).toBe("BULLISH");
  });

  it("maps strong bearish phrasings", () => {
    expect(heuristicSentiment("Gold prices plunge hard")).toBe("BEARISH");
    expect(heuristicSentiment("XAU slides after selloff pressure")).toBe("BEARISH");
  });

  it("stays neutral without decisive words", () => {
    expect(heuristicSentiment("Fed speakers scheduled this week")).toBe("NEUTRAL");
  });
});

describe("aggregateHeuristicNews", () => {
  it("aggregates a majority direction", () => {
    const result = aggregateHeuristicNews([
      { title: "Gold rally on safe haven demand" },
      { title: "Gold surges to record high" },
      { title: "Dollar steady, no major move" },
    ])!;
    expect(result.label).toBe("BULLISH");
    expect(result.bullShare).toBeGreaterThan(50);
  });

  it("returns null for empty input", () => {
    expect(aggregateHeuristicNews([])).toBeNull();
  });
});

describe("aggregateNewsSentiment", () => {
  it("returns null when empty", () => {
    expect(aggregateNewsSentiment([])).toBeNull();
  });

  it("flags overwhelmingly bullish headlines", () => {
    const news: NewsItem[] = [
      { title: "A", sentiment: { bullish: 90, bearish: 10 } },
      { title: "B", sentiment: { bullish: 80, bearish: 20 } },
      { title: "C", sentiment: { bullish: 70, bearish: 30 } },
    ];
    const result = aggregateNewsSentiment(news)!;
    expect(result.label).toBe("BULLISH");
    expect(result.net).toBeGreaterThan(0.5);
    expect(result.count).toBe(3);
  });

  it("flags overwhelmingly bearish headlines", () => {
    const news: NewsItem[] = [
      { title: "A", sentiment: { bullish: 10, bearish: 90 } },
      { title: "B", sentiment: { bullish: 20, bearish: 80 } },
    ];
    const result = aggregateNewsSentiment(news)!;
    expect(result.label).toBe("BEARISH");
    expect(result.net).toBeLessThan(-0.5);
  });

  it("stays neutral without a strong signal", () => {
    const news: NewsItem[] = [{ title: "A", sentiment: { bullish: 55, bearish: 45 } }];
    const result = aggregateNewsSentiment(news)!;
    expect(result.label).toBe("NEUTRAL");
  });

  it("ignores items without sentiment", () => {
    const news: NewsItem[] = [{ title: "A" }, { title: "B", sentiment: { bullish: 90, bearish: 10 } }];
    const result = aggregateNewsSentiment(news)!;
    expect(result.count).toBe(1);
    expect(result.label).toBe("BULLISH");
  });
});

describe("currencyForSymbol", () => {
  it("maps majors and metals", () => {
    expect(currencyForSymbol("XAUUSD")).toEqual(["USD"]);
    expect(currencyForSymbol("EURUSD")).toEqual(["EUR", "USD"]);
    expect(currencyForSymbol("USDJPY")).toEqual(["USD", "JPY"]);
    expect(currencyForSymbol("BTCUSD")).toEqual(["USD"]);
  });

  it("falls back to USD for unknown symbols", () => {
    expect(currencyForSymbol("FOOBAR")).toEqual(["USD"]);
  });
});

describe("filterCalendarEvents", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const event = (date: string, importance: string, currency = "USD", actual: string | null = null): CalendarEvent => ({
    date,
    event: "Nonfarm Payrolls",
    country: "United States",
    currency,
    importance,
    forecast: "150K",
    previous: "120K",
    actual,
  });

  it("picks the next high-impact USD event in the window", () => {
    const events = [
      event("2026-09-08T15:00:00.000Z", "low"),
      event("2026-09-09T13:30:00.000Z", "high"),
      event("2026-09-10T16:00:00.000Z", "medium", "JPY"),
      event("2026-09-09T15:00:00.000Z", "medium"),
    ];
    const read = filterCalendarEvents(events, { currencies: ["USD"], now, windowHours: 24 });
    expect(read.nextHighImpact?.event).toBe("Nonfarm Payrolls");
    expect(read.nextHighImpact?.importance).toBe("high");
    expect(read.upcoming.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps recent released events with actuals", () => {
    const events = [
      event("2026-09-09T10:00:00.000Z", "high", "USD", "145K"),
      event("2026-09-09T15:00:00.000Z", "medium"),
    ];
    const read = filterCalendarEvents(events, { currencies: ["USD"], now, windowHours: 24 });
    expect(read.recent.length).toBe(1);
    expect(read.recent[0].actual).toBe("145K");
  });

  it("filters out events beyond the window", () => {
    const events = [event("2026-09-11T13:30:00.000Z", "medium")];
    const read = filterCalendarEvents(events, { currencies: ["USD"], now, windowHours: 12 });
    expect(read.upcoming).toHaveLength(0);
    expect(read.nextHighImpact).toBeNull();
  });
});