import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LOCAL_USER_ID: z.string().optional(),
  MARKET_DATA_PROVIDER: z.string().default("binance"),
  MARKET_DATA_BASE_URL: z.string().default("https://api.binance.com"),
  TWELVE_DATA_API_KEY: z.string().optional(),
  MT5_BRIDGE_URL: z.string().optional(),
  MT5_BRIDGES: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export const env = schema.parse(process.env);
