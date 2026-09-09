"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { appTokenHeaders } from "@/lib/app-token";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type AutoTradeStatus = {
  enabled: boolean;
  status: string;
  config: {
    mode: "paper" | "demo" | "real";
    tradeMode: "single" | "multi";
    symbol: string;
    timeframe: string;
    direction: "AUTO" | "BUY" | "SELL";
    riskPercent: number;
    fixedLot: number;
    slAtrMultiplier: number;
    tpRiskReward: number;
    minConfluenceScore: number;
    minScalpingConfidence: number;
    maxOpenPositions: number;
    loopIntervalMs: number;
  };
  account: { login: number | null; server: string | null; currency: string | null; accountType: string | null; tradeAllowed: boolean; balance: number | null; equity: number | null } | null;
  accountConflict: boolean | null;
  position: {
    ticket: string;
    action: "BUY" | "SELL";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    volume: number;
    riskPerUnit: number;
    lastPrice: number | null;
    mode: string;
    openedAt: string;
  } | null;
  positions: Array<{
    ticket: string;
    action: "BUY" | "SELL";
    symbol: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    volume: number;
    riskPerUnit: number;
    lastPrice: number | null;
    mode: string;
    openedAt: string;
  }>;
  stats: { trades: number; wins: number; winRate: number; realizedPnl: number; balance: number; equity: number };
  lastCycle: { at: string; message: string } | null;
  lastError: string | null;
  lastSkipReason: string | null;
  logs: Array<{ ts: string; level: string; message: string }>;
  loop: { running: boolean; lastTickAt: number | null };
};

