import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { latexDocuments, students, userSettings } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { decrypt } from "../lib/encryption";
import { createAIProvider } from "../lib/ai/index";
import { getLatexPreamble } from "../lib/latex/preamble";
import { buildLatexPrompt } from "../lib/latex/prompt-builder";
import { getLatexModel } from "../lib/latex/model-selection";
import { getDocumentTypeConfig } from "../lib/latex/document-types";
import { compileLatex } from "../lib/latex/compiler-client";
import { compileWithAutoFix } from "../lib/latex/auto-fix";
import { sanitizeLatexSource } from "../lib/latex/sanitizer";
import { LATEX_DOCUMENT_TYPES, SIZE_LEVELS } from "@aee-pro/shared";
import type { Env } from "../index";

type LatexEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const latexDocumentRoutes = new Hono<LatexEnv>();

latexDocumentRoutes.use("*", authMiddleware);

// ---------- helpers ----------

function getMaxTokens(sizeLevel: number): number {
  const entry = SIZE_LEVELS.find((s) => s.level === sizeLevel);
  return entry?.maxTokens ?? 8000;
}

function extractLatexBody(raw: string): string {
  // Remove fence blocks
  let cleaned = raw.replace(/```latex\s*/gi, "").replace(/```\s*/g, "").trim();

  // Extract from \begin{document} to \end{document}
  const startIdx = cleaned.indexOf("\\begin{document}");
  const endIdx = cleaned.lastIndexOf("\\end{document}");

  let body: string;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    body = cleaned.substring(startIdx, endIdx + "\\end{document}".length);
  } else if (startIdx !== -1) {
    // Truncated — missing \end{document}
    body = cleaned.substring(startIdx);
  } else {
    body = "\\begin{document}\n" + cleaned;
  }

  // Sanitize truncated documents: close any open environments
  body = sanitizeTruncatedLatex(body);

  // Strip problematic TeX constructs (\ifnum, \ifdim, etc.)
  body = sanitizeLatexSource(body);

  return body;
}

/**
 * Check if the LaTeX body has meaningful content (not just empty section headers).
 * Returns null if OK, or an error message if content is too thin.
 */
function checkContentQuality(body: string): string | null {
  // Strip LaTeX commands, environments, and whitespace to get "actual text"
  const textOnly = body
    .replace(/\\begin\{document\}/g, "")
    .replace(/\\end\{document\}/g, "")
    .replace(/\\(section|subsection|subsubsection|paragraph)\*?\{[^}]*\}/g, "")
    .replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?(\{[^}]*\})?/g, "")
    .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, "")
    .replace(/[{}\\%&$#_\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (textOnly.length < 200) {
    return `A IA gerou um documento quase vazio (apenas ${textOnly.length} caracteres de conteúdo). O modelo escolhido pode não ser capaz de gerar documentos LaTeX complexos. Tente usar um modelo mais capaz (Claude, GPT-4, Gemini).`;
  }
  return null;
}

function sanitizeTruncatedLatex(latex: string): string {
  // Ensure \end{document} exists
  let result = latex;
  if (!result.trimEnd().endsWith("\\end{document}")) {
    result += "\n\\end{document}";
  }
  // The heavy lifting (closing unclosed environments) is now handled
  // by sanitizeLatexSource → closeUnclosedEnvironments
  return result;
}

// ---------- POST /generate ----------

