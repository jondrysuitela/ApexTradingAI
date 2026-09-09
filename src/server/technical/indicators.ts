export type CandleInput = { open: number; high: number; low: number; close: number; volume: number; timestamp: string };

export function sma(values: number[], length: number) {
  if (values.length < length || length <= 0) return null;
  const slice = values.slice(-length);
  return slice.reduce((sum, value) => sum + value, 0) / length;
}

export function ema(values: number[], length: number) {
  if (values.length < length || length <= 0) return null;
  const k = 2 / (length + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

export function emaSeries(values: number[], length: number): (number | null)[] {
  if (values.length < length || length <= 0) return [];
  const k = 2 / (length + 1);
  const series: (number | null)[] = [];
  let result = values[0];
  for (let i = 0; i < values.length; i += 1) {
    result = i === 0 ? values[0] : values[i] * k + result * (1 - k);
    series.push(i >= length - 1 ? result : null);
  }
  return series;
}

export function rsi(values: number[], length = 14) {
  if (values.length <= length) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - length; i < values.length - 1; i += 1) {
    const diff = values[i + 1] - values[i];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function atr(candles: CandleInput[], length = 14) {
  if (candles.length <= length) return null;
  const trs = candles.slice(-length - 1).slice(1).map((candle, index) => {
    const prevClose = candles[candles.length - length - 1 + index].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - prevClose), Math.abs(candle.low - prevClose));
  });
  return trs.reduce((sum, value) => sum + value, 0) / trs.length;
}

export function bollingerBands(values: number[], length = 20, stdDevMultiplier = 2) {
  if (values.length < length) return null;
  const slice = values.slice(-length);
  const mean = slice.reduce((sum, value) => sum + value, 0) / length;
  const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / length;
  const deviation = Math.sqrt(variance);
  return { middle: mean, upper: mean + stdDevMultiplier * deviation, lower: mean - stdDevMultiplier * deviation };
}

export function macd(values: number[]) {
  if (values.length < 35) return null;

  const macdSeries: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const slice = values.slice(0, index + 1);
    const fast = ema(slice, 12);
    const slow = ema(slice, 26);
    if (fast === null || slow === null) continue;
    macdSeries.push(fast - slow);
  }

  if (macdSeries.length < 9) return null;

  const macdLine = macdSeries.at(-1) ?? null;
  const signalLine = ema(macdSeries, 9);
  if (macdLine === null || signalLine === null) return null;

  return { macd: macdLine, signal: signalLine, histogram: macdLine - signalLine };
}

export function average(values: number[], length: number) {
  if (values.length < length || length <= 0) return null;
  const slice = values.slice(-length);
  return slice.reduce((sum, value) => sum + value, 0) / length;
}

export function adx(candles: CandleInput[], length = 14) {
  if (candles.length < length + 1) return null;
  const slices = candles.slice(-(length + 1));
  let plusDm = 0;
  let minusDm = 0;
  let trSum = 0;
  for (let i = 1; i < slices.length; i += 1) {
    const high = slices[i].high;
    const low = slices[i].low;
    const prevHigh = slices[i - 1].high;
    const prevLow = slices[i - 1].low;
    const prevClose = slices[i - 1].close;
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDm += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm += downMove > upMove && downMove > 0 ? downMove : 0;
    trSum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  if (trSum === 0) return null;
  const plusDi = (plusDm / trSum) * 100;
  const minusDi = (minusDm / trSum) * 100;
  const diSum = plusDi + minusDi;
  const dx = diSum > 0 ? Math.abs(plusDi - minusDi) / diSum * 100 : 0;
  return { adx: dx, plusDi, minusDi };
}

export function stochastic(candles: CandleInput[], kLength = 14, dLength = 3) {
  if (candles.length < kLength) return null;
  const slice = candles.slice(-kLength);
  const highest = Math.max(...slice.map((c) => c.high));
  const lowest = Math.min(...slice.map((c) => c.low));
  const range = highest - lowest;
  const current = candles.at(-1)!.close;
  const k = range > 0 ? ((current - lowest) / range) * 100 : 50;
  const kValues: number[] = [k];
  for (let i = 1; i < dLength && candles.length >= kLength + i; i += 1) {
    const prevSlice = candles.slice(-(kLength + i), -i);
    const ph = Math.max(...prevSlice.map((c) => c.high));
    const pl = Math.min(...prevSlice.map((c) => c.low));
    const pr = ph - pl;
    kValues.push(pr > 0 ? ((prevSlice.at(-1)!.close - pl) / pr) * 100 : 50);
  }
  const d = kValues.reduce((s, v) => s + v, 0) / kValues.length;
  return { k, d };
}

export function emaSlope(values: number[], length = 20) {
  if (values.length < length + 5) return null;
  const current = ema(values, length);
  const prev = ema(values.slice(0, -5), length);
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / prev) * 10000;
}

export function bodyRatio(candle: CandleInput) {
  const range = candle.high - candle.low;
  if (range === 0) return 1;
  return Math.abs(candle.close - candle.open) / range;
}

export function upperWickRatio(candle: CandleInput) {
  const range = candle.high - candle.low;
  if (range === 0) return 0;
  const bodyTop = Math.max(candle.open, candle.close);
  return (candle.high - bodyTop) / range;
}

export function lowerWickRatio(candle: CandleInput) {
  const range = candle.high - candle.low;
  if (range === 0) return 0;
  const bodyBottom = Math.min(candle.open, candle.close);
  return (bodyBottom - candle.low) / range;
}

export function atrPercentile(candles: CandleInput[], length = 14, lookback = 100) {
  if (candles.length < lookback) return null;
  const currentAtr = atr(candles, length);
  if (currentAtr === null) return null;
  const historicalAtrs: number[] = [];
  for (let i = length + 1; i <= Math.min(candles.length, lookback); i += 1) {
    const a = atr(candles.slice(0, i), length);
    if (a !== null) historicalAtrs.push(a);
  }
  if (historicalAtrs.length === 0) return null;
  const below = historicalAtrs.filter((a) => a < currentAtr).length;
  return Math.round((below / historicalAtrs.length) * 100);
}
