import { Card } from "@/components/ui/card";

export function HealthMonitoring() {
  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Health Monitoring</div>
      <div className="mt-4 grid gap-2 text-sm text-slate-300">
        <p>• /api/health</p>
        <p>• /api/market-data/health</p>
        <p>• /api/ai/health</p>
        <p>• /api/worker/health</p>
      </div>
    </Card>
  );
}
