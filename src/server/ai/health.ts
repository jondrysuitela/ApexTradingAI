import { env } from "@/server/env";
import { getAIProvider } from "./provider";

export async function getAIHealth() {
  const provider = getAIProvider();
  const configured = provider.isConfigured();
  return { status: configured ? "ok" : "not_connected", provider: env.AI_PROVIDER || provider.name, connected: configured };
}
