import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { workspaceFiles } from "./workspace-files";

export const workspaceFileVersions = sqliteTable("workspace_file_versions", {
  id: text("id").primaryKey(),
  fileId: text("file_id")
    .notNull()
    .references(() => workspaceFiles.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  r2Key: text("r2_key").notNull(),
  sizeBytes: integer("size_bytes").default(0),
  createdAt: text("created_at").notNull(),
});
