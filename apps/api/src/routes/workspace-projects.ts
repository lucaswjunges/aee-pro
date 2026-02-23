import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import {
  workspaceProjects,
  workspaceFiles,
  workspaceConversations,
  latexDocuments,
} from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type WsEnv = Env & { Variables: { userId: string } };

export const workspaceProjectRoutes = new Hono<WsEnv>();
workspaceProjectRoutes.use("*", authMiddleware);

// ---------- GET / — list projects ----------

workspaceProjectRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const studentId = c.req.query("studentId");
  const db = createDb(c.env.DB);

  const conditions = [eq(workspaceProjects.userId, userId)];
  if (studentId) {
    conditions.push(eq(workspaceProjects.studentId, studentId));
  }

  const projects = await db
    .select()
    .from(workspaceProjects)
    .where(and(...conditions))
    .orderBy(workspaceProjects.updatedAt);

  return c.json({ success: true, data: projects });
});

// ---------- GET /:id — get project ----------

workspaceProjectRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const project = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(eq(workspaceProjects.id, id), eq(workspaceProjects.userId, userId))
    )
    .get();

  if (!project) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  // Fetch files for this project
  const files = await db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, id));

  // Fetch conversations
  const conversations = await db
    .select()
    .from(workspaceConversations)
    .where(eq(workspaceConversations.projectId, id))
    .orderBy(workspaceConversations.updatedAt);

  return c.json({
    success: true,
    data: { ...project, files, conversations },
  });
});

// ---------- POST / — create project ----------

workspaceProjectRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    name: string;
    description?: string;
    studentId?: string;
  }>();

  if (!body.name?.trim()) {
    return c.json({ success: false, error: "Nome é obrigatório" }, 400);
  }

  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(workspaceProjects).values({
    id,
    userId,
    studentId: body.studentId || null,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  // Create default conversation
  const convId = crypto.randomUUID();
  await db.insert(workspaceConversations).values({
    id: convId,
    projectId: id,
    userId,
    title: null,
    createdAt: now,
    updatedAt: now,
  });

  const project = await db
    .select()
    .from(workspaceProjects)
    .where(eq(workspaceProjects.id, id))
    .get();

  return c.json({ success: true, data: { ...project, conversationId: convId } }, 201);
});

// ---------- POST /import-latex — import LaTeX document into workspace ----------

workspaceProjectRoutes.post("/import-latex", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ latexDocumentId: string }>();

  if (!body.latexDocumentId) {
    return c.json({ success: false, error: "latexDocumentId é obrigatório" }, 400);
  }

  const db = createDb(c.env.DB);

  // Fetch the latex document (verify ownership)
  const doc = await db
    .select()
    .from(latexDocuments)
    .where(
      and(
        eq(latexDocuments.id, body.latexDocumentId),
        eq(latexDocuments.userId, userId)
      )
    )
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  if (!doc.latexSource) {
    return c.json({ success: false, error: "Documento sem código LaTeX" }, 400);
  }

  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();

  // 1. Create workspace project
  await db.insert(workspaceProjects).values({
    id: projectId,
    userId,
    studentId: doc.studentId,
    name: doc.title,
    description: `Importado de documento LaTeX: ${doc.documentType}`,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Upload LaTeX source to R2 and create file record
  const texR2Key = `workspace/${userId}/${projectId}/main.tex`;
  const texBytes = new TextEncoder().encode(doc.latexSource);
  await c.env.R2.put(texR2Key, texBytes, {
    httpMetadata: { contentType: "text/x-tex" },
  });

  const texFileId = crypto.randomUUID();
  await db.insert(workspaceFiles).values({
    id: texFileId,
    projectId,
    userId,
    path: "main.tex",
    mimeType: "text/x-tex",
    sizeBytes: texBytes.byteLength,
    r2Key: texR2Key,
    isOutput: 0,
    createdAt: now,
    updatedAt: now,
  });

  // 3. Copy PDF from R2 if it exists
  if (doc.pdfR2Key) {
    const pdfObject = await c.env.R2.get(doc.pdfR2Key);
    if (pdfObject) {
      const pdfR2Key = `workspace/${userId}/${projectId}/output/documento.pdf`;
      const pdfBody = await pdfObject.arrayBuffer();
      await c.env.R2.put(pdfR2Key, pdfBody, {
        httpMetadata: { contentType: "application/pdf" },
      });

      const pdfFileId = crypto.randomUUID();
      await db.insert(workspaceFiles).values({
        id: pdfFileId,
        projectId,
        userId,
        path: "output/documento.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBody.byteLength,
        r2Key: pdfR2Key,
        isOutput: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // 4. Create default conversation
  const conversationId = crypto.randomUUID();
  await db.insert(workspaceConversations).values({
    id: conversationId,
    projectId,
    userId,
    title: null,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    success: true,
    data: { projectId, conversationId },
  }, 201);
});

// ---------- PUT /:id — update project ----------

workspaceProjectRoutes.put("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    description?: string;
    studentId?: string | null;
  }>();
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(eq(workspaceProjects.id, id), eq(workspaceProjects.userId, userId))
    )
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  await db
    .update(workspaceProjects)
    .set({
      name: body.name?.trim() || existing.name,
      description:
        body.description !== undefined
          ? body.description?.trim() || null
          : existing.description,
      studentId:
        body.studentId !== undefined ? body.studentId : existing.studentId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaceProjects.id, id));

  const updated = await db
    .select()
    .from(workspaceProjects)
    .where(eq(workspaceProjects.id, id))
    .get();

  return c.json({ success: true, data: updated });
});

// ---------- DELETE /:id — delete project + all files ----------

workspaceProjectRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(eq(workspaceProjects.id, id), eq(workspaceProjects.userId, userId))
    )
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  // Delete all R2 files for this project
  const files = await db
    .select({ r2Key: workspaceFiles.r2Key })
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, id));

  for (const file of files) {
    await c.env.R2.delete(file.r2Key).catch(() => {});
  }

  // Cascade delete handles conversations, messages, files in D1
  await db
    .delete(workspaceProjects)
    .where(eq(workspaceProjects.id, id));

  return c.json({ success: true });
});
