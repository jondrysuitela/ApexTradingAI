"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

type WorkerResult = {
  alerts: { processed: number; triggered: number };
  paperTrading: { processed: number; filled: number; marked: number };
};

export function WorkerControl() {
  const [status, setStatus] = useState("IDLE");
  const [result, setResult] = useState<WorkerResult | null>(null);

  async function runWorker() {
    setStatus("RUNNING");
    const response = await fetch("/api/worker/run", { method: "POST" });
    if (!response.ok) {
      setStatus("FAILED");
      return;
    }

    const body = (await response.json()) as { result: WorkerResult };
    setResult(body.result);
    setStatus("COMPLETED");
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Worker Control</div>
          <div className="mt-1 text-lg font-semibold">Manual deterministic cycle</div>
        </div>
        <button onClick={runWorker} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
          Run Worker
        </button>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-300">
        <p>Status: {status}</p>
        <p>Alerts: {result ? `${result.alerts.processed} processed, ${result.alerts.triggered} triggered` : "NOT RUN"}</p>
        <p>Paper trading: {result ? `${result.paperTrading.processed} processed, ${result.paperTrading.filled} filled, ${result.paperTrading.marked} marked` : "NOT RUN"}</p>
      </div>
    </Card>
  );
}
