import { z } from "zod";

export const settingsUpdateSchema = z.object({
  aiProvider: z.enum(["openai", "anthropic", "gemini", "groq", "deepseek", "mistral", "cohere", "openrouter", "together"]).nullable().optional(),
  aiApiKey: z.string().nullable().optional(),
  aiModel: z.string().nullable().optional(),
  maxOutputTokens: z.number().int().min(1000).max(32000).nullable().optional(),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").optional(),
  email: z.string().email("E-mail inválido").optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