latexDocumentRoutes.post("/generate", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json()) as {
    studentId: string;
    documentType: string;
    heatLevel?: number;
    sizeLevel?: number;
    customPrompt?: string;
    unlimitedTokens?: boolean;
  };

  if (!body.studentId || !body.documentType) {
    return c.json({ success: false, error: "studentId e documentType são obrigatórios" }, 400);
  }

  const heatLevel = Math.max(1, Math.min(5, body.heatLevel ?? 3));
  const sizeLevel = Math.max(1, Math.min(5, body.sizeLevel ?? 3));
  const customPrompt = body.customPrompt?.trim() || undefined;
  const unlimitedTokens = body.unlimitedTokens === true;

  const typeConfig = getDocumentTypeConfig(body.documentType);
  if (!typeConfig) {
    return c.json({ success: false, error: "Tipo de documento inválido" }, 400);
  }

  const db = createDb(c.env.DB);

  // Verify student ownership
  const student = await db
    .select()
    .from(students)
    .where(and(eq(students.id, body.studentId), eq(students.userId, userId)))
    .get();

  if (!student) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  // Get AI settings
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.aiProvider || !settings?.aiApiKeyEncrypted) {
    return c.json(
      { success: false, error: "Configure o provider de IA nas configurações antes de gerar documentos" },
      400,
    );
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, error: "Erro ao descriptografar a chave de API" }, 500);
  }

  // Build prompt
  const { system, user } = buildLatexPrompt(
    student as unknown as Parameters<typeof buildLatexPrompt>[0],
    body.documentType,
    heatLevel,
    sizeLevel,
    customPrompt,
  );
  const effectiveMaxTokens = unlimitedTokens ? 65536 : getMaxTokens(sizeLevel);

  // Create record
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const model = settings.aiModel || getLatexModel(settings.aiProvider);
  const typeName = LATEX_DOCUMENT_TYPES.find((t) => t.slug === body.documentType)?.name ?? typeConfig.name;

  await db.insert(latexDocuments).values({
    id: docId,
    userId,
    studentId: body.studentId,
    documentType: body.documentType,
    title: `${typeName} - ${student.name}`,
    status: "generating",
    heatLevel,
    sizeLevel,
    aiProvider: settings.aiProvider,
    aiModel: model,
    compilationAttempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Return immediately — process AI generation in background
  const newDoc = await db.select().from(latexDocuments).where(eq(latexDocuments.id, docId)).get();
  const aiProvider = settings.aiProvider!;

  const bgWork = (async () => {
    try {
      const provider = createAIProvider(aiProvider, apiKey);
      const result = await provider.generate({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: effectiveMaxTokens,
        temperature: 0.7,
      });

      const body_latex = extractLatexBody(result.content);

      // Quality check: reject near-empty content
      const qualityError = checkContentQuality(body_latex);
      if (qualityError) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: qualityError, updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, docId));
        return;
      }

      const preamble = getLatexPreamble({
        documentTitle: typeName,
        studentName: student.name,
        schoolName: student.school ?? "Escola",
      });
      const fullLatex = preamble + body_latex;

      await db
        .update(latexDocuments)
        .set({
          latexSource: fullLatex,
          status: "compiling",
          generatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(latexDocuments.id, docId));

      const compileResult = await compileWithAutoFix(
        fullLatex,
        c.env.LATEX_COMPILER_URL,
        c.env.LATEX_COMPILER_TOKEN,
        provider,
        model,
        effectiveMaxTokens,
      );

      if (compileResult.success && compileResult.pdfBase64) {
        const r2Key = `latex-pdfs/${userId}/${docId}.pdf`;
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
          .where(eq(latexDocuments.id, docId));
      } else {
        await db
          .update(latexDocuments)
          .set({
            latexSource: compileResult.latexSource,
            status: "compile_error",
            compilationAttempts: compileResult.attempts,
            lastCompilationError: compileResult.lastError ?? "Unknown compilation error",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, docId));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido na geração";
      await db
        .update(latexDocuments)
        .set({ status: "error", lastCompilationError: errorMsg, updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, docId));
    }
  })();

  c.executionCtx.waitUntil(bgWork);
  return c.json({ success: true, data: newDoc }, 201);
});

// ---------- GET / ----------

latexDocumentRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const studentId = c.req.query("studentId");
  const db = createDb(c.env.DB);

  const result = await db
    .select({
      id: latexDocuments.id,
      userId: latexDocuments.userId,
      studentId: latexDocuments.studentId,
      documentType: latexDocuments.documentType,
      title: latexDocuments.title,
      pdfR2Key: latexDocuments.pdfR2Key,
      pdfSizeBytes: latexDocuments.pdfSizeBytes,
      status: latexDocuments.status,
      heatLevel: latexDocuments.heatLevel,
      sizeLevel: latexDocuments.sizeLevel,
      aiProvider: latexDocuments.aiProvider,
      aiModel: latexDocuments.aiModel,
      compilationAttempts: latexDocuments.compilationAttempts,
      lastCompilationError: latexDocuments.lastCompilationError,
      generatedAt: latexDocuments.generatedAt,
      createdAt: latexDocuments.createdAt,
      updatedAt: latexDocuments.updatedAt,
    })
    .from(latexDocuments)
    .where(
      studentId
        ? and(eq(latexDocuments.userId, userId), eq(latexDocuments.studentId, studentId))
        : eq(latexDocuments.userId, userId),
    )
    .orderBy(desc(latexDocuments.createdAt));

  return c.json({ success: true, data: result });
});

// ---------- GET /:id ----------

latexDocumentRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.id, id), eq(latexDocuments.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  return c.json({ success: true, data: doc });
});

// ---------- GET /:id/pdf ----------

