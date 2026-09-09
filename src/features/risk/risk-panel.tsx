"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { calculateRisk } from "@/server/technical/risk";

type Summary = {
  latestClose: number | null;
  setup: { entryZone: { low: number; high: number } | null; invalidation: number | null; targets: number[]; state: string; score: number; direction: "LONG" | "SHORT" | "NEUTRAL" } | null;
};

export function RiskPanel({ summary }: { summary: Summary | null }) {
  const [equity, setEquity] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [leverage, setLeverage] = useState(1);

  const inputs = useMemo(() => {
    if (!summary?.latestClose || !summary.setup?.entryZone || !summary.setup.invalidation || summary.setup.targets.length === 0) {
      return null;
    }

    const entry = (summary.setup.entryZone.low + summary.setup.entryZone.high) / 2;
    return {
      entry,
      stop: summary.setup.invalidation,
      target: summary.setup.targets[0],
    };
  }, [summary]);

  const risk = inputs
    ? calculateRisk({
        equity,
        riskPercent,
        entry: inputs.entry,
        stop: inputs.stop,
        target: inputs.target,
        leverage,
      })
    : null;

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Risk Calculator</div>
      {!summary || !inputs ? (
        <div className="mt-4 text-sm text-slate-400">NOT CONNECTED</div>
      ) : (
        <div className="mt-4 grid gap-3 text-sm">
          <Row label="Equity">
            <Input value={equity} onChange={(value) => setEquity(value)} />
          </Row>
          <Row label="Risk %">
            <Input value={riskPercent} onChange={(value) => setRiskPercent(value)} />
          </Row>
          <Row label="Leverage">
            <Input value={leverage} onChange={(value) => setLeverage(value)} />
          </Row>
          <Metric label="Entry" value={inputs.entry.toFixed(2)} />
          <Metric label="Stop" value={inputs.stop.toFixed(2)} />
          <Metric label="Target" value={inputs.target.toFixed(2)} />
          <Metric label="Risk Amount" value={format(risk?.riskAmount)} />
          <Metric label="Position Size" value={format(risk?.positionSize)} />
          <Metric label="Potential Loss" value={format(risk?.potentialLoss)} />
          <Metric label="Potential Profit" value={format(risk?.potentialProfit)} />
          <Metric label="R:R" value={format(risk?.riskReward)} />
          <Metric label="Exposure" value={format(risk?.exposure)} />
          <Metric label="Liquidation Risk" value={format(risk?.liquidationRisk)} />
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-cyan-100">{value}</span>
    </div>
  );
}

function Input({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-28 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-1 text-right text-sm outline-none"
    />
  );
}

function format(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value) ? "NOT CONNECTED" : value.toFixed(2);
}
