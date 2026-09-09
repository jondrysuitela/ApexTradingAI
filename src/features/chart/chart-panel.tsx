import { Card } from "@/components/ui/card";

export function ChartPanel() {
  return (
    <Card>
      <div className="space-y-3">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Chart</div>
        <div className="text-lg font-semibold">Professional chart workspace</div>
        <p className="text-sm text-slate-300">Real candle data is rendered below in the dashboard chart. When the provider is not connected, the app shows NOT CONNECTED rather than inventing data.</p>
      </div>
    </Card>
  );
}
