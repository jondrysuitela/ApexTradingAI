import { env } from "@/server/env";
import type { AIAnalysisInput, AIAnalysisOutput, AIProvider } from "../types";
import { buildFactsOnlyAnalysis } from "./base";
import { buildAnalysisPrompt, GROUNDED_INSTRUCTIONS, parseGroundedJSON, postJSON, toAIAnalysisOutput } from "../generate";

const DEFAULT_MODEL = "gemini-2.0-flash";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export class GoogleAIProvider implements AIProvider {
  name = "google" as const;

  isConfigured() {
    return Boolean(env.GOOGLE_AI_API_KEY);
  }

  async analyzeMarket(input: AIAnalysisInput): Promise<AIAnalysisOutput> {
    if (!this.isConfigured()) return buildFactsOnlyAnalysis(this.name, false, input);
    try {
      const data = await postJSON<GeminiResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${env.GOOGLE_AI_API_KEY}`,
        { "Content-Type": "application/json" },
        {
          system_instruction: { parts: [{ text: GROUNDED_INSTRUCTIONS }] },
          contents: [{ role: "user", parts: [{ text: buildAnalysisPrompt(input) }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 900, temperature: 0.2 },
        }
      );
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = parseGroundedJSON(text ?? "");
      if (!parsed) return buildFactsOnlyAnalysis(this.name, false, input);
      return toAIAnalysisOutput(this.name, input, parsed);
    } catch {
      return buildFactsOnlyAnalysis(this.name, false, input);
    }
  }
}