export function AutoTradeCard({ symbol: workspaceSymbol, timeframe: workspaceTimeframe, symbols: brokerSymbols }: { symbol: string; timeframe: string; symbols: string[] }) {
  const { data, mutate, isLoading } = useSWR<AutoTradeStatus>("/api/auto-trade", fetcher, { refreshInterval: 10000 });
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const position = data?.position ?? null;
  const stats = data?.stats ?? null;
  const multi = (data?.config?.tradeMode ?? "single") === "multi";
  const openPositions = multi && data?.positions?.length ? data.positions : position ? [position] : [];

  const configSymbol = data?.config?.symbol ?? workspaceSymbol;
  const configTimeframe = data?.config?.timeframe ?? workspaceTimeframe;
  const symbolMismatch = configSymbol !== "AUTO" && workspaceSymbol.toUpperCase() !== configSymbol.toUpperCase();

  useEffect(() => {
    if (!data?.config || !workspaceSymbol || busy) return;
    if (data.position || (data.positions?.length ?? 0) > 0) return;
    if (configSymbol === "AUTO" || configSymbol.toUpperCase() === workspaceSymbol.toUpperCase()) return;
    if (!data.enabled) {
      void post({ action: "config", symbol: workspaceSymbol });
    }
  }, [workspaceSymbol, configSymbol, data?.position, data?.positions?.length, data?.enabled]);

  const baseSymbols = brokerSymbols.length > 0 ? brokerSymbols : ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "USDIDR", "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "XAGUSD", "SPX", "IXIC"];
  const symbolOptions = [
    "AUTO",
    ...(configSymbol !== "AUTO" && !baseSymbols.some((item) => item.toUpperCase() === configSymbol.toUpperCase()) ? [...baseSymbols, configSymbol] : baseSymbols),
  ];
  const timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
  const slSizes = [0.5, 0.75, 1, 1.5, 2, 3];
  const targets = [2, 3, 5, 8, 12];
  const lots = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setActionMessage(null);
    try {
      const response = await fetch("/api/auto-trade", {
        method: "POST",
        headers: { "content-type": "application/json", ...appTokenHeaders() },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setActionMessage(`Gagal: ${result.error ?? response.status}`);
        return;
      }
      setActionMessage(result.cycle?.message ?? result.result?.message ?? "OK");
      void mutate();
    } catch {
      setActionMessage("Request gagal — cek koneksi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between text-sm">
        <span className="uppercase tracking-[0.3em] text-slate-400">Auto Trading</span>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            data?.enabled
              ? multi
                ? openPositions.length > 0
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                  : "border-cyan-400/40 bg-cyan-500/20 text-cyan-200"
                : position
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                  : "border-cyan-400/40 bg-cyan-500/20 text-cyan-200"
              : "border-white/10 bg-slate-950/50 text-slate-400"
          }`}
        >
          {data?.enabled
            ? multi
              ? openPositions.length > 0
                ? `${openPositions.length} POSISI BERJALAN`
                : "RUNNING"
              : position
                ? `POSISI ${position.action} TERBUKA`
                : "RUNNING"
            : "OFF"}
        </span>
      </div>

      {data?.lastError ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{data.lastError}</div> : null}
      {actionMessage ? <div className="mt-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-cyan-200">{actionMessage}</div> : null}
      {symbolMismatch ? (
        <div className="mt-2 rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          ⚠ Auto-trade berjalan di <span className="font-mono">{configSymbol}</span>, tapi aktif di <span className="font-mono">{workspaceSymbol}</span>. Trade akan dikunci pada symbol auto-trade, bukan yang sedang dianalisis.
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm lg:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Mode</div>
          <select
            value={data?.config?.mode ?? "paper"}
            onChange={(event) => post({ action: "config", mode: event.target.value })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            <option value="paper" className="bg-slate-950">Paper (virtual)</option>
            <option value="demo" className="bg-slate-950">Akun Demo</option>
            <option value="real" className="bg-slate-950">Real (uang asli)</option>
          </select>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Mode Trade</div>
          <select
            value={data?.config?.tradeMode ?? "single"}
            onChange={(event) => post({ action: "config", tradeMode: event.target.value })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            <option value="single" className="bg-slate-950">Single (1 posisi)</option>
            <option value="multi" className="bg-slate-950">Multi (max {data?.config?.maxOpenPositions ?? 1})</option>
          </select>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Trade</div>
          <select
            value={data?.config?.direction ?? "AUTO"}
            onChange={(event) => post({ action: "config", direction: event.target.value })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            <option value="AUTO" className="bg-slate-950">AUTO (sinyal)</option>
            <option value="BUY" className="bg-slate-950">BUY (long saja)</option>
            <option value="SELL" className="bg-slate-950">SELL (short saja)</option>
          </select>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Pasar</div>
          <select
            value={configSymbol}
            onChange={(event) => post({ action: "config", symbol: event.target.value })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            {symbolOptions.map((item) => (
              <option key={item} value={item} className="bg-slate-950">{item === "AUTO" ? "AUTO (cari pasar otomatis)" : item}</option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Timeframe</div>
          <select
            value={configTimeframe}
            onChange={(event) => post({ action: "config", timeframe: event.target.value })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            {timeframes.map((item) => (
              <option key={item} value={item} className="bg-slate-950">{item}</option>
            ))}
          </select>
        </div>
        <Field label="Risk / trade" value={`${data?.config?.riskPercent ?? 1}%`} />
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Lot</div>
          <select
            value={data?.config?.fixedLot ?? 0.01}
            onChange={(event) => post({ action: "config", fixedLot: Number(event.target.value) })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            {lots.map((item) => (
              <option key={item} value={item} className="bg-slate-950">{item.toFixed(2)} lot</option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">SL size</div>
          <select
            value={data?.config?.slAtrMultiplier ?? 0.75}
            onChange={(event) => post({ action: "config", slSize: event.target.value })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            {slSizes.map((item) => (
              <option key={item} value={item} className="bg-slate-950">{item.toFixed(2)} ATR</option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Target</div>
          <select
            value={data?.config?.tpRiskReward ?? 5}
            onChange={(event) => post({ action: "config", target: event.target.value })}
            disabled={busy}
            className="w-full bg-transparent font-mono text-xs text-cyan-100 outline-none disabled:opacity-50"
          >
            {targets.map((item) => (
              <option key={item} value={item} className="bg-slate-950">{item.toFixed(0)}R</option>
            ))}
          </select>
        </div>
      </div>

      {data?.account?.accountType ? (
        <div
          className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
            data.accountConflict ? "border-red-400/40 bg-red-500/10 text-red-300" : "border-white/10 bg-slate-950/40 text-slate-400"
          }`}
        >
          Terminal MT5: <span className="font-mono text-cyan-200">{data.account.accountType.toUpperCase()}</span>{" "}
          <span className="font-mono">{data.account.login ?? "?"}@{data.account.server ?? "?"}</span>
          {data.accountConflict ? " — TIDAK SESUAI dengan mode dipilih, entry dibatalkan otomatis." : ` — sesuai mode ${(data?.config?.mode ?? "paper").toUpperCase()}.`}
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-600">Terminal MT5 tidak terdeteksi — hanya mode paper berjalan.</div>
      )}

      {multi && openPositions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {openPositions.map((item, index) => (
            <PositionCard key={`${item.ticket}-${index}`} position={item} />
          ))}
        </div>
      ) : position ? (
        <PositionCard position={position} />
      ) : (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-500">
          {data?.enabled
            ? data?.lastSkipReason
              ? configSymbol === "AUTO"
                ? `Auto market aktif — memindai pasar terbaik. ${data.lastSkipReason}`
                : `Menunggu sinyal scalping + confluence searah — ${data.lastSkipReason}`
              : configSymbol === "AUTO"
                ? "Auto market aktif — memindai pasar terbaik..."
                : "Menunggu sinyal scalping + confluence searah..."
            : "Auto-trading mati. Tekan START untuk memulai loop."}
        </div>
      )}

      {stats ? (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat label="Trades" value={String(stats.trades)} />
          <Stat label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
          <Stat label="Realized PnL" value={`$${stats.realizedPnl.toFixed(2)}`} accent />
          <Stat label={(data?.config?.mode === "paper" ? "Paper Equity" : `${(data?.config?.mode ?? "paper").toUpperCase()} Equity`)} value={`$${stats.equity.toFixed(2)}`} />
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <button
          disabled={busy}
          onClick={() => post({ action: data?.enabled ? "stop" : "start" })}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
            data?.enabled
              ? "border border-red-400/40 bg-red-500/20 text-red-300 hover:bg-red-500/30"
              : "border border-cyan-400/40 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
          }`}
        >
          {data?.enabled ? "STOP" : "START"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => post({ action: "run-now" })} className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm hover:bg-slate-950/80 disabled:opacity-50">
            Run Now
          </button>
          <button disabled={busy || openPositions.length === 0} onClick={() => post({ action: "close" })} className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200 hover:bg-yellow-500/20 disabled:opacity-40">
            Close
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-28 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-2 text-[11px] text-slate-400">
        {(data?.logs?.length ? data.logs : []).slice(0, 12).map((entry, index) => (
          <div key={`${entry.ts}-${index}`} className="flex gap-2">
            <span className="shrink-0 text-slate-600">{new Date(entry.ts).toLocaleTimeString("id-ID")}</span>
            <span className={entry.level === "error" ? "text-red-300" : entry.level === "trade" ? "text-cyan-200" : "text-slate-400"}>{entry.message}</span>
          </div>
        ))}
        {!data?.logs?.length ? <div className="text-slate-600">Belum ada log. {isLoading ? "Menyambung..." : "Loop: " + (data?.loop?.running ? "aktif" : "mati")}</div> : null}
      </div>
      <div className="mt-2 text-[11px] text-slate-600">
        Loop interval {(data?.config?.loopIntervalMs ?? 15000) / 1000}s · SL dari ATR × {(data?.config?.slAtrMultiplier ?? 0.75).toFixed(2)} · TP {(data?.config?.tpRiskReward ?? 5).toFixed(0)}× risiko · trade {(data?.config?.tradeMode ?? "single").toUpperCase()} · max {data?.config?.maxOpenPositions ?? 1} posisi.
      </div>
    </Card>
  );
}

function PositionCard({ position }: { position: { action: "BUY" | "SELL"; symbol?: string; entryPrice: number; stopLoss: number; takeProfit: number; volume: number; riskPerUnit: number; lastPrice: number | null; mode: string; openedAt: string } }) {
  const sideColor = position.action === "BUY" ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300" : "border-red-400/40 bg-red-500/20 text-red-300";
  const unrealized = position.lastPrice !== null ? (position.lastPrice - position.entryPrice) * position.volume * 100 * (position.action === "BUY" ? 1 : -1) : null;
  const rMultiple = position.lastPrice !== null && position.riskPerUnit > 0
    ? position.action === "BUY"
      ? (position.lastPrice - position.entryPrice) / position.riskPerUnit
      : (position.entryPrice - position.lastPrice) / position.riskPerUnit
    : null;

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${sideColor}`}>
          {position.action}
          {position.symbol ? ` · ${position.symbol}` : ""}
        </span>
        <span className="text-xs text-slate-400">
          {position.mode.toUpperCase()} vol {position.volume} · {new Date(position.openedAt).toLocaleString("id-ID")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="text-slate-400">
          Entry <span className="block font-mono text-cyan-100">{position.entryPrice.toFixed(5)}</span>
        </div>
        <div className="text-slate-400">
          Last <span className="block font-mono text-cyan-100">{position.lastPrice !== null ? position.lastPrice.toFixed(5) : "—"}</span>
        </div>
        <div className="text-slate-400">
          SL <span className="block font-mono text-red-300">{position.stopLoss.toFixed(5)}</span>
        </div>
        <div className="text-slate-400">
          TP <span className="block font-mono text-emerald-300">{position.takeProfit.toFixed(5)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">
          Unrealized: <span className={unrealized !== null && unrealized >= 0 ? "text-emerald-300" : "text-red-300"}>{unrealized !== null ? `$${unrealized.toFixed(2)}` : "—"}</span>
        </span>
        <span className="text-slate-400">
          R: <span className={rMultiple !== null && rMultiple >= 0 ? "text-emerald-300" : "text-red-300"}>{rMultiple !== null ? `${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R` : "—"}</span>
        </span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="font-mono text-xs text-cyan-100">{value}</div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1.5">
      <div className={`font-mono text-sm ${accent ? (value.startsWith("$") && value.includes("-") ? "text-red-300" : "text-emerald-300") : "text-cyan-100"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
    </div>
  );
}