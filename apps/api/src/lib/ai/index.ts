import type { AIProvider } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { GroqProvider } from "./providers/groq";
import { DeepSeekProvider } from "./providers/deepseek";
import { MistralProvider } from "./providers/mistral";
import { CohereProvider } from "./providers/cohere";
import { OpenRouterProvider } from "./providers/openrouter";
import { TogetherProvider } from "./providers/together";

export type { AIProvider, AIMessage, AIGenerateOptions, AIGenerateResult } from "./types";

export function createAIProvider(type: string, apiKey: string): AIProvider {
  switch (type) {
    case "openai":
      return new OpenAIProvider(apiKey);
    case "anthropic":
      return new AnthropicProvider(apiKey);
    case "gemini":
      return new GeminiProvider(apiKey);
    case "groq":
      return new GroqProvider(apiKey);
    case "deepseek":
      return new DeepSeekProvider(apiKey);
    case "mistral":
      return new MistralProvider(apiKey);
    case "cohere":
      return new CohereProvider(apiKey);
    case "openrouter":
      return new OpenRouterProvider(apiKey);
    case "together":
      return new TogetherProvider(apiKey);
    default:
      throw new Error(`Provider de IA não suportado: ${type}`);
  }
}
