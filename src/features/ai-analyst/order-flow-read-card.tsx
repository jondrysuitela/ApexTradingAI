"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type OrderFlowRead = {
  vwap:
    | {
        vwap: number | null;
        upper1: number | null;
        lower1: number | null;
        position: string;
        deviationPct: number | null;
      }
    | null;
  volumeProfile: { poc: number | null; vah: number | null; val: number | null; valueAreaPct: number | null } | null;
  delta: { buyVolume: number; sellVolume: number; totalVolume: number; imbalance: number; cvd: number; cvdDirection: string; aggressiveMomentum: string } | null;
  sweeps: Array<{ direction: "LONG" | "SHORT"; levelPrice: number; strength: number }>;
  fvgs: Array<{ direction: "BULLISH" | "BEARISH"; top: number; bottom: number; fresh: boolean }>;
  orderBlocks: Array<{ direction: "BULLISH" | "BEARISH"; high: number; low: number }>;
  fib: { direction: "UP" | "DOWN"; swingLow: number; swingHigh: number; nearest: { level: { ratio: number; price: number; kind: string }; distancePct: number } | null } | null;
};

type LearningRead = Array<{ name: string; samples: number; winRate: number; edge: number; weight: number; directionBias: "LONG" | "SHORT" | "NEUTRAL" }>;

const posColor = (position: string) => (position.startsWith("ABOVE") ? "text-emerald-400" : position.startsWith("BELOW") ? "text-red-400" : "text-slate-400");

export function OrderFlowReadCard({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const { data } = useSWR<{ analysis: { orderFlow: OrderFlowRead | null; learning: LearningRead | null } }>(
    `/api/ai/analysis?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=120`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const orderFlow = data?.analysis?.orderFlow ?? null;
  const learning = (data?.analysis?.learning ?? []).filter((item) => item.samples >= 6 && Math.abs(item.weight - 1) > 0.2);
  const delta = orderFlow?.delta ?? null;
  const vwap = orderFlow?.vwap ?? null;
  const profile = orderFlow?.volumeProfile ?? null;
  const lastSweep = orderFlow?.sweeps?.at(-1) ?? null;
  const freshFvg = orderFlow?.fvgs?.filter((item) => item.fresh).at(-1) ?? null;
  const lastBlock = orderFlow?.orderBlocks?.at(-1) ?? null;
  const fib = orderFlow?.fib ?? null;

  const deltaColor = !delta ? "text-slate-400" : delta.imbalance > 0.15 ? "text-emerald-400" : delta.imbalance < -0.15 ? "text-red-400" : "text-slate-400";

  return (
    <Card>
      <div className="flex items-center justify-between text-sm">
        <span className="uppercase tracking-[0.3em] text-slate-400">Order Flow</span>
        <span className={`font-mono text-xs ${deltaColor}`}>{delta ? `Δ ${delta.imbalance >= 0 ? "+" : ""}${(delta.imbalance * 100).toFixed(0)}%` : "—"}</span>
      </div>
      {!orderFlow ? (
        <div className="mt-3 text-sm text-slate-400">NOT CONNECTED</div>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="CVD" value={delta ? `${delta.cvd >= 0 ? "+" : ""}${delta.cvd.toFixed(0)} ${delta.cvdDirection}` : "—"} tone={deltaColor} />
            <Stat label="Aggression" value={delta ? delta.aggressiveMomentum.replace("_", " ") : "—"} tone={deltaColor} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="VWAP" value={vwap?.vwap ? vwap.vwap.toFixed(4) : "—"} sub={vwap?.vwap ? `${vwap.position.replace("_", " ")} (${vwap.deviationPct?.toFixed(2)}%)` : undefined} tone={vwap ? posColor(vwap.position) : "text-slate-400"} />
            <Stat label="Volume Profile" value={profile?.poc ? `POC ${profile.poc.toFixed(4)}` : "—"} sub={profile?.poc ? `VA ${profile.val?.toFixed(3)}-${profile.vah?.toFixed(3)}` : undefined} tone="text-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Sweep" value={lastSweep ? `${lastSweep.direction} @ ${lastSweep.levelPrice.toFixed(4)}` : "none"} tone={lastSweep ? (lastSweep.direction === "LONG" ? "text-amber-300" : "text-amber-300") : "text-slate-500"} />
            <Stat label="FVG" value={freshFvg ? `${freshFvg.direction} ${freshFvg.bottom.toFixed(4)}-${freshFvg.top.toFixed(4)}` : "none"} tone={freshFvg ? "text-cyan-300" : "text-slate-500"} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Order Block" value={lastBlock ? `${lastBlock.direction} ${lastBlock.low.toFixed(4)}-${lastBlock.high.toFixed(4)}` : "none"} tone={lastBlock ? "text-cyan-300" : "text-slate-500"} />
            <Stat label="Fibonacci" value={fib?.nearest?.level ? `${(fib.nearest.level.ratio * 100).toFixed(1)}% ${fib.direction === "UP" ? "support" : "resistance"} ${fib.nearest.level.price.toFixed(4)}` : "—"} tone={fib?.nearest?.level ? "text-cyan-300" : "text-slate-500"} />
          </div>
          {learning.length ? (
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-400/80">Learning Loop</div>
              {learning.map((item) => (
                <div key={item.name} className="mt-1 flex items-center justify-between font-mono text-xs">
                  <span className="text-slate-300">{item.name}</span>
                  <span className="text-emerald-300">
                    {item.edge >= 0 ? "+" : ""}
                    {item.edge.toFixed(2)}R x{item.weight.toFixed(2)} ({item.winRate.toFixed(0)}%, n={item.samples})
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-xs ${tone}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}