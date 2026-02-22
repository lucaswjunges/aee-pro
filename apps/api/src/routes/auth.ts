import { Hono } from "hono";
import { eq, and, gt } from "drizzle-orm";
import { users, sessions, passwordResetTokens } from "@aee-pro/db/schema";
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

// POST /api/auth/forgot-password
authRoutes.post("/forgot-password", async (c) => {
  const body = await c.req.json() as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email) {
    return c.json({ success: false, error: "E-mail é obrigatório" }, 400);
  }

  const db = createDb(c.env.DB);

  // Always return success to not reveal if e-mail exists
  const user = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email)).get();
  if (!user) {
    return c.json({ success: true });
  }

  // Delete any existing tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

  // Create new token (valid for 1 hour)
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const now = new Date().toISOString();

  await db.insert(passwordResetTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    token,
    expiresAt,
    createdAt: now,
  });

  const frontendUrl = c.env.FRONTEND_URL || "https://aee-pro-web.pages.dev";
  const resetUrl = `${frontendUrl}/redefinir-senha?token=${token}`;

  // Send e-mail via Resend
  if (c.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "AEE+ PRO <noreply@blumenauautomacao.com.br>",
        to: [email],
        subject: "Redefinição de senha — AEE+ PRO",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#4f46e5;margin-bottom:8px">AEE+ PRO</h2>
            <p>Olá, <strong>${user.name}</strong>!</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${resetUrl}"
                style="background:#4f46e5;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
                Redefinir Senha
              </a>
            </div>
            <p style="color:#6b7280;font-size:13px">Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail.</p>
            <p style="color:#6b7280;font-size:13px">Ou copie e cole o link abaixo no navegador:<br>
              <a href="${resetUrl}" style="color:#4f46e5;word-break:break-all">${resetUrl}</a>
            </p>
          </div>
        `,
      }),
    }).catch((err) => console.error("[forgot-password] Resend error:", err));
  }

  return c.json({ success: true });
});

// POST /api/auth/reset-password
authRoutes.post("/reset-password", async (c) => {
  const body = await c.req.json() as { token?: string; password?: string };

  if (!body.token?.trim() || !body.password?.trim()) {
    return c.json({ success: false, error: "Token e senha são obrigatórios" }, 400);
  }

  if (body.password.trim().length < 6) {
    return c.json({ success: false, error: "A senha deve ter pelo menos 6 caracteres" }, 400);
  }

  const db = createDb(c.env.DB);

  const record = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, body.token.trim()))
    .get();

  if (!record || record.expiresAt < Date.now()) {
    return c.json({ success: false, error: "Link inválido ou expirado. Solicite um novo." }, 400);
  }

  const hashed = await hashPassword(body.password.trim());
  const now = new Date().toISOString();

  await db.update(users).set({ password: hashed, updatedAt: now }).where(eq(users.id, record.userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, body.token.trim()));

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
