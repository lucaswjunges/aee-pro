export type AIProviderType = "groq" | "gemini" | "openai" | "anthropic" | "deepseek" | "mistral" | "cohere" | "openrouter" | "together";

export interface UserSettings {
  id: string;
  userId: string;
  aiProvider: AIProviderType | null;
  aiApiKeyMasked: string | null;
  aiModel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettingsUpdate {
  aiProvider?: AIProviderType | null;
  aiApiKey?: string | null;
  aiModel?: string | null;
}

export const AI_PROVIDERS: Record<AIProviderType, {
  name: string;
  defaultModel: string;
  models: string[];
  free?: boolean;
  apiKeyUrl: string;
  apiKeyHint: string;
}> = {
  groq: {
    name: "Groq (Gratuito)",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "llama-4-scout-17b-16e-instruct"],
    free: true,
    apiKeyUrl: "https://console.groq.com/keys",
    apiKeyHint: "Crie uma conta gratuita e gere uma API key em GroqCloud Console.",
  },
  gemini: {
    name: "Google Gemini (Gratuito)",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.5-flash-preview-05-20", "gemini-2.5-pro-preview-05-06", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
    free: true,
    apiKeyUrl: "https://aistudio.google.com/apikey",
    apiKeyHint: "Acesse o Google AI Studio e crie uma API key gratuitamente.",
  },
  deepseek: {
    name: "DeepSeek",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    apiKeyHint: "Crie uma conta e gere uma API key na plataforma DeepSeek. Preços muito acessíveis.",
  },
  openrouter: {
    name: "OpenRouter (Vários modelos)",
    defaultModel: "google/gemini-2.5-flash-preview-05-20",
    models: [
      "google/gemini-2.5-flash-preview-05-20",
      "google/gemini-2.5-pro-preview-05-06",
      "deepseek/deepseek-chat",
      "meta-llama/llama-4-scout",
      "anthropic/claude-sonnet-4",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1",
      "mistralai/mistral-large-latest",
    ],
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyHint: "Acesso a centenas de modelos com uma única chave. Alguns modelos são gratuitos.",
  },
  openai: {
    name: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano", "gpt-4o-mini", "gpt-4o", "o3-mini"],
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyHint: "Acesse o painel da OpenAI para criar uma API key.",
  },
  anthropic: {
    name: "Anthropic (Claude)",
    defaultModel: "claude-sonnet-4-5-20250929",
    models: ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001", "claude-opus-4-6-20250515", "claude-3-5-sonnet-20241022"],
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyHint: "Acesse o console da Anthropic para gerar sua API key.",
  },
  mistral: {
    name: "Mistral AI",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    apiKeyHint: "Crie uma conta na Mistral AI e gere uma API key no console.",
  },
  cohere: {
    name: "Cohere",
    defaultModel: "command-r-plus",
    models: ["command-r-plus", "command-r", "command-a-03-2025"],
    apiKeyUrl: "https://dashboard.cohere.com/api-keys",
    apiKeyHint: "Crie uma conta na Cohere e obtenha uma API key. Plano gratuito disponível para testes.",
  },
  together: {
    name: "Together AI",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Llama-4-Scout-17B-16E-Instruct",
      "deepseek-ai/DeepSeek-V3",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
    apiKeyUrl: "https://api.together.xyz/settings/api-keys",
    apiKeyHint: "Crie uma conta na Together AI. US$5 de crédito grátis ao registrar.",
  },
};
