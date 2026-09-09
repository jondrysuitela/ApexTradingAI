"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type Snapshot = {
  account: { name: string; balance: string; equity: string; realizedPnl: string };
  orders: Array<{ id: string; symbol: string; side: string; orderType: string; quantity: string; status: string; filledPrice?: string | null }>;
  positions: Array<{ id: string; symbol: string; quantity: string; averagePrice: string; markPrice?: string | null; unrealizedPnl: string; markedAt?: string | null }>;
  history: Array<{ id: string; symbol: string; side: string; orderType: string; quantity: string; filledPrice: string | null; realizedPnl: string | null; filledAt: string | null }>;
  summary: { balance: string; equity: string; realizedPnl: string; trades: number; wins: number; winRate: string; grossVolume: string; lastTradeAt: string | null };
};

export function PaperTradingPanel() {
  const query = useSWR<{ snapshot: Snapshot | null }>("/api/paper-trading", fetcher, { refreshInterval: 30000 });
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [quantity, setQuantity] = useState("0.01");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function ensureAccount() {
    const response = await fetch("/api/paper-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ensure-account" }),
    });
    await handleActionResponse(response);
  }

  async function createOrder() {
    const response = await fetch("/api/paper-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, side, orderType, quantity, limitPrice: limitPrice || null, stopPrice: stopPrice || null }),
    });
    await handleActionResponse(response);
  }

  async function processOrders() {
    const response = await fetch("/api/paper-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "process-orders" }),
    });
    await handleActionResponse(response);
  }

  async function refreshMarks() {
    const response = await fetch("/api/paper-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "refresh-marks" }),
    });
    await handleActionResponse(response);
  }

  async function handleActionResponse(response: Response) {
    if (response.ok) {
      setMessage("Updated");
      await query.mutate();
      return;
    }

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setMessage(body?.error ?? "Request failed");
  }

  async function exportSummary() {
    if (!snapshot) return;

    const lines = [
      ["metric", "value"],
      ["balance", snapshot.summary.balance],
      ["equity", snapshot.summary.equity],
      ["realizedPnl", snapshot.summary.realizedPnl],
      ["trades", String(snapshot.summary.trades)],
      ["wins", String(snapshot.summary.wins)],
      ["winRate", snapshot.summary.winRate],
      ["grossVolume", snapshot.summary.grossVolume],
      ["lastTradeAt", snapshot.summary.lastTradeAt ?? ""],
    ]
      .map((row) => row.join(","))
      .join("\n");

    await navigator.clipboard.writeText(lines);
  }

  const snapshot = query.data?.snapshot;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Paper Trading</div>
            <div className="mt-1 text-lg font-semibold">Simulation only</div>
          </div>
          <button onClick={ensureAccount} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
            Create Account
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {message ? <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">{message}</div> : null}
          <Field label="Symbol" value={symbol} onChange={setSymbol} />
          <Select label="Side" value={side} onChange={(value) => setSide(value as "buy" | "sell")} options={["buy", "sell"]} />
          <Select label="Order Type" value={orderType} onChange={(value) => setOrderType(value as "market" | "limit" | "stop")} options={["market", "limit", "stop"]} />
          <Field label="Quantity" value={quantity} onChange={setQuantity} />
          <Field label="Limit Price" value={limitPrice} onChange={setLimitPrice} />
          <Field label="Stop Price" value={stopPrice} onChange={setStopPrice} />
          <button onClick={createOrder} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
            Submit Simulated Order
          </button>
          <button onClick={processOrders} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
            Process Open Orders
          </button>
          <button onClick={refreshMarks} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
            Refresh Position Marks
          </button>
          <button onClick={exportSummary} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
            Export Summary
          </button>
        </div>
      </Card>

      <Card>
        <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Account</div>
        {!snapshot ? (
          <div className="mt-4 text-sm text-slate-400">NOT CONNECTED</div>
        ) : (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2 md:grid-cols-3">
              <Metric label="Balance" value={snapshot.account.balance} />
              <Metric label="Equity" value={snapshot.account.equity} />
              <Metric label="Realized P/L" value={snapshot.account.realizedPnl} />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Metric label="Filled Trades" value={String(snapshot.history.length)} />
              <Metric label="Open Positions" value={String(snapshot.positions.length)} />
              <Metric label="Active Orders" value={String(snapshot.orders.filter((order) => order.status === "open").length)} />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Metric label="Win Rate" value={`${snapshot.summary.winRate}%`} />
              <Metric label="Gross Volume" value={snapshot.summary.grossVolume} />
              <Metric label="Last Trade" value={snapshot.summary.lastTradeAt ?? "never"} />
            </div>
            <Section
              title="Orders"
              items={snapshot.orders.map((order) => `${order.symbol} ${order.side} ${order.quantity} ${order.orderType} ${order.status}${order.filledPrice ? ` @ ${order.filledPrice}` : ""}`)}
            />
            <Section
              title="Trade History"
              items={snapshot.history.map((trade) => `${trade.symbol} ${trade.side} ${trade.quantity} ${trade.orderType} @ ${trade.filledPrice ?? "n/a"} pnl ${trade.realizedPnl ?? "n/a"} ${trade.filledAt ? `on ${trade.filledAt}` : ""}`)}
            />
            <Section
              title="Positions"
              items={snapshot.positions.map(
                (position) => `${position.symbol} qty ${position.quantity} avg ${position.averagePrice} mark ${position.markPrice ?? "NOT CONNECTED"} P/L ${position.unrealizedPnl}`,
              )}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 outline-none" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 outline-none">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 font-medium text-cyan-100">{value}</div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</div>
      <div className="mt-2 grid gap-1 text-slate-300">{items.length ? items.map((item) => <div key={item}>{item}</div>) : <div>NOT CONNECTED</div>}</div>
    </div>
  );
}
