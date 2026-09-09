import { Card } from "@/components/ui/card";
import { sma, ema, rsi, bollingerBands } from "@/server/technical/indicators";

type Candle = { open: number; high: number; low: number; close: number; volume: number };

export function IndicatorSummary({ candles }: { candles: Candle[] }) {
  const closes = candles.map((candle) => candle.close);
  const summary = {
    sma20: sma(closes, 20),
    ema20: ema(closes, 20),
    rsi14: rsi(closes, 14),
    bollinger: bollingerBands(closes, 20),
  };

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Technical Indicators</div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="SMA 20" value={format(summary.sma20)} />
        <Metric label="EMA 20" value={format(summary.ema20)} />
        <Metric label="RSI 14" value={format(summary.rsi14)} />
        <Metric label="BB Mid" value={format(summary.bollinger?.middle)} />
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-cyan-100">{value}</div>
    </div>
  );
}

function format(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value) ? "NOT CONNECTED" : value.toFixed(2);
}
