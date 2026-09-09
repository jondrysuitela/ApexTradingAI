import type { CandleInput } from "./indicators";

export type VolumeProfile = {
  high: number;
  low: number;
  poc: number;
  vah: number;
  val: number;
  valueAreaPct: number;
  totalVolume: number;
  priceBuckets: Array<{ price: number; volume: number }>;
};

const VALUE_AREA_THRESHOLD = 0.7;

export function sessionVolumeProfile(candles: CandleInput[], bucketCount = 24): VolumeProfile | null {
  if (candles.length < 5) return null;

  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const range = high - low;
  if (range <= 0) return null;

  const bucketSize = range / bucketCount;
  const buckets = new Array<number>(bucketCount).fill(0);

  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    let index = Math.floor((mid - low) / bucketSize);
    if (index < 0) index = 0;
    if (index >= bucketCount) index = bucketCount - 1;
    buckets[index] += c.volume;
  }

  const totalVolume = buckets.reduce((sum, value) => sum + value, 0);
  if (totalVolume <= 0) return null;

  let pocIndex = 0;
  let maxVolume = -1;
  for (let i = 0; i < bucketCount; i += 1) {
    if (buckets[i] > maxVolume) {
      maxVolume = buckets[i];
      pocIndex = i;
    }
  }

  let up = pocIndex;
  let down = pocIndex;
  let areaVolume = buckets[pocIndex];
  while (areaVolume / totalVolume < VALUE_AREA_THRESHOLD && (up < bucketCount - 1 || down > 0)) {
    const upNext = up < bucketCount - 1 ? buckets[up + 1] : -1;
    const downNext = down > 0 ? buckets[down - 1] : -1;
    if (upNext >= downNext && upNext >= 0) {
      up += 1;
      areaVolume += upNext;
    } else if (downNext >= 0) {
      down -= 1;
      areaVolume += downNext;
    } else {
      break;
    }
  }

  return {
    high,
    low,
    poc: low + (pocIndex + 0.5) * bucketSize,
    vah: low + (up + 1) * bucketSize,
    val: low + down * bucketSize,
    valueAreaPct: totalVolume > 0 ? (areaVolume / totalVolume) * 100 : 0,
    totalVolume,
    priceBuckets: buckets.map((volume, index) => ({ price: low + (index + 0.5) * bucketSize, volume })),
  };
}

export function priceZoneOf(price: number, profile: VolumeProfile): "INSIDE_VA" | "ABOVE_VAH" | "BELOW_VAL" {
  if (price > profile.vah) return "ABOVE_VAH";
  if (price < profile.val) return "BELOW_VAL";
  return "INSIDE_VA";
}