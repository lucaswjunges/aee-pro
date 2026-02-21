import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider"), // openai | anthropic | gemini
  aiApiKeyEncrypted: text("ai_api_key_encrypted"),
  aiModel: text("ai_model"),
  maxOutputTokens: integer("max_output_tokens"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
