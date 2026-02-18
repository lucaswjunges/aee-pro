import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const userImages = sqliteTable("user_images", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  displayName: text("display_name").notNull(),
  category: text("category").notNull(), // "builtin" | "uploaded"
  r2Key: text("r2_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull(),
});
