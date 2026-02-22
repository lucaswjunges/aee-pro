import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { students } from "./students";

export const aeeSessions = sqliteTable("aee_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  sessionDate: text("session_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  present: integer("present").notNull().default(1),
  sessionType: text("session_type").notNull().default("individual"),
  objectives: text("objectives"),
  activitiesPerformed: text("activities_performed"),
  studentResponse: text("student_response"),
  observations: text("observations"),
  nextSteps: text("next_steps"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
