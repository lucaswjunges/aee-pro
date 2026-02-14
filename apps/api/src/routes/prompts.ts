import { Hono } from "hono";
import { eq, and, or, isNull } from "drizzle-orm";
import { prompts } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";
import { PROMPTS } from "@aee-pro/db/seed";

type PromptEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const promptRoutes = new Hono<PromptEnv>();

// GET /api/prompts - list available prompts
// Built-in: WITHOUT template (IP protected)
// Custom (user's own): WITH template visible
promptRoutes.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  // Get all built-in prompts + user's custom prompts
  const result = await db
    .select()
    .from(prompts)
    .where(
      or(
        eq(prompts.isBuiltIn, true),
        eq(prompts.userId, userId)
      )
    )
    .orderBy(prompts.sortOrder);

  const data = result.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    requiredFields: p.requiredFields,
    isBuiltIn: p.isBuiltIn,
    sortOrder: p.sortOrder,
    promptTemplate: p.promptTemplate,
    userId: p.userId,
  }));

  return c.json({ success: true, data });
});

// POST /api/prompts - create custom prompt
promptRoutes.post("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json() as {
    name?: string;
    description?: string;
    category?: string;
    promptTemplate?: string;
    requiredFields?: string;
  };

  if (!body.name?.trim()) {
    return c.json({ success: false, error: "Nome é obrigatório" }, 400);
  }

  if (!body.promptTemplate?.trim()) {
    return c.json({ success: false, error: "Template do prompt é obrigatório" }, 400);
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const slug = `custom-${id.slice(0, 8)}`;

  // Get next sort order
  const allPrompts = await db.select({ sortOrder: prompts.sortOrder }).from(prompts);
  const maxSort = allPrompts.reduce((max, p) => Math.max(max, p.sortOrder), 0);

  await db.insert(prompts).values({
    id,
    slug,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    category: body.category?.trim() || "custom",
    promptTemplate: body.promptTemplate.trim(),
    requiredFields: body.requiredFields || JSON.stringify(["name"]),
    isBuiltIn: false,
    userId,
    sortOrder: maxSort + 1,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.select().from(prompts).where(eq(prompts.id, id)).get();
  return c.json({ success: true, data: created }, 201);
});

// PUT /api/prompts/:id - edit prompt (built-in: only template; custom: all fields)
promptRoutes.put("/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json() as {
    name?: string;
    description?: string;
    category?: string;
    promptTemplate?: string;
    requiredFields?: string;
  };

  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(prompts)
    .where(eq(prompts.id, id))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Prompt não encontrado" }, 404);
  }

  if (!existing.isBuiltIn && existing.userId !== userId) {
    return c.json({ success: false, error: "Sem permissão para editar este prompt" }, 403);
  }

  const now = new Date().toISOString();
  const updates: Record<string, string | null> = { updatedAt: now };

  if (existing.isBuiltIn) {
    // Built-in: only allow editing the template
    if (body.promptTemplate !== undefined) updates.promptTemplate = body.promptTemplate.trim();
  } else {
    // Custom: allow editing all fields
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.category !== undefined) updates.category = body.category?.trim() || null;
    if (body.promptTemplate !== undefined) updates.promptTemplate = body.promptTemplate.trim();
    if (body.requiredFields !== undefined) updates.requiredFields = body.requiredFields;
  }

  await db.update(prompts).set(updates).where(eq(prompts.id, id));

  const updated = await db.select().from(prompts).where(eq(prompts.id, id)).get();
  return c.json({ success: true, data: updated });
});

// POST /api/prompts/:id/reset - restore built-in prompt to original template
promptRoutes.post("/:id/reset", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(prompts)
    .where(eq(prompts.id, id))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Prompt não encontrado" }, 404);
  }

  if (!existing.isBuiltIn) {
    return c.json({ success: false, error: "Apenas prompts built-in podem ser restaurados" }, 400);
  }

  // Find original from seed data
  const original = PROMPTS.find((p) => p.slug === existing.slug);
  if (!original) {
    return c.json({ success: false, error: "Template original não encontrado" }, 404);
  }

  const now = new Date().toISOString();
  await db
    .update(prompts)
    .set({ promptTemplate: original.promptTemplate, updatedAt: now })
    .where(eq(prompts.id, id));

  const updated = await db.select().from(prompts).where(eq(prompts.id, id)).get();
  return c.json({ success: true, data: updated });
});

// DELETE /api/prompts/:id - delete custom prompt (only owner, not built-in)
promptRoutes.delete("/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(prompts)
    .where(eq(prompts.id, id))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Prompt não encontrado" }, 404);
  }

  if (existing.isBuiltIn) {
    return c.json({ success: false, error: "Prompts built-in não podem ser excluídos" }, 403);
  }

  if (existing.userId !== userId) {
    return c.json({ success: false, error: "Sem permissão para excluir este prompt" }, 403);
  }

  await db.delete(prompts).where(eq(prompts.id, id));
  return c.json({ success: true });
});

// POST /api/prompts/seed - seed built-in prompts (idempotent)
promptRoutes.post("/seed", async (c) => {
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  for (const prompt of PROMPTS) {
    const existing = await db
      .select()
      .from(prompts)
      .where(eq(prompts.slug, prompt.slug))
      .get();

    if (!existing) {
      await db.insert(prompts).values({
        ...prompt,
        isBuiltIn: true,
        userId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return c.json({ success: true, data: { seeded: PROMPTS.length } });
});
