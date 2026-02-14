import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  promptTemplate: text("prompt_template").notNull(),
  requiredFields: text("required_fields"), // JSON array of field names
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(true),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