latexDocumentRoutes.get("/:id/pdf", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.id, id), eq(latexDocuments.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  if (!doc.pdfR2Key) {
    return c.json({ success: false, error: "PDF não disponível" }, 404);
  }

  const object = await c.env.R2.get(doc.pdfR2Key);
  if (!object) {
    return c.json({ success: false, error: "PDF não encontrado no armazenamento" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  const safeFilename = doc.title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_") || "documento";
  const utf8Filename = encodeURIComponent(doc.title.replace(/\s+/g, "_")) + ".pdf";
  headers.set(
    "Content-Disposition",
    `inline; filename="${safeFilename}.pdf"; filename*=UTF-8''${utf8Filename}`,
  );

  return new Response(object.body, { headers });
});

// ---------- POST /:id/recompile ----------

latexDocumentRoutes.post("/:id/recompile", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.id, id), eq(latexDocuments.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  if (!doc.latexSource) {
    return c.json({ success: false, error: "Documento sem código LaTeX" }, 400);
  }

  // Get AI settings for auto-fix
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  await db
    .update(latexDocuments)
    .set({ status: "compiling", updatedAt: new Date().toISOString() })
    .where(eq(latexDocuments.id, id));

  let compileResult;

  if (settings?.aiProvider && settings?.aiApiKeyEncrypted) {
    // With auto-fix: AI can correct compilation errors
    let apiKey: string;
    try {
      apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
    } catch {
      apiKey = "";
    }

    if (apiKey) {
      const provider = createAIProvider(settings.aiProvider, apiKey);
      const model = settings.aiModel || getLatexModel(settings.aiProvider);
      compileResult = await compileWithAutoFix(
        doc.latexSource,
        c.env.LATEX_COMPILER_URL,
        c.env.LATEX_COMPILER_TOKEN,
        provider,
        model,
        getMaxTokens(doc.sizeLevel),
      );
    }
  }

  // Fallback: compile without auto-fix (still sanitize)
  if (!compileResult) {
    const sanitized = sanitizeLatexSource(doc.latexSource);
    const raw = await compileLatex(sanitized, c.env.LATEX_COMPILER_URL, c.env.LATEX_COMPILER_TOKEN);
    compileResult = { ...raw, latexSource: sanitized, attempts: 1 };
  }

  if (compileResult.success && compileResult.pdfBase64) {
    const r2Key = `latex-pdfs/${userId}/${id}.pdf`;
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
        compilationAttempts: (doc.compilationAttempts ?? 0) + compileResult.attempts,
        lastCompilationError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(latexDocuments.id, id));
  } else {
    await db
      .update(latexDocuments)
      .set({
        status: "compile_error",
        compilationAttempts: (doc.compilationAttempts ?? 0) + compileResult.attempts,
        lastCompilationError: compileResult.lastError ?? "Unknown error",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(latexDocuments.id, id));
  }

  const updated = await db.select().from(latexDocuments).where(eq(latexDocuments.id, id)).get();
  return c.json({ success: true, data: updated });
});

// ---------- POST /:id/edit-ai ----------

latexDocumentRoutes.post("/:id/edit-ai", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = (await c.req.json()) as { instruction: string };

  if (!body.instruction?.trim()) {
    return c.json({ success: false, error: "Instrução é obrigatória" }, 400);
  }

  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.id, id), eq(latexDocuments.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  if (!doc.latexSource) {
    return c.json({ success: false, error: "Documento sem código LaTeX" }, 400);
  }

  const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (!settings?.aiProvider || !settings?.aiApiKeyEncrypted) {
    return c.json({ success: false, error: "Configure o provider de IA nas configurações" }, 400);
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
  } catch {
    return c.json({ success: false, error: "Erro ao descriptografar a chave de API" }, 500);
  }

  // Extract body from current source
  const startIdx = doc.latexSource.indexOf("\\begin{document}");
  const preamblePart = startIdx !== -1 ? doc.latexSource.substring(0, startIdx) : "";
  const bodyPart = startIdx !== -1 ? doc.latexSource.substring(startIdx) : doc.latexSource;

  const model = settings.aiModel || getLatexModel(settings.aiProvider);
  const provider = createAIProvider(settings.aiProvider, apiKey);

  try {
    const result = await provider.generate({
      model,
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em LaTeX. Edite o corpo LaTeX seguindo a instrução do usuário. Retorne APENAS o corpo modificado (de \\begin{document} a \\end{document}), sem explicações, sem fence blocks. O preâmbulo é gerenciado externamente — não o inclua.",
        },
        {
          role: "user",
          content: `INSTRUÇÃO: ${body.instruction}\n\nCÓDIGO LATEX ATUAL:\n${bodyPart}`,
        },
      ],
      maxTokens: 16000,
      temperature: 0.5,
    });

    const editedBody = extractLatexBody(result.content);
    const newSource = preamblePart + editedBody;

    await db
      .update(latexDocuments)
      .set({
        latexSource: newSource,
        status: "compiling",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(latexDocuments.id, id));

    // Recompile
    const compileResult = await compileWithAutoFix(
      newSource,
      c.env.LATEX_COMPILER_URL,
      c.env.LATEX_COMPILER_TOKEN,
      provider,
      model,
      getMaxTokens(doc.sizeLevel),
    );

    if (compileResult.success && compileResult.pdfBase64) {
      const r2Key = `latex-pdfs/${userId}/${id}.pdf`;
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
        .where(eq(latexDocuments.id, id));
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
        .where(eq(latexDocuments.id, id));
    }

    const updated = await db.select().from(latexDocuments).where(eq(latexDocuments.id, id)).get();
    return c.json({ success: true, data: updated });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
    return c.json({ success: false, error: `Erro na edição: ${errorMsg}` }, 500);
  }
});

