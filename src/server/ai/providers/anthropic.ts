import { env } from "@/server/env";
import type { AIAnalysisInput, AIAnalysisOutput, AIProvider } from "../types";
import { buildFactsOnlyAnalysis } from "./base";
import { buildAnalysisPrompt, GROUNDED_INSTRUCTIONS, parseGroundedJSON, postJSON, toAIAnalysisOutput } from "../generate";

const DEFAULT_MODEL = "claude-3-5-haiku-latest";

type AnthropicResponse = {
  content?: Array<{ text?: string }>;
};

export class AnthropicProvider implements AIProvider {
  name = "anthropic" as const;

  isConfigured() {
    return Boolean(env.ANTHROPIC_API_KEY);
  }

  async analyzeMarket(input: AIAnalysisInput): Promise<AIAnalysisOutput> {
    if (!this.isConfigured()) return buildFactsOnlyAnalysis(this.name, false, input);
    try {
      const data = await postJSON<AnthropicResponse>(
        "https://api.anthropic.com/v1/messages",
        {
          "x-api-key": env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        {
          model: DEFAULT_MODEL,
          max_tokens: 900,
          temperature: 0.2,
          system: GROUNDED_INSTRUCTIONS,
          messages: [{ role: "user", content: buildAnalysisPrompt(input) }],
        }
      );
      const text = data.content?.[0]?.text;
      const parsed = parseGroundedJSON(text ?? "");
      if (!parsed) return buildFactsOnlyAnalysis(this.name, false, input);
      return toAIAnalysisOutput(this.name, input, parsed);
    } catch {
      return buildFactsOnlyAnalysis(this.name, false, input);
    }
  }
}