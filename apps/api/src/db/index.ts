import { drizzle } from "drizzle-orm/d1";
import * as schema from "@aee-pro/db/schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
