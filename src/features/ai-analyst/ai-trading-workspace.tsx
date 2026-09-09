"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { MarketChart } from "@/features/chart/market-chart";
import { MarketSummaryPanel } from "@/features/markets/market-summary-panel";
import { AiSummaryPanel } from "@/features/markets/ai-summary-panel";
import { RiskPanel } from "@/features/risk/risk-panel";
import { QuickTradeBar } from "@/features/ai-analyst/quick-trade-bar";
import { ScalpingReadCard } from "@/features/ai-analyst/scalping-read-card";
import { OrderFlowReadCard } from "@/features/ai-analyst/order-flow-read-card";
import { NewsCalendarCard } from "@/features/ai-analyst/news-calendar-card";
import { AutoTradeCard } from "@/features/ai-analyst/auto-trade-card";
import { LivePositionsPanel } from "@/features/ai-analyst/live-positions-panel";
import { AiAlertTicker } from "@/features/ai-analyst/ai-alert-ticker";
import type { AlertContext } from "@/server/ai/alerts";
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

type Summary = {
  symbol: string;
  timeframe: string;
  status: string;
  latestClose: number | null;
  indicators: { sma20: number | null; ema20: number | null; rsi14: number | null; atr14: number | null };
  structure: Array<{ type: string; timestamp: string; price: number; strength: number; source: string }>;
  supportResistance: Array<{ price: number; type: "support" | "resistance"; strength: number; touchCount: number; lastReaction: string; distanceFromCurrentPrice: number }>;
  setup: { state: string; score: number; setupType: string; direction: "LONG" | "SHORT" | "NEUTRAL"; entryZone: { low: number; high: number } | null; invalidation: number | null; targets: number[]; timestamp: string } | null;
  signal: {
    action: "BUY" | "SELL" | "WAIT";
    bias: "LONG" | "SHORT" | "NEUTRAL";
    confidence: number;
    entryZone: { low: number; high: number } | null;
    stopLoss: number | null;
    targets: number[];
    riskReward: number | null;
    reasons: string[];
    warnings: string[];
  };
  confirmations?: Array<{ timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; latestClose: number | null }>;
  multiTimeframe?: { alignment: "LONG" | "SHORT" | "NEUTRAL"; longVotes: number; shortVotes: number; neutralVotes: number };
};

type Ticker = { symbol: string; price: number; timestamp: string; provider: string; source: string; freshness: "LIVE" | "DELAYED" | "STALE" | "OFFLINE" };
type Mt5Account = {
  login: number | null;
  name: string | null;
  server: string | null;
  currency: string | null;
  balance: number | null;
  equity: number | null;
  marginFree: number | null;
  leverage: number | null;
  tradeAllowed: boolean | null;
};
type Mt5Status = { status: string; symbols: Array<{ symbol: string; resolvedSymbol: string; available: boolean }>; account: Mt5Account | null };

