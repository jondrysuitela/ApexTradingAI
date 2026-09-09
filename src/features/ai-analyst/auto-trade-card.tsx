"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { appTokenHeaders } from "@/lib/app-token";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type AutoTradeStatus = {
  enabled: boolean;
  status: string;
  config: {
    mode: "paper" | "demo" | "real";
    symbol: string;
    timeframe: string;
    riskPercent: number;
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
  stats: { trades: number; wins: number; winRate: number; realizedPnl: number; balance: number; equity: number };
  lastCycle: { at: string; message: string } | null;
  lastError: string | null;
  logs: Array<{ ts: string; level: string; message: string }>;
  loop: { running: boolean; lastTickAt: number | null };
};

export function AutoTradeCard() {
  const { data, mutate, isLoading } = useSWR<AutoTradeStatus>("/api/auto-trade", fetcher, { refreshInterval: 10000 });
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const position = data?.position ?? null;
  const stats = data?.stats ?? null;
  const sideColor = position?.action === "BUY" ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300" : "border-red-400/40 bg-red-500/20 text-red-300";

  const unrealized = useMemo(() => {
    if (!position || position.lastPrice === null) return null;
    const signed = position.action === "BUY" ? 1 : -1;
    return (position.lastPrice - position.entryPrice) * position.volume * 100 * signed;
  }, [position]);

  const rMultiple = useMemo(() => {
    if (!position || position.lastPrice === null || position.riskPerUnit <= 0) return null;
    return position.action === "BUY"
      ? (position.lastPrice - position.entryPrice) / position.riskPerUnit
      : (position.entryPrice - position.lastPrice) / position.riskPerUnit;
  }, [position]);

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
              ? position
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                : "border-cyan-400/40 bg-cyan-500/20 text-cyan-200"
              : "border-white/10 bg-slate-950/50 text-slate-400"
          }`}
        >
          {data?.enabled ? (position ? `POSISI ${position.action} TERBUKA` : "RUNNING") : "OFF"}
        </span>
      </div>

      {data?.lastError ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{data.lastError}</div> : null}
      {actionMessage ? <div className="mt-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-cyan-200">{actionMessage}</div> : null}

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
        <Field label="Symbol" value={data?.config?.symbol ?? "XAUUSD"} />
        <Field label="Timeframe" value={data?.config?.timeframe ?? "5m"} />
        <Field label="Risk / trade" value={`${data?.config?.riskPercent ?? 1}%`} />
        <Field label="SL size" value={`${(data?.config?.slAtrMultiplier ?? 0.75).toFixed(2)} ATR`} />
        <Field label="Target" value={`${(data?.config?.tpRiskReward ?? 5).toFixed(0)}R`} />
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

      {position ? (
        <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${sideColor}`}>{position.action}</span>
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
      ) : (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-500">
          {data?.enabled ? "Menunggu sinyal scalping + confluence searah..." : "Auto-trading mati. Tekan START untuk memulai loop."}
        </div>
      )}

      {stats ? (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat label="Trades" value={String(stats.trades)} />
          <Stat label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
          <Stat label="Realized PnL" value={`$${stats.realizedPnl.toFixed(2)}`} accent />
          <Stat label="Paper Equity" value={`$${stats.equity.toFixed(2)}`} />
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
          <button disabled={busy || !position} onClick={() => post({ action: "close" })} className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200 hover:bg-yellow-500/20 disabled:opacity-40">
            Close
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-28 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-2 text-[11px] text-slate-400">
        {(data?.logs?.length ? data.logs : []).slice(0, 12).map((entry) => (
          <div key={entry.ts} className="flex gap-2">
            <span className="shrink-0 text-slate-600">{new Date(entry.ts).toLocaleTimeString("id-ID")}</span>
            <span className={entry.level === "error" ? "text-red-300" : entry.level === "trade" ? "text-cyan-200" : "text-slate-400"}>{entry.message}</span>
          </div>
        ))}
        {!data?.logs?.length ? <div className="text-slate-600">Belum ada log. {isLoading ? "Menyambung..." : "Loop: " + (data?.loop?.running ? "aktif" : "mati")}</div> : null}
      </div>
      <div className="mt-2 text-[11px] text-slate-600">
        Loop interval {(data?.config?.loopIntervalMs ?? 15000) / 1000}s · SL dari ATR × {(data?.config?.slAtrMultiplier ?? 0.75).toFixed(2)} · TP {(data?.config?.tpRiskReward ?? 5).toFixed(0)}× risiko · max {data?.config?.maxOpenPositions ?? 1} posisi.
      </div>
    </Card>
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