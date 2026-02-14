import type { AIProvider, AIGenerateOptions, AIGenerateResult } from "../types";

export class AnthropicProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const systemMsg = options.messages.find((m) => m.role === "system");
    const userMessages = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 2000,
      temperature: options.temperature ?? 0.7,
      messages: userMessages,
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err}`);
    }

    const data = await res.json() as {
      content: { type: string; text: string }[];
      model: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      content: text,
      model: data.model,
      usage: data.usage
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
        : undefined,
    };
  }
}
