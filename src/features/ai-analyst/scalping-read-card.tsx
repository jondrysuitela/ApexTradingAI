"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type ScalpingRead = {
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  score: number;
  reasoning: string[];
  entryType: "PULLBACK" | "BREAKOUT" | "RANGE_BOUNCE" | "MOMENTUM" | "NO_EDGE";
  volatility: "COMPRESSED" | "SCALPABLE" | "WIDE" | "EXTREME";
  atrPercent: number | null;
  session?: {
    name: string;
    label: string;
    liquidity: "BEST" | "HIGH" | "GOOD" | "LOW" | "POOR";
    block: boolean;
    note: string;
  };
  spread?: {
    points: number | null;
    price: number | null;
    atrCoverPct: number | null;
    block: boolean;
    note: string;
  };
  gated?: boolean;
  suggestion: string;
};

const liquidityColor = { BEST: "text-emerald-400", HIGH: "text-emerald-400", GOOD: "text-amber-300", LOW: "text-amber-300", POOR: "text-red-400" } as const;

export function ScalpingReadCard({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const { data } = useSWR<{ analysis: { scalping: ScalpingRead | null } }>(
    `/api/ai/analysis?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=120`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const scalping = data?.analysis?.scalping ?? null;
  const directionLabel = scalping?.direction === "LONG" ? "BUY" : scalping?.direction === "SHORT" ? "SELL" : "WAIT";
  const directionColor = scalping?.direction === "LONG" ? "text-emerald-400" : scalping?.direction === "SHORT" ? "text-red-400" : "text-slate-400";
  const volatilityColor = scalping?.volatility === "EXTREME" ? "text-red-400" : scalping?.volatility === "WIDE" ? "text-amber-300" : scalping?.volatility === "COMPRESSED" ? "text-sky-300" : "text-emerald-400";
  const session = scalping?.session ?? null;
  const spread = scalping?.spread ?? null;
  const blocked = Boolean(scalping?.gated);

  return (
    <Card>
      <div className="flex items-center justify-between text-sm">
        <span className="uppercase tracking-[0.3em] text-slate-400">Scalping Read</span>
        <span className={`font-mono font-semibold ${directionColor}`}>{!scalping ? "—" : `${directionLabel} ${scalping.confidence}/100`}</span>
      </div>
      {!scalping ? (
        <div className="mt-3 text-sm text-slate-400">NOT CONNECTED</div>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          {blocked ? (
            <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              DIBLOKIR untuk scalping — {session?.block ? session.note : spread?.block ? spread.note : "kondisi tidak mendukung"}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-mono text-xs uppercase ${volatilityColor}`}>{scalping.volatility} vol</span>
            <span className="text-xs uppercase text-slate-500">{scalping.entryType === "NO_EDGE" ? "NO EDGE" : scalping.entryType}</span>
            {scalping.atrPercent !== null ? <span className="text-xs text-slate-500">ATR {scalping.atrPercent.toFixed(2)}%</span> : null}
            {session ? (
              <span className={`font-mono text-xs uppercase ${liquidityColor[session.liquidity]}`} title={session.note}>
                {session.label}
              </span>
            ) : null}
            {spread?.price !== null && spread?.price !== undefined ? (
              <span className={`font-mono text-xs uppercase ${spread?.block ? "text-red-400" : "text-slate-500"}`} title={spread?.note ?? ""}>
                spread {spread?.price?.toFixed(spread?.price !== null && spread.price < 1 ? 4 : 2)}
                {spread?.atrCoverPct !== null && spread?.atrCoverPct !== undefined ? ` (${spread.atrCoverPct.toFixed(0)}% ATR)` : ""}
              </span>
            ) : null}
          </div>
          <p className="text-slate-400">{scalping.suggestion}</p>
          {scalping.reasoning.length ? (
            <div className="text-xs text-slate-500">
              {scalping.reasoning.slice(0, 3).map((reason, index) => (
                <div key={`${reason}-${index}`}>- {reason}</div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}