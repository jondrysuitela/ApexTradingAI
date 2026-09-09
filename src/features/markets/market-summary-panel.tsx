import { Card } from "@/components/ui/card";

type Summary = {
  symbol: string;
  timeframe: string;
  status: string;
  latestClose: number | null;
  setup: { state: string; setupType: string; score: number } | null;
  indicators: { sma20: number | null; ema20: number | null; rsi14: number | null; atr14: number | null };
  structure: Array<{ type: string; timestamp: string; price: number; strength: number }>;
  supportResistance: Array<{ type: string; price: number; strength: number; touchCount: number }>;
};

export function MarketSummaryPanel({ summary }: { summary: Summary | null }) {
  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Transparent Scoring</div>
      {!summary ? (
        <div className="mt-4 text-sm text-slate-400">NOT CONNECTED</div>
      ) : (
        <div className="mt-4 grid gap-3 text-sm">
          <Metric label="Symbol" value={summary.symbol} />
          <Metric label="Timeframe" value={summary.timeframe} />
          <Metric label="Latest Close" value={format(summary.latestClose)} />
          <Metric label="Setup State" value={summary.setup?.state ?? "NO_TRADE"} />
          <Metric label="Setup Score" value={summary.setup ? `${summary.setup.score}/100` : "0/100"} />
          <Metric label="RSI 14" value={format(summary.indicators.rsi14)} />
          <Metric label="SMA 20" value={format(summary.indicators.sma20)} />
          <Metric label="EMA 20" value={format(summary.indicators.ema20)} />
          <Metric label="ATR 14" value={format(summary.indicators.atr14)} />
          <Metric label="Structure Events" value={String(summary.structure.length)} />
          <Metric label="S/R Levels" value={String(summary.supportResistance.length)} />
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-slate-300">
            AI explains these facts only. It does not compute indicators or invent values.
          </div>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-cyan-100">{value}</span>
    </div>
  );
}

function format(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value) ? "NOT CONNECTED" : value.toFixed(2);
}
