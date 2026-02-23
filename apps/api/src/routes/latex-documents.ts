import { Hono } from "hono";
import { eq, and, desc, asc } from "drizzle-orm";
import { latexDocuments, students, userSettings, userImages, aeeSessions } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { decrypt } from "../lib/encryption";
import { createAIProvider } from "../lib/ai/index";
import { getLatexPreamble } from "../lib/latex/preamble";
import { buildLatexPrompt, buildSignatureBlock, type SessionSummary } from "../lib/latex/prompt-builder";
import { getLatexModel, normalizeModelForProvider } from "../lib/latex/model-selection";
import { getDocumentTypeConfig } from "../lib/latex/document-types";
import { compileLatex } from "../lib/latex/compiler-client";
import { compileWithAutoFix, filterDisplayWarnings } from "../lib/latex/auto-fix";
import { sanitizeLatexSource } from "../lib/latex/sanitizer";
import { resolveImagesFromLatex } from "../lib/latex/image-resolver";
import { LATEX_DOCUMENT_TYPES, SIZE_LEVELS } from "@aee-pro/shared";
import type { Env } from "../index";

/** Max age for "generating"/"compiling" status before marking as stale (20 minutes).
 * generateAndCompile timeout is 10 min; compilation pipeline up to 2 min. */
const STALE_GENERATING_MS = 20 * 60 * 1000;

type LatexEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const latexDocumentRoutes = new Hono<LatexEnv>();

// ---------- POST /webhook/result/:docId ----------
// Called by Fly.io when async generation+compilation is done.
// No session auth — uses LATEX_COMPILER_TOKEN as shared secret.

