"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { MarketChart } from "@/features/chart/market-chart";
import { IndicatorSummary } from "@/features/market/indicator-summary";
import { SetupSummary } from "@/features/market/setup-summary";
import { MarketAssetSearch } from "@/features/markets/market-asset-search";
import { WatchlistPanel } from "@/features/markets/watchlist-panel";
import { MarketSummaryPanel } from "@/features/markets/market-summary-panel";
import { MultiTimeframePanel } from "@/features/markets/multi-timeframe-panel";
import { AiSummaryPanel } from "@/features/markets/ai-summary-panel";
import { RiskPanel } from "@/features/risk/risk-panel";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type Summary = {
  symbol: string;
  timeframe: string;
  status: string;
  latestClose: number | null;
  indicators: { sma20: number | null; ema20: number | null; rsi14: number | null; atr14: number | null };
  structure: Array<{ type: string; timestamp: string; price: number; strength: number; source: string }>;
  supportResistance: Array<{ price: number; type: "support" | "resistance"; strength: number; touchCount: number; lastReaction: string; distanceFromCurrentPrice: number }>;
  setup: { state: string; score: number; setupType: string; direction: "LONG" | "SHORT" | "NEUTRAL"; entryZone: { low: number; high: number } | null; invalidation: number | null; targets: number[]; timestamp: string } | null;
};

export function MarketOverview() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const candlesQuery = useSWR<{ candles: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }> }>(
    `/api/market-data/candles?symbol=${symbol}&timeframe=${timeframe}&limit=120`,
    fetcher,
    { refreshInterval: 60000 },
  );

  const candles = candlesQuery.data?.candles ?? [];
  const latest = candles.at(-1);
  const summaryQuery = useSWR<{ analysis: Summary }>(
    `/api/market-data/analysis?symbol=${symbol}&timeframe=${timeframe}&limit=120`,
    fetcher,
    { refreshInterval: 60000 },
  );

  const summary = summaryQuery.data?.analysis ?? null;

  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Market Regime</div>
            <h1 className="mt-1 text-2xl font-semibold">{symbol.replace("USDT", "/USDT")}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm">
              {(["1m", "5m", "15m", "1h", "4h", "1d"] as const).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <div className="text-right">
              <div className="text-sm text-slate-400">Latest close</div>
              <div className="text-2xl font-semibold text-cyan-200">{latest ? latest.close.toFixed(2) : "NOT CONNECTED"}</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <MarketAssetSearch onSelect={setSymbol} />
          <WatchlistPanel />
          <MultiTimeframePanel symbol={symbol} />
        </div>
        <MarketSummaryPanel summary={summary} />
      </div>

      <Card>
        <MarketChart candles={candles} analysis={summary} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <IndicatorSummary candles={candles} />
        <SetupSummary candles={candles} />
      </div>

      <RiskPanel summary={summary} />

      <AiSummaryPanel symbol={symbol} timeframe={timeframe} />
    </div>
  );
}
