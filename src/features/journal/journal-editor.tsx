"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type Entry = {
  id: string;
  symbol: string;
  direction: string;
  strategy: string | null;
  reason: string | null;
  result: string | null;
  notes: string | null;
  createdAt: string;
};

export function JournalEditor() {
  const query = useSWR<{ entries: Entry[] }>("/api/journal", fetcher, { refreshInterval: 30000 });
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [direction, setDirection] = useState("LONG");
  const [strategy, setStrategy] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  async function saveEntry() {
    const response = await fetch("/api/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, direction, strategy, reason, notes }),
    });

    if (response.ok) {
      await query.mutate();
    }
  }

  return (
    <Card className="xl:col-span-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Journal</div>
          <div className="mt-1 text-lg font-semibold">Trade notes and performance memory</div>
        </div>
        <button onClick={saveEntry} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
          Save Entry
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Symbol" value={symbol} onChange={setSymbol} />
        <Field label="Direction" value={direction} onChange={setDirection} />
        <Field label="Strategy" value={strategy} onChange={setStrategy} />
        <Field label="Reason" value={reason} onChange={setReason} />
        <Field label="Notes" value={notes} onChange={setNotes} />
      </div>

      <div className="mt-6 grid gap-2">
        {query.data?.entries?.length ? query.data.entries.map((entry) => <EntryRow key={entry.id} entry={entry} />) : <div className="text-sm text-slate-400">NOT CONNECTED</div>}
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

function EntryRow({ entry }: { entry: Entry }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-cyan-100">{entry.symbol}</span>
        <span className="text-slate-400">{entry.direction}</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">{entry.strategy ?? "No strategy"} · {entry.reason ?? "No reason"}</div>
    </div>
  );
}
