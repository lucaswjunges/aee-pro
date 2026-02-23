import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { workspaceConversations } from "./workspace-conversations";

export const workspaceMessages = sqliteTable("workspace_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => workspaceConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  tokenCount: integer("token_count"),
  createdAt: text("created_at").notNull(),
});
