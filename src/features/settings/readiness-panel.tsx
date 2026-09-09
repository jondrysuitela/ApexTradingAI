"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type Readiness = {
  previewReady: boolean;
  databaseConfigured: boolean;
  authConfigured: boolean;
  marketData: { provider: string; baseUrlConfigured: boolean; twelveDataConfigured: boolean; mt5BridgeConfigured: boolean };
  ai: { provider: string; configured: boolean };
  worker: { redisConfigured: boolean; mode: string };
};

export function ReadinessPanel() {
  const query = useSWR<Readiness>("/api/readiness", fetcher, { refreshInterval: 30000 });
  const status = query.data;

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Preview Readiness</div>
      <div className="mt-3 text-lg font-semibold">{status?.previewReady ? "App Shell Ready" : "Not Ready"}</div>
      <div className="mt-4 grid gap-2 text-sm text-slate-300">
        <ReadinessRow label="Database URL" ready={Boolean(status?.databaseConfigured)} />
        <ReadinessRow label="Supabase Auth" ready={Boolean(status?.authConfigured)} />
        <ReadinessRow label={`Market Data: ${status?.marketData.provider ?? "loading"}`} ready={Boolean(status?.marketData.baseUrlConfigured)} />
        <ReadinessRow label="Twelve Data Realtime" ready={Boolean(status?.marketData.twelveDataConfigured)} />
        <ReadinessRow label="MT5 Bridge" ready={Boolean(status?.marketData.mt5BridgeConfigured)} />
        <ReadinessRow label={`AI: ${status?.ai.provider ?? "loading"}`} ready={Boolean(status?.ai.configured)} />
        <ReadinessRow label={`Worker: ${status?.worker.mode ?? "loading"}`} ready={Boolean(status)} muted={!status?.worker.redisConfigured} />
      </div>
    </Card>
  );
}

function ReadinessRow({ label, ready, muted = false }: { label: string; ready: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className={ready ? (muted ? "text-slate-300" : "text-cyan-200") : "text-slate-500"}>{ready ? (muted ? "OPTIONAL" : "READY") : "NOT CONNECTED"}</span>
    </div>
  );
}
