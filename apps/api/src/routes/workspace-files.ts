import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { workspaceProjects, workspaceFiles } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type WsEnv = Env & { Variables: { userId: string } };

export const workspaceFileRoutes = new Hono<WsEnv>();
workspaceFileRoutes.use("*", authMiddleware);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------- GET /projects/:projectId/files — list files ----------

workspaceFileRoutes.get("/projects/:projectId/files", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const db = createDb(c.env.DB);

  // Verify project ownership
  const project = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.id, projectId),
        eq(workspaceProjects.userId, userId)
      )
    )
    .get();

  if (!project) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  const files = await db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, projectId))
    .orderBy(workspaceFiles.path);

  return c.json({ success: true, data: files });
});

// ---------- POST /projects/:projectId/files — upload file ----------

workspaceFileRoutes.post("/projects/:projectId/files", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const db = createDb(c.env.DB);

  // Verify project ownership
  const project = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.id, projectId),
        eq(workspaceProjects.userId, userId)
      )
    )
    .get();

  if (!project) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");
  const pathParam = formData.get("path")?.toString();

  if (!file || typeof file === "string") {
    return c.json({ success: false, error: "Arquivo não enviado" }, 400);
  }

  const uploadFile = file as unknown as File;

  if (uploadFile.size > MAX_FILE_SIZE) {
    return c.json(
      {
        success: false,
        error: `Arquivo muito grande (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB.`,
      },
      400
    );
  }

  const filePath = pathParam || uploadFile.name;
  const id = crypto.randomUUID();
  const r2Key = `workspace/${userId}/${projectId}/${filePath}`;
  const now = new Date().toISOString();

  const buffer = await uploadFile.arrayBuffer();
  await c.env.R2.put(r2Key, buffer, {
    httpMetadata: { contentType: uploadFile.type },
  });

  // Upsert: if file at same path exists, update it
  const existing = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, projectId),
        eq(workspaceFiles.path, filePath)
      )
    )
    .get();

  if (existing) {
    // Delete old R2 object if key changed
    if (existing.r2Key !== r2Key) {
      await c.env.R2.delete(existing.r2Key).catch(() => {});
    }
    await db
      .update(workspaceFiles)
      .set({
        mimeType: uploadFile.type,
        sizeBytes: uploadFile.size,
        r2Key,
        updatedAt: now,
      })
      .where(eq(workspaceFiles.id, existing.id));

    const updated = await db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.id, existing.id))
      .get();
    return c.json({ success: true, data: updated });
  }

  await db.insert(workspaceFiles).values({
    id,
    projectId,
    userId,
    path: filePath,
    mimeType: uploadFile.type,
    sizeBytes: uploadFile.size,
    r2Key,
    isOutput: 0,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.id, id))
    .get();

  return c.json({ success: true, data: created }, 201);
});

// ---------- POST /projects/:projectId/files/text — create text file ----------

workspaceFileRoutes.post("/projects/:projectId/files/text", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("projectId");
  const db = createDb(c.env.DB);

  const project = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.id, projectId),
        eq(workspaceProjects.userId, userId)
      )
    )
    .get();

  if (!project) {
    return c.json({ success: false, error: "Projeto não encontrado" }, 404);
  }

  const body = await c.req.json<{
    path: string;
    content: string;
    mimeType?: string;
    isOutput?: boolean;
  }>();

  if (!body.path?.trim()) {
    return c.json({ success: false, error: "Caminho é obrigatório" }, 400);
  }

  const filePath = body.path.trim();
  const content = body.content || "";
  const mimeType = body.mimeType || guessMimeType(filePath);
  const id = crypto.randomUUID();
  const r2Key = `workspace/${userId}/${projectId}/${filePath}`;
  const now = new Date().toISOString();
  const contentBytes = new TextEncoder().encode(content);

  await c.env.R2.put(r2Key, contentBytes, {
    httpMetadata: { contentType: mimeType },
  });

  // Upsert
  const existing = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, projectId),
        eq(workspaceFiles.path, filePath)
      )
    )
    .get();

  if (existing) {
    if (existing.r2Key !== r2Key) {
      await c.env.R2.delete(existing.r2Key).catch(() => {});
    }
    await db
      .update(workspaceFiles)
      .set({
        mimeType,
        sizeBytes: contentBytes.byteLength,
        r2Key,
        isOutput: body.isOutput ? 1 : 0,
        updatedAt: now,
      })
      .where(eq(workspaceFiles.id, existing.id));

    const updated = await db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.id, existing.id))
      .get();
    return c.json({ success: true, data: updated });
  }

  await db.insert(workspaceFiles).values({
    id,
    projectId,
    userId,
    path: filePath,
    mimeType,
    sizeBytes: contentBytes.byteLength,
    r2Key,
    isOutput: body.isOutput ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.id, id))
    .get();

  return c.json({ success: true, data: created }, 201);
});

// ---------- GET /files/:fileId — download file content ----------

workspaceFileRoutes.get("/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);

  const file = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.userId, userId))
    )
    .get();

  if (!file) {
    return c.json({ success: false, error: "Arquivo não encontrado" }, 404);
  }

  const object = await c.env.R2.get(file.r2Key);
  if (!object) {
    return c.json(
      { success: false, error: "Arquivo não encontrado no armazenamento" },
      404
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", file.mimeType);
  headers.set("Cache-Control", "private, max-age=3600");

  return new Response(object.body, { headers });
});

