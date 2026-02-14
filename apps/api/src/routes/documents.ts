import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { documents, students, prompts, userSettings } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { decrypt } from "../lib/encryption";
import { createAIProvider } from "../lib/ai/index";
import { renderPrompt } from "../lib/prompt-engine";
import { generateDocx } from "../lib/export-docx";
import type { Env } from "../index";

type DocEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const documentRoutes = new Hono<DocEnv>();

documentRoutes.use("*", authMiddleware);

// POST /api/documents/generate
documentRoutes.post("/generate", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json() as { studentId: string; promptSlug: string };

  if (!body.studentId || !body.promptSlug) {
    return c.json({ success: false, error: "studentId e promptSlug são obrigatórios" }, 400);
  }

  const db = createDb(c.env.DB);

  // 1. Fetch student (verify ownership)
  const student = await db
    .select()
    .from(students)
    .where(and(eq(students.id, body.studentId), eq(students.userId, userId)))
    .get();

  if (!student) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  // 2. Fetch prompt template
  const prompt = await db
    .select()
    .from(prompts)
    .where(eq(prompts.slug, body.promptSlug))
    .get();

  if (!prompt) {
    return c.json({ success: false, error: "Tipo de documento não encontrado" }, 404);
  }

  // 3. Fetch user settings (provider + API key)
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiProvider || !settings?.aiApiKeyEncrypted) {
    return c.json(
      { success: false, error: "Configure o provider de IA nas configurações antes de gerar documentos" },
      400
    );
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, error: "Erro ao descriptografar a chave de API" }, 500);
  }

  // 4. Render prompt with student data + computed fields
  const today = new Date();
  const dataAtual = today.toLocaleDateString("pt-BR");
  let idade: string | null = null;
  if (student.dateOfBirth) {
    const parts = String(student.dateOfBirth).split(/[-/]/);
    let birth: Date | null = null;
    if (parts.length === 3) {
      // dd/mm/yyyy or yyyy-mm-dd
      birth = parts[0].length === 4
        ? new Date(+parts[0], +parts[1] - 1, +parts[2])
        : new Date(+parts[2], +parts[1] - 1, +parts[0]);
    }
    if (birth && !isNaN(birth.getTime())) {
      let years = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        years--;
      }
      idade = `${years} anos`;
    }
  }
  const studentData: Record<string, string | null> = {
    ...(student as Record<string, string | null>),
    dataAtual,
    idade,
  };
  const renderedPrompt = renderPrompt(prompt.promptTemplate, studentData);

  // 5. Create document record (status: generating)
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const model = settings.aiModel || getDefaultModel(settings.aiProvider);

  await db.insert(documents).values({
    id: docId,
    userId,
    studentId: body.studentId,
    promptId: prompt.id,
    documentType: prompt.slug,
    title: `${prompt.name} - ${student.name}`,
    content: null,
    status: "generating",
    aiProvider: settings.aiProvider,
    aiModel: model,
    generatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  // 6. Call AI provider
  try {
    const provider = createAIProvider(settings.aiProvider, apiKey);
    const result = await provider.generate({
      model,
      messages: [
        {
          role: "system",
          content: `Você é um professor especialista em Atendimento Educacional Especializado (AEE). Gere documentos profissionais, claros e funcionais em português brasileiro. A data de hoje é ${new Date().toLocaleDateString("pt-BR")}.`,
        },
        {
          role: "user",
          content: renderedPrompt,
        },
      ],
      maxTokens: 2000,
      temperature: 0.7,
    });

    // 7. Update document with generated content
    const generatedAt = new Date().toISOString();
    await db
      .update(documents)
      .set({
        content: result.content,
        status: "completed",
        generatedAt,
        updatedAt: generatedAt,
      })
      .where(eq(documents.id, docId));

    const doc = await db.select().from(documents).where(eq(documents.id, docId)).get();
    return c.json({ success: true, data: doc }, 201);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido na geração";
    await db
      .update(documents)
      .set({ status: "error", content: errorMsg, updatedAt: new Date().toISOString() })
      .where(eq(documents.id, docId));

    return c.json({ success: false, error: `Erro na geração: ${errorMsg}` }, 500);
  }
});

