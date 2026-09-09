export type NewsItem = {
  title: string;
  summary?: string;
  url?: string;
  sentiment?: { bearish: number; bullish: number };
};

export type SentimentLabel = "BULLISH" | "BEARISH" | "NEUTRAL";

export type SentimentAggregate = {
  count: number;
  bullShare: number;
  bearShare: number;
  net: number;
  label: SentimentLabel;
};

export type CalendarEvent = {
  date: string;
  event: string;
  country: string;
  currency: string;
  importance: "high" | "medium" | "low" | "none" | string;
  forecast: string;
  previous: string;
  actual: string | null;
  unit?: string;
};

export type CalendarFilterOptions = {
  currencies: string[];
  now: Date;
  windowHours: number;
};

export type CalendarRead = {
  upcoming: CalendarEvent[];
  recent: CalendarEvent[];
  nextHighImpact: CalendarEvent | null;
};

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

const BULLISH_WORDS = ["rally", "rebound", "bounce", "surge", "gains", "jumps", "rises", "climb", "soars", "strengthen", "upgrade", "beat", "safe haven", "hedge", "outperform", "strong demand", "hold highs", "support", "adds", "buys", "buy", "demand", "record high", "all-time high", "inflow", "inflows", "reserve", "reserves", "central bank", "uptick", "boosts", "outlook", "higher"];
const BEARISH_WORDS = ["plunge", "crash", "drops", "drop", "fall", "slide", "dump", "retreat", "weak", "slump", "tumble", "selloff", "sell-off", "cut", "downgrade", "downgraded", "miss", "recession", "surplus", "ceiling", "pressure", "eases", "softens", "outflow", "outflows", "weaker", "debts", "debt", "pullback", "losses", "declines", "bearish", "sold", "rejects", "cuts"];
const GOLD_CONTEXT_WORDS = ["gold", "xau", "bullion", "precious metal", "goldman", "commodities", "metals"];

export function heuristicSentiment(title: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const lower = title.toLowerCase();
  const bullHits = BULLISH_WORDS.filter((word) => lower.includes(word)).length;
  const bearHits = BEARISH_WORDS.filter((word) => lower.includes(word)).length;
  if (bullHits === 0 && bearHits === 0) return "NEUTRAL";

  const inGoldContext = GOLD_CONTEXT_WORDS.some((word) => lower.includes(word));
  const netHits = bullHits - bearHits;
  const adjusted = netHits === 0 ? 0 : Math.abs(netHits) >= 2 || inGoldContext ? netHits : 0;
  if (adjusted >= 1) return "BULLISH";
  if (adjusted <= -1) return "BEARISH";
  return "NEUTRAL";
}

export function aggregateHeuristicNews(headlines: Array<{ title: string }>): SentimentAggregate | null {
  const scored = headlines.map((item) => heuristicSentiment(item.title));
  const bull = scored.filter((label) => label === "BULLISH").length;
  const bear = scored.filter((label) => label === "BEARISH").length;
  const count = scored.length;
  if (count === 0) return null;

  const bullShare = (bull / count) * 100;
  const bearShare = (bear / count) * 100;
  const net = clamp((bull - bear) / count);
  const label: SentimentLabel = net >= 0.15 ? "BULLISH" : net <= -0.15 ? "BEARISH" : "NEUTRAL";
  return { count, bullShare, bearShare, net, label };
}

export function aggregateNewsSentiment(news: NewsItem[]): SentimentAggregate | null {
  if (news.length === 0) return null;

  let bullShare = 0;
  let bearShare = 0;
  let counted = 0;

  for (const item of news) {
    if (!item.sentiment) continue;
    const bull = Number(item.sentiment.bullish) || 0;
    const bear = Number(item.sentiment.bearish) || 0;
    bullShare += bull;
    bearShare += bear;
    counted += 1;
  }

  if (counted === 0) return null;

  const total = bullShare + bearShare;
  const bullPct = total > 0 ? (bullShare / total) * 100 : 0;
  const bearPct = total > 0 ? (bearShare / total) * 100 : 0;
  const net = total > 0 ? clamp((bullShare - bearShare) / total) : 0;
  const label: SentimentLabel = net >= 0.15 ? "BULLISH" : net <= -0.15 ? "BEARISH" : "NEUTRAL";

  return { count: counted, bullShare: bullPct, bearShare: bearPct, net, label };
}

export function currencyForSymbol(symbol: string): string[] {
  const normalized = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const map: Record<string, string[]> = {
    USDIDR: ["USD", "IDR"],
    EURUSD: ["EUR", "USD"],
    GBPUSD: ["GBP", "USD"],
    USDJPY: ["USD", "JPY"],
    XAUUSD: ["USD"],
    XAGUSD: ["USD"],
    BTCUSD: ["USD"],
    XAU: ["USD"],
  };

  if (map[normalized]) return map[normalized];

  if (normalized.startsWith("X")) return ["USD"];
  if (normalized.endsWith("USD")) return [normalized.slice(0, 3), "USD"];
  if (normalized.startsWith("USD")) return ["USD", normalized.slice(3, 6)];

  return ["USD"];
}

export function filterCalendarEvents(events: CalendarEvent[], options: CalendarFilterOptions): CalendarRead {
  const currencies = new Set(options.currencies.map((currency) => currency.toUpperCase()));
  const minTime = new Date(options.now.getTime() - options.windowHours * 60 * 60 * 1000);
  const maxTime = new Date(options.now.getTime() + options.windowHours * 60 * 60 * 1000);

  const relevant = events
    .filter((event) => {
      const eventDate = new Date(event.date);
      if (Number.isNaN(eventDate.getTime())) return false;
      if (eventDate < minTime || eventDate > maxTime) return false;
      const importance = String(event.importance).toLowerCase();
      return currencies.has(String(event.currency).toUpperCase()) && (importance === "high" || importance === "medium");
    })
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  const upcoming = relevant.filter((event) => new Date(event.date) >= options.now);
  const recent = relevant.filter((event) => new Date(event.date) < options.now && event.actual != null).slice(-5).reverse();
  const nextHighImpact = upcoming.find((event) => String(event.importance).toLowerCase() === "high") ?? upcoming[0] ?? null;

  return { upcoming, recent, nextHighImpact };
}