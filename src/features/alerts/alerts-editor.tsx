"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type AlertItem = {
  id: string;
  symbol: string;
  alertType: string;
  channel: string;
  threshold: string | null;
  timeframe: string | null;
  status: string;
  lastTriggeredAt: string | null;
  lastTriggeredValue: string | null;
};

type AlertNotificationItem = {
  id: string;
  symbol: string;
  alertType: string;
  channel: string;
  triggerValue: string;
  message: string;
  createdAt: string;
};

export function AlertsEditor() {
  const query = useSWR<{ alerts: AlertItem[]; notifications: AlertNotificationItem[] }>("/api/alerts", fetcher, { refreshInterval: 30000 });
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [alertType, setAlertType] = useState("price");
  const [channel, setChannel] = useState("browser");
  const [threshold, setThreshold] = useState("0");
  const [timeframe, setTimeframe] = useState("1h");

  async function createRule() {
    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, alertType, channel, threshold, timeframe }),
    });

    if (response.ok) {
      await query.mutate();
    }
  }

  async function evaluateAlerts() {
    const response = await fetch("/api/alerts", { method: "PATCH" });
    if (response.ok) {
      await query.mutate();
    }
  }

  return (
    <Card className="xl:col-span-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Alert Rules</div>
          <div className="mt-1 text-lg font-semibold">Persisted rules, no fabricated notifications</div>
        </div>
        <div className="flex gap-2">
          <button onClick={evaluateAlerts} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
            Evaluate Alerts
          </button>
          <button onClick={createRule} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
            Save Rule
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Symbol" value={symbol} onChange={setSymbol} />
        <SelectField label="Type" value={alertType} onChange={setAlertType} options={["price", "percentage_change", "breakout", "breakdown", "indicator", "setup_score", "volatility", "market_regime"]} />
        <SelectField label="Channel" value={channel} onChange={setChannel} options={["browser", "email", "telegram", "discord"]} />
        <Field label="Threshold" value={threshold} onChange={setThreshold} />
        <Field label="Timeframe" value={timeframe} onChange={setTimeframe} />
      </div>

      <div className="mt-6 grid gap-2">
        {query.data?.alerts?.length ? query.data.alerts.map((item) => <RuleRow key={item.id} item={item} />) : <div className="text-sm text-slate-400">NOT CONNECTED</div>}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Notification History</div>
        <div className="mt-3 grid gap-2">
          {query.data?.notifications?.length ? query.data.notifications.map((item) => <NotificationRow key={item.id} item={item} />) : <div className="text-sm text-slate-400">NOT CONNECTED</div>}
        </div>
      </div>
    </Card>
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

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
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

function RuleRow({ item }: { item: AlertItem }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
      <div>
        <div className="font-medium text-cyan-100">{item.symbol}</div>
        <div className="text-xs text-slate-500">{item.alertType} · {item.channel} · {item.timeframe ?? "any"}</div>
        <div className="text-xs text-slate-500">
          Last trigger: {item.lastTriggeredAt ?? "never"}{item.lastTriggeredValue ? ` @ ${item.lastTriggeredValue}` : ""}
        </div>
      </div>
      <div className="text-xs text-slate-400">{item.status}</div>
    </div>
  );
}

function NotificationRow({ item }: { item: AlertNotificationItem }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-cyan-100">{item.symbol}</div>
          <div className="text-xs text-slate-500">
            {item.alertType} · {item.channel} · {item.triggerValue}
          </div>
        </div>
        <div className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</div>
      </div>
      <div className="mt-2 text-xs text-slate-400">{item.message}</div>
    </div>
  );
}
