export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIGenerateOptions {
  model: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface AIGenerateResult {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProvider {
  generate(options: AIGenerateOptions): Promise<AIGenerateResult>;
}