// ---------- PUT /:id ----------

latexDocumentRoutes.put("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = (await c.req.json()) as { latexSource?: string; title?: string };
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.id, id), eq(latexDocuments.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  const updates: Record<string, string> = { updatedAt: new Date().toISOString() };
  if (body.latexSource !== undefined) updates.latexSource = body.latexSource;
  if (body.title !== undefined) updates.title = body.title;

  await db.update(latexDocuments).set(updates).where(eq(latexDocuments.id, id));

  const updated = await db.select().from(latexDocuments).where(eq(latexDocuments.id, id)).get();
  return c.json({ success: true, data: updated });
});

// ---------- DELETE /:id ----------

latexDocumentRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.id, id), eq(latexDocuments.userId, userId)))
    .get();

  if (!existing) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  // Delete R2 object if exists
  if (existing.pdfR2Key) {
    await c.env.R2.delete(existing.pdfR2Key).catch(() => {});
  }

  await db.delete(latexDocuments).where(eq(latexDocuments.id, id));
  return c.json({ success: true });
});

// ---------- POST /:id/regenerate ----------

latexDocumentRoutes.post("/:id/regenerate", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.id, id), eq(latexDocuments.userId, userId)))
    .get();

  if (!doc) {
    return c.json({ success: false, error: "Documento não encontrado" }, 404);
  }

  const typeConfig = getDocumentTypeConfig(doc.documentType);
  if (!typeConfig) {
    return c.json({ success: false, error: "Tipo de documento inválido" }, 400);
  }

  // Verify student
  const student = await db
    .select()
    .from(students)
    .where(and(eq(students.id, doc.studentId), eq(students.userId, userId)))
    .get();

  if (!student) {
    return c.json({ success: false, error: "Aluno não encontrado" }, 404);
  }

  // Get AI settings
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

  // Delete old R2 object
  if (doc.pdfR2Key) {
    await c.env.R2.delete(doc.pdfR2Key).catch(() => {});
  }

  // Delete old record
  await db.delete(latexDocuments).where(eq(latexDocuments.id, id));

  // Build prompt with same heat/size
  const heatLevel = doc.heatLevel;
  const sizeLevel = doc.sizeLevel;
  const { system, user } = buildLatexPrompt(
    student as unknown as Parameters<typeof buildLatexPrompt>[0],
    doc.documentType,
    heatLevel,
    sizeLevel,
  );

  const now = new Date().toISOString();
  const newDocId = crypto.randomUUID();
  const model = settings.aiModel || getLatexModel(settings.aiProvider);
  const typeName = LATEX_DOCUMENT_TYPES.find((t) => t.slug === doc.documentType)?.name ?? typeConfig.name;

  await db.insert(latexDocuments).values({
    id: newDocId,
    userId,
    studentId: doc.studentId,
    documentType: doc.documentType,
    title: `${typeName} - ${student.name}`,
    status: "generating",
    heatLevel,
    sizeLevel,
    aiProvider: settings.aiProvider,
    aiModel: model,
    compilationAttempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Return immediately — process in background
  const newDoc = await db.select().from(latexDocuments).where(eq(latexDocuments.id, newDocId)).get();
  const regenAiProvider = settings.aiProvider!;

  const bgWork = (async () => {
    try {
      const provider = createAIProvider(regenAiProvider, apiKey);
      const result = await provider.generate({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: getMaxTokens(sizeLevel),
        temperature: 0.7,
      });

      const bodyLatex = extractLatexBody(result.content);

      // Quality check: reject near-empty content
      const qualityError = checkContentQuality(bodyLatex);
      if (qualityError) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: qualityError, updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, newDocId));
        return;
      }

      const preamble = getLatexPreamble({
        documentTitle: typeName,
        studentName: student.name,
        schoolName: student.school ?? "Escola",
      });
      const fullLatex = preamble + bodyLatex;

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
        getMaxTokens(sizeLevel),
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
            lastCompilationError: compileResult.lastError ?? "Unknown compilation error",
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
