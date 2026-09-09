"use client";

import { useState } from "react";
import useSWR from "swr";
import { appTokenHeaders } from "@/lib/app-token";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type TradeMode = "paper" | "live";

type LiveConfig = {
  configured: boolean;
  status: string;
  account: null | {
    login: number;
    name: string;
    server: string;
    currency: string;
    balance: number;
    equity: number;
    marginFree: number;
    leverage: number;
    tradeAllowed: boolean;
  };
  symbol: null | {
    symbol: string;
    resolvedSymbol: string;
    digits: number;
    volumeMin: number;
    volumeMax: number;
    volumeStep: number;
  };
  errors?: Record<string, string>;
};

type LiveOrderResult = {
  retcodeLabel?: string;
  filled?: boolean;
  price?: number | null;
  volume?: number | null;
  order?: { ticket?: number; type?: number } | null;
};

export function QuickTradeBar({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const [mode, setMode] = useState<TradeMode>("paper");
  const [quantity, setQuantity] = useState("0.01");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<null | { side: "buy" | "sell"; volume: number }>(null);

  const paperQuery = useSWR<{ snapshot: PaperSnapshot | null }>("/api/paper-trading", fetcher, { refreshInterval: 15000 });
  const liveQuery = useSWR<LiveConfig>(`/api/market-data/order?symbol=${encodeURIComponent(symbol)}`, fetcher, { refreshInterval: 10000 });
  const snapshot = paperQuery.data?.snapshot ?? null;
  const live = liveQuery.data;

  const liveSymbol = live?.symbol;
  const volumeMin = liveSymbol?.volumeMin ?? 0.01;
  const volumeMax = liveSymbol?.volumeMax ?? 100;
  const volumeStep = liveSymbol?.volumeStep ?? 0.01;

  function normalizeVolume(value: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return volumeMin;
    const clamped = Math.min(Math.max(parsed, volumeMin), volumeMax);
    const steps = Math.round((clamped - volumeMin) / volumeStep);
    return Math.round((volumeMin + steps * volumeStep) * 100000) / 100000;
  }

  function selectSide(side: "buy" | "sell") {
    if (busy || !quantity || mode === "live" && !live?.account?.tradeAllowed) return;
    const volume = normalizeVolume(quantity);
    setQuantity(String(volume));
    if (mode === "live") {
      setPending({ side, volume });
    } else {
      void placePaperOrder(side);
    }
  }

  async function confirmLiveOrder() {
    if (!pending || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const sl = stopLoss.trim() ? Number(stopLoss) : null;
      const tp = takeProfit.trim() ? Number(takeProfit) : null;
      const response = await fetch("/api/market-data/order", {
        method: "POST",
        headers: { "content-type": "application/json", ...appTokenHeaders() },
        body: JSON.stringify({ symbol, side: pending.side, volume: pending.volume, sl, tp, comment: `trader-web:${timeframe}` }),
      });
      const body = (await response.json().catch(() => null)) as { order?: LiveOrderResult; error?: string } | null;

      if (response.ok && body?.order) {
        const result = body.order;
        const hint = tradeRetcodeHint(result.retcodeLabel);
        setMessage({
          type: result.filled ? "ok" : "info",
          text: result.filled
            ? `ORDER REAL TERISI: ${pending.side.toUpperCase()} ${result.volume ?? pending.volume} ${symbol} @ ${result.price?.toFixed(liveSymbol?.digits ?? 5)} (ticket ${result.order?.ticket ?? "n/a"})`
            : `Order tidak terisi: ${result.retcodeLabel ?? "unknown"}${hint ? `. ${hint}` : ""}`,
        });
      } else {
        setMessage({ type: "error", text: body?.error ?? "Order real gagal." });
      }
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function placePaperOrder(side: "buy" | "sell") {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/paper-trading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, side, orderType: "market", quantity }),
      });
      const body = (await response.json().catch(() => null)) as { order?: { id?: string; status?: string }; error?: string; account?: unknown } | null;

      if (response.ok && body?.order) {
        setMessage({ type: "ok", text: `Paper order ${side.toUpperCase()} ${quantity} ${symbol} dibuka (${body.order.status})` });
        await paperQuery.mutate();
      } else if (response.ok && body?.account) {
        setMessage({ type: "ok", text: "Paper account siap." });
      } else {
        setMessage({ type: "error", text: body?.error ?? "Pesan order gagal." });
      }
    } finally {
      setBusy(false);
    }
  }

  const liveReady = mode === "live" && live?.status === "ready" && live?.account?.tradeAllowed;
  const liveOffline = mode === "live" && (!live || live.status !== "ready");
  const liveStatusText = liveOffline ? statusText(live) : null;

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setMode("paper")}
            className={`rounded-lg border px-3 py-1.5 transition ${mode === "paper" ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
          >
            Paper (simulasi)
          </button>
          <button
            onClick={() => setMode("live")}
            className={`rounded-lg border px-3 py-1.5 transition ${mode === "live" ? "border-red-400 bg-red-400/10 text-red-100" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
          >
            Real MT5
          </button>
        </div>
        {mode === "live" ? (
          <div className="text-xs text-slate-400">
            {liveOffline ? (
              <span className="text-yellow-200/80">{liveStatusText}</span>
            ) : live?.account ? (
              <span>
                Akun {live.account.name} ({live.account.login}@{live.account.server}) — {live.account.currency} Balance {fmt(live.account.balance)} | Equity {fmt(live.account.equity)} |
                Free {fmt(live.account.marginFree)} {live.account.tradeAllowed ? "" : "| TRADING DILARANG"}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            {snapshot ? (
              <span>
                Balance {snapshot.account.balance} | Equity {snapshot.account.equity} | P/L {snapshot.account.realizedPnl}
              </span>
            ) : (
              <span className="text-yellow-200/80">Paper trading NOT CONNECTED (auth/database belum dikonfigurasi)</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs">
          <span className="uppercase tracking-[0.25em] text-slate-500">Quantity</span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="decimal"
            className="w-28 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none"
          />
        </label>
        {mode === "live" ? (
          <>
            <label className="grid gap-1 text-xs">
              <span className="uppercase tracking-[0.25em] text-slate-500">Stop Loss</span>
              <input
                value={stopLoss}
                onChange={(event) => setStopLoss(event.target.value)}
                placeholder="opsional"
                inputMode="decimal"
                className="w-28 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="uppercase tracking-[0.25em] text-slate-500">Take Profit</span>
              <input
                value={takeProfit}
                onChange={(event) => setTakeProfit(event.target.value)}
                placeholder="opsional"
                inputMode="decimal"
                className="w-28 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm outline-none"
              />
            </label>
          </>
        ) : null}
        <button
          onClick={() => selectSide("buy")}
          disabled={busy || (mode === "live" && !liveReady)}
          className="flex-1 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50 sm:flex-none"
        >
          {mode === "live" ? "ORDER REAL BUY" : "BUY"} {symbol}
        </button>
        <button
          onClick={() => selectSide("sell")}
          disabled={busy || (mode === "live" && !liveReady)}
          className="flex-1 rounded-xl border border-red-400/40 bg-red-500/20 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/30 disabled:opacity-50 sm:flex-none"
        >
          {mode === "live" ? "ORDER REAL SELL" : "SELL"} {symbol}
        </button>
        {mode === "live" && liveSymbol ? (
          <div className="text-xs text-slate-500">Lot {liveSymbol.resolvedSymbol}: min {liveSymbol.volumeMin} / max {liveSymbol.volumeMax} / step {liveSymbol.volumeStep}</div>
        ) : null}
      </div>

      {pending ? (
        <div className="rounded-xl border border-red-400/40 bg-red-950/40 p-3 text-sm">
          <div className="font-semibold text-red-100">
            Konfirmasi ORDER REAL — {pending.side.toUpperCase()} {pending.volume} {symbol} @ market
          </div>
          <div className="mt-1 text-xs text-slate-300">Order ini dikirim langsung ke terminal MT5 dan akan dieksekusi dengan uang asli. Pastikan akun & simbol sudah benar.</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmLiveOrder}
              disabled={busy}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {busy ? "Mengirim..." : "Ya, kirim order real"}
            </button>
            <button onClick={() => setPending(null)} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
              Batal
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className={`rounded-xl border px-3 py-2 text-sm ${message.type === "ok" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : message.type === "error" ? "border-red-400/30 bg-red-400/10 text-red-100" : "border-white/10 bg-slate-950/50 text-slate-300"}`}>
          {message.text}
        </div>
      ) : null}
      {mode === "live" ? <div className="text-xs text-slate-500">Mode real memakai bridge MT5 (mt5.order_send). Selalu cek terminal MT5 untuk konfirmasi order. Gunakan akun demo dulu sebelum akun real.</div> : null}
    </div>
  );
}

function fmt(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "n/a";
}

function tradeRetcodeHint(label: string | undefined) {
  switch (label) {
    case "TRADE_RETCODE_CLIENT_DISABLES_AT":
      return "Trading dimatikan oleh terminal: nyalakan tombol 'Algo Trading' di MT5 (Ctrl+E, atau menu Tools > Options > Expert Advisors > Allow Algorithmic Trading), lalu coba lagi.";
    case "TRADE_RETCODE_SERVER_DISABLES_AT":
      return "Trading dimatikan oleh server/broker untuk akun ini. Hubungi broker atau gunakan akun lain.";
    case "TRADE_RETCODE_NO_MONEY":
      return "Saldo/margin tidak cukup untuk order ini.";
    case "TRADE_RETCODE_MARKET_CLOSED":
      return "Market sedang tutup untuk simbol ini — coba saat sesi trading aktif.";
    case "TRADE_RETCODE_INVALID_VOLUME":
      return "Volume tidak valid — cek batas lot min/max/step simbol.";
    case "TRADE_RETCODE_INVALID_FILL":
      return "Mode filling tidak didukung broker — coba order dengan volume lebih kecil.";
    case "TRADE_RETCODE_REQUOTE":
      return "Harga berubah saat eksekusi (requote) — coba lagi.";
    case "TRADE_RETCODE_PRICE_OFF":
      return "Harga terlalu jauh dari market — naikkan deviation atau coba lagi.";
    case "TRADE_RETCODE_AUTOTRADING_DISABLED":
      return "Algo Trading dalam keadaan mati — nyalakan via tombol Algo Trading di MT5 (Ctrl+E).";
    default:
      return "";
  }
}

function statusText(live: LiveConfig | undefined) {
  if (!live) return "Menghubungi bridge MT5...";
  if (live.status === "not_configured") return "Bridge MT5 belum dikonfigurasi (MT5_BRIDGE_URL).";
  if (live.status === "symbol_not_found") {
    return `Simbol trading tidak ditemukan di akun ini (${live.errors?.symbol ?? "HTTP 404"}). Pilih simbol lain yang tersedia di terminal MT5.`;
  }
  if (live.status === "ready" && live.account) {
    return live.account.tradeAllowed
      ? "MT5 trading aktif — siap order real."
      : "MT5 trading dilarang oleh broker/terminal (trade_allowed false).";
  }
  const accountError = live.errors?.account ?? "tidak diketahui";
  const symbolError = live.errors?.symbol ?? "";
  if (accountError.includes("MT5 offline") || accountError.includes("Not Found") || accountError.includes("404")) {
    return `Bridge belum memuat endpoint trading — RESTART bridge: tutup proses uvicorn 8787 lalu jalankan ulang scripts/start-trader.ps1 (atau: python -m uvicorn server:app --host 127.0.0.1 --port 8787 --reload di folder mt5-bridge). Detail: ${accountError}`;
  }
  return `MT5 trading belum siap (${live.status}). Detail akun: ${accountError}${symbolError ? ` | ${symbolError}` : ""}`;
}

type PaperSnapshot = {
  account: { name: string; balance: string; equity: string; realizedPnl: string };
  orders: Array<{ id: string; symbol: string; side: string; orderType: string; quantity: string; status: string; filledPrice?: string | null }>;
  positions: Array<{ id: string; symbol: string; quantity: string; averagePrice: string; markPrice?: string | null; unrealizedPnl: string; markedAt?: string | null }>;
  history: Array<{ id: string; symbol: string; side: string; orderType: string; quantity: string; filledPrice: string | null; realizedPnl: string | null; filledAt: string | null }>;
  summary: { balance: string; equity: string; realizedPnl: string; trades: number; wins: number; winRate: string; grossVolume: string; lastTradeAt: string | null };
};