"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { DEFAULT_MARKET_UNIVERSE } from "@/server/market-data/universe";

export function MarketAssetSearch({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return DEFAULT_MARKET_UNIVERSE;
    return DEFAULT_MARKET_UNIVERSE.filter((item) => item.symbol.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle));
  }, [query]);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Asset Search</div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm outline-none placeholder:text-slate-500"
          placeholder="Search symbol or name"
        />
        <div className="grid gap-2">
          {results.map((item) => (
            <button
              key={item.symbol}
              type="button"
              onClick={() => onSelect(item.symbol)}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm hover:border-cyan-400/40"
            >
              <span>{item.label}</span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-500">{item.market}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
