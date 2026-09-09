import { z } from "zod";
import { TIMEFRAMES } from "@/lib/timeframes";

export const marketDataQuerySchema = z.object({
  symbol: z.string().min(1).default("BTC/USDT"),
  timeframe: z.enum(TIMEFRAMES).default("1h"),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export const tickerQuerySchema = z.object({
  symbol: z.string().min(1).default("BTC/USDT"),
});
