"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type UTCTimestamp,
  type Time,
} from "lightweight-charts";

type Candle = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };
type Analysis = {
  supportResistance?: Array<{ price: number; type: "support" | "resistance"; strength: number; touchCount: number; lastReaction: string; distanceFromCurrentPrice: number }>;
  structure?: Array<{ type: string; timestamp: string; price: number; strength: number; source: string }>;
  setup?: { direction: "LONG" | "SHORT" | "NEUTRAL"; entryZone: { low: number; high: number } | null; invalidation: number | null; targets: number[]; state: string; score: number; timestamp: string } | null;
};

export function MarketChart({ candles, analysis, livePrice }: { candles: Candle[]; analysis?: Analysis | null; livePrice?: number | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const livePriceLineRef = useRef<IPriceLine | null>(null);
  const markerApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const markers = useMemo(() => buildMarkers(analysis), [analysis]);
  const chartData = useMemo(() => buildChartData(candles, livePrice), [candles, livePrice]);
  const hasChartData = chartData.length > 0;

  useEffect(() => {
    if (!containerRef.current || !hasChartData) return;

    if (chartRef.current || seriesRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      height: 320,
      layout: { background: { color: "#0b1020" }, textColor: "#d9e6f2" },
      grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      timeScale: { borderColor: "rgba(255,255,255,0.12)", rightOffset: 4, barSpacing: 10, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    candleSeries.setData(chartData);

    markerApiRef.current = createSeriesMarkers(candleSeries, markers);
    renderPriceLevels(candleSeries, analysis);
    if (livePrice !== null && livePrice !== undefined) {
      livePriceLineRef.current = candleSeries.createPriceLine({
        price: livePrice,
        color: "rgba(34,211,238,0.9)",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "LIVE",
      });
    }

    chart.timeScale().fitContent();
    chart.timeScale().scrollToRealTime();
    chartRef.current = chart;
    seriesRef.current = candleSeries;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      markerApiRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      livePriceLineRef.current = null;
    };
  }, [hasChartData]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || chartData.length === 0) return;
    series.setData(chartData);
    chartRef.current?.timeScale().scrollToRealTime();
  }, [chartData]);

  useEffect(() => {
    if (!markerApiRef.current) return;
    markerApiRef.current.setMarkers(markers);
  }, [markers]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || livePrice === null || livePrice === undefined) return;

    if (livePriceLineRef.current) {
      series.removePriceLine(livePriceLineRef.current);
    }

    livePriceLineRef.current = series.createPriceLine({
      price: livePrice,
      color: "rgba(34,211,238,0.9)",
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: "LIVE",
    });
    chartRef.current?.timeScale().scrollToRealTime();
  }, [livePrice]);

  if (!hasChartData) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-sm text-slate-400">NOT CONNECTED</div>;
  }

  return <div ref={containerRef} className="w-full" />;
}

function buildChartData(candles: Candle[], livePrice?: number | null) {
  if (candles.length === 0 && livePrice) {
    return [
      {
        time: Math.floor(Date.now() / 1000) as UTCTimestamp,
        open: livePrice,
        high: livePrice,
        low: livePrice,
        close: livePrice,
      },
    ];
  }

  return candles.map((candle, index) => {
    const isLast = index === candles.length - 1 && livePrice;
    const close = isLast ? livePrice : candle.close;
    return {
      time: Math.floor(new Date(candle.timestamp).getTime() / 1000) as UTCTimestamp,
      open: candle.open,
      high: isLast ? Math.max(candle.high, livePrice) : candle.high,
      low: isLast ? Math.min(candle.low, livePrice) : candle.low,
      close,
    };
  });
}

function buildMarkers(analysis?: Analysis | null) {
  const structure = analysis?.structure ?? [];
  const setup = analysis?.setup;

  return [
    ...structure.slice(-8).map((event) => ({
      time: Math.floor(new Date(event.timestamp).getTime() / 1000) as UTCTimestamp,
      position: event.type.includes("Low") ? ("belowBar" as const) : ("aboveBar" as const),
      color: event.type.includes("Low") ? "#22c55e" : "#ef4444",
      shape: event.type.includes("Low") ? ("arrowUp" as const) : ("arrowDown" as const),
      text: event.type,
    })),
    ...(setup
      ? [
          {
            time: Math.floor(new Date(setup.timestamp).getTime() / 1000) as UTCTimestamp,
            position: "inBar" as const,
            color: setup.direction === "LONG" ? "#22c55e" : setup.direction === "SHORT" ? "#ef4444" : "#64748b",
            shape: "circle" as const,
            text: `${setup.state} ${setup.score}/100`,
          },
        ]
      : []),
  ];
}

function renderPriceLevels(series: ISeriesApi<"Candlestick">, analysis?: Analysis | null) {
  const levels = analysis?.supportResistance ?? [];
  for (const level of levels.slice(0, 8)) {
    series.createPriceLine({
      price: level.price,
      color: level.type === "support" ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `${level.type.toUpperCase()} ${level.touchCount}`,
    });
  }

  const setup = analysis?.setup;
  if (setup?.entryZone) {
    series.createPriceLine({
      price: setup.entryZone.low,
      color: "rgba(14,165,233,0.7)",
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: "ENTRY LOW",
    });
    series.createPriceLine({
      price: setup.entryZone.high,
      color: "rgba(14,165,233,0.7)",
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: "ENTRY HIGH",
    });
  }

  if (setup?.invalidation) {
    series.createPriceLine({
      price: setup.invalidation,
      color: "rgba(250,204,21,0.75)",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "INVALIDATION",
    });
  }

  for (const target of setup?.targets ?? []) {
    series.createPriceLine({
      price: target,
      color: "rgba(168,85,247,0.75)",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "TARGET",
    });
  }
}
