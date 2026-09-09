import { Card } from "@/components/ui/card";
import { detectSetup } from "@/server/technical/setups";

type Candle = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };

export function SetupSummary({ candles }: { candles: Candle[] }) {
  const setup = candles.length >= 5 ? detectSetup("BTCUSDT", candles, "1h") : null;

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Setup Engine</div>
      {setup ? (
        <div className="mt-4 space-y-3">
          <div className="text-xl font-semibold text-cyan-200">{setup.state}</div>
          <div className="text-sm text-slate-300">{setup.setupType}</div>
          <div className="text-sm text-slate-300">Score: {setup.score}/100</div>
          <div className="text-xs text-slate-400">{setup.supportingFactors.join(" | ")}</div>
        </div>
      ) : (
        <div className="mt-4 text-sm text-slate-400">NOT CONNECTED</div>
      )}
    </Card>
  );
}
