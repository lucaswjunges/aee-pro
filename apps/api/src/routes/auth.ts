import { Hono } from "hono";
import { eq, and, gt } from "drizzle-orm";
import { users, sessions } from "@aee-pro/db/schema";
import { loginSchema, registerSchema } from "@aee-pro/shared";
import { createDb } from "../db/index";
import { hashPassword, verifyPassword } from "../lib/password";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type AuthEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const { name, email, password } = parsed.data;
  const db = createDb(c.env.DB);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (existing) {
    return c.json({ success: false, error: "E-mail já cadastrado" }, 409);
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const hashedPassword = await hashPassword(password);

  await db.insert(users).values({
    id: userId,
    name,
    email,
    password: hashedPassword,
    createdAt: now,
    updatedAt: now,
  });

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt,
    createdAt: now,
  });

  return c.json(
    {
      success: true,
      data: {
        user: { id: userId, name, email, createdAt: now, updatedAt: now },
        token,
      },
    },
    201
  );
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const { email, password } = parsed.data;
  const db = createDb(c.env.DB);

  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!user || !(await verifyPassword(password, user.password))) {
    return c.json({ success: false, error: "E-mail ou senha incorretos" }, 401);
  }

  const now = new Date().toISOString();
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    token,
    expiresAt,
    createdAt: now,
  });

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    },
  });
});

authRoutes.post("/logout", authMiddleware, async (c) => {
  const token = c.req.header("Authorization")!.slice(7);
  const db = createDb(c.env.DB);
  await db.delete(sessions).where(eq(sessions.token, token));
  return c.json({ success: true });
});

authRoutes.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  const user = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) {
    return c.json({ success: false, error: "Usuário não encontrado" }, 404);
  }

  return c.json({ success: true, data: user });
});
