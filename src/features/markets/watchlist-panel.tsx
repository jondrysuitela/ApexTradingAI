"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type WatchlistItem = { symbol: string; label: string };

export function WatchlistPanel() {
  const query = useSWR<{ items: WatchlistItem[] }>("/api/watchlist", fetcher, { refreshInterval: 30000 });
  const items = query.data?.items ?? [];

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Watchlist</div>
      <div className="mt-4 grid gap-2 text-sm">
        {items.length === 0 ? (
          <div className="text-sm text-slate-400">NOT CONNECTED</div>
        ) : (
          items.map((item) => (
            <div key={item.symbol} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
              <span>{item.symbol}</span>
              <span className="text-xs text-slate-500">{item.label}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
