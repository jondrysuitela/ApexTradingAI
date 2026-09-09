"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

export function HealthStrip() {
  const readiness = useSWR("/api/readiness", fetcher, { refreshInterval: 30000 });
  const marketValue = readiness.data?.marketData?.twelveDataConfigured ? "ready" : "not_connected";
  const aiValue = readiness.data?.ai?.configured ? "ready" : "local";

  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <StatusCard label="Market Data" value={marketValue} />
      <StatusCard label="AI" value={aiValue} />
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-[130px] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-cyan-200">{value}</div>
    </Card>
  );
}
