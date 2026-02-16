/**
 * Known model-to-OpenRouter-ID mappings for models that need a vendor prefix.
 */
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  "mistral-large-latest": "mistralai/mistral-large",
  "mistral-medium-latest": "mistralai/mistral-medium",
  "mistral-small-latest": "mistralai/mistral-small",
  "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4-5",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "gpt-4.1": "openai/gpt-4.1",
  "gpt-4.1-mini": "openai/gpt-4.1-mini",
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gemini-2.5-flash": "google/gemini-2.5-flash-preview",
  "gemini-2.0-flash": "google/gemini-2.0-flash-001",
  "deepseek-chat": "deepseek/deepseek-chat",
  "command-r-plus": "cohere/command-r-plus",
  "llama-3.3-70b-versatile": "meta-llama/llama-3.3-70b-instruct",
};

/**
 * Normalize a model ID for the given provider.
 * OpenRouter requires "vendor/model" format — if the user configured
 * a bare model name (e.g. "mistral-large-latest"), map it automatically.
 */
export function normalizeModelForProvider(model: string, provider: string): string {
  if (provider !== "openrouter") return model;
  // Already has vendor prefix
  if (model.includes("/")) return model;
  // Look up in map
  return OPENROUTER_MODEL_MAP[model] || `openai/${model}`;
}

/**
 * Returns the strongest model for each provider — LaTeX generation
 * requires more capable models than plain text documents.
 */
export function getLatexModel(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-5-20250929";
    case "openai":
      return "gpt-4.1";
    case "gemini":
      return "gemini-2.5-flash";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "deepseek":
      return "deepseek-chat";
    case "mistral":
      return "mistral-large-latest";
    case "openrouter":
      return "openai/gpt-4.1-mini";
    case "together":
      return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    case "cohere":
      return "command-r-plus";
    default:
      return "gpt-4.1";
  }
}
