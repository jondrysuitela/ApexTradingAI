import { Card } from "@/components/ui/card";

export function MarketAnalysisPanel() {
  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Analysis Rules</div>
      <div className="mt-4 space-y-3 text-sm text-slate-300">
        <p>• Deterministic indicators calculate first.</p>
        <p>• Market structure and support/resistance derive from actual candles.</p>
        <p>• Setup score is transparent and auditable.</p>
        <p>• AI only explains structured facts. It does not invent market data.</p>
      </div>
    </Card>
  );
}
