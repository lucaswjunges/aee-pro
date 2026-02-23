import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { students } from "./students";

export const workspaceProjects = sqliteTable("workspace_projects", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: text("student_id").references(() => students.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
