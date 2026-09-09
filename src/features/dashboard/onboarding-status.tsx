"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type BootstrapStatus = {
  connected: boolean;
  complete: boolean;
  checks: null | { profile: boolean; portfolio: boolean; watchlist: boolean };
};

export function OnboardingStatus() {
  const query = useSWR<{ status: BootstrapStatus }>("/api/bootstrap", fetcher, { refreshInterval: 30000 });
  const status = query.data?.status;

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Workspace Readiness</div>
      <div className="mt-3 text-lg font-semibold">{status?.complete ? "Bootstrapped" : "Setup Required"}</div>
      <div className="mt-4 grid gap-2 text-sm text-slate-300">
        <ReadinessRow label="Database/User Session" ready={Boolean(status?.connected)} />
        <ReadinessRow label="Profile" ready={Boolean(status?.checks?.profile)} />
        <ReadinessRow label="Portfolio" ready={Boolean(status?.checks?.portfolio)} />
        <ReadinessRow label="Watchlist" ready={Boolean(status?.checks?.watchlist)} />
      </div>
    </Card>
  );
}

function ReadinessRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className={ready ? "text-cyan-200" : "text-slate-500"}>{ready ? "READY" : "NOT CONNECTED"}</span>
    </div>
  );
}
