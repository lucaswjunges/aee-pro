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
      return "anthropic/claude-sonnet-4-5-20250929";
    case "together":
      return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    case "cohere":
      return "command-r-plus";
    default:
      return "gpt-4.1";
  }
}
