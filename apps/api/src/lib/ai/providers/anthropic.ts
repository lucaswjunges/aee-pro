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
      stream: true, // Always stream — Anthropic requires it for long requests
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

    // Parse SSE streaming response
    let text = "";
    let outputModel = options.model;
    let inputTokens = 0;
    let outputTokens = 0;

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const event = JSON.parse(data) as Record<string, unknown>;
          if (event.type === "message_start" && event.message) {
            const msg = event.message as Record<string, unknown>;
            if (msg.model) outputModel = msg.model as string;
            if (msg.usage) {
              inputTokens = (msg.usage as Record<string, number>).input_tokens ?? 0;
            }
          } else if (event.type === "content_block_delta") {
            const delta = event.delta as Record<string, unknown>;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              text += delta.text;
            }
          } else if (event.type === "message_delta") {
            outputTokens = ((event.usage as Record<string, number>) ?? {}).output_tokens ?? 0;
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    return {
      content: text,
      model: outputModel,
      usage:
        inputTokens > 0 || outputTokens > 0
          ? { inputTokens, outputTokens }
          : undefined,
    };
  }
}
