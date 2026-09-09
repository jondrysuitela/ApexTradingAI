"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type ScannerResult = {
  symbol: string;
  direction: string;
  setup: string;
  score: number;
  risk: string;
  timeframe: string;
  freshness: string;
};

export function ScannerResults() {
  const query = useSWR<{ results: ScannerResult[] }>("/api/scanner?timeframe=1h", fetcher, { refreshInterval: 60000 });
  const results = query.data?.results ?? [];

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Scanner</div>
        <div className="text-xs text-slate-500">Sorted by setup score</div>
      </div>
      <div className="mt-4 grid gap-2">
        {results.length === 0 ? (
          <div className="text-sm text-slate-400">NOT CONNECTED</div>
        ) : (
          results.map((item) => (
            <div key={item.symbol} className="grid grid-cols-[0.8fr_0.8fr_1fr_0.6fr_0.6fr] gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
              <span className="font-medium text-cyan-100">{item.symbol}</span>
              <span>{item.direction}</span>
              <span className="text-slate-300">{item.setup}</span>
              <span className="text-slate-400">{item.score}/100</span>
              <span className="text-slate-500">{item.freshness}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
