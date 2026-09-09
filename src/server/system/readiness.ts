import { env } from "@/server/env";

export function getReadinessStatus() {
  const authConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
  const databaseConfigured = Boolean(env.DATABASE_URL);
  const aiProvider = env.AI_PROVIDER ?? "facts-only";

  return {
    previewReady: true,
    databaseConfigured,
    authConfigured,
    marketData: {
      provider: env.MARKET_DATA_PROVIDER,
      baseUrlConfigured: Boolean(env.MARKET_DATA_BASE_URL),
      twelveDataConfigured: Boolean(env.TWELVE_DATA_API_KEY),
      mt5BridgeConfigured: Boolean(env.MT5_BRIDGE_URL),
    },
    ai: {
      provider: aiProvider,
      configured: aiProvider === "openai" ? Boolean(env.OPENAI_API_KEY) : aiProvider === "anthropic" ? Boolean(env.ANTHROPIC_API_KEY) : aiProvider === "google" ? Boolean(env.GOOGLE_AI_API_KEY) : true,
    },
    worker: {
      redisConfigured: Boolean(env.REDIS_URL),
      mode: "manual",
    },
  };
}