latexDocumentRoutes.post("/webhook/result/:docId", async (c) => {
  const token = c.req.header("authorization")?.replace("Bearer ", "").trim() ?? "";
  if (!c.env.LATEX_COMPILER_TOKEN || token !== c.env.LATEX_COMPILER_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const docId = c.req.param("docId");
  const db = createDb(c.env.DB);

  const doc = await db
    .select()
    .from(latexDocuments)
    .where(eq(latexDocuments.id, docId))
    .get();

  if (!doc) {
    console.error(`[webhook] doc not found: ${docId}`);
    return c.json({ error: "Document not found" }, 404);
  }

  const result = (await c.req.json()) as {
    success: boolean;
    pdf_base64?: string;
    pdf_size_bytes?: number;
    latex_source?: string;
    error?: string;
    warnings?: string[];
    attempts?: number;
    ai_model?: string;
  };

  console.log(`[webhook] doc=${docId} success=${result.success} attempts=${result.attempts}`);

  if (result.success && result.pdf_base64) {
    const r2Key = `latex-pdfs/${doc.userId}/${docId}.pdf`;
    const pdfBuffer = Uint8Array.from(atob(result.pdf_base64), (ch) => ch.charCodeAt(0));
    await c.env.R2.put(r2Key, pdfBuffer, {
      httpMetadata: { contentType: "application/pdf" },
    });

    await db
      .update(latexDocuments)
      .set({
        latexSource: result.latex_source ?? doc.latexSource,
        pdfR2Key: r2Key,
        pdfSizeBytes: result.pdf_size_bytes ?? pdfBuffer.length,
        status: "completed",
        aiModel: result.ai_model ?? doc.aiModel,
        compilationAttempts: result.attempts ?? 1,
        compilationWarnings: JSON.stringify(filterDisplayWarnings(result.warnings ?? [])),
        lastCompilationError: null,
        generatedAt: doc.generatedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(latexDocuments.id, docId));
  } else {
    await db
      .update(latexDocuments)
      .set({
        latexSource: result.latex_source ?? doc.latexSource,
        status: "compile_error",
        compilationAttempts: result.attempts ?? 0,
        lastCompilationError: result.error ?? "Erro desconhecido na geração",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(latexDocuments.id, docId));
  }

  return c.json({ success: true });
});

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

/** Document types that benefit from session data in their prompts */
const SESSION_DATA_TYPES = new Set([
  "grafico-evolucao",
  "relatorio-bimestral",
  "relatorio-semestral",
  "relatorio-anual",
  "avancos-retrocessos",
  "parecer-descritivo",
  "plano-metas",
]);

async function fetchSessionSummaries(
  db: ReturnType<typeof createDb>,
  userId: string,
  studentId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<SessionSummary[]> {
  const conditions = [
    eq(aeeSessions.userId, userId),
    eq(aeeSessions.studentId, studentId),
  ];
  if (periodStart) {
    const { gte } = await import("drizzle-orm");
    conditions.push(gte(aeeSessions.sessionDate, periodStart));
  }
  if (periodEnd) {
    const { lte } = await import("drizzle-orm");
    conditions.push(lte(aeeSessions.sessionDate, periodEnd));
  }

  const sessions = await db
    .select()
    .from(aeeSessions)
    .where(and(...conditions))
    .orderBy(asc(aeeSessions.sessionDate));

  return sessions.map((s) => ({
    date: s.sessionDate,
    present: !!s.present,
    objectives: s.objectives,
    studentResponse: s.studentResponse,
    ratingCognitive: s.ratingCognitive,
    ratingLinguistic: s.ratingLinguistic,
    ratingMotor: s.ratingMotor,
    ratingSocial: s.ratingSocial,
    ratingAutonomy: s.ratingAutonomy,
    ratingAcademic: s.ratingAcademic,
  }));
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

/**
 * Inject the signature block into the LaTeX body before \end{document}.
 * Inserted BEFORE the LGPD footer (\vfill\begin{center}\scriptsize).
 */
function injectSignatureBlock(body: string, documentType: string, student: Record<string, string | null | undefined>): string {
  const sig = buildSignatureBlock(documentType, student as Parameters<typeof buildSignatureBlock>[1]);
  const endDocIdx = body.lastIndexOf("\\end{document}");
  if (endDocIdx === -1) return body;

  // Try to insert before the LGPD footer (\vfill ... \scriptsize)
  const vfillIdx = body.lastIndexOf("\\vfill", endDocIdx);
  const insertIdx = vfillIdx !== -1 ? vfillIdx : endDocIdx;

  return body.substring(0, insertIdx) + "\n" + sig + "\n\n" + body.substring(insertIdx);
}

// ---------- POST /dossie ----------

latexDocumentRoutes.post("/dossie", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json()) as { studentId: string; documentIds: string[] };

  if (!body.studentId || !Array.isArray(body.documentIds) || body.documentIds.length === 0) {
    return c.json({ success: false, error: "studentId e documentIds são obrigatórios" }, 400);
  }

  if (body.documentIds.length > 30) {
    return c.json({ success: false, error: "Máximo de 30 documentos por dossiê" }, 400);
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

  // Fetch requested documents (only completed ones with PDFs)
  const allDocs = await db
    .select()
    .from(latexDocuments)
    .where(and(eq(latexDocuments.userId, userId), eq(latexDocuments.studentId, body.studentId)))
    .orderBy(desc(latexDocuments.createdAt));

  const requestedIds = new Set(body.documentIds);
  const validDocs = allDocs.filter(
    (d) => requestedIds.has(d.id) && d.status === "completed" && d.pdfR2Key,
  );

  if (validDocs.length === 0) {
    return c.json({ success: false, error: "Nenhum documento concluído com PDF encontrado" }, 400);
  }

  // Fetch all PDFs from R2 in parallel
  const pdfResults = await Promise.all(
    validDocs.map(async (doc) => {
      const obj = await c.env.R2.get(doc.pdfR2Key!);
      if (!obj) return null;
      const buf = await obj.arrayBuffer();
      return {
        title: doc.title,
        data_base64: btoa(String.fromCharCode(...new Uint8Array(buf))),
      };
    }),
  );

  const pdfs = pdfResults.filter((p): p is NonNullable<typeof p> => p !== null);

  if (pdfs.length === 0) {
    return c.json({ success: false, error: "Não foi possível recuperar os PDFs do armazenamento" }, 500);
  }

  // Send to Python compiler service
  const compilerUrl = c.env.LATEX_COMPILER_URL;
  const compilerToken = c.env.LATEX_COMPILER_TOKEN;

  if (!compilerUrl) {
    return c.json({ success: false, error: "Compilador LaTeX não configurado" }, 500);
  }

  let compileRes: Response;
  try {
    compileRes = await fetch(`${compilerUrl}/compile-dossie`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${compilerToken}`,
      },
      body: JSON.stringify({
        student_name: student.name,
        student_school: student.school ?? undefined,
        student_diagnosis: student.diagnosis ?? undefined,
        student_grade: student.grade ?? undefined,
        pdfs,
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `Erro ao conectar ao compilador: ${msg}` }, 502);
  }

  if (!compileRes.ok) {
    const text = await compileRes.text().catch(() => "");
    return c.json({ success: false, error: `Compilador retornou ${compileRes.status}: ${text.slice(0, 500)}` }, 502);
  }

  const result = (await compileRes.json()) as {
    success: boolean;
    pdf_base64?: string;
    pdf_size_bytes?: number;
    error?: string;
  };

  if (!result.success || !result.pdf_base64) {
    return c.json({ success: false, error: result.error ?? "Erro na compilação do dossiê" }, 500);
  }

  // Return PDF blob directly
  const pdfBuffer = Uint8Array.from(atob(result.pdf_base64), (ch) => ch.charCodeAt(0));
  const safeName = student.name.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_") || "Aluno";
  const year = new Date().getFullYear();
  const utf8Filename = encodeURIComponent(`Dossie_${student.name.replace(/\s+/g, "_")}_${year}`) + ".pdf";

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set(
    "Content-Disposition",
    `attachment; filename="Dossie_${safeName}_${year}.pdf"; filename*=UTF-8''${utf8Filename}`,
  );

  return new Response(pdfBuffer, { headers });
});

// ---------- POST /generate-periodic ----------

latexDocumentRoutes.post("/generate-periodic", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json()) as {
    studentId: string;
    periodType: "mensal" | "bimestral" | "semestral" | "anual";
    periodStart: string;
    periodEnd: string;
    heatLevel?: number;
    sizeLevel?: number;
    printMode?: "color" | "bw";
  };

  if (!body.studentId || !body.periodType || !body.periodStart || !body.periodEnd) {
    return c.json({ success: false, error: "studentId, periodType, periodStart e periodEnd são obrigatórios" }, 400);
  }

  const periodTypeMap: Record<string, string> = {
    mensal: "relatorio-bimestral",
    bimestral: "relatorio-bimestral",
    semestral: "relatorio-semestral",
    anual: "relatorio-anual",
  };
  const periodLabelMap: Record<string, string> = {
    mensal: "Mensal",
    bimestral: "Bimestral",
    semestral: "Semestral",
    anual: "Anual",
  };

  const documentType = periodTypeMap[body.periodType];
  if (!documentType) {
    return c.json({ success: false, error: "Tipo de período inválido" }, 400);
  }

  const heatLevel = Math.max(1, Math.min(5, body.heatLevel ?? 3));
  const sizeLevel = Math.max(1, Math.min(5, body.sizeLevel ?? 3));
  const printMode = body.printMode === "bw" ? "bw" as const : "color" as const;

  const typeConfig = getDocumentTypeConfig(documentType);
  if (!typeConfig) {
    return c.json({ success: false, error: "Tipo de documento inválido" }, 400);
  }

  const db = createDb(c.env.DB);

  const student = await db
    .select()
    .from(students)
    .where(and(eq(students.id, body.studentId), eq(students.userId, userId)))
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

  // Fetch session data for the period
  const sessionData = await fetchSessionSummaries(db, userId, body.studentId, body.periodStart, body.periodEnd);

  // Build custom prompt with period context
  const periodLabel = periodLabelMap[body.periodType];
  const customPrompt = `PERÍODO DO RELATÓRIO: ${periodLabel} — de ${body.periodStart} a ${body.periodEnd}
Total de sessões no período: ${sessionData.length}
Sessões com presença: ${sessionData.filter((s) => s.present).length}
Use os dados das sessões fornecidos para gerar o relatório baseado em evidências reais.`;

  const { system, user } = buildLatexPrompt(
    student as unknown as Parameters<typeof buildLatexPrompt>[0],
    documentType,
    heatLevel,
    sizeLevel,
    customPrompt,
    sessionData,
  );

  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const model = normalizeModelForProvider(settings.aiModel || getLatexModel(settings.aiProvider), settings.aiProvider);
  const typeName = LATEX_DOCUMENT_TYPES.find((t) => t.slug === documentType)?.name ?? typeConfig.name;
  const effectiveMaxTokens = getMaxTokens(sizeLevel);

  await db.insert(latexDocuments).values({
    id: docId,
    userId,
    studentId: body.studentId,
    documentType,
    title: `${typeName} (${periodLabel}) - ${student.name}`,
    status: "generating",
    heatLevel,
    sizeLevel,
    printMode,
    aiProvider: settings.aiProvider,
    aiModel: model,
    compilationAttempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  const newDoc = await db.select().from(latexDocuments).where(eq(latexDocuments.id, docId)).get();
  const periodicAiProvider = settings.aiProvider!;

  const processPeriodicGeneration = async () => {
    try {
      if (!c.env.LATEX_COMPILER_URL) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: "LATEX_COMPILER_URL não configurado.", updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, docId));
        return;
      }

      const preamble = getLatexPreamble({
        documentTitle: typeName,
        studentName: student.name,
        schoolName: student.school ?? "Escola",
        printMode,
      });

      const provider = createAIProvider(periodicAiProvider, apiKey);
      const result = await provider.generate({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: effectiveMaxTokens,
        temperature: 0.7,
      });

      let latexBody = extractLatexBody(result.content);

      const qualityError = checkContentQuality(latexBody);
      if (qualityError) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: qualityError, updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, docId));
        return;
      }

      latexBody = injectSignatureBlock(latexBody, documentType, student as Parameters<typeof buildSignatureBlock>[1]);
      const fullSource = preamble + latexBody;

      await db
        .update(latexDocuments)
        .set({ latexSource: fullSource, status: "compiling", generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, docId));

      const images = await resolveImagesFromLatex(fullSource, userId, db, c.env.R2);

      const compileResult = await compileWithAutoFix(
        fullSource,
        c.env.LATEX_COMPILER_URL,
        c.env.LATEX_COMPILER_TOKEN,
        provider,
        model,
        effectiveMaxTokens,
        images.length > 0 ? images : undefined,
      );

      if (compileResult.success && compileResult.pdfBase64) {
        const r2Key = `latex-pdfs/${userId}/${docId}.pdf`;
        const pdfBuffer = Uint8Array.from(atob(compileResult.pdfBase64), (ch) => ch.charCodeAt(0));
        await c.env.R2.put(r2Key, pdfBuffer, { httpMetadata: { contentType: "application/pdf" } });

        await db
          .update(latexDocuments)
          .set({
            latexSource: compileResult.latexSource,
            pdfR2Key: r2Key,
            pdfSizeBytes: compileResult.pdfSizeBytes ?? pdfBuffer.length,
            status: "completed",
            compilationAttempts: compileResult.attempts,
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
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
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: compileResult.lastError ?? "Erro na compilação",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, docId));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido na geração";
      await db
        .update(latexDocuments)
        .set({ status: "error", lastCompilationError: errorMsg, updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, docId))
        .catch(() => {});
    }
  };

  c.executionCtx.waitUntil(processPeriodicGeneration());
  return c.json({ success: true, data: newDoc }, 201);
});

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
    printMode?: "color" | "bw";
  };

  if (!body.studentId || !body.documentType) {
    return c.json({ success: false, error: "studentId e documentType são obrigatórios" }, 400);
  }

  const heatLevel = Math.max(1, Math.min(5, body.heatLevel ?? 3));
  const sizeLevel = Math.max(1, Math.min(5, body.sizeLevel ?? 3));
  const customPrompt = body.customPrompt?.trim() || undefined;
  const unlimitedTokens = body.unlimitedTokens === true;
  const printMode = body.printMode === "bw" ? "bw" as const : "color" as const;

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

  // Fetch session data for types that benefit from it
  let sessionData: SessionSummary[] | undefined;
  if (SESSION_DATA_TYPES.has(body.documentType)) {
    sessionData = await fetchSessionSummaries(db, userId, body.studentId);
  }

  // Build prompt
  const { system, user } = buildLatexPrompt(
    student as unknown as Parameters<typeof buildLatexPrompt>[0],
    body.documentType,
    heatLevel,
    sizeLevel,
    customPrompt,
    sessionData,
  );
  const effectiveMaxTokens = unlimitedTokens ? 65536 : getMaxTokens(sizeLevel);

  // Create record
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const model = normalizeModelForProvider(settings.aiModel || getLatexModel(settings.aiProvider), settings.aiProvider);
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
    printMode,
    aiProvider: settings.aiProvider,
    aiModel: model,
    compilationAttempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Return immediately — process AI generation in background via waitUntil.
  // The frontend polls for status and shows progress until the doc completes.
  const newDoc = await db.select().from(latexDocuments).where(eq(latexDocuments.id, docId)).get();
  const aiProvider = settings.aiProvider!;

  // Generate LaTeX via user's AI key, then compile via Python service.
  const processGeneration = async () => {
    try {
      if (!c.env.LATEX_COMPILER_URL) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: "LATEX_COMPILER_URL não configurado.", updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, docId));
        return;
      }

      const preamble = getLatexPreamble({
        documentTitle: typeName,
        studentName: student.name,
        schoolName: student.school ?? "Escola",
        printMode,
      });

      console.log(`[generate] Starting AI generation with ${aiProvider}/${model}`);

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

      let latexBody = extractLatexBody(result.content);

      const qualityError = checkContentQuality(latexBody);
      if (qualityError) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: qualityError, updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, docId));
        return;
      }

      latexBody = injectSignatureBlock(latexBody, body.documentType, student as Parameters<typeof buildSignatureBlock>[1]);
      const fullSource = preamble + latexBody;

      await db
        .update(latexDocuments)
        .set({ latexSource: fullSource, status: "compiling", generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, docId));

      const images = await resolveImagesFromLatex(fullSource, userId, db, c.env.R2);

      const compileResult = await compileWithAutoFix(
        fullSource,
        c.env.LATEX_COMPILER_URL,
        c.env.LATEX_COMPILER_TOKEN,
        provider,
        model,
        effectiveMaxTokens,
        images.length > 0 ? images : undefined,
      );

      if (compileResult.success && compileResult.pdfBase64) {
        console.log(`[generate] Success after ${compileResult.attempts} attempts`);
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
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, docId));
      } else {
        console.log(`[generate] Compile failed: ${compileResult.lastError?.slice(0, 200)}`);
        await db
          .update(latexDocuments)
          .set({
            latexSource: compileResult.latexSource,
            status: "compile_error",
            compilationAttempts: compileResult.attempts,
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: compileResult.lastError ?? "Erro na compilação",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, docId));
      }
    } catch (err) {
      console.error(`[generate] Fatal error for doc ${docId}:`, err);
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido na geração";
      await db
        .update(latexDocuments)
        .set({ status: "error", lastCompilationError: errorMsg, updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, docId))
        .catch(() => {});
    }
  };

  // waitUntil keeps Worker alive for AI generation + compilation.
  c.executionCtx.waitUntil(processGeneration());
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
      printMode: latexDocuments.printMode,
      aiProvider: latexDocuments.aiProvider,
      aiModel: latexDocuments.aiModel,
      compilationAttempts: latexDocuments.compilationAttempts,
      lastCompilationError: latexDocuments.lastCompilationError,
      compilationWarnings: latexDocuments.compilationWarnings,
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

  // Auto-fix stale "generating"/"compiling" documents (stuck for >5 min)
  const now = Date.now();
  const staleIds: string[] = [];
  for (const doc of result) {
    if (doc.status === "generating" || doc.status === "compiling") {
      const updatedAt = new Date(doc.updatedAt).getTime();
      if (now - updatedAt > STALE_GENERATING_MS) {
        staleIds.push(doc.id);
      }
    }
  }
  if (staleIds.length > 0) {
    for (const staleId of staleIds) {
      await db
        .update(latexDocuments)
        .set({
          status: "error",
          lastCompilationError: "Timeout: geração excedeu o tempo limite. Tente gerar novamente.",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(latexDocuments.id, staleId));
    }
    // Re-fetch with updated statuses
    const refreshed = await db
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
        printMode: latexDocuments.printMode,
        aiProvider: latexDocuments.aiProvider,
        aiModel: latexDocuments.aiModel,
        compilationAttempts: latexDocuments.compilationAttempts,
        lastCompilationError: latexDocuments.lastCompilationError,
        compilationWarnings: latexDocuments.compilationWarnings,
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
    return c.json({ success: true, data: refreshed });
  }

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

// ---------- GET /:id/export/docx ----------

latexDocumentRoutes.get("/:id/export/docx", async (c) => {
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

  // Send LaTeX source to converter service (preprocessor + pandoc)
  const compilerUrl = c.env.LATEX_COMPILER_URL;
  const compilerToken = c.env.LATEX_COMPILER_TOKEN;

  if (!compilerUrl) {
    return c.json({ success: false, error: "Compilador LaTeX não configurado" }, 500);
  }

  // Resolve images for DOCX conversion
  const docxImages = await resolveImagesFromLatex(doc.latexSource, userId, createDb(c.env.DB), c.env.R2);

  let res: Response;
  try {
    res = await fetch(`${compilerUrl}/convert-docx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${compilerToken}`,
      },
      body: JSON.stringify({
        latex_source: doc.latexSource,
        ...(docxImages.length > 0 ? { images: docxImages } : {}),
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `Erro ao conectar ao conversor: ${msg}` }, 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return c.json({ success: false, error: `Erro na conversão (${res.status}): ${text.slice(0, 500)}` }, 502);
  }

  const data = (await res.json()) as {
    success: boolean;
    docx_base64?: string;
    docx_size_bytes?: number;
    error?: string;
  };

  if (!data.success || !data.docx_base64) {
    return c.json({ success: false, error: data.error ?? "Erro na conversão DOCX" }, 500);
  }

  const docxBuffer = Uint8Array.from(atob(data.docx_base64), (ch) => ch.charCodeAt(0));

  const headers = new Headers();
  headers.set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const safeFilename = doc.title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_") || "documento";
  const utf8Filename = encodeURIComponent(doc.title.replace(/\s+/g, "_")) + ".docx";
  headers.set(
    "Content-Disposition",
    `attachment; filename="${safeFilename}.docx"; filename*=UTF-8''${utf8Filename}`,
  );

  return new Response(docxBuffer, { headers });
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

  // Mark as compiling immediately and return
  await db
    .update(latexDocuments)
    .set({ status: "compiling", updatedAt: new Date().toISOString() })
    .where(eq(latexDocuments.id, id));

  const updated = await db.select().from(latexDocuments).where(eq(latexDocuments.id, id)).get();

  // Get AI settings for auto-fix
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  const latexSource = doc.latexSource!;

  const processRecompile = async () => {
    try {
      console.log(`[recompile] Starting for doc ${id}, compiler: ${c.env.LATEX_COMPILER_URL}`);
      const images = await resolveImagesFromLatex(latexSource, userId, db, c.env.R2);
      const imagesParam = images.length > 0 ? images : undefined;

      let compileResult;

      if (settings?.aiProvider && settings?.aiApiKeyEncrypted) {
        let apiKey: string;
        try {
          apiKey = await decrypt(settings.aiApiKeyEncrypted, c.env.SESSION_SECRET);
        } catch {
          apiKey = "";
        }

        if (apiKey) {
          console.log(`[recompile] Using auto-fix with ${settings.aiProvider}`);
          const provider = createAIProvider(settings.aiProvider, apiKey);
          const model = normalizeModelForProvider(settings.aiModel || getLatexModel(settings.aiProvider), settings.aiProvider);
          compileResult = await compileWithAutoFix(
            latexSource,
            c.env.LATEX_COMPILER_URL,
            c.env.LATEX_COMPILER_TOKEN,
            provider,
            model,
            getMaxTokens(doc.sizeLevel),
            imagesParam,
          );
        }
      }

      if (!compileResult) {
        console.log("[recompile] No AI provider, compiling without auto-fix");
        const sanitized = sanitizeLatexSource(latexSource);
        const raw = await compileLatex(sanitized, c.env.LATEX_COMPILER_URL, c.env.LATEX_COMPILER_TOKEN, imagesParam);
        compileResult = { ...raw, latexSource: sanitized, attempts: 1 };
      }

      if (compileResult.success && compileResult.pdfBase64) {
        console.log(`[recompile] Success after ${compileResult.attempts} attempts`);
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
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, id));
      } else {
        console.log(`[recompile] Failed: ${compileResult.lastError?.slice(0, 200)}`);
        await db
          .update(latexDocuments)
          .set({
            status: "compile_error",
            compilationAttempts: (doc.compilationAttempts ?? 0) + compileResult.attempts,
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: compileResult.lastError ?? "Unknown error",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, id));
      }
    } catch (err) {
      console.error(`[recompile] Fatal error for doc ${id}:`, err);
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      await db
        .update(latexDocuments)
        .set({
          status: "compile_error",
          lastCompilationError: `Erro na compilação: ${errorMsg}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(latexDocuments.id, id))
        .catch(() => {});
    }
  };

  c.executionCtx.waitUntil(processRecompile());
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

  // Mark as "generating" immediately and return — process in background
  await db
    .update(latexDocuments)
    .set({ status: "generating", updatedAt: new Date().toISOString() })
    .where(eq(latexDocuments.id, id));

  const updated = await db.select().from(latexDocuments).where(eq(latexDocuments.id, id)).get();

  // Extract body from current source
  const startIdx = doc.latexSource.indexOf("\\begin{document}");
  const preamblePart = startIdx !== -1 ? doc.latexSource.substring(0, startIdx) : "";
  const bodyPart = startIdx !== -1 ? doc.latexSource.substring(startIdx) : doc.latexSource;

  const model = normalizeModelForProvider(settings.aiModel || getLatexModel(settings.aiProvider), settings.aiProvider);
  const editAiProvider = settings.aiProvider!;

  const bgWork = (async () => {
    try {
      const provider = createAIProvider(editAiProvider, apiKey);

      // Fetch user's available images to inform the AI
      const allUserImages = await db
        .select()
        .from(userImages)
        .where(eq(userImages.userId, userId));

      // Build available images section for the system prompt
      let imagePromptSection = "";
      const availableImages = [
        ...allUserImages.map((img) => ({ filename: img.filename, displayName: img.displayName })),
        { filename: "urso-pelucia.png", displayName: "Urso de Pelúcia" },
        { filename: "estrela-dourada.png", displayName: "Estrela Dourada" },
        { filename: "coracao-vermelho.png", displayName: "Coração Vermelho" },
        { filename: "borboleta-colorida.png", displayName: "Borboleta Colorida" },
        { filename: "coruja-sabedoria.png", displayName: "Coruja da Sabedoria" },
        { filename: "livro-aberto.png", displayName: "Livro Aberto" },
        { filename: "lapis-colorido.png", displayName: "Lápis Colorido" },
        { filename: "nuvem-fofa.png", displayName: "Nuvem Fofa" },
        { filename: "arco-iris.png", displayName: "Arco-Íris" },
        { filename: "flor-jardim.png", displayName: "Flor do Jardim" },
        { filename: "sol-sorridente.png", displayName: "Sol Sorridente" },
        { filename: "abc-letras.png", displayName: "Letras ABC" },
      ];

      if (availableImages.length > 0) {
        imagePromptSection = `\n\nIMAGENS DISPONÍVEIS (use \\includegraphics{filename} para incluir):\n${availableImages.map((img) => `- ${img.filename} — ${img.displayName}`).join("\n")}\nPara incluir uma imagem: \\includegraphics[width=3cm]{filename}\nVocê pode ajustar width conforme necessário. Use \\begin{center}...\\end{center} para centralizar.`;
      }

      const result = await provider.generate({
        model,
        messages: [
          {
            role: "system",
            content:
              `Você é um especialista em LaTeX. Edite o corpo LaTeX seguindo a instrução do usuário. Retorne APENAS o corpo modificado (de \\begin{document} a \\end{document}), sem explicações, sem fence blocks. O preâmbulo é gerenciado externamente — não o inclua.${imagePromptSection}`,
          },
          {
            role: "user",
            content: `INSTRUÇÃO: ${body.instruction}\n\nCÓDIGO LATEX ATUAL:\n${bodyPart}`,
          },
        ],
        maxTokens: getMaxTokens(doc.sizeLevel),
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

      // Resolve images referenced in the edited LaTeX source
      const images = await resolveImagesFromLatex(newSource, userId, db, c.env.R2);

      // Recompile
      const compileResult = await compileWithAutoFix(
        newSource,
        c.env.LATEX_COMPILER_URL,
        c.env.LATEX_COMPILER_TOKEN,
        provider,
        model,
        getMaxTokens(doc.sizeLevel),
        images.length > 0 ? images : undefined,
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
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
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
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: compileResult.lastError ?? "Unknown error",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, id));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      await db
        .update(latexDocuments)
        .set({
          status: "error",
          lastCompilationError: `Erro na edição: ${errorMsg}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(latexDocuments.id, id));
    }
  })();

  c.executionCtx.waitUntil(bgWork);
  return c.json({ success: true, data: updated });
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

  // Build prompt with same heat/size/printMode
  const heatLevel = doc.heatLevel;
  const sizeLevel = doc.sizeLevel;
  const printMode = doc.printMode === "bw" ? "bw" as const : "color" as const;

  // Fetch session data for types that benefit from it
  let regenSessionData: SessionSummary[] | undefined;
  if (SESSION_DATA_TYPES.has(doc.documentType)) {
    regenSessionData = await fetchSessionSummaries(db, userId, doc.studentId);
  }

  const { system, user } = buildLatexPrompt(
    student as unknown as Parameters<typeof buildLatexPrompt>[0],
    doc.documentType,
    heatLevel,
    sizeLevel,
    undefined,
    regenSessionData,
  );

  const now = new Date().toISOString();
  const newDocId = crypto.randomUUID();
  const model = normalizeModelForProvider(settings.aiModel || getLatexModel(settings.aiProvider), settings.aiProvider);
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
    printMode,
    aiProvider: settings.aiProvider,
    aiModel: model,
    compilationAttempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Return immediately — process in background
  const newDoc = await db.select().from(latexDocuments).where(eq(latexDocuments.id, newDocId)).get();
  const regenAiProvider = settings.aiProvider!;

  const regenMaxTokens = getMaxTokens(sizeLevel);

  // Generate LaTeX via user's AI key, then compile via Python service.
  const processRegenerate = async () => {
    try {
      if (!c.env.LATEX_COMPILER_URL) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: "LATEX_COMPILER_URL não configurado.", updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, newDocId));
        return;
      }

      const preamble = getLatexPreamble({
        documentTitle: typeName,
        studentName: student.name,
        schoolName: student.school ?? "Escola",
        printMode,
      });

      console.log(`[regenerate] Starting AI generation with ${regenAiProvider}/${model}`);

      const provider = createAIProvider(regenAiProvider, apiKey);
      const result = await provider.generate({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: regenMaxTokens,
        temperature: 0.7,
      });

      let latexBody = extractLatexBody(result.content);

      const qualityError = checkContentQuality(latexBody);
      if (qualityError) {
        await db
          .update(latexDocuments)
          .set({ status: "error", lastCompilationError: qualityError, updatedAt: new Date().toISOString() })
          .where(eq(latexDocuments.id, newDocId));
        return;
      }

      latexBody = injectSignatureBlock(latexBody, doc.documentType, student as Parameters<typeof buildSignatureBlock>[1]);
      const fullSource = preamble + latexBody;

      await db
        .update(latexDocuments)
        .set({ latexSource: fullSource, status: "compiling", generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, newDocId));

      const images = await resolveImagesFromLatex(fullSource, userId, db, c.env.R2);

      const compileResult = await compileWithAutoFix(
        fullSource,
        c.env.LATEX_COMPILER_URL,
        c.env.LATEX_COMPILER_TOKEN,
        provider,
        model,
        regenMaxTokens,
        images.length > 0 ? images : undefined,
      );

      if (compileResult.success && compileResult.pdfBase64) {
        console.log(`[regenerate] Success after ${compileResult.attempts} attempts`);
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
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, newDocId));
      } else {
        console.log(`[regenerate] Compile failed: ${compileResult.lastError?.slice(0, 200)}`);
        await db
          .update(latexDocuments)
          .set({
            latexSource: compileResult.latexSource,
            status: "compile_error",
            compilationAttempts: compileResult.attempts,
            compilationWarnings: JSON.stringify(filterDisplayWarnings(compileResult.warnings ?? [])),
            lastCompilationError: compileResult.lastError ?? "Erro na compilação",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(latexDocuments.id, newDocId));
      }
    } catch (err) {
      console.error(`[regenerate] Fatal error for doc ${newDocId}:`, err);
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido na geração";
      await db
        .update(latexDocuments)
        .set({ status: "error", lastCompilationError: errorMsg, updatedAt: new Date().toISOString() })
        .where(eq(latexDocuments.id, newDocId))
        .catch(() => {});
    }
  };

  c.executionCtx.waitUntil(processRegenerate());
  return c.json({ success: true, data: newDoc }, 201);
});
