"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type Snapshot = {
  portfolio: { name: string; baseCurrency: string; status: string };
  positions: Array<{ asset: string; quantity: string; averagePrice: string; marketValue: string; unrealizedPnl: string }>;
};

export function PortfolioSummary() {
  const query = useSWR<{ snapshot: Snapshot | null }>("/api/portfolio", fetcher, { refreshInterval: 30000 });

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Portfolio</div>
        <button className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">Create Primary</button>
      </div>
      {!query.data?.snapshot ? (
        <div className="mt-4 text-sm text-slate-400">NOT CONNECTED</div>
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
            <span className="text-slate-400">Name</span>
            <span className="font-medium text-cyan-100">{query.data.snapshot.portfolio.name}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
            <span className="text-slate-400">Base Currency</span>
            <span className="font-medium text-cyan-100">{query.data.snapshot.portfolio.baseCurrency}</span>
          </div>
          <div className="grid gap-2">
            {query.data.snapshot.positions.map((position) => (
              <div key={position.asset} className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-cyan-100">{position.asset}</span>
                  <span className="text-slate-400">PnL {position.unrealizedPnl}</span>
                </div>
                <div className="text-xs text-slate-500">Qty {position.quantity} · Avg {position.averagePrice} · Value {position.marketValue}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