// GET /api/documents?studentId=x
documentRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const studentId = c.req.query("studentId");
  const db = createDb(c.env.DB);

  let query = db
    .select()
    .from(documents)
    .where(
      studentId
        ? and(eq(documents.userId, userId), eq(documents.studentId, studentId))
        : eq(documents.userId, userId)
    )
    .orderBy(desc(documents.createdAt));

  const result = await query;
  return c.json({ success: true, data: result });
});

// GET /api/documents/:id
documentRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  return c.json({ success: true, data: doc });
});

// PUT /api/documents/:id
documentRoutes.put("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json() as { content?: string; title?: string };
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  const now = new Date().toISOString();
  const updates: Record<string, string> = { updatedAt: now };
  if (body.content !== undefined) updates.content = body.content;
  if (body.title !== undefined) updates.title = body.title;

  await db.update(documents).set(updates).where(eq(documents.id, id));

  const updated = await db.select().from(documents).where(eq(documents.id, id)).get();
  return c.json({ success: true, data: updated });
});

// DELETE /api/documents/:id
documentRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  await db.delete(documents).where(eq(documents.id, id));
  return c.json({ success: true });
});

// POST /api/documents/:id/regenerate
documentRoutes.post("/:id/regenerate", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  if (!doc.promptId) {
    return c.json({ success: false, error: "Documento sem prompt associado, não é possível regenerar" }, 400);
  }

  // Get the prompt slug from the original prompt
  const prompt = await db.select().from(prompts).where(eq(prompts.id, doc.promptId)).get();
  if (!prompt) {
    return c.json({ success: false, error: "Prompt original não encontrado" }, 404);
  }

  // Delete old document and generate new one
  await db.delete(documents).where(eq(documents.id, id));

  // Forward to generate
  const generateUrl = new URL(c.req.url);
  generateUrl.pathname = "/api/documents/generate";

  // Reuse the generate logic by calling it internally
  const student = await db
    .select()
    .from(students)
    .where(and(eq(students.id, doc.studentId), eq(students.userId, userId)))
    .get();

  if (!student) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiProvider || !settings?.aiApiKeyEncrypted) {
    return c.json({ success: false, error: "Configure o provider de IA nas configurações" }, 400);
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, error: "Erro ao descriptografar a chave de API" }, 500);
  }

  const regenToday = new Date();
  let regenIdade: string | null = null;
  if (student.dateOfBirth) {
    const parts = String(student.dateOfBirth).split(/[-/]/);
    let birth: Date | null = null;
    if (parts.length === 3) {
      birth = parts[0].length === 4
        ? new Date(+parts[0], +parts[1] - 1, +parts[2])
        : new Date(+parts[2], +parts[1] - 1, +parts[0]);
    }
    if (birth && !isNaN(birth.getTime())) {
      let years = regenToday.getFullYear() - birth.getFullYear();
      const md = regenToday.getMonth() - birth.getMonth();
      if (md < 0 || (md === 0 && regenToday.getDate() < birth.getDate())) years--;
      regenIdade = `${years} anos`;
    }
  }
  const studentData: Record<string, string | null> = {
    ...(student as Record<string, string | null>),
    dataAtual: regenToday.toLocaleDateString("pt-BR"),
    idade: regenIdade,
  };
  const renderedPrompt = renderPrompt(prompt.promptTemplate, studentData);

  const now = new Date().toISOString();
  const newDocId = crypto.randomUUID();
  const model = settings.aiModel || getDefaultModel(settings.aiProvider);

  await db.insert(documents).values({
    id: newDocId,
    userId,
    studentId: doc.studentId,
    promptId: prompt.id,
    documentType: prompt.slug,
    title: `${prompt.name} - ${student.name}`,
    content: null,
    status: "generating",
    aiProvider: settings.aiProvider,
    aiModel: model,
    generatedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const provider = createAIProvider(settings.aiProvider, apiKey);
    const result = await provider.generate({
      model,
      messages: [
        {
          role: "system",
          content: `Você é um professor especialista em Atendimento Educacional Especializado (AEE). Gere documentos profissionais, claros e funcionais em português brasileiro. A data de hoje é ${new Date().toLocaleDateString("pt-BR")}.`,
        },
        { role: "user", content: renderedPrompt },
      ],
      maxTokens: 2000,
      temperature: 0.7,
    });

    const generatedAt = new Date().toISOString();
    await db
      .update(documents)
      .set({ content: result.content, status: "completed", generatedAt, updatedAt: generatedAt })
      .where(eq(documents.id, newDocId));

    const newDoc = await db.select().from(documents).where(eq(documents.id, newDocId)).get();
    return c.json({ success: true, data: newDoc }, 201);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    await db
      .update(documents)
      .set({ status: "error", content: errorMsg, updatedAt: new Date().toISOString() })
      .where(eq(documents.id, newDocId));
    return c.json({ success: false, error: `Erro na regeneração: ${errorMsg}` }, 500);
  }
});

