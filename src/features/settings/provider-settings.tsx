import { Card } from "@/components/ui/card";
import { env } from "@/server/env";

export function ProviderSettings() {
  const marketConfigured = Boolean(env.MARKET_DATA_PROVIDER);
  const aiConfigured = Boolean(env.AI_PROVIDER);
  const databaseConfigured = Boolean(env.DATABASE_URL);

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Provider Configuration</div>
      <div className="mt-4 grid gap-2 text-sm">
        <Row label="Market Data Provider" value={marketConfigured ? env.MARKET_DATA_PROVIDER : "NOT CONNECTED"} />
        <Row label="AI Provider" value={aiConfigured ? env.AI_PROVIDER ?? "NOT CONNECTED" : "NOT CONNECTED"} />
        <Row label="Database" value={databaseConfigured ? "CONFIGURED" : "NOT CONNECTED"} />
        <Row label="Supabase" value={env.SUPABASE_URL ? "CONFIGURED" : "NOT CONNECTED"} />
        <Row label="Redis" value={env.REDIS_URL ? "CONFIGURED" : "NOT CONNECTED"} />
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-cyan-100">{value}</span>
    </div>
  );
}
