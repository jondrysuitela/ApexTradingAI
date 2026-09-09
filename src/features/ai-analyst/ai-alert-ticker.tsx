"use client";

import { useEffect, useRef } from "react";
import type { AiAlert, AlertContext } from "@/server/ai/alerts";

function beep(action: "BUY" | "SELL" | "WAIT") {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);
    osc.type = "sine";
    const base = action === "BUY" ? 880 : action === "SELL" ? 330 : 440;
    osc.frequency.value = base;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (action === "WAIT" ? 0.35 : 0.9));
    osc.frequency.linearRampToValueAtTime(action === "BUY" ? base * 1.5 : base * 0.75, context.currentTime + 0.4);
    if (action === "BUY" || action === "SELL") {
      osc.frequency.linearRampToValueAtTime(base, context.currentTime + 0.75);
    }
    osc.start();
    osc.stop(context.currentTime + 1);
    void context.resume();
  } catch {
    // audio tidak tersedia — abaikan
  }
}

function notify(latest: AiAlert) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "denied") return;
  if (Notification.permission !== "granted") {
    Notification.requestPermission().catch(() => undefined);
    return;
  }
  const now = Date.now();
  const lastId = localStorage.getItem(`ai-alert-last-id`);
  const lastAt = Number(localStorage.getItem(`ai-alert-last-at`) ?? 0);
  if (lastId === latest.id || now - lastAt < 30_000) return;
  localStorage.setItem(`ai-alert-last-id`, latest.id);
  localStorage.setItem(`ai-alert-last-at`, String(now));
  try {
    new Notification(`AI ALERT ${latest.action} ${latest.symbol}`, {
      body: `${latest.confidence}/100 — ${latest.reason}`,
      tag: `ai-alert-${latest.symbol}-${latest.timeframe}`,
      silent: true,
    });
  } catch {
    // push gagal — tetap pakai beep
  }
}

export function AiAlertTicker({ alert, symbol, timeframe }: { alert: AlertContext | null; symbol: string; timeframe: string }) {
  const latest = alert?.latest ?? null;
  const lastHandledId = useRef<string | null>(null);

  useEffect(() => {
    if (!latest) return;
    if (lastHandledId.current === latest.id) return;
    lastHandledId.current = latest.id;
    beep(latest.action);
    notify(latest);
  }, [latest]);

  const color =
    latest?.action === "BUY" ? "text-emerald-300" : latest?.action === "SELL" ? "text-red-300" : "text-yellow-200";
  const stripBorder =
    latest?.action === "BUY" ? "border-emerald-400/30" : latest?.action === "SELL" ? "border-red-400/30" : "border-white/10";

  return (
    <div className={`rounded-xl border ${stripBorder} bg-slate-950/50 px-3 py-2`}>
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
        <span>AI Real-Time Alert</span>
        <span className="text-slate-600">● MENERUSKAN ANALISIS SAMA</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-lg font-bold ${color}`}>{latest ? `${latest.action} ${latest.symbol} ${latest.timeframe}` : `MENUNGGU ${symbol} ${timeframe}`}</span>
        {latest ? (
          <span className={`font-mono text-sm ${color}`}>
            {latest.confidence}/100 <span className="text-slate-500">{new Date(latest.timestamp).toLocaleTimeString()}</span>
          </span>
        ) : null}
      </div>
      {latest ? <p className="mt-0.5 text-xs text-slate-400">{latest.reason}</p> : <p className="mt-0.5 text-xs text-slate-500">Akan berbunyi + notifikasi browser saat AI menghasilkan sinyal buy/sell baru.</p>}
      {alert && alert.history.length > 1 ? (
        <div className="mt-1.5 space-y-0.5 border-t border-white/5 pt-1.5">
          {alert.history.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                {item.action} {item.symbol} {item.timeframe}
              </span>
              <span className="font-mono">
                {item.confidence}/100 · {new Date(item.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}