// POST /api/documents/:id/edit-ai
documentRoutes.post("/:id/edit-ai", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json() as { instruction: string };

  if (!body.instruction?.trim()) {
    return c.json({ success: false, error: "Instrução é obrigatória" }, 400);
  }

  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  if (doc.status !== "completed" || !doc.content) {
    return c.json({ success: false, error: "Documento precisa estar concluído para editar" }, 400);
  }

  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiProvider || !settings?.aiApiKeyEncrypted) {
    return c.json({ success: false, error: "Configure o provider de IA nas configurações" }, 400);
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, error: "Erro ao descriptografar a chave de API" }, 500);
  }

  const model = settings.aiModel || getDefaultModel(settings.aiProvider);

  try {
    const provider = createAIProvider(settings.aiProvider, apiKey);
    const result = await provider.generate({
      model,
      messages: [
        {
          role: "system",
          content: "Você é um professor especialista em AEE. O usuário vai enviar uma instrução de edição e um documento entre tags XML. Aplique a instrução ao documento e retorne SOMENTE o documento editado. Não inclua as tags XML, a instrução, nem qualquer explicação na resposta — apenas o texto do documento editado.",
        },
        {
          role: "user",
          content: `<instrucao>${body.instruction}</instrucao>\n\n<documento>\n${doc.content}\n</documento>`,
        },
      ],
      maxTokens: 2000,
      temperature: 0.7,
    });

    const now = new Date().toISOString();
    await db
      .update(documents)
      .set({ content: result.content, updatedAt: now })
      .where(eq(documents.id, id));

    const updated = await db.select().from(documents).where(eq(documents.id, id)).get();
    return c.json({ success: true, data: updated });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ success: false, error: `Erro na edição: ${errorMsg}` }, 500);
  }
});

// GET /api/documents/:id/export/docx
documentRoutes.get("/:id/export/docx", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  if (doc.status !== "completed" || !doc.content) {
    return c.json({ success: false, error: "Documento ainda não foi gerado" }, 400);
  }

  const date = doc.generatedAt
    ? new Date(doc.generatedAt).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  // Get student name
  const student = await db
    .select({ name: students.name })
    .from(students)
    .where(eq(students.id, doc.studentId))
    .get();

  const studentName = student?.name ?? "Aluno";

  const buffer = await generateDocx(doc.title, doc.content, studentName, date);

  const filename = `${doc.title.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").replace(/\s+/g, "_")}.docx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "openai": return "gpt-4.1-mini";
    case "anthropic": return "claude-sonnet-4-5-20250929";
    case "gemini": return "gemini-2.0-flash";
    case "groq": return "llama-3.3-70b-versatile";
    case "deepseek": return "deepseek-chat";
    case "mistral": return "mistral-small-latest";
    case "cohere": return "command-r-plus";
    case "openrouter": return "google/gemini-2.5-flash-preview-05-20";
    case "together": return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    default: return "gpt-4.1-mini";
  }
}
