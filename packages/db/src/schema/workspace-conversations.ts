import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { workspaceProjects } from "./workspace-projects";

export const workspaceConversations = sqliteTable("workspace_conversations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => workspaceProjects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
