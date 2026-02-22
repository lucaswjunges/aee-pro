import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { aeeSessions } from "@aee-pro/db/schema";
import { aeeSessionSchema, aeeSessionUpdateSchema } from "@aee-pro/shared";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type SessionEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const aeeSessionRoutes = new Hono<SessionEnv>();

aeeSessionRoutes.use("*", authMiddleware);

// List sessions (optionally filtered by studentId)
aeeSessionRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const studentId = c.req.query("studentId");
  const db = createDb(c.env.DB);

  const conditions = [eq(aeeSessions.userId, userId)];
  if (studentId) {
    conditions.push(eq(aeeSessions.studentId, studentId));
  }

  const result = await db
    .select()
    .from(aeeSessions)
    .where(and(...conditions))
    .orderBy(desc(aeeSessions.sessionDate));

  return c.json({ success: true, data: result });
});

// Get single session
aeeSessionRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const session = await db
    .select()
    .from(aeeSessions)
    .where(and(eq(aeeSessions.id, id), eq(aeeSessions.userId, userId)))
    .get();

  if (!session) {
    return c.json({ success: false, error: "Sessão não encontrada" }, 404);
  }

  return c.json({ success: true, data: session });
});

// Create session
aeeSessionRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = aeeSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const data = {
    id,
    userId,
    studentId: parsed.data.studentId,
    sessionDate: parsed.data.sessionDate,
    startTime: parsed.data.startTime ?? null,
    endTime: parsed.data.endTime ?? null,
    present: parsed.data.present ?? 1,
    sessionType: parsed.data.sessionType ?? "individual",
    objectives: parsed.data.objectives ?? null,
    activitiesPerformed: parsed.data.activitiesPerformed ?? null,
    studentResponse: parsed.data.studentResponse ?? null,
    observations: parsed.data.observations ?? null,
    nextSteps: parsed.data.nextSteps ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(aeeSessions).values(data);

  return c.json({ success: true, data }, 201);
});

// Update session
aeeSessionRoutes.put("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();

  const parsed = aeeSessionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos" },
      400
    );
  }

  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(aeeSessions)
    .where(and(eq(aeeSessions.id, id), eq(aeeSessions.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Sessão não encontrada" }, 404);
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updateData[key] = value ?? null;
    }
  }

  await db
    .update(aeeSessions)
    .set(updateData as Partial<typeof aeeSessions.$inferInsert>)
    .where(and(eq(aeeSessions.id, id), eq(aeeSessions.userId, userId)));

  const updated = await db
    .select()
    .from(aeeSessions)
    .where(eq(aeeSessions.id, id))
    .get();

  return c.json({ success: true, data: updated });
});

// Delete session
aeeSessionRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(aeeSessions)
    .where(and(eq(aeeSessions.id, id), eq(aeeSessions.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Sessão não encontrada" }, 404);
  }

  await db
    .delete(aeeSessions)
    .where(and(eq(aeeSessions.id, id), eq(aeeSessions.userId, userId)));

  return c.json({ success: true });
});
