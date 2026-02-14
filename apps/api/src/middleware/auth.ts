import { createMiddleware } from "hono/factory";
import { eq, and, gt } from "drizzle-orm";
import { sessions, users } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import type { Env } from "../index";

type AuthEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Não autorizado" }, 401);
  }

  const token = header.slice(7);
  const db = createDb(c.env.DB);

  const now = Date.now();
  const result = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .get();

  if (!result) {
    return c.json({ success: false, error: "Sessão inválida ou expirada" }, 401);
  }

  c.set("userId", result.userId);
  await next();
});