// ---------- GET /files/:fileId/text — read file as text ----------

workspaceFileRoutes.get("/files/:fileId/text", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);

  const file = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.userId, userId))
    )
    .get();

  if (!file) {
    return c.json({ success: false, error: "Arquivo não encontrado" }, 404);
  }

  const object = await c.env.R2.get(file.r2Key);
  if (!object) {
    return c.json(
      { success: false, error: "Arquivo não encontrado no armazenamento" },
      404
    );
  }

  const text = await object.text();
  return c.json({ success: true, data: { ...file, content: text } });
});

// ---------- GET /files/:fileId/export/docx — export as DOCX ----------

workspaceFileRoutes.get("/files/:fileId/export/docx", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);

  const file = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.userId, userId))
    )
    .get();

  if (!file) {
    return c.json({ success: false, error: "Arquivo não encontrado" }, 404);
  }

  const object = await c.env.R2.get(file.r2Key);
  if (!object) {
    return c.json({ success: false, error: "Conteúdo não encontrado" }, 404);
  }

  const content = await object.text();
  const fileName = file.path.split("/").pop()?.replace(/\.\w+$/, "") || "document";
  const isLatex = file.mimeType === "text/x-latex" || file.path.endsWith(".tex");

  let docxBytes: Uint8Array;

  if (isLatex) {
    // Use Fly.io pandoc conversion for LaTeX files
    let pandocOk = false;
    try {
      const convertRes = await fetch(`${c.env.LATEX_COMPILER_URL}/convert-docx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${c.env.LATEX_COMPILER_TOKEN}`,
        },
        body: JSON.stringify({ latex_source: content }),
      });

      if (convertRes.ok) {
        const result = (await convertRes.json()) as {
          success: boolean;
          docx_base64: string | null;
        };
        if (result.success && result.docx_base64) {
          docxBytes = Uint8Array.from(atob(result.docx_base64), (ch) => ch.charCodeAt(0));
          pandocOk = true;
        }
      }
    } catch {
      // Service unreachable — fall through to fallback
    }

    if (!pandocOk) {
      const { generateDocx, latexToText } = await import("../lib/export-docx");
      const textContent = latexToText(content);
      docxBytes = await generateDocx(fileName, textContent, "", new Date().toLocaleDateString("pt-BR"));
    }
  } else {
    // Use the docx library for text/markdown content
    const { generateDocx } = await import("../lib/export-docx");
    docxBytes = await generateDocx(fileName, content, "", new Date().toLocaleDateString("pt-BR"));
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  headers.set(
    "Content-Disposition",
    `attachment; filename="${fileName}.docx"`
  );

  return new Response(docxBytes, { headers });
});

// ---------- DELETE /files/:fileId — delete file ----------

workspaceFileRoutes.delete("/files/:fileId", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);

  const file = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.userId, userId))
    )
    .get();

  if (!file) {
    return c.json({ success: false, error: "Arquivo não encontrado" }, 404);
  }

  await c.env.R2.delete(file.r2Key).catch(() => {});
  await db.delete(workspaceFiles).where(eq(workspaceFiles.id, fileId));

  return c.json({ success: true });
});

// ---------- GET /student/:studentId/output-files — workspace PDFs for a student ----------

workspaceFileRoutes.get("/student/:studentId/output-files", async (c) => {
  const userId = c.get("userId");
  const studentId = c.req.param("studentId");
  const db = createDb(c.env.DB);

  // Find all workspace projects linked to this student
  const projects = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.userId, userId),
        eq(workspaceProjects.studentId, studentId)
      )
    );

  if (projects.length === 0) {
    return c.json({ success: true, data: [] });
  }

  // For each project, get output PDF files
  const allOutputFiles: Array<{
    id: string;
    projectId: string;
    projectName: string;
    path: string;
    mimeType: string;
    sizeBytes: number | null;
    r2Key: string;
    createdAt: string | null;
    updatedAt: string | null;
  }> = [];

  for (const project of projects) {
    const files = await db
      .select()
      .from(workspaceFiles)
      .where(
        and(
          eq(workspaceFiles.projectId, project.id),
          eq(workspaceFiles.userId, userId)
        )
      )
      .orderBy(desc(workspaceFiles.updatedAt));

    // Include PDFs (output files) from workspace
    const pdfFiles = files.filter(
      (f) =>
        f.mimeType === "application/pdf" ||
        f.path.endsWith(".pdf")
    );

    for (const f of pdfFiles) {
      allOutputFiles.push({
        id: f.id,
        projectId: project.id,
        projectName: project.name,
        path: f.path,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        r2Key: f.r2Key,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      });
    }
  }

  // Sort by date descending
  allOutputFiles.sort((a, b) => {
    const da = a.updatedAt || a.createdAt || "";
    const db2 = b.updatedAt || b.createdAt || "";
    return db2.localeCompare(da);
  });

  return c.json({ success: true, data: allOutputFiles });
});

// ---------- helpers ----------

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    tex: "text/x-latex",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    ts: "text/typescript",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    gif: "image/gif",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext || ""] || "application/octet-stream";
}
