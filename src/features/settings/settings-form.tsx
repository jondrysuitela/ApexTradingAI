"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type Preferences = {
  defaultSymbol: string;
  defaultTimeframe: string;
  riskPercent: string;
  maxDailyLoss: string;
  maxExposure: string;
  maxPositionSize: string;
  maxLeverage: string;
  openPositionsLimit: string;
};

const EMPTY: Preferences = {
  defaultSymbol: "BTCUSDT",
  defaultTimeframe: "1h",
  riskPercent: "1.00",
  maxDailyLoss: "0",
  maxExposure: "0",
  maxPositionSize: "0",
  maxLeverage: "1",
  openPositionsLimit: "0",
};

export function SettingsForm() {
  const { data, mutate } = useSWR<{ preferences: Preferences }>("/api/settings", fetcher, { refreshInterval: 30000 });
  const [form, setForm] = useState<Preferences>(EMPTY);

  useState(() => {
    if (data?.preferences) {
      setForm(data.preferences);
    }
  });

  const values = data?.preferences ?? form;

  async function save() {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (response.ok) {
      await mutate();
    }
  }

  return (
    <Card className="xl:col-span-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Preferences</div>
          <div className="mt-1 text-lg font-semibold">Default symbol, timeframe, and risk limits</div>
        </div>
        <button onClick={save} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
          Save
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Default Symbol" value={values.defaultSymbol} onChange={(value) => setForm({ ...values, defaultSymbol: value })} />
        <Field label="Default Timeframe" value={values.defaultTimeframe} onChange={(value) => setForm({ ...values, defaultTimeframe: value })} />
        <Field label="Risk %" value={values.riskPercent} onChange={(value) => setForm({ ...values, riskPercent: value })} />
        <Field label="Max Daily Loss" value={values.maxDailyLoss} onChange={(value) => setForm({ ...values, maxDailyLoss: value })} />
        <Field label="Max Exposure" value={values.maxExposure} onChange={(value) => setForm({ ...values, maxExposure: value })} />
        <Field label="Max Position Size" value={values.maxPositionSize} onChange={(value) => setForm({ ...values, maxPositionSize: value })} />
        <Field label="Max Leverage" value={values.maxLeverage} onChange={(value) => setForm({ ...values, maxLeverage: value })} />
        <Field label="Open Positions" value={values.openPositionsLimit} onChange={(value) => setForm({ ...values, openPositionsLimit: value })} />
      </div>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 outline-none" />
    </label>
  );
}
