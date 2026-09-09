"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type NewsRead = {
  sentiment: { count: number; bullShare: number; bearShare: number; net: number; label: "BULLISH" | "BEARISH" | "NEUTRAL" } | null;
  topHeadlines: Array<{ title: string; sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"; url?: string }>;
  calendar: {
    upcoming: Array<EventRead>;
    recent: Array<EventRead>;
    nextHighImpact: EventRead | null;
  };
  generatedAt: string;
  source: string | null;
};

type EventRead = { date: string; event: string; country: string; currency: string; importance: string; forecast: string; previous: string; actual: string | null; unit?: string };

const sentimentColor = { BULLISH: "text-emerald-400", BEARISH: "text-red-400", NEUTRAL: "text-slate-400" } as const;
const impactColor = (importance: string) => (String(importance).toLowerCase() === "high" ? "text-red-400" : "text-amber-300");

export function NewsCalendarCard({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const { data } = useSWR<{ analysis: { news: NewsRead | null } }>(
    `/api/ai/analysis?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=120`,
    fetcher,
    { refreshInterval: 60000 },
  );

  const news = data?.analysis?.news ?? null;
  const sentiment = news?.sentiment ?? null;
  const upcoming = (news?.calendar.upcoming ?? []).slice(0, 3);
  const nextEvent = news?.calendar.nextHighImpact ?? null;
  const sentimentLabel = sentiment ? (sentiment.net >= 0.15 ? "BULLISH" : sentiment.net <= -0.15 ? "BEARISH" : "NEUTRAL") : "NEUTRAL";

  return (
    <Card>
      <div className="flex items-center justify-between text-sm">
        <span className="uppercase tracking-[0.3em] text-slate-400">News & Calendar</span>
        <span className={`font-mono text-xs uppercase ${news?.source ? sentimentColor[sentimentLabel] : "text-slate-500"}`}>
          {!news?.source ? "NO DATA" : sentiment ? `${sentimentLabel} ${sentiment.net >= 0 ? "+" : ""}${(sentiment.net * 100).toFixed(0)}%` : "FLAT"}
        </span>
      </div>
      {!news?.source ? (
        <div className="mt-3 text-sm text-slate-400">TwelveData tidak terhubung / tidak ada data.</div>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          {news.topHeadlines.length ? (
            <div className="space-y-1.5">
              {news.topHeadlines.slice(0, 3).map((headline, index) => (
                <Headline key={`${headline.title}-${index}`} title={headline.title} sentiment={headline.sentiment} url={headline.url} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500">Belum ada headline untuk simbol ini.</div>
          )}
          <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Next High Impact</div>
            {nextEvent ? (
              <div className="mt-1">
                <span className={`font-mono text-xs ${impactColor(nextEvent.importance)}`}>{String(nextEvent.importance).toUpperCase()}</span>
                <span className="ml-2 text-xs text-slate-300">{nextEvent.event}</span>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {new Date(nextEvent.date).toLocaleString("id-ID")} · F: {nextEvent.forecast || "—"} · P: {nextEvent.previous || "—"}
                  {nextEvent.actual !== null ? ` · A: ${nextEvent.actual}` : ""}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-500">Tidak ada event high/medium impact 24 jam ke depan.</div>
            )}
          </div>
          {upcoming.length && !nextEvent ? (
            <div className="space-y-1 text-xs text-slate-500">
              {upcoming.map((event) => (
                <div key={event.date} className="flex items-center justify-between">
                  <span>{event.event}</span>
                  <span className={`font-mono ${impactColor(event.importance)}`}>{String(event.importance).toUpperCase()} {new Date(event.date).toLocaleTimeString("id-ID")}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Headline({ title, sentiment, url }: { title: string; sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"; url?: string }) {
  const dot = sentiment === "BULLISH" ? "bg-emerald-400" : sentiment === "BEARISH" ? "bg-red-400" : "bg-slate-500";
  const content = (
    <span className="flex items-start gap-2">
      <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="text-xs text-slate-300">{title}</span>
    </span>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="block hover:opacity-80">
      {content}
    </a>
  ) : (
    <div>{content}</div>
  );
}