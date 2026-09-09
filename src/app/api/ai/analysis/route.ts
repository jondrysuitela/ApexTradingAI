import { NextResponse } from "next/server";
import { AppError, handleApiError } from "@/server/errors";
import { analyzeMarket, analyzeMarketWithConfirmation } from "@/server/market-data/analysis";
import type { Timeframe } from "@/lib/timeframes";
import { marketDataQuerySchema } from "@/server/market-data/validation";
import { analyzeMarketWithAI } from "@/server/ai/service";
import type { AIAnalysisInput } from "@/server/ai/types";
import { getNewsContext, type NewsContext } from "@/server/news/service";

type AnalysisWithSignal = AIAnalysisInput & {
  signal?: {
    action: "BUY" | "SELL" | "WAIT";
    bias: "LONG" | "SHORT" | "NEUTRAL";
    stopLoss: number | null;
    reasons: string[];
    warnings: string[];
    confidence: number;
    confluence?: {
      score: number;
      direction: "LONG" | "SHORT" | "NEUTRAL";
      confidence: number;
      factors: Array<{ name: string; weight: number; score: number; direction: "LONG" | "SHORT" | "NEUTRAL"; detail: string }>;
      regime: { trend: string; volatility: string; momentum: string; regimeLabel: string };
      narrative: string;
      strategyVote?: {
        longWeight: number;
        shortWeight: number;
        totalWeight: number;
        strategyCount: number;
        agreeingCount: number;
        topStrategy: string | null;
        detail: string;
      };
      backtest?: {
        winRate: number | null;
        avgProfitPct: number | null;
        avgLossPct: number | null;
        expectancyPct: number | null;
        totalSignals: number;
        edge: string;
      };
      scalping?: {
        direction: "LONG" | "SHORT" | "NEUTRAL";
        confidence: number;
        score: number;
        reasoning: string[];
        entryType: "PULLBACK" | "BREAKOUT" | "RANGE_BOUNCE" | "MOMENTUM" | "NO_EDGE";
        volatility: "COMPRESSED" | "SCALPABLE" | "WIDE" | "EXTREME";
        atrPercent: number | null;
        session?: {
          name: string;
          label: string;
          liquidity: "BEST" | "HIGH" | "GOOD" | "LOW" | "POOR";
          block: boolean;
          note: string;
        };
        spread?: {
          points: number | null;
          price: number | null;
          atrCoverPct: number | null;
          block: boolean;
          note: string;
        };
        gated?: boolean;
        suggestion: string;
      };
      orderFlow?: {
        vwap: {
          vwap: number | null;
          upper1: number | null;
          lower1: number | null;
          position: string;
          deviationPct: number | null;
        };
        volumeProfile: { poc: number | null; vah: number | null; val: number | null; valueAreaPct: number | null } | null;
        delta: { buyVolume: number; sellVolume: number; totalVolume: number; imbalance: number; cvd: number; cvdDirection: string; aggressiveMomentum: string } | null;
        sweeps: Array<{ direction: "LONG" | "SHORT"; levelPrice: number; strength: number }>;
        fvgs: Array<{ direction: "BULLISH" | "BEARISH"; top: number; bottom: number; fresh: boolean }>;
        orderBlocks: Array<{ direction: "BULLISH" | "BEARISH"; high: number; low: number }>;
        fib: { direction: "UP" | "DOWN"; swingLow: number; swingHigh: number; nearest: { level: { ratio: number; price: number; kind: string }; distancePct: number } | null } | null;
      };
      learning?: Array<{
        name: string;
        samples: number;
        winRate: number;
        edge: number;
        weight: number;
        directionBias: "LONG" | "SHORT" | "NEUTRAL";
      }>;
    };
  };
};

export async function GET(request: Request) {
  const input = getMarketInput(request);

  try {
    const analysis = await analyzeMarketWithConfirmation(input.symbol, input.timeframe as Timeframe, input.limit);
    const news = await getNewsContext(input.symbol);
    const ai = await analyzeWithFallback(
      {
        ...analysis,
        confluence: analysis.signal?.confluence,
        strategyVote: analysis.signal?.confluence?.strategyVote,
        backtest: analysis.signal?.confluence?.backtest,
        scalping: analysis.signal?.confluence?.scalping,
        newsContext: news,
      },
      news
    );

    return NextResponse.json({ analysis: withNews(ai, news) });
  } catch (error) {
    if (isMarketDataRuntimeError(error)) {
      const analysis = analyzeMarket(input.symbol, input.timeframe, []);
      const news = await getNewsContext(input.symbol);
      return NextResponse.json({ analysis: withNews(buildLocalAnalysis(analysis), news) });
    }

    return handleApiError(error);
  }
}

