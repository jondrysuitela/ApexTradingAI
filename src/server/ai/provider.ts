import { env } from "@/server/env";
import type { AIProvider } from "./types";
import { AnthropicProvider } from "./providers/anthropic";
import { GoogleAIProvider } from "./providers/google";
import { OpenAIProvider } from "./providers/openai";

export function getAIProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "google":
      return new GoogleAIProvider();
    default:
      return new OpenAIProvider();
  }
}
