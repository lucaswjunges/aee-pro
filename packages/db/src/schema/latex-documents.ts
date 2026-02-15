import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { students } from "./students";

export const latexDocuments = sqliteTable("latex_documents", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  title: text("title").notNull(),
  latexSource: text("latex_source"),
  pdfR2Key: text("pdf_r2_key"),
  pdfSizeBytes: integer("pdf_size_bytes"),
  status: text("status").notNull().default("generating"),
  // status: generating | compiling | completed | compile_error | error
  heatLevel: integer("heat_level").notNull().default(3),
  sizeLevel: integer("size_level").notNull().default(3),
  aiProvider: text("ai_provider"),
  aiModel: text("ai_model"),
  compilationAttempts: integer("compilation_attempts").default(0),
  lastCompilationError: text("last_compilation_error"),
  generatedAt: text("generated_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
