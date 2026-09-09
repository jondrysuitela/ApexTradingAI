import type { CandleInput } from "./indicators";

export type HarmonicPatternType = "ABCD" | "Gartley" | "Butterfly" | "Crab";

export type HarmonicPattern = {
  type: HarmonicPatternType;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  targets: number[];
  quality: number;
  description: string;
};

const FIB = {
  AB: 0.382,
  BC: [1.0, 1.272, 1.618] as const,
  CD: [1.272, 1.618, 2.0] as const,
  XA_RETRACE: 0.618,
};

export function detectHarmonics(candles: CandleInput[]): HarmonicPattern[] {
  if (candles.length < 20) return [];
  const patterns: HarmonicPattern[] = [];
  const swings = findSwingPoints(candles, 2);
  const highs = swings.filter((s) => s.type === "HIGH").slice(-10);
  const lows = swings.filter((s) => s.type === "LOW").slice(-10);

  // Build alternating swing sequence
  const seq = buildAlternatingSequence(highs, lows);
  if (seq.length < 5) return [];

  const last = candles.at(-1)!;

  for (let i = 0; i < seq.length - 4; i += 1) {
    const o = seq[i];
    const x = seq[i + 1];
    const a = seq[i + 2];
    const b = seq[i + 3];
    const c = seq[i + 4];

    // Ensure alternating pattern structure
    if (o.type === x.type || x.type === a.type || a.type === b.type || b.type === c.type) continue;

    const dxa = Math.abs(x.price - a.price);
    if (dxa === 0) continue;

    // AB leg (A->B), BC (B->C), CD (C->D potential)
    const ab = Math.abs(a.price - b.price) / dxa;
    const bc = Math.abs(b.price - c.price) / dxa;
    const xaRetrace = Math.abs(o.price - a.price) / dxa;

    // Check X->A retracement for Gartley (0.618) and Butterfly (0.786)
    const near = (val: number, target: number, tol = 0.05) => Math.abs(val - target) < tol;

    // ABCD: BC ~ XA and CD extension near AB leg
    if (near(ab, FIB.XA_RETRACE) && near(bc, 1.0) && last.high >= computeCD(c.price, b.price, a.price, 1.272) - dxa * 0.02) {
      patterns.push(buildABCD(o, x, a, b, c));
    }

    // Gartley: XA retrace to A ~ 0.618, B retrace of XA -> C near 0.618 of AB
    if (near(xaRetrace, 0.618, 0.08) && near(ab, 0.318, 0.1) && near(Math.abs(b.price - c.price) / Math.abs(a.price - b.price), 0.886, 0.1)) {
      patterns.push(buildHarmonic("Gartley", o, x, a, b, c, last, 0.618, 0.382, 0.886));
    }

    // Butterfly: XA retrace ~ 0.786, AB retrace ~ 0.618
    if (near(xaRetrace, 0.786, 0.08) && near(ab, 0.318, 0.1)) {
      patterns.push(buildHarmonic("Butterfly", o, x, a, b, c, last, 0.786, 0.382, 1.272));
    }

    // Crab: XA retrace to A ~ 0.886, CD reaches 2.24-3.618 extension
    if (near(xaRetrace, 0.886, 0.06) && near(ab, 0.382, 0.1)) {
      patterns.push(buildHarmonic("Crab", o, x, a, b, c, last, 0.886, 0.382, 1.618));
    }
  }

  return patterns;
}

function computeCD(cPrice: number, bPrice: number, aPrice: number, extension: number): number {
  const bc = Math.abs(bPrice - cPrice);
  if (cPrice >= bPrice) return cPrice + bc * extension;
  return cPrice - bc * extension;
}

function buildABCD(o: SwingPoint, x: SwingPoint, a: SwingPoint, b: SwingPoint, c: SwingPoint): HarmonicPattern {
  const dxa = Math.abs(x.price - a.price);
  const direction: "LONG" | "SHORT" = o.price < x.price ? "LONG" : "SHORT";
  const entry = direction === "LONG" ? computeCD(c.price, b.price, a.price, 1.272) : computeCD(c.price, b.price, a.price, 1.272);
  const stop = direction === "LONG" ? c.price - dxa * 0.02 : c.price + dxa * 0.02;
  const targets = [entry + dxa * 0.1618, entry + dxa * 0.382].slice(0, direction === "LONG" ? 2 : 2);

  return {
    type: "ABCD",
    direction,
    entry,
    stop,
    targets,
    quality: 70,
    description: `ABCD pattern (${direction}) projecting to ${entry.toFixed(5)}`,
  };
}

function buildHarmonic(
  type: HarmonicPatternType,
  _o: SwingPoint,
  x: SwingPoint,
  a: SwingPoint,
  b: SwingPoint,
  c: SwingPoint,
  _last: CandleInput,
  _xaRetrace: number,
  _abRetrace: number,
  cdExt: number,
): HarmonicPattern {
  const isBullish = x.price > a.price; // X above A => potential bullish harmonic
  const cd = computeCD(c.price, b.price, a.price, cdExt);
  const dxa = Math.abs(x.price - a.price);

  const pattern: HarmonicPattern = {
    type,
    direction: isBullish ? "LONG" : "SHORT",
    entry: cd,
    stop: isBullish ? cd - Math.max(dxa * 0.02, Math.abs(c.price - cd) * 0.5) : cd + Math.max(dxa * 0.02, Math.abs(c.price - cd) * 0.5),
    targets: [cd + dxa * (isBullish ? 0.1618 : -0.1618), cd + dxa * (isBullish ? 0.382 : -0.382)],
    quality: type === "Crab" ? 80 : type === "Butterfly" ? 75 : 85,
    description: `${type} ${isBullish ? "bullish" : "bearish"} pattern detected at ${cd.toFixed(5)}`,
  };

  return pattern;
}

type SwingPoint = { index: number; price: number; type: "HIGH" | "LOW" };

function findSwingPoints(candles: CandleInput[], threshold = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = threshold; i < candles.length - threshold; i += 1) {
    const isHigh = Array.from({ length: threshold * 2 }, (_, k) => candles[i - threshold + k].high).every((h) => h <= candles[i].high);
    const isLow = Array.from({ length: threshold * 2 }, (_, k) => candles[i - threshold + k].low).every((l) => l >= candles[i].low);
    if (isHigh) swings.push({ index: i, price: candles[i].high, type: "HIGH" });
    if (isLow) swings.push({ index: i, price: candles[i].low, type: "LOW" });
  }
  return swings;
}

function buildAlternatingSequence(highs: SwingPoint[], lows: SwingPoint[]) {
  const merged = [...highs, ...lows].sort((a, b) => a.index - b.index);
  const seq: SwingPoint[] = [];
  for (const point of merged) {
    const last = seq.at(-1);
    if (last && last.type === point.type) {
      // Keep the more extreme of consecutive same-type
      if (point.type === "HIGH" && point.price > last.price) seq[seq.length - 1] = point;
      if (point.type === "LOW" && point.price < last.price) seq[seq.length - 1] = point;
    } else {
      seq.push(point);
    }
  }
  return seq;
}