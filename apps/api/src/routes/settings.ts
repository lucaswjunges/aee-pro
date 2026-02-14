import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { userSettings, users } from "@aee-pro/db/schema";
import { settingsUpdateSchema, profileUpdateSchema } from "@aee-pro/shared";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption";
import { verifyPassword, hashPassword } from "../lib/password";
import type { Env } from "../index";

type SettingsEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const settingsRoutes = new Hono<SettingsEnv>();

settingsRoutes.use("*", authMiddleware);

// GET /api/settings
settingsRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings) {
    return c.json({
      success: true,
      data: {
        aiProvider: null,
        aiApiKeyMasked: null,
        aiModel: null,
      },
    });
  }

  let aiApiKeyMasked: string | null = null;
  if (settings.aiApiKeyEncrypted) {
    try {
      const decrypted = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
      aiApiKeyMasked = maskApiKey(decrypted);
    } catch {
      aiApiKeyMasked = "****";
    }
  }

  return c.json({
    success: true,
    data: {
      aiProvider: settings.aiProvider,
      aiApiKeyMasked,
      aiModel: settings.aiModel,
    },
  });
});

// PUT /api/settings
settingsRoutes.put("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  let aiApiKeyEncrypted = existing?.aiApiKeyEncrypted ?? null;
  if (parsed.data.aiApiKey !== undefined) {
    if (parsed.data.aiApiKey) {
      aiApiKeyEncrypted = await encrypt(parsed.data.aiApiKey, c.env.SESSION_SECRET);
    } else {
      aiApiKeyEncrypted = null;
    }
  }

  if (existing) {
    await db
      .update(userSettings)
      .set({
        aiProvider: parsed.data.aiProvider !== undefined ? parsed.data.aiProvider : existing.aiProvider,
        aiApiKeyEncrypted,
        aiModel: parsed.data.aiModel !== undefined ? parsed.data.aiModel : existing.aiModel,
        updatedAt: now,
      })
      .where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({
      id: crypto.randomUUID(),
      userId,
      aiProvider: parsed.data.aiProvider ?? null,
      aiApiKeyEncrypted,
      aiModel: parsed.data.aiModel ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return c.json({ success: true });
});

// POST /api/settings/test-connection
settingsRoutes.post("/test-connection", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiProvider || !settings?.aiApiKeyEncrypted) {
    return c.json(
      { success: false, error: "Configure o provider e a chave de API primeiro" },
      400
    );
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, error: "Erro ao descriptografar a chave de API" }, 500);
  }

  const provider = settings.aiProvider;

  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`OpenAI: ${res.status}`);
    } else if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.aiModel || "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }],
        }),
      });
      if (!res.ok && res.status !== 400) throw new Error(`Anthropic: ${res.status}`);
    } else if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (!res.ok) throw new Error(`Gemini: ${res.status}`);
    } else if (provider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Groq: ${res.status}`);
    } else if (provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`DeepSeek: ${res.status}`);
    } else if (provider === "mistral") {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Mistral: ${res.status}`);
    } else if (provider === "cohere") {
      const res = await fetch("https://api.cohere.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Cohere: ${res.status}`);
    } else if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`OpenRouter: ${res.status}`);
    } else if (provider === "together") {
      const res = await fetch("https://api.together.xyz/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Together: ${res.status}`);
    }

    return c.json({ success: true, data: { message: "Conexão bem-sucedida!" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ success: false, error: `Falha na conexão: ${message}` }, 400);
  }
});

// PUT /api/profile
settingsRoutes.put("/profile", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  await db
    .update(users)
    .set({ ...parsed.data, updatedAt: now })
    .where(eq(users.id, userId));

  const updated = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!updated) {
    return c.json({ success: false, error: "Usuário não encontrado" }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});

// PUT /api/settings/password
settingsRoutes.put("/password", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json() as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!body.currentPassword?.trim()) {
    return c.json({ success: false, error: "Senha atual é obrigatória" }, 400);
  }

  if (!body.newPassword?.trim() || body.newPassword.trim().length < 6) {
    return c.json({ success: false, error: "Nova senha deve ter pelo menos 6 caracteres" }, 400);
  }

  const db = createDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();

  if (!user) {
    return c.json({ success: false, error: "Usuário não encontrado" }, 404);
  }

  const isValid = await verifyPassword(body.currentPassword, user.password);
  if (!isValid) {
    return c.json({ success: false, error: "Senha atual incorreta" }, 403);
  }

  const newHash = await hashPassword(body.newPassword.trim());
  const now = new Date().toISOString();

  await db
    .update(users)
    .set({ password: newHash, updatedAt: now })
    .where(eq(users.id, userId));

  return c.json({ success: true, data: { message: "Senha alterada com sucesso!" } });
});
