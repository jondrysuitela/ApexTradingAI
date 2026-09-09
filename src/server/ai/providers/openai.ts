import { env } from "@/server/env";
import type { AIAnalysisInput, AIAnalysisOutput, AIProvider } from "../types";
import { buildFactsOnlyAnalysis } from "./base";
import { buildAnalysisPrompt, GROUNDED_INSTRUCTIONS, parseGroundedJSON, postJSON, toAIAnalysisOutput } from "../generate";

const DEFAULT_MODEL = "gpt-4o-mini";

type ChatCompletion = {
  choices?: Array<{ message?: { content?: string } }>;
};

export class OpenAIProvider implements AIProvider {
  name = "openai" as const;

  isConfigured() {
    return Boolean(env.OPENAI_API_KEY);
  }

  async analyzeMarket(input: AIAnalysisInput): Promise<AIAnalysisOutput> {
    if (!this.isConfigured()) return buildFactsOnlyAnalysis(this.name, false, input);
    try {
      const data = await postJSON<ChatCompletion>(
        "https://api.openai.com/v1/chat/completions",
        { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        {
          model: DEFAULT_MODEL,
          temperature: 0.2,
          max_tokens: 900,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: GROUNDED_INSTRUCTIONS },
            { role: "user", content: buildAnalysisPrompt(input) },
          ],
        }
      );
      const text = data.choices?.[0]?.message?.content;
      const parsed = parseGroundedJSON(text ?? "");
      if (!parsed) return buildFactsOnlyAnalysis(this.name, false, input);
      return toAIAnalysisOutput(this.name, input, parsed);
    } catch {
      return buildFactsOnlyAnalysis(this.name, false, input);
    }
  }
}