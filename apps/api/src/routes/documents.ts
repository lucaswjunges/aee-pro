import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { documents, students, prompts, userSettings, latexDocuments } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { decrypt } from "../lib/encryption";
import { createAIProvider } from "../lib/ai/index";
import { renderPrompt } from "../lib/prompt-engine";
import { generateDocx } from "../lib/export-docx";
import { getLatexPreamble } from "../lib/latex/preamble";
import { compileLatex } from "../lib/latex/compiler-client";
import { compileWithAutoFix } from "../lib/latex/auto-fix";
import { sanitizeLatexSource } from "../lib/latex/sanitizer";
import { getLatexModel } from "../lib/latex/model-selection";
import { LATEX_DOCUMENT_TYPES } from "@aee-pro/shared";
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

// GET /api/documents/:id/export/pdf
documentRoutes.get("/:id/export/pdf", async (c) => {
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

  const student = await db
    .select({ name: students.name })
    .from(students)
    .where(eq(students.id, doc.studentId))
    .get();

  const studentName = student?.name ?? "Aluno";
  const date = doc.generatedAt
    ? new Date(doc.generatedAt).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  const fullLatex = buildSimplePdfLatex(doc.title, doc.content, studentName, date);
  const result = await compileLatex(fullLatex, c.env.LATEX_COMPILER_URL, c.env.LATEX_COMPILER_TOKEN);

  if (!result.success || !result.pdfBase64) {
    return c.json({ success: false, error: `Erro ao compilar PDF: ${result.error}` }, 500);
  }

  const pdfBuffer = Uint8Array.from(atob(result.pdfBase64), (ch) => ch.charCodeAt(0));
  const safeFilename = doc.title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_") || "documento";
  const utf8Filename = encodeURIComponent(doc.title.replace(/\s+/g, "_")) + ".pdf";

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename}.pdf"; filename*=UTF-8''${utf8Filename}`,
    },
  });
});

