"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

export function AiSummaryPanel({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const query = useSWR<{ analysis: { status: string; summary: string; bullishFactors: string[]; bearishFactors: string[]; riskFactors: string[]; scenarioAnalysis: string[]; invalidation: string; provider: string; confirmations?: Array<{ timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; latestClose: number | null }>; multiTimeframe?: { alignment: "LONG" | "SHORT" | "NEUTRAL"; longVotes: number; shortVotes: number; neutralVotes: number } } }>(
    `/api/ai/analysis?symbol=${symbol}&timeframe=${timeframe}&limit=120`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const analysis = query.data?.analysis;

  return (
    <Card>
      <div className="text-sm uppercase tracking-[0.3em] text-slate-400">AI Market Summary</div>
      {!analysis ? (
        <div className="mt-4 text-sm text-slate-400">NOT CONNECTED</div>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <p>{analysis.summary}</p>
          <p>Provider: {analysis.provider}</p>
          {analysis.multiTimeframe ? (
            <p>
              Alignment: {analysis.multiTimeframe.alignment} | Votes L {analysis.multiTimeframe.longVotes} S {analysis.multiTimeframe.shortVotes} N {analysis.multiTimeframe.neutralVotes}
            </p>
          ) : null}
          <Section label="Bullish factors" items={analysis.bullishFactors} />
          <Section label="Bearish factors" items={analysis.bearishFactors} />
          <Section label="Risk factors" items={analysis.riskFactors} />
          <Section label="Scenario analysis" items={analysis.scenarioAnalysis} />
          {analysis.confirmations ? <Section label="Confirmation frames" items={analysis.confirmations.map((item) => `${item.timeframe}: ${item.bias} (${item.confidence}/100)`)} /> : null}
          <p>Invalidation: {analysis.invalidation}</p>
          <p>This panel explains structured facts only. It does not create market data, override scoring, or claim certainty.</p>
        </div>
      )}
    </Card>
  );
}

function Section({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>NOT CONNECTED</li>}
      </ul>
    </div>
  );
}
