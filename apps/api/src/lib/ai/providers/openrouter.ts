import type { AIProvider, AIGenerateOptions, AIGenerateResult } from "../types";

const FALLBACK_MODEL = "openai/gpt-4.1-mini";

export class OpenRouterProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const result = await this.callApi(options, options.model);

    // If the model ID is invalid, retry with a reliable fallback
    if (
      result.type === "error" &&
      result.status === 400 &&
      result.body.includes("not a valid model") &&
      options.model !== FALLBACK_MODEL
    ) {
      console.warn(
        `[OpenRouter] Model "${options.model}" invalid, retrying with "${FALLBACK_MODEL}"`,
      );
      const fallbackResult = await this.callApi(options, FALLBACK_MODEL);
      if (fallbackResult.type === "error") {
        throw new Error(
          `OpenRouter API error (${fallbackResult.status}): ${fallbackResult.body}`,
        );
      }
      return { ...fallbackResult.data, model: `${FALLBACK_MODEL} (fallback de ${options.model})` };
    }

    if (result.type === "error") {
      throw new Error(`OpenRouter API error (${result.status}): ${result.body}`);
    }

    return result.data;
  }

  private async callApi(
    options: AIGenerateOptions,
    model: string,
  ): Promise<
    | { type: "success"; data: AIGenerateResult }
    | { type: "error"; status: number; body: string }
  > {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aee-pro.pages.dev",
        "X-Title": "AEE+ PRO",
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 2000,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { type: "error", status: res.status, body: err };
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      type: "success",
      data: {
        content: data.choices[0]?.message?.content ?? "",
        model: data.model,
        usage: data.usage
          ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
          : undefined,
      },
    };
  }
}