export function AiTradingWorkspace() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("5m");
  const [activeTab, setActiveTab] = useState<"analisis" | "about">("analisis");
  const [accountFlash, setAccountFlash] = useState<string | null>(null);
  const accountLoginRef = useRef<number | null>(null);
  const mt5Query = useSWR<Mt5Status>(`/api/market-data/mt5`, fetcher, { refreshInterval: 15000 });
  const mt5Symbols = mt5Query.data?.symbols ?? [];
  const marketOptions = useMemo(() => {
    if (mt5Symbols.length === 0) {
      return [{ symbol, resolvedSymbol: symbol, available: false }];
    }

    return [...mt5Symbols].sort((left, right) => Number(right.available) - Number(left.available) || left.resolvedSymbol.localeCompare(right.resolvedSymbol));
  }, [mt5Symbols, symbol]);
  const candlesQuery = useSWR<{ candles: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }> }>(
    `/api/market-data/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=80`,
    fetcher,
    { refreshInterval: 5000 },
  );
  const summaryQuery = useSWR<{ analysis: Summary; alert?: AlertContext }>(`/api/market-data/analysis?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=80`, fetcher, { refreshInterval: 10000 });
  const tickerQuery = useSWR<{ ticker: Ticker | null }>(`/api/market-data/ticker?symbol=${encodeURIComponent(symbol)}`, fetcher, { refreshInterval: 1000 });

  const candles = candlesQuery.data?.candles ?? [];
  const summary = summaryQuery.data?.analysis ?? null;
  const ticker = tickerQuery.data?.ticker ?? null;
  const visualStatus = ticker ? "UPDATING 1S" : tickerQuery.isLoading ? "CONNECTING" : "WAITING";
  const sourceStatus = ticker?.source?.includes("mt5") ? (ticker.provider === "mt5-cache" ? "MT5 CACHE" : "MT5 LIVE") : ticker?.source?.includes("twelvedata") ? "TWELVE DATA" : ticker?.source?.includes("binance") ? "BINANCE" : "UNKNOWN";
  const mt5SymbolStatus = mt5Query.data?.symbols.find((item) => item.symbol === symbol);
  const mt5Availability = mt5SymbolStatus?.available ? "AVAILABLE" : mt5Query.isLoading ? "CHECKING" : "NOT FOUND";
  const account = mt5Query.data?.account ?? null;
  const accountLabel = account?.login ? `${account.login}@${account.server ?? "?"}` : "—";

  useEffect(() => {
    if (!mt5Symbols.length) return;

    const current = mt5Symbols.find((item) => item.resolvedSymbol === symbol || item.symbol === symbol);
    if (current?.available) return;

    const firstAvailable = mt5Symbols.find((item) => item.available);
    if (firstAvailable && firstAvailable.resolvedSymbol !== symbol) {
      setSymbol(firstAvailable.resolvedSymbol);
    }
  }, [mt5Symbols, symbol]);

  useEffect(() => {
    const accountData = mt5Query.data?.account ?? null;
    const login = accountData?.login ?? null;
    if (login === null) return;
    const previous = accountLoginRef.current;
    if (previous === null) {
      accountLoginRef.current = login;
      return;
    }
    if (previous === login) return;
    accountLoginRef.current = login;
    setAccountFlash(`Akun MT5 berubah → ${accountData?.name ?? ""} (${login}@${accountData?.server ?? "?"})`);
    void candlesQuery.mutate();
    void summaryQuery.mutate();
    void tickerQuery.mutate();
  }, [mt5Query.data?.account?.login]);

  useEffect(() => {
    if (!accountFlash) return;
    const timer = setTimeout(() => setAccountFlash(null), 8000);
    return () => clearTimeout(timer);
  }, [accountFlash]);

  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">AI Analyst</div>
            <h1 className="mt-1 text-xl font-semibold">{symbol}</h1>
            <p className="mt-1 text-sm text-slate-400">Pilih pasar & timeframe, baca sinyal, dan eksekusi langsung — semua dari sini.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge label="Data" value={sourceStatus} />
              <Badge label="Refresh" value={visualStatus} />
              <Badge label="MT5" value={mt5Availability} />
              <Badge label="Akun" value={accountLabel} />
              <Badge label="Last Quote" value={ticker ? new Date(ticker.timestamp).toLocaleTimeString() : "WAITING"} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="text-slate-400">Market</span>
              <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 outline-none">
                {marketOptions.map((item) => (
                  <option key={item.resolvedSymbol} value={item.resolvedSymbol}>
                    {item.resolvedSymbol} {item.available ? "- MT5" : "- not found"}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-slate-400">Timeframe</span>
              <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 outline-none">
                {(["5m", "15m", "1h", "4h", "1d", "1w"] as const).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-5">
          <QuickTradeBar symbol={symbol} timeframe={timeframe} />
        </div>
      </Card>

      <div className="flex gap-2 rounded-2xl border border-white/10 bg-[#0c1226] p-1">
        <TabButton active={activeTab === "analisis"} onClick={() => setActiveTab("analisis")}>
          AI Analisis
        </TabButton>
        <TabButton active={activeTab === "about"} onClick={() => setActiveTab("about")}>
          About
        </TabButton>
      </div>

      {accountFlash ? (
        <div className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">{accountFlash}</div>
      ) : null}

      {activeTab === "about" ? (
        <div className="grid gap-5">
          <AiSummaryPanel symbol={symbol} timeframe={timeframe} />
          <TimeframeConfirmationPanel summary={summary} />
        </div>
      ) : (
        <div className="grid gap-5 xl:items-start xl:grid-cols-[1.4fr_0.6fr]">
          <div className="grid gap-5">
            <Card className="xl:sticky xl:top-2 xl:z-20" style={{ backgroundColor: "#0c1226" }}>
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="uppercase tracking-[0.3em] text-slate-400">Chart</span>
                <span className="text-cyan-200">{ticker?.price ? ticker.price.toFixed(5) : summary?.latestClose ? summary.latestClose.toFixed(5) : "NOT CONNECTED"}</span>
              </div>
              <MarketChart candles={candles} analysis={summary} livePrice={ticker?.price ?? null} />
            </Card>
            <div className="grid gap-5 md:grid-cols-2">
              <LivePositionsPanel symbol={symbol} />
              <MarketSummaryPanel summary={summary} />
              <RiskPanel summary={summary} />
              <SignalCard signal={summary?.signal ?? null} />
            </div>
          </div>
          <div className="grid gap-5">
            <div className="grid gap-5 xl:sticky xl:top-2 xl:z-20 xl:rounded-2xl xl:border xl:border-white/10 xl:bg-[#0c1226] xl:p-4 xl:shadow-lg xl:shadow-black/20">
              <AiAlertTicker alert={summaryQuery.data?.alert ?? null} symbol={symbol} timeframe={timeframe} />
              <AutoTradeCard symbol={symbol} timeframe={timeframe} />
              <ScalpingReadCard symbol={symbol} timeframe={timeframe} />
              <OrderFlowReadCard symbol={symbol} timeframe={timeframe} />
              <NewsCalendarCard symbol={symbol} timeframe={timeframe} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-slate-300">
      {label}: <span className="text-cyan-200">{value}</span>
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition ${
        active ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function SignalCard({ signal }: { signal: Summary["signal"] | null }) {
  const color = signal?.action === "BUY" ? "text-emerald-300" : signal?.action === "SELL" ? "text-red-300" : "text-yellow-200";
  const badgeColor = signal?.action === "BUY" ? "border-emerald-400/40 bg-emerald-500/20" : signal?.action === "SELL" ? "border-red-400/40 bg-red-500/20" : "border-yellow-400/40 bg-yellow-500/10";

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Trading Signal</div>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${badgeColor} ${color}`}>{signal?.action ?? "WAIT"}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Metric label="Bias" value={signal?.bias ?? "NEUTRAL"} />
        <Metric label="Confidence" value={`${signal?.confidence ?? 0}/100`} />
        <Metric label="Entry Zone" value={signal?.entryZone ? `${formatPrice(signal.entryZone.low)} - ${formatPrice(signal.entryZone.high)}` : "WAIT"} />
        <Metric label="Stop Loss" value={formatPrice(signal?.stopLoss)} />
        <Metric label="Target 1" value={formatPrice(signal?.targets[0])} />
        <Metric label="Risk Reward" value={signal?.riskReward ? `${signal.riskReward.toFixed(2)}R` : "NOT CONNECTED"} />
      </div>
      {signal?.reasons?.length ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Reasons</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-slate-300">
            {signal.reasons.slice(0, 4).map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {signal?.warnings?.length ? (
        <div className="mt-2 rounded-xl border border-yellow-400/20 bg-yellow-500/5 p-3 text-xs text-yellow-200/80">
          <div className="text-[10px] uppercase tracking-[0.25em] text-yellow-400/70">Warnings</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {signal.warnings.slice(0, 3).map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 text-xs text-slate-500">Signal ini kalkulasi deterministic. AI hanya menjelaskan konteks dan tidak boleh mengarang data market.</div>
    </Card>
  );
}

function TimeframeConfirmationPanel({ summary }: { summary: Summary | null }) {
  const confirmations = summary?.confirmations ?? [];
  const alignment = summary?.multiTimeframe?.alignment ?? "NEUTRAL";
  const color = alignment === "LONG" ? "text-emerald-300" : alignment === "SHORT" ? "text-red-300" : "text-yellow-200";

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Multi-Timeframe Confirmation</div>
          <div className={`mt-2 text-2xl font-semibold ${color}`}>{alignment}</div>
          <div className="mt-2 text-sm text-slate-300">
            Votes: LONG {summary?.multiTimeframe?.longVotes ?? 0} | SHORT {summary?.multiTimeframe?.shortVotes ?? 0} | NEUTRAL {summary?.multiTimeframe?.neutralVotes ?? 0}
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[540px]">
          {confirmations.length ? confirmations.map((item) => <FrameBadge key={item.timeframe} timeframe={item.timeframe} bias={item.bias} confidence={item.confidence} />) : <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-slate-400">WAIT</div>}
        </div>
      </div>
    </Card>
  );
}

function FrameBadge({ timeframe, bias, confidence }: { timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number }) {
  const color = bias === "LONG" ? "text-emerald-300" : bias === "SHORT" ? "text-red-300" : "text-yellow-200";
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{timeframe}</div>
      <div className={`mt-2 font-semibold ${color}`}>{bias}</div>
      <div className="mt-1 text-xs text-slate-400">Confidence {confidence}/100</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 font-medium text-cyan-100">{value}</div>
    </div>
  );
}

function formatPrice(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value) ? "NOT CONNECTED" : value.toFixed(5);
}
