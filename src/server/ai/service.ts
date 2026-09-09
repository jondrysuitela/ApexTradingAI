import type { AIAnalysisInput, AIAnalysisOutput } from "./types";
import { getAIProvider } from "./provider";

export async function analyzeMarketWithAI(input: AIAnalysisInput): Promise<AIAnalysisOutput> {
  const provider = getAIProvider();
  return provider.analyzeMarket(input);
}
