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
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    free: true,
    apiKeyUrl: "https://console.groq.com/keys",
    apiKeyHint: "Crie uma conta gratuita e gere uma API key em GroqCloud Console.",
  },
  gemini: {
    name: "Google Gemini (Gratuito)",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
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
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    models: [
      "meta-llama/llama-3.3-70b-instruct",
      "google/gemini-2.0-flash-001",
      "deepseek/deepseek-chat",
      "mistralai/mistral-large-latest",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o-mini",
    ],
    apiKeyUrl: "https://openrouter.ai/keys",
    apiKeyHint: "Acesso a centenas de modelos com uma única chave. Alguns modelos são gratuitos.",
  },
  openai: {
    name: "OpenAI",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyHint: "Acesse o painel da OpenAI para criar uma API key.",
  },
  anthropic: {
    name: "Anthropic (Claude)",
    defaultModel: "claude-3-haiku-20240307",
    models: ["claude-3-haiku-20240307", "claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
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
    defaultModel: "command-r",
    models: ["command-r", "command-r-plus", "command-light"],
    apiKeyUrl: "https://dashboard.cohere.com/api-keys",
    apiKeyHint: "Crie uma conta na Cohere e obtenha uma API key. Plano gratuito disponível para testes.",
  },
  together: {
    name: "Together AI",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "meta-llama/Llama-3.1-8B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "deepseek-ai/DeepSeek-V3",
    ],
    apiKeyUrl: "https://api.together.xyz/settings/api-keys",
    apiKeyHint: "Crie uma conta na Together AI. US$5 de crédito grátis ao registrar.",
  },
};
