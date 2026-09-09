"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const FRAMES = [
  { label: "1D", timeframe: "1d" },
  { label: "4H", timeframe: "4h" },
  { label: "1H", timeframe: "1h" },
  { label: "15M", timeframe: "15m" },
  { label: "5M", timeframe: "5m" },
] as const;

export function MultiTimeframePanel({ symbol }: { symbol: string }) {
  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Multi-Timeframe</div>
      <div className="mt-4 grid gap-2">
        {FRAMES.map((frame) => (
          <TimeframeRow key={frame.label} symbol={symbol} label={frame.label} timeframe={frame.timeframe} />
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-400">Higher timeframe, intermediate timeframe, and execution timeframe are derived from actual candle direction, not AI guesses.</div>
    </Card>
  );
}

function TimeframeRow({ symbol, label, timeframe }: { symbol: string; label: string; timeframe: string }) {
  const query = useSWR<{ candles: Array<{ close: number }> }>(`/api/market-data/candles?symbol=${symbol}&timeframe=${timeframe}&limit=50`, fetcher, {
    refreshInterval: 60000,
  });

  const candles = query.data?.candles ?? [];
  const closes = candles.map((candle) => candle.close);
  const last = closes.at(-1) ?? null;
  const first = closes[0] ?? null;
  const trend = last === null || first === null ? "NOT CONNECTED" : last > first ? "bullish" : last < first ? "bearish" : "neutral";

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
      <span className="text-slate-300">{label}</span>
      <span className="font-medium text-cyan-100">{trend}</span>
    </div>
  );
}
