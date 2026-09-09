"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { appTokenHeaders } from "@/lib/app-token";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type Position = {
  ticket: number;
  symbol: string;
  type: number;
  typeLabel: "BUY" | "SELL";
  volume: number;
  priceOpen: number;
  priceCurrent: number;
  sl: number | null;
  tp: number | null;
  profit: number;
  swap: number;
  totalProfit: number;
  time: string;
  magic: number;
  comment: string;
};

type PositionsResponse = {
  positions: Position[];
  account: null | {
    login: number | null;
    name: string | null;
    server: string | null;
    currency: string | null;
    balance: number | null;
    equity: number | null;
    margin: number | null;
    marginFree: number | null;
  };
  error?: string;
};

export function LivePositionsPanel({ symbol }: { symbol: string }) {
  const { data, mutate } = useSWR<PositionsResponse>(`/api/market-data/positions?symbol=${encodeURIComponent(symbol)}`, fetcher, {
    refreshInterval: 3000,
  });
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loginChange, setLoginChange] = useState<string | null>(null);
  const loginRef = useRef<number | null>(null);

  const positions = data?.positions ?? [];
  const account = data?.account ?? null;
  const totalProfit = positions.reduce((sum, position) => sum + position.totalProfit, 0);

  useEffect(() => {
    const login = account?.login ?? null;
    if (login === null || loginRef.current === login) return;
    const previous = loginRef.current;
    loginRef.current = login;
    if (previous !== null) {
      setLoginChange(`Akun MT5 berubah → ${account?.name ?? ""} (${login}@${account?.server ?? "?"})`);
    }
  }, [account?.login, account?.name, account?.server]);

  useEffect(() => {
    if (!loginChange) return;
    const timer = setTimeout(() => setLoginChange(null), 8000);
    return () => clearTimeout(timer);
  }, [loginChange]);

  async function closePosition(ticket: number) {
    setClosingTicket(ticket);
    setMessage(null);
    try {
      const response = await fetch("/api/market-data/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...appTokenHeaders() },
        body: JSON.stringify({ ticket }),
      });
      const body = await response.json();
      if (response.ok && body.filled) {
        setMessage({ ok: true, text: `posisi #${ticket} TUTUP @ ${body.price?.toFixed(5) ?? "n/a"} (${body.retcodeLabel ?? "DONE"})` });
      } else {
        setMessage({ ok: false, text: `gagal tutup #${ticket}: ${body.retcodeLabel ?? body.error ?? "unknown"} — nyalakan Algo Trading (Ctrl+E) di terminal MT5` });
      }
    } catch {
      setMessage({ ok: false, text: `gagal terhubung ke bridge saat menutup #${ticket}` });
    } finally {
      setClosingTicket(null);
      mutate();
    }
  }

  async function closeAll() {
    if (closingAll || positions.length === 0) return;
    setClosingAll(true);
    setMessage(null);
    try {
      const response = await fetch("/api/market-data/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...appTokenHeaders() },
        body: JSON.stringify({ all: true }),
      });
      const body = await response.json();
      if (response.ok && body.filled) {
        setMessage({ ok: true, text: `SEMUA posisi ditutup (${body.results?.length ?? 0})` });
      } else {
        const failed = (body.results ?? []).filter((item: { filled?: boolean }) => !item.filled);
        const failedText = failed.length ? failed.map((item: { symbol?: string; retcodeLabel?: string }) => `${item.symbol ?? "?"} ${item.retcodeLabel ?? "?"}`).join(", ") : body.error ?? "unknown";
        setMessage({
          ok: false,
          text: failed.length === 0 ? `gagal tutup semua: ${failedText}` : `${failed.length}/${body.results?.length ?? "?"} gagal tutup: ${failedText} — nyalakan Algo Trading (Ctrl+E)`,
        });
      }
    } catch {
      setMessage({ ok: false, text: `gagal terhubung ke bridge saat menutup semua` });
    } finally {
      setClosingAll(false);
      mutate();
    }
  }

  const closing = closingTicket !== null || closingAll;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="uppercase tracking-[0.3em] text-slate-400">Open Positions</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono ${totalProfit > 0 ? "text-emerald-400" : totalProfit < 0 ? "text-red-400" : "text-slate-400"}`}>
            P/L {totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}
          </span>
          {positions.length > 0 ? (
            <button
              type="button"
              onClick={() => void closeAll()}
              disabled={closing}
              className="rounded-lg border border-red-400/50 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {closingAll ? "MENUTUP..." : `Tutup Semua (${positions.length})`}
            </button>
          ) : null}
        </div>
      </div>

      {account ? (
        <div className="mt-2 text-xs text-slate-400">
          <span className="font-mono text-slate-200">
            {account.name ?? ""} ({account.login ?? "?"}@{account.server ?? "?"})
          </span>{" "}
          · {account.currency ?? ""} · Equity <span className="font-mono text-slate-200">${account.equity?.toFixed(2) ?? "n/a"}</span> · Balance{" "}
          <span className="font-mono text-slate-200">${account.balance?.toFixed(2) ?? "n/a"}</span> · Free{" "}
          <span className="font-mono text-slate-200">${account.marginFree?.toFixed(2) ?? "n/a"}</span>
        </div>
      ) : null}

      {loginChange ? (
        <div className="mt-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">{loginChange} — data diperbarui otomatis untuk akun ini.</div>
      ) : null}

      {message ? (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${message.ok ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300" : "border-red-500/30 bg-red-950/30 text-red-300"}`}>{message.text}</div>
      ) : null}

      <div className="mt-3 space-y-2">
        {positions.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-400">{data ? "TIDAK ADA POSISI BUKA" : "Menghubungi MT5..."}</div>
        ) : (
          positions.map((position) => (
            <div key={position.ticket} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${position.typeLabel === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{position.typeLabel}</span>
                  <span className="font-mono text-sm text-slate-200">{position.symbol}</span>
                  <span className="font-mono text-xs text-slate-500">{position.volume}</span>
                </div>
                <span className={`font-mono text-sm font-semibold ${position.totalProfit > 0 ? "text-emerald-400" : position.totalProfit < 0 ? "text-red-400" : "text-slate-400"}`}>
                  {position.totalProfit >= 0 ? "+" : ""}${position.totalProfit.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Open <span className="font-mono text-slate-300">{position.priceOpen.toFixed(5)}</span>
                </span>
                <span>
                  Now <span className="font-mono text-cyan-200">{position.priceCurrent.toFixed(5)}</span>
                </span>
                {position.sl !== null ? (
                  <span>
                    SL <span className="font-mono text-slate-300">{position.sl.toFixed(5)}</span>
                  </span>
                ) : null}
                {position.tp !== null ? (
                  <span>
                    TP <span className="font-mono text-slate-300">{position.tp.toFixed(5)}</span>
                  </span>
                ) : null}
                <span className="font-mono text-slate-500">#{position.ticket}</span>
              </div>
              <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/50 px-2 py-1.5">
                {position.comment ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono font-semibold text-cyan-200">{orderTimeframe(position.comment)}</span>
                    <span className="text-slate-400">{position.comment}</span>
                  </div>
                ) : (
                  <span className="text-xs italic text-slate-500">tanpa deskripsi (order manual MT5)</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => closePosition(position.ticket)}
                disabled={closing}
                className="mt-2 w-full rounded-lg border border-red-500/40 bg-red-500/10 py-1.5 text-xs font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {closingTicket === position.ticket ? "MENUTUP..." : "TUTUP PASAR (Close)"}
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function orderTimeframe(comment: string) {
  const match = comment.match(/(\d+[mhdw])$/i);
  return match ? match[1].toUpperCase() : "TRADER-WEB";
}