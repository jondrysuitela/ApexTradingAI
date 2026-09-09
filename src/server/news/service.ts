import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { aggregateHeuristicNews, aggregateNewsSentiment, currencyForSymbol, filterCalendarEvents, heuristicSentiment, type CalendarEvent, type CalendarRead, type NewsItem, type SentimentAggregate } from "./aggregate";

const BASE_URL = "https://api.twelvedata.com";
const YAHOO_RSS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const NEWS_TTL_MS = 5 * 60 * 1000;
const CALENDAR_TTL_MS = 30 * 60 * 1000;

export type NewsContext = {
  sentiment: SentimentAggregate | null;
  topHeadlines: Array<{ title: string; sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"; url?: string }>;
  calendar: CalendarRead;
  generatedAt: string;
  source: string | null;
};

type TwelveDataAnalysisResponse = {
  status?: "ok" | "error";
  message?: string;
  news?: Array<{ title: string; summary?: string; url?: string; sentiment?: { bearish: number; bullish: number } }>;
};

type TwelveDataCalendarResponse = {
  status?: "ok" | "error";
  message?: string;
  calendar?: Array<{
    date: string;
    event: string;
    country: string;
    currency: string;
    importance: string;
    forecast?: string;
    previous?: string;
    actual?: string | null;
    unit?: string;
  }>;
};

const newsCache = new Map<string, { data: NewsItem[]; expiresAt: number }>();
const calendarCache = new Map<string, { data: CalendarEvent[]; expiresAt: number }>();

function toTwelveDataSymbol(symbol: string) {
  const normalized = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const map: Record<string, string> = {
    USDIDR: "USD/IDR",
    EURUSD: "EUR/USD",
    GBPUSD: "GBP/USD",
    USDJPY: "USD/JPY",
    XAUUSD: "XAU/USD",
    XAGUSD: "XAG/USD",
    BTCUSD: "BTC/USD",
  };
  return map[normalized] ?? symbol;
}

async function fetchJson<T>(path: string, apiKey: string): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${BASE_URL}${path}${separator}apikey=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new AppError(`Twelve Data request failed: ${response.status} ${response.statusText}`, 503, "MARKET_DATA_NOT_CONNECTED");
  }
  return response.json() as Promise<T>;
}

async function fetchNewsSentiment(symbol: string, apiKey: string): Promise<NewsItem[]> {
  const data = await fetchJson<TwelveDataAnalysisResponse>(`/analysis?symbol=${encodeURIComponent(toTwelveDataSymbol(symbol))}`, apiKey);
  if (data.status === "error") {
    return [];
  }
  return data.news ?? [];
}

async function fetchEconomicCalendar(apiKey: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const data = await fetchJson<TwelveDataCalendarResponse>(
    `/economic_calendar?start_date=${startDate}&end_date=${endDate}&symbol=USD`,
    apiKey,
  );
  if (data.status === "error" || !data.calendar) {
    return [];
  }

  return data.calendar.map((event) => ({
    date: event.date,
    event: event.event,
    country: event.country,
    currency: event.currency,
    importance: event.importance,
    forecast: event.forecast ?? "",
    previous: event.previous ?? "",
    actual: event.actual ?? null,
    unit: event.unit,
  }));
}

function withCache<T>(cache: Map<string, { data: T; expiresAt: number }>, key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return Promise.resolve(existing.data);
  }

  return loader().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

function headlineSentiment(item: NewsItem): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (!item.sentiment) return "NEUTRAL";
  const bull = Number(item.sentiment.bullish) || 0;
  const bear = Number(item.sentiment.bearish) || 0;
  if (bull - bear >= 15) return "BULLISH";
  if (bear - bull >= 15) return "BEARISH";
  return "NEUTRAL";
}

export async function getNewsContext(symbol: string): Promise<NewsContext> {
  const now = new Date();
  const emptyCalendar: CalendarRead = { upcoming: [], recent: [], nextHighImpact: null };

  try {
    if (env.TWELVE_DATA_API_KEY) {
      const apiKey = env.TWELVE_DATA_API_KEY;
      const [news, events] = await Promise.all([
        withCache(newsCache, `news-${symbol}`, NEWS_TTL_MS, () => fetchNewsSentiment(symbol, apiKey)),
        withCache(calendarCache, "calendar-usd", CALENDAR_TTL_MS, () => fetchEconomicCalendar(apiKey)),
      ]);

      if (news.length > 0 || events.length > 0) {
        const sentiment = aggregateNewsSentiment(news);
        const topHeadlines = news
          .filter((item) => item.title.length > 0)
          .slice(0, 4)
          .map((item) => ({ title: item.title, sentiment: headlineSentiment(item), url: item.url }));
        const calendar = filterCalendarEvents(events, { currencies: currencyForSymbol(symbol), now, windowHours: 24 });
        return { sentiment, topHeadlines, calendar, generatedAt: new Date().toISOString(), source: "twelvedata" };
      }
    }
  } catch {
    // fall through to the Yahoo fallback below
  }

  try {
    const headlines = await fetchYahooRssHeadlines(symbol);
    if (headlines.length > 0) {
      const sentiment = aggregateHeuristicNews(headlines);
      const topHeadlines = headlines.slice(0, 4).map((item) => ({ title: item.title, sentiment: heuristicSentiment(item.title), url: item.url }));
      return { sentiment, topHeadlines, calendar: emptyCalendar, generatedAt: new Date().toISOString(), source: "yahoo-rss-heuristic" };
    }
  } catch {
    // no news source available
  }

  return { sentiment: null, topHeadlines: [], calendar: emptyCalendar, generatedAt: new Date().toISOString(), source: null };
}

const YAHOO_TICKERS: Record<string, string> = {
  XAUUSD: "GC=F",
  XAUEUR: "GC=F",
  XAGUSD: "SI=F",
  XAGXAG: "SI=F",
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
};

function yahooTickerFor(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (YAHOO_TICKERS[upper]) return YAHOO_TICKERS[upper];
  if (/^[A-Z]{6}$/.test(upper)) return `${upper}=X`;
  return "GC=F";
}

async function fetchYahooRssHeadlines(symbol: string): Promise<Array<{ title: string; url?: string }>> {
  const ticker = encodeURIComponent(yahooTickerFor(symbol));
  const response = await fetch(`${YAHOO_RSS_URL}?s=${ticker}&region=US&lang=en-US`, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  if (!response.ok) {
    throw new AppError(`Yahoo RSS request failed: ${response.status}`, 503, "MARKET_DATA_NOT_CONNECTED");
  }
  const body = await response.text();
  const items = Array.from(body.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/gi));
  if (items.length === 0) return [];
  return items.slice(0, 6).map((match) => ({ title: match[1].trim(), url: match[2].trim() }));
}