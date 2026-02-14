import type { AIProvider, AIGenerateOptions, AIGenerateResult } from "../types";

export class CohereProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(options: AIGenerateOptions): Promise<AIGenerateResult> {
    // Convert messages to Cohere format
    const systemMsg = options.messages.find((m) => m.role === "system");
    const chatMessages = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "CHATBOT" as const : "USER" as const, message: m.content }));

    const res = await fetch("https://api.cohere.com/v1/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        message: chatMessages[chatMessages.length - 1]?.message ?? "",
        chat_history: chatMessages.slice(0, -1),
        preamble: systemMsg?.content,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cohere API error (${res.status}): ${err}`);
    }

    const data = await res.json() as {
      text: string;
      meta?: { tokens?: { input_tokens: number; output_tokens: number } };
    };

    return {
      content: data.text ?? "",
      model: options.model,
      usage: data.meta?.tokens
        ? { inputTokens: data.meta.tokens.input_tokens, outputTokens: data.meta.tokens.output_tokens }
        : undefined,
    };
  }
}
