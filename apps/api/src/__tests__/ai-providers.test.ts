import { describe, it, expect } from "vitest";
import { createAIProvider } from "../lib/ai/index";

describe("createAIProvider", () => {
  it("deve criar provider OpenAI", () => {
    const provider = createAIProvider("openai", "sk-test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider Anthropic", () => {
    const provider = createAIProvider("anthropic", "sk-ant-test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider Gemini", () => {
    const provider = createAIProvider("gemini", "AIza-test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider Groq", () => {
    const provider = createAIProvider("groq", "gsk_test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider DeepSeek", () => {
    const provider = createAIProvider("deepseek", "sk-test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider Mistral", () => {
    const provider = createAIProvider("mistral", "test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider Cohere", () => {
    const provider = createAIProvider("cohere", "test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider OpenRouter", () => {
    const provider = createAIProvider("openrouter", "sk-or-test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve criar provider Together", () => {
    const provider = createAIProvider("together", "test-key");
    expect(provider).toBeDefined();
    expect(provider.generate).toBeInstanceOf(Function);
  });

  it("deve lançar erro para provider inválido", () => {
    expect(() => createAIProvider("invalid-provider", "key")).toThrow(
      "Provider de IA não suportado: invalid-provider"
    );
  });

  it("deve lançar erro para provider vazio", () => {
    expect(() => createAIProvider("", "key")).toThrow(
      "Provider de IA não suportado: "
    );
  });
});
