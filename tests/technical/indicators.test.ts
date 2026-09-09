import { describe, expect, it } from "vitest";
import { ema, rsi, sma } from "@/server/technical/indicators";

describe("indicators", () => {
  it("calculates SMA deterministically", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
  });

  it("calculates EMA deterministically", () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toBeCloseTo(4.0625);
  });

  it("calculates RSI without fabricating missing values", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
    expect(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14)).toBe(100);
  });
});