function getMarketInput(request: Request) {
  const url = new URL(request.url);
  return marketDataQuerySchema.parse({
    symbol: url.searchParams.get("symbol") ?? undefined,
    timeframe: url.searchParams.get("timeframe") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
}

function isMarketDataRuntimeError(error: unknown) {
  return error instanceof AppError || error instanceof TypeError || (error instanceof Error && error.message.includes("Market data provider is not configured"));
}

async function analyzeWithFallback(analysis: AnalysisWithSignal, news: NewsContext | null = null) {
  const local = buildLocalAnalysis(analysis, news);
  try {
    const ai = await analyzeMarketWithAI(analysis);
    if (ai.connected && ai.status === "CONNECTED") {
      return {
        ...local,
        provider: ai.provider,
        summary: ai.summary,
        bullishFactors: ai.bullishFactors,
        bearishFactors: ai.bearishFactors,
        riskFactors: ai.riskFactors,
        scenarioAnalysis: ai.scenarioAnalysis,
        invalidation: ai.invalidation,
      };
    }
  } catch {
    // fall through ke local deterministic
  }
  return local;
}

function buildLocalAnalysis(analysis: AnalysisWithSignal, news: NewsContext | null = null) {
  const signal = analysis.signal ?? null;
  const rsi = analysis.indicators.rsi14;
  const trend = analysis.indicators.ema20 && analysis.indicators.sma20 ? (analysis.indicators.ema20 > analysis.indicators.sma20 ? "bullish" : "bearish") : "neutral";
  const mtf = analysis.multiTimeframe;
  const confirmations = analysis.confirmations ?? [];
  const confluence = analysis.confluence ?? analysis.signal?.confluence;
  const strategyVote = analysis.strategyVote ?? analysis.signal?.confluence?.strategyVote;
  const backtest = analysis.backtest ?? analysis.signal?.confluence?.backtest;
  const scalping = analysis.scalping ?? analysis.signal?.confluence?.scalping;
  const orderFlow = analysis.signal?.confluence?.orderFlow;
  const learning = analysis.signal?.confluence?.learning;
  const mtfText = mtf ? ` Multi-timeframe alignment ${mtf.alignment} with votes L:${mtf.longVotes} S:${mtf.shortVotes} N:${mtf.neutralVotes}.` : "";
  const confirmationText = confirmations.length
    ? ` Confirmation frames: ${confirmations.map((item) => `${item.timeframe}:${item.bias}(${item.confidence})`).join(", ")}.`
    : "";
  const confluenceText = confluence
    ? ` Confluence engine: ${confluence.direction} at ${confluence.confidence}% (score ${confluence.score}/100), regime ${confluence.regime.regimeLabel}.`
    : "";
  const strategyText = strategyVote
    ? ` Strategy vote: ${strategyVote.agreeingCount}/${strategyVote.strategyCount} strategi searah (lead: ${strategyVote.topStrategy ?? "none"}).`
    : "";
  const backtestText = backtest && backtest.edge !== "INSUFFICIENT" && backtest.expectancyPct !== null
    ? ` Backtest edge: win-rate ${backtest.winRate?.toFixed(0)}%, expectancy ${backtest.expectancyPct.toFixed(3)}% dari ${backtest.totalSignals} sinyal (${backtest.edge.toLowerCase()}).`
    : "";
  const scalpingText = scalping && scalping.direction !== "NEUTRAL" && scalping.entryType !== "NO_EDGE"
    ? ` Scalping read: ${scalping.direction} (${scalping.entryType}, ${scalping.confidence}/100, volatilitas ${scalping.volatility.toLowerCase()}). ${scalping.suggestion}`
    : scalping
      ? ` Scalping read: belum ada edge short-term (volatilitas ${scalping.volatility.toLowerCase()}).`
      : "";
  const orderFlowText = orderFlow
    ? ` Order flow: delta ${orderFlow.delta ? `${orderFlow.delta.imbalance >= 0 ? "+" : ""}${(orderFlow.delta.imbalance * 100).toFixed(0)}% (${orderFlow.delta.cvdDirection}, momentum ${orderFlow.delta.aggressiveMomentum.toLowerCase()})` : "n/a"}, VWAP ${orderFlow.vwap.vwap ? orderFlow.vwap.vwap.toFixed(4) : "n/a"} (${orderFlow.vwap.position.replace("_", " ")}), ${orderFlow.volumeProfile ? `POC ${orderFlow.volumeProfile.poc?.toFixed(4) ?? "n/a"}` : "belum ada volume profile"}.`
    : "";
  const learningText = learning?.length
    ? ` Learning loop: ${learning.filter((item) => item.samples >= 6 && Math.abs(item.weight - 1) > 0.2).map((item) => `${item.name} ${item.edge >= 0 ? "+" : ""}${item.edge.toFixed(2)}R x${item.weight.toFixed(2)} (n=${item.samples})`).join(", ") || "belum ada edge terpelajari yang kuat"}.`
    : "";
  const sentiment = news?.sentiment ?? null;
  const newsText = news?.source
    ? ` Berita: sentimen ${sentiment ? `${sentiment.label} (${(sentiment.bullShare).toFixed(0)}% bull / ${(sentiment.bearShare).toFixed(0)}% bear, ${sentiment.count} headline)` : "netral/tidak tersedia"}, event berikutnya: ${news.calendar.nextHighImpact ? `${news.calendar.nextHighImpact.event} (${news.calendar.nextHighImpact.importance}, ${new Date(news.calendar.nextHighImpact.date).toLocaleString("id-ID")})` : "tidak ada dalam 24 jam"}.`
    : "";
  const newsBullFactors = news?.source && sentiment?.label === "BULLISH"
    ? [`Sentimen berita BULLISH: ${sentiment.bullShare.toFixed(0)}% headline positif dari ${sentiment.count} berita.`]
    : [];
  const newsBearFactors = news?.source && sentiment?.label === "BEARISH"
    ? [`Sentimen berita BEARISH: ${sentiment.bearShare.toFixed(0)}% headline negatif dari ${sentiment.count} berita.`]
    : [];
  const newsRiskFactors = news?.source && news.calendar.nextHighImpact
    ? [`Event berimpact ${news.calendar.nextHighImpact.importance.toUpperCase()} ${new Date(news.calendar.nextHighImpact.date).toLocaleString("id-ID")}: ${news.calendar.nextHighImpact.event}.`]
    : [];

  return {
    provider: "local-deterministic",
    connected: false,
    status: "NOT CONNECTED" as const,
    summary: analysis.latestClose
      ? `${analysis.symbol} ${analysis.timeframe} dianalisis dari data market aktif. Trend saat ini ${trend}, RSI ${rsi ? rsi.toFixed(1) : "n/a"}, signal deterministic membaca ${signal?.action ?? "WAIT"}.${confluenceText}${strategyText}${backtestText}${scalpingText}${orderFlowText}${learningText}${newsText}${mtfText}${confirmationText}`
      : `${analysis.symbol} ${analysis.timeframe} belum punya candle valid dari provider, jadi analisis ditahan.`,
    bullishFactors: [
      analysis.indicators.ema20 && analysis.indicators.sma20 && analysis.indicators.ema20 > analysis.indicators.sma20 ? "EMA20 berada di atas SMA20." : "Belum ada konfirmasi trend bullish dari EMA/SMA.",
      ...(signal?.bias === "LONG" ? ["Signal engine memiliki bias LONG."] : []),
      ...(mtf?.alignment === "LONG" ? [`Multi-timeframe alignment mengarah LONG (${mtf.longVotes}/${confirmations.length || 3}).`] : []),
      ...(confluence?.direction === "LONG" ? [`Confluence engine LONG dengan confidence ${confluence.confidence}%.`] : []),
      ...newsBullFactors,
    ],
    bearishFactors: [
      analysis.indicators.ema20 && analysis.indicators.sma20 && analysis.indicators.ema20 < analysis.indicators.sma20 ? "EMA20 berada di bawah SMA20." : "Belum ada konfirmasi trend bearish dari EMA/SMA.",
      ...(signal?.bias === "SHORT" ? ["Signal engine memiliki bias SHORT."] : []),
      ...(mtf?.alignment === "SHORT" ? [`Multi-timeframe alignment mengarah SHORT (${mtf.shortVotes}/${confirmations.length || 3}).`] : []),
      ...(confluence?.direction === "SHORT" ? [`Confluence engine SHORT dengan confidence ${confluence.confidence}%.`] : []),
      ...newsBearFactors,
    ],
    riskFactors: [
      ...(signal?.warnings?.length ? signal.warnings : []),
      ...(confluence?.regime?.volatility === "EXTREME" ? ["Volatilitas EXTREME - spread dan slippage lebih besar."] : []),
      ...(confluence?.regime?.volatility === "COMPRESSED" ? ["Volatilitas COMPRESSED - risiko breakout, pertimbangkan tunggu."] : []),
      ...newsRiskFactors,
      "Gunakan harga broker/exchange sebagai referensi eksekusi akhir.",
    ],
    scenarioAnalysis: [
      ...(confluence?.narrative ? [confluence.narrative] : []),
      ...(confluence?.factors?.length
        ? confluence.factors.filter((f) => f.score > 0).slice(0, 5).map((f) => `Faktor ${f.name}: ${f.detail}`)
        : []),
      ...(strategyVote ? [`Strategy vote: ${strategyVote.detail}`] : []),
      ...(backtest && backtest.edge !== "INSUFFICIENT" && backtest.expectancyPct !== null
        ? [`Backtest: ${backtest.totalSignals} sinyal simulasikan, win-rate ${backtest.winRate?.toFixed(0)}%, expectancy ${backtest.expectancyPct.toFixed(3)}% (${backtest.edge.toLowerCase()})`]
        : []),
      ...(scalping && scalping.direction !== "NEUTRAL"
        ? [`Scalping: ${scalping.suggestion}`]
        : scalping
          ? ["Scalping: belum ada edge short-term yang terkonfirmasi."]
          : []),
      ...(signal?.reasons?.length ? signal.reasons : ["WAIT sampai data dan setup teknikal lebih jelas."]),
      ...(confirmations.length ? [`Frame confirmations: ${confirmations.map((item) => `${item.timeframe}=${item.bias}`).join(" | ")}`] : []),
    ],
    invalidation: signal?.stopLoss ? `Invalid jika harga menembus ${signal.stopLoss.toFixed(5)}.` : "WAIT, belum ada level invalidation yang valid.",
    confirmations,
    multiTimeframe: mtf,
    scalping: scalping
      ? {
          direction: scalping.direction,
          confidence: scalping.confidence,
          score: scalping.score,
          reasoning: scalping.reasoning,
          entryType: scalping.entryType,
          volatility: scalping.volatility,
          atrPercent: scalping.atrPercent,
          session: scalping.session,
          spread: scalping.spread,
          gated: scalping.gated ?? false,
          suggestion: scalping.suggestion,
        }
      : null,
    orderFlow: orderFlow
      ? {
          vwap: orderFlow.vwap,
          volumeProfile: orderFlow.volumeProfile,
          delta: orderFlow.delta,
          sweeps: orderFlow.sweeps,
          fvgs: orderFlow.fvgs,
          orderBlocks: orderFlow.orderBlocks,
          fib: orderFlow.fib,
        }
      : null,
    learning: learning ?? [],
    news: news
      ? {
          sentiment: news.sentiment,
          topHeadlines: news.topHeadlines,
          calendar: {
            upcoming: news.calendar.upcoming.map((event) => ({ date: event.date, event: event.event, country: event.country, currency: event.currency, importance: event.importance, forecast: event.forecast, previous: event.previous, actual: event.actual, unit: event.unit })),
            recent: news.calendar.recent.map((event) => ({ date: event.date, event: event.event, country: event.country, currency: event.currency, importance: event.importance, forecast: event.forecast, previous: event.previous, actual: event.actual, unit: event.unit })),
            nextHighImpact: news.calendar.nextHighImpact
              ? { date: news.calendar.nextHighImpact.date, event: news.calendar.nextHighImpact.event, country: news.calendar.nextHighImpact.country, currency: news.calendar.nextHighImpact.currency, importance: news.calendar.nextHighImpact.importance, forecast: news.calendar.nextHighImpact.forecast, previous: news.calendar.nextHighImpact.previous, actual: news.calendar.nextHighImpact.actual, unit: news.calendar.nextHighImpact.unit }
              : null,
          },
          generatedAt: news.generatedAt,
          source: news.source,
        }
      : null,
  };
}

function withNews<T extends Record<string, unknown>>(output: T, news: NewsContext | null): T & { news: NewsContext | null } {
  return { ...output, news };
}