// POST /api/documents/:id/convert-to-latex
documentRoutes.post("/:id/convert-to-latex", async (c) => {
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
    return c.json({ success: false, error: "Documento precisa estar concluído para converter" }, 400);
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

  const student = await db
    .select({ name: students.name, school: students.school })
    .from(students)
    .where(eq(students.id, doc.studentId))
    .get();

  const studentName = student?.name ?? "Aluno";
  const schoolName = student?.school ?? "Escola";
  const model = settings.aiModel || getLatexModel(settings.aiProvider);

  // Create LaTeX document record
  const now = new Date().toISOString();
  const newDocId = crypto.randomUUID();

  // Find matching LaTeX document type, or fall back to generic
  const latexType = LATEX_DOCUMENT_TYPES.find((t) => t.slug === doc.documentType);
  const typeName = latexType?.name ?? doc.title.split(" - ")[0] ?? "Documento";

  await db.insert(latexDocuments).values({
    id: newDocId,
    userId,
    studentId: doc.studentId,
    documentType: doc.documentType,
    title: `${typeName} - ${studentName}`,
    status: "generating",
    heatLevel: 2,
    sizeLevel: 3,
    aiProvider: settings.aiProvider,
    aiModel: model,
    compilationAttempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  const newDoc = await db.select().from(latexDocuments).where(eq(latexDocuments.id, newDocId)).get();

  // Background: AI converts text → LaTeX, then compiles
  const bgWork = (async () => {
    try {
      const provider = createAIProvider(settings.aiProvider!, apiKey);

      const today = new Date().toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const result = await provider.generate({
        model,
        messages: [
          {
            role: "system",
            content: `Você é um especialista em LaTeX e AEE (Atendimento Educacional Especializado). Converta o texto abaixo em código LaTeX profissional, bonito e formal.

REGRAS:
1. Gere APENAS o corpo do documento — de \\begin{document} até \\end{document}.
2. NÃO inclua \\documentclass, \\usepackage, \\definecolor — o preâmbulo já existe.
3. Use um estilo SIMPLES e PROFISSIONAL: seções (\\section, \\subsection), infobox para dados importantes, tabelas com tabularx/booktabs.
4. NÃO use TikZ complexo, pgfplots, nem diagramas elaborados.
5. Pode usar: infobox, datacard, successbox, alertbox para destacar informações.
6. Use \\rowcolor para cores alternadas em tabelas. Use cores disponíveis: aeeblue, aeegold, aeegreen, aeered, aeeorange, aeepurple, aeeteal, aeegray.
7. Comandos de ícone: \\cmark (check), \\starmark (estrela), \\hand (mão), \\bulb (lâmpada).
8. A data de hoje é ${today}.
9. PROIBIDO: condicionais TeX (\\ifnum etc.), \\foreach com rnd, \\begin{axis}, \\pgfmathparse, longtable dentro de adjustbox, colunas X em longtable.
10. Todas as tcolorbox já são breakable — NÃO adicione breakable manualmente.
11. \\rowcolor DEVE ser o PRIMEIRO comando da linha de tabela.
12. Escape caracteres especiais LaTeX: & % $ # _ { } ~ ^

Retorne o código LaTeX COMPLETO (de \\begin{document} até \\end{document}), sem explicações, sem fence blocks.`,
          },
          {
            role: "user",
            content: `TÍTULO DO DOCUMENTO: ${doc.title}\n\nCONTEÚDO PARA CONVERTER:\n${doc.content}`,
          },
        ],
        maxTokens: 16000,
        temperature: 0.4,
      });

      // Extract body and build full source
      let body = result.content.replace(/```latex\s*/gi, "").replace(/```\s*/g, "").trim();
      const startIdx = body.indexOf("\\begin{document}");
      if (startIdx !== -1) {
        const endIdx = body.lastIndexOf("\\end{document}");
        body = endIdx !== -1
          ? body.substring(startIdx, endIdx + "\\end{document}".length)
          : body.substring(startIdx) + "\n\\end{document}";
      } else {
        body = "\\begin{document}\n" + body + "\n\\end{document}";
      }

      body = sanitizeLatexSource(body);

      const preamble = getLatexPreamble({
        documentTitle: typeName,
        studentName,
        schoolName,
      });
      const fullLatex = preamble + body;

      await db
        .update(latexDocuments)
        .set({
          latexSource: fullLatex,
          status: "compiling",
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(latexDocuments.id, newDocId));

      const compileResult = await compileWithAutoFix(
        fullLatex,
        c.env.LATEX_COMPILER_URL,
        c.env.LATEX_COMPILER_TOKEN,
        provider,
        model,
        16000,
      );

      if (compileResult.success && compileResult.pdfBase64) {
        const r2Key = `latex-pdfs/${userId}/${newDocId}.pdf`;
        const pdfBuffer = Uint8Array.from(atob(compileResult.pdfBase64), (ch) => ch.charCodeAt(0));
        await c.env.R2.put(r2Key, pdfBuffer, {
          httpMetadata: { contentType: "application/pdf" },
        });

        await db
          .update(latexDocuments)
          .set({
            latexSource: compileResult.latexSource,
            pdfR2Key: r2Key,
            pdfSizeBytes: compileResult.pdfSizeBytes ?? pdfBuffer.length,
            status: "completed",
            compilationAttempts: compileResult.attempts,
            lastCompilationError: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, newDocId));
      } else {
        await db
          .update(latexDocuments)
          .set({
            latexSource: compileResult.latexSource,
            status: "compile_error",
            compilationAttempts: compileResult.attempts,
            lastCompilationError: compileResult.lastError ?? "Unknown error",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, newDocId));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      await db
        .update(latexDocuments)
        .set({ status: "error", lastCompilationError: errorMsg, updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, newDocId));
    }
  })();

  c.executionCtx.waitUntil(bgWork);
  return c.json({ success: true, data: newDoc }, 201);
});

/** Escape special LaTeX characters in a text fragment */
function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/—/g, "---")
    .replace(/–/g, "--")
    .replace(/\u201c/g, "``")
    .replace(/[\u201d\u201f]/g, "''")
    .replace(/"/g, "''");
}

/**
 * Build a clean, simple PDF from plain text — matches DOCX style.
 * Minimal preamble, Arial-like font, title + subtitle + content.
 * Parses markdown-style headings and **bold**.
 */
function buildSimplePdfLatex(
  title: string,
  content: string,
  studentName: string,
  date: string,
): string {
  const preamble = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazilian]{babel}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{setspace}
\\onehalfspacing
\\usepackage{parskip}
\\usepackage{titlesec}
\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}
\\titleformat{\\subsection}{\\normalsize\\bfseries}{}{0em}{}
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot[C]{\\footnotesize\\thepage}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\usepackage{hyperref}
\\hypersetup{hidelinks}
`;

  const lines = content.split("\n");
  const bodyLines: string[] = [];

  // Title block
  bodyLines.push("\\begin{center}");
  bodyLines.push(`{\\Large\\bfseries ${escapeLatex(title)}}\\\\[6pt]`);
  bodyLines.push(`{\\small\\color[gray]{0.4} Aluno(a): ${escapeLatex(studentName)} --- ${escapeLatex(date)}}`);
  bodyLines.push("\\end{center}");
  bodyLines.push("\\vspace{0.5cm}");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const nextTrimmed = (lines[i + 1] ?? "").trim();

    if (!trimmed) {
      bodyLines.push("");
      continue;
    }

    // Markdown-style headings
    const h1Match = trimmed.match(/^##\s+(.+)/);
    const h0Match = trimmed.match(/^#\s+(.+)/);

    if (h0Match) {
      bodyLines.push(`\\section*{${escapeAndBold(h0Match[1])}}`);
    } else if (h1Match) {
      bodyLines.push(`\\subsection*{${escapeAndBold(h1Match[1])}}`);
    } else if (/^\*\*(.+?)\*\*$/.test(trimmed)) {
      // Full bold line — standalone paragraph (no \\)
      const inner = trimmed.match(/^\*\*(.+?)\*\*$/)![1];
      bodyLines.push(`\n\\textbf{${escapeLatex(inner)}}\n`);
    } else {
      // Regular line with inline **bold** support
      // Only add \\ if next line is also non-empty (line break within paragraph)
      // Don't add \\ before blank lines — causes "no line to end" error
      const suffix = nextTrimmed ? " \\\\" : "";
      bodyLines.push(escapeAndBold(trimmed) + suffix);
    }
  }

  return preamble + "\n\\begin{document}\n\n" + bodyLines.join("\n") + "\n\n\\end{document}\n";
}

/** Escape LaTeX + convert **bold** markers to \\textbf */
function escapeAndBold(text: string): string {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter(Boolean)
    .map((part) => {
      const boldMatch = part.match(/^\*\*(.+)\*\*$/);
      if (boldMatch) return `\\textbf{${escapeLatex(boldMatch[1])}}`;
      return escapeLatex(part);
    })
    .join("");
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "openai": return "gpt-4.1-mini";
    case "anthropic": return "claude-sonnet-4-5-20250929";
    case "gemini": return "gemini-2.0-flash";
    case "groq": return "llama-3.3-70b-versatile";
    case "deepseek": return "deepseek-chat";
    case "mistral": return "mistral-small-latest";
    case "cohere": return "command-r-plus";
    case "openrouter": return "openai/gpt-4.1-mini";
    case "together": return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    default: return "gpt-4.1-mini";
  }
}
