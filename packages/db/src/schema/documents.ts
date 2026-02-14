import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { students } from "./students";
import { prompts } from "./prompts";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  promptId: text("prompt_id")
    .references(() => prompts.id, { onDelete: "set null" }),
  documentType: text("document_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  status: text("status").notNull().default("generating"), // generating | completed | error
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),
  generatedAt: text("generated_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
