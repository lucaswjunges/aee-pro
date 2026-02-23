import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { workspaceProjects } from "./workspace-projects";

export const workspaceFiles = sqliteTable(
  "workspace_files",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => workspaceProjects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").default(0),
    r2Key: text("r2_key").notNull(),
    isOutput: integer("is_output").default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [unique("unique_project_path").on(table.projectId, table.path)]
);
