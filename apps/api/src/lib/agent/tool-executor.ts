import { eq, and, or } from "drizzle-orm";
import {
  workspaceFiles,
  workspaceProjects,
  students,
  prompts,
} from "@aee-pro/db/schema";
import type { Database } from "../../db/index";
import { compileLatex, type CompileImage, type CompileFile } from "../latex/compiler-client";
import { sanitizeLatexSource } from "../latex/sanitizer";
import { injectProfessionalPreamble } from "../latex/preamble";
import { validateAndFixLatex } from "../latex/validator";
import { PRO_MAX_ENHANCEMENTS } from "../latex/document-types";
import { analyzeLatexStructure, formatQualityReport } from "../latex/quality-analyzer";
import { saveVersion } from "../../routes/workspace-drive";

/** Yield control to the event loop so other requests can be processed */
const yieldEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

export interface ToolExecContext {
  db: Database;
  r2: R2Bucket;
  userId: string;
  projectId: string;
  compilerUrl: string;
  compilerToken: string;
  aiApiKey?: string;
  aiProvider?: string;
  qualityMode?: "standard" | "promax";
}

export interface ToolExecResult {
  success: boolean;
  output?: string;
  error?: string;
  fileId?: string;
  filePath?: string;
  /** ID of the version snapshot saved before modification (for undo) */
  versionId?: string;
  /** Truncated old text for inline diff display (edit_file only) */
  oldText?: string;
  /** Truncated new text for inline diff display (edit_file only) */
  newText?: string;
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  try {
    // Validate required parameters before calling tools
    const requireParam = (name: string): string => {
      const val = input[name];
      if (val == null || (typeof val === "string" && !val.trim())) {
        throw new Error(`Parâmetro obrigatório "${name}" não fornecido.`);
      }
      return String(val);
    };

    switch (toolName) {
      case "read_file":
        return await readFile(requireParam("path"), ctx);
      case "write_file":
        return await writeFile(
          requireParam("path"),
          requireParam("content"),
          ctx
        );
      case "edit_file":
        return await editFile(
          requireParam("path"),
          requireParam("old_text"),
          requireParam("new_text"),
          ctx,
          input.replace_all as boolean | undefined
        );
      case "list_files":
        return await listFiles(ctx);
      case "delete_file":
        return await deleteFile(requireParam("path"), ctx);
      case "rename_file":
        return await renameFile(
          requireParam("old_path"),
          requireParam("new_path"),
          ctx
        );
      case "search_files":
        return await searchFiles(requireParam("query"), ctx);
      case "compile_latex":
        return await compileLatexFile(requireParam("path"), ctx);
      case "get_student_data":
        return await getStudentData(ctx, input.name as string | undefined);
      case "get_prompt_template":
        return await getPromptTemplate(requireParam("slug"), ctx);
      case "assess_quality":
        return await assessQuality(requireParam("path"), ctx);
      default:
        return { success: false, error: `Tool desconhecida: ${toolName}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Erro ao executar ${toolName}: ${msg}` };
  }
}

// ---------- Tool implementations ----------

async function readFile(
  path: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  const file = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, path)
      )
    )
    .get();

  if (!file) {
    return { success: false, error: `Arquivo não encontrado: ${path}` };
  }

  const object = await ctx.r2.get(file.r2Key);
  if (!object) {
    return {
      success: false,
      error: `Arquivo não encontrado no armazenamento: ${path}`,
    };
  }

  // For binary files, return metadata only
  if (isBinaryMime(file.mimeType)) {
    return {
      success: true,
      output: `[Arquivo binário: ${file.mimeType}, ${file.sizeBytes} bytes]`,
      fileId: file.id,
      filePath: path,
    };
  }

  const text = await object.text();
  return { success: true, output: text, fileId: file.id, filePath: path };
}

async function writeFile(
  path: string,
  content: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  const r2Key = `workspace/${ctx.userId}/${ctx.projectId}/${path}`;
  const mimeType = guessMimeType(path);
  let cleanContent = unescapeAIContent(content);
  if (path.endsWith(".tex")) {
    cleanContent = fixDoubleEscapedLatex(cleanContent);
  }
  const contentBytes = new TextEncoder().encode(cleanContent);
  const now = new Date().toISOString();

  await ctx.r2.put(r2Key, contentBytes, {
    httpMetadata: { contentType: mimeType },
  });

  // Upsert in DB
  const existing = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, path)
      )
    )
    .get();

  let fileId: string;

  let versionId: string | null = null;

  if (existing) {
    // Save current version before overwriting
    versionId = await saveVersion(existing.id, existing.r2Key, existing.sizeBytes ?? 0, ctx.db, ctx.r2).catch(() => null);
    if (existing.r2Key !== r2Key) {
      await ctx.r2.delete(existing.r2Key).catch(() => {});
    }
    await ctx.db
      .update(workspaceFiles)
      .set({
        mimeType,
        sizeBytes: contentBytes.byteLength,
        r2Key,
        updatedAt: now,
      })
      .where(eq(workspaceFiles.id, existing.id));
    fileId = existing.id;
  } else {
    fileId = crypto.randomUUID();
    await ctx.db.insert(workspaceFiles).values({
      id: fileId,
      projectId: ctx.projectId,
      userId: ctx.userId,
      path,
      mimeType,
      sizeBytes: contentBytes.byteLength,
      r2Key,
      isOutput: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    success: true,
    output: `Arquivo ${existing ? "atualizado" : "criado"}: ${path} (${contentBytes.byteLength} bytes)`,
    fileId,
    filePath: path,
    ...(versionId ? { versionId } : {}),
  };
}

async function editFile(
  path: string,
  oldText: string,
  newText: string,
  ctx: ToolExecContext,
  replaceAll?: boolean
): Promise<ToolExecResult> {
  const file = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, path)
      )
    )
    .get();

  if (!file) {
    return { success: false, error: `Arquivo não encontrado: ${path}` };
  }

  const object = await ctx.r2.get(file.r2Key);
  if (!object) {
    return { success: false, error: `Conteúdo não encontrado: ${path}` };
  }

  const content = await object.text();

  // AI models sometimes double-escape newlines in tool arguments
  let cleanOld = unescapeAIContent(oldText);
  let cleanNew = unescapeAIContent(newText);
  // Fix double-escaped LaTeX in .tex files
  if (path.endsWith(".tex")) {
    cleanOld = fixDoubleEscapedLatex(cleanOld);
    cleanNew = fixDoubleEscapedLatex(cleanNew);
  }
  // Normalize line endings (\r\n → \n)
  const normContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const normOld = cleanOld.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Try progressively more lenient matching strategies
  let matchedOld: string;
  let targetContent: string;

  // Helpers for fuzzy matching
  const trimLines = (s: string) =>
    s.split("\n").map((l) => l.trimEnd()).join("\n");
  const collapseWhitespace = (s: string) =>
    s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trimEnd()).join("\n");
  const collapseBlankLines = (s: string) =>
    s.replace(/\n{3,}/g, "\n\n");

  if (content.includes(cleanOld)) {
    // 1. Exact match
    matchedOld = cleanOld;
    targetContent = content;
  } else if (normContent.includes(normOld)) {
    // 2. Normalized line endings
    matchedOld = normOld;
    targetContent = normContent;
  } else if (trimLines(normContent).includes(trimLines(normOld))) {
    // 3. Trim trailing whitespace per line
    matchedOld = trimLines(normOld);
    targetContent = trimLines(normContent);
  } else if (
    collapseBlankLines(collapseWhitespace(normContent)).includes(
      collapseBlankLines(collapseWhitespace(normOld))
    )
  ) {
    // 4. Collapse runs of spaces/tabs → single space, collapse 3+ blank lines → 2
    matchedOld = collapseBlankLines(collapseWhitespace(normOld));
    targetContent = collapseBlankLines(collapseWhitespace(normContent));
  } else if (
    path.endsWith(".tex") &&
    fixDoubleEscapedLatex(normContent).includes(normOld)
  ) {
    // 5. File content is double-escaped but old_text is correct — match against unescaped file
    matchedOld = normOld;
    targetContent = fixDoubleEscapedLatex(normContent);
  } else {
    // Build helpful error with nearby context
    const firstLine = normOld.split("\n")[0].trim();
    let hint = "\n\nDica: use read_file para ver o conteúdo atual antes de editar.";
    if (firstLine && firstLine.length >= 5) {
      const lines = normContent.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(firstLine)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 8);
          const snippet = lines.slice(start, end)
            .map((l, idx) => `${start + idx + 1}: ${l}`)
            .join("\n");
          hint = `\n\nTrecho próximo encontrado nas linhas ${start + 1}-${end}:\n${snippet}`;
          break;
        }
      }
    }
    return {
      success: false,
      error: `Texto não encontrado no arquivo ${path}. O old_text não corresponde ao conteúdo real.${hint}`,
    };
  }

  // Save current version before editing
  const versionId = await saveVersion(file.id, file.r2Key, file.sizeBytes ?? 0, ctx.db, ctx.r2).catch(() => null);

  const newContent = replaceAll
    ? targetContent.split(matchedOld).join(cleanNew)
    : targetContent.replace(matchedOld, cleanNew);
  const contentBytes = new TextEncoder().encode(newContent);

  await ctx.r2.put(file.r2Key, contentBytes, {
    httpMetadata: { contentType: file.mimeType },
  });

  await ctx.db
    .update(workspaceFiles)
    .set({
      sizeBytes: contentBytes.byteLength,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaceFiles.id, file.id));

  // Truncate diff text for frontend display (~2000 chars)
  const maxDiff = 2000;
  const truncOld = matchedOld.length > maxDiff ? matchedOld.slice(0, maxDiff) + "\n..." : matchedOld;
  const truncNew = cleanNew.length > maxDiff ? cleanNew.slice(0, maxDiff) + "\n..." : cleanNew;

  return {
    success: true,
    output: `Arquivo editado: ${path} (substituição feita)`,
    fileId: file.id,
    filePath: path,
    ...(versionId ? { versionId } : {}),
    oldText: truncOld,
    newText: truncNew,
  };
}

async function listFiles(ctx: ToolExecContext): Promise<ToolExecResult> {
  const files = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, ctx.projectId))
    .orderBy(workspaceFiles.path);

  if (files.length === 0) {
    return { success: true, output: "Nenhum arquivo no projeto." };
  }

  const listing = files
    .map(
      (f) =>
        `${f.path} (${f.mimeType}, ${formatBytes(f.sizeBytes ?? 0)}${f.isOutput ? ", output" : ""})`
    )
    .join("\n");

  return { success: true, output: listing };
}

async function deleteFile(
  path: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  const file = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, path)
      )
    )
    .get();

  if (!file) {
    return { success: false, error: `Arquivo não encontrado: ${path}` };
  }

  await ctx.r2.delete(file.r2Key).catch(() => {});
  await ctx.db.delete(workspaceFiles).where(eq(workspaceFiles.id, file.id));

  return {
    success: true,
    output: `Arquivo removido: ${path}`,
    filePath: path,
  };
}

async function searchFiles(
  query: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  const files = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, ctx.projectId));

  const textFiles = files.filter((f) => !isBinaryMime(f.mimeType));
  const results: string[] = [];

  for (const file of textFiles) {
    const object = await ctx.r2.get(file.r2Key);
    if (!object) continue;

    const content = await object.text();
    const lines = content.split("\n");
    const regex = new RegExp(query, "gi");

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push(`${file.path}:${i + 1}: ${lines[i].trim()}`);
      }
      regex.lastIndex = 0;
    }
  }

  if (results.length === 0) {
    return { success: true, output: `Nenhuma ocorrência de "${query}" encontrada.` };
  }

  return {
    success: true,
    output: `${results.length} resultado(s) encontrado(s):\n${results.slice(0, 50).join("\n")}`,
  };
}

async function compileLatexFile(
  path: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  console.log("[compile_latex] START", path);
  console.log("[compile_latex] step 1: DB query for file");
  // Read the .tex file
  const file = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, path)
      )
    )
    .get();

  if (!file) {
    return { success: false, error: `Arquivo não encontrado: ${path}` };
  }

  console.log("[compile_latex] step 2: R2 read");
  const object = await ctx.r2.get(file.r2Key);
  if (!object) {
    return { success: false, error: `Conteúdo não encontrado: ${path}` };
  }

  console.log("[compile_latex] step 3: text()");
  let rawSource = await object.text();
  console.log("[compile_latex] step 3 done, rawSource length:", rawSource.length);

  // Fix double-escaped LaTeX (\\begin → \begin) and write back permanently
  const fixedEscape = fixDoubleEscapedLatex(rawSource);
  if (fixedEscape !== rawSource) {
    rawSource = fixedEscape;
    console.log("[compile_latex] fixed double-escaped LaTeX — writing back to file");
    const fixedBytes = new TextEncoder().encode(rawSource);
    await ctx.r2.put(file.r2Key, fixedBytes, {
      httpMetadata: { contentType: file.mimeType },
    });
    await ctx.db
      .update(workspaceFiles)
      .set({ sizeBytes: fixedBytes.byteLength, updatedAt: new Date().toISOString() })
      .where(eq(workspaceFiles.id, file.id));
  }

  // Validate & auto-fix with Haiku BEFORE preamble/sanitization
  // Fixes are written back to the stored file so the AI sees the corrected version
  if (ctx.aiApiKey && ctx.aiProvider === "anthropic") {
    console.log("[compile_latex] step 3b: Haiku validation START");
    await yieldEventLoop();
    const validation = await validateAndFixLatex(rawSource, ctx.aiApiKey);
    if (validation.applied > 0) {
      rawSource = validation.source;
      console.log(`[compile_latex] Haiku validation: ${validation.applied} fix(es) applied — writing back to file`);
      // Write corrected source back to R2 so AI and user see the fixes
      const fixedBytes = new TextEncoder().encode(rawSource);
      await ctx.r2.put(file.r2Key, fixedBytes, {
        httpMetadata: { contentType: file.mimeType },
      });
      await ctx.db
        .update(workspaceFiles)
        .set({ sizeBytes: fixedBytes.byteLength, updatedAt: new Date().toISOString() })
        .where(eq(workspaceFiles.id, file.id));
    } else {
      console.log("[compile_latex] Haiku validation: VALID (no fixes needed)");
    }
    await yieldEventLoop();
  }

  // Auto-inject professional preamble:
  // - If AI wrote \documentclass: replace its preamble with the professional one
  // - If AI followed instructions (no \documentclass, starts at \begin{document}): prepend professional preamble
  let sourceForSanitize = rawSource;
  if (rawSource.includes("\\begin{document}")) {
    // Get fallback student/school from project
    let fallbackStudent: string | undefined;
    let fallbackSchool: string | undefined;
    try {
      const project = await ctx.db
        .select()
        .from(workspaceProjects)
        .where(eq(workspaceProjects.id, ctx.projectId))
        .get();
      if (project?.studentId) {
        const student = await ctx.db
          .select()
          .from(students)
          .where(and(eq(students.id, project.studentId), eq(students.userId, ctx.userId)))
          .get();
        if (student) {
          fallbackStudent = student.name || undefined;
          fallbackSchool = student.school || undefined;
        }
      }
    } catch { /* non-critical — proceed without fallbacks */ }

    const fallbackTitle = path.replace(/\.tex$/, "").replace(/[-_]/g, " ");
    sourceForSanitize = injectProfessionalPreamble(rawSource, fallbackTitle, fallbackStudent, fallbackSchool);
    console.log("[compile_latex] preamble injected, new length:", sourceForSanitize.length);
  }

  // Sanitize: fix common AI-generated LaTeX issues (same pipeline as document generation)
  // Yield before/after because the sanitizer runs 24+ regex passes synchronously
  await yieldEventLoop();
  console.log("[compile_latex] step 4: sanitize START");
  const sanitizeStart = Date.now();
  let latexSource = sanitizeLatexSource(sourceForSanitize);
  console.log("[compile_latex] step 4a: sanitize done in", Date.now() - sanitizeStart, "ms");
  // Fix \\ after sectioning commands — causes "There's no line here to end"
  latexSource = fixLineBreakAfterSectioning(latexSource);
  console.log("[compile_latex] step 4b: fixLineBreak done");
  await yieldEventLoop();

  // Collect all project files for compilation
  const allFiles = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(eq(workspaceFiles.projectId, ctx.projectId));

  // Collect images
  const images: CompileImage[] = [];
  const imageFiles = allFiles.filter((f) => f.mimeType.startsWith("image/"));

  for (const img of imageFiles) {
    const imgObj = await ctx.r2.get(img.r2Key);
    if (!imgObj) continue;
    const buffer = await imgObj.arrayBuffer();
    // Chunk-based base64 to avoid stack overflow with large images
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
    }
    images.push({ filename: img.path, data_base64: btoa(binary) });
  }

  // Collect additional text files (.tex, .bib, .sty, .cls) — everything except the main file
  const additionalFiles: CompileFile[] = [];
  const auxExtensions = [".tex", ".bib", ".sty", ".cls", ".bst"];
  const auxFiles = allFiles.filter(
    (f) =>
      f.path !== path &&
      auxExtensions.some((ext) => f.path.endsWith(ext))
  );

  for (const aux of auxFiles) {
    const auxObj = await ctx.r2.get(aux.r2Key);
    if (!auxObj) continue;
    const content = await auxObj.text();
    additionalFiles.push({ filename: aux.path, content });
  }

  // Yield after collecting all files (image encoding can be CPU-heavy)
  if (images.length > 0) await yieldEventLoop();

  // Compile with auto-retry for "no line here to end" / "Illegal unit of measure" errors
  const MAX_AUTO_RETRIES = 5;
  let compileSource = latexSource;
  let result: Awaited<ReturnType<typeof compileLatex>> = { success: false, error: "Compilação não executada" };
  let autoFixes = 0;

  for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
    console.log("[compile_latex] calling compiler, attempt:", attempt, "source length:", compileSource.length, "images:", images.length, "files:", additionalFiles.length);
    result = await compileLatex(
      compileSource,
      ctx.compilerUrl,
      ctx.compilerToken,
      images.length > 0 ? images : undefined,
      additionalFiles.length > 0 ? additionalFiles : undefined
    );

    if (result.success) break;

    // Auto-fix "There's no line here to end" or "Illegal unit of measure" — parse line number
    const lineMatch = result.error?.match(/(?:line |l\.|ERRO na linha )(\d+).*(?:no line here to end|Illegal unit of measure)/i);

    if (!lineMatch || attempt === MAX_AUTO_RETRIES) break;

    const errorLine = parseInt(lineMatch[1], 10);
    const lines = compileSource.split("\n");
    if (errorLine < 1 || errorLine > lines.length) break;

    const idx = errorLine - 1;
    const line = lines[idx];
    let fixed = false;

    // Strategy 1: remove \\ from the offending line
    if (line.includes("\\\\")) {
      lines[idx] = line.replace(/\\\\\s*(\[[^\]]*\])?/, "");
      fixed = true;
      console.log(`[compile_latex] auto-fix #${attempt + 1}: removed \\\\ from line ${errorLine}`);
    }
    // Strategy 2: the previous line ends with \\ after \vspace or \end
    if (!fixed && idx > 0 && lines[idx - 1].includes("\\\\")) {
      lines[idx - 1] = lines[idx - 1].replace(/\\\\\s*(\[[^\]]*\])?/, "");
      fixed = true;
      console.log(`[compile_latex] auto-fix #${attempt + 1}: removed \\\\ from line ${errorLine - 1}`);
    }
    // Strategy 3: if the line is blank or just whitespace, remove it
    if (!fixed && line.trim() === "") {
      lines.splice(idx, 1);
      fixed = true;
      console.log(`[compile_latex] auto-fix #${attempt + 1}: removed blank line ${errorLine}`);
    }
    // Strategy 4: insert \leavevmode to create paragraph context where \\ is valid
    if (!fixed && !line.trim().startsWith("\\leavevmode")) {
      lines[idx] = "\\leavevmode " + line;
      fixed = true;
      console.log(`[compile_latex] auto-fix #${attempt + 1}: inserted \\leavevmode before line ${errorLine}`);
    }
    // Strategy 5: comment out the problematic line entirely
    if (!fixed) {
      lines[idx] = "% AUTO-FIX: " + lines[idx];
      fixed = true;
      console.log(`[compile_latex] auto-fix #${attempt + 1}: commented out line ${errorLine}`);
    }

    if (fixed) {
      autoFixes++;
      compileSource = lines.join("\n");
    } else {
      break;
    }

    await yieldEventLoop();
  }

  console.log("[compile_latex] compiler returned, success:", result.success, autoFixes > 0 ? `(${autoFixes} auto-fix(es))` : "");
  if (!result.success) {
    const autoFixNote = autoFixes > 0
      ? `\n\n[Auto-fix tentou ${autoFixes} correção(ões) automáticas (remover \\\\, \\leavevmode, comentar linha) mas o erro persistiu. A linha problemática precisa ser reescrita manualmente.]`
      : "";
    return {
      success: false,
      error: `Erro de compilação:\n${result.error}${autoFixNote}`,
    };
  }

  if (autoFixes > 0) {
    // Update latexSource for any downstream use
    latexSource = compileSource;
  }

  // Yield after compiler returns (large base64 response)
  await yieldEventLoop();

  // Save PDF to R2
  console.log("[compile_latex] saving PDF to R2, base64 length:", result.pdfBase64?.length);
  const pdfPath = path.replace(/\.tex$/, ".pdf");
  const pdfR2Key = `workspace/${ctx.userId}/${ctx.projectId}/output/${pdfPath}`;
  // Chunked base64 decode — avoids per-byte callback that blocks event loop
  const pdfBinary = atob(result.pdfBase64!);
  const pdfBytes = new Uint8Array(pdfBinary.length);
  for (let i = 0; i < pdfBinary.length; i++) {
    pdfBytes[i] = pdfBinary.charCodeAt(i);
  }

  await ctx.r2.put(pdfR2Key, pdfBytes, {
    httpMetadata: { contentType: "application/pdf" },
  });

  // Upsert PDF file record
  const now = new Date().toISOString();
  const existingPdf = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, `output/${pdfPath}`)
      )
    )
    .get();

  if (existingPdf) {
    await ctx.db
      .update(workspaceFiles)
      .set({
        sizeBytes: pdfBytes.byteLength,
        r2Key: pdfR2Key,
        updatedAt: now,
      })
      .where(eq(workspaceFiles.id, existingPdf.id));
  } else {
    await ctx.db.insert(workspaceFiles).values({
      id: crypto.randomUUID(),
      projectId: ctx.projectId,
      userId: ctx.userId,
      path: `output/${pdfPath}`,
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
      r2Key: pdfR2Key,
      isOutput: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  const autoFixNote = autoFixes > 0
    ? `\n(${autoFixes} correção(ões) automática(s) aplicada(s) durante compilação: "no line here to end" corrigido)`
    : "";

  // Format warnings with severity classification
  let warningsNote = "";
  if (result.warnings?.length) {
    const overfullHbox: string[] = [];
    const underfullHbox: string[] = [];
    const otherWarnings: string[] = [];
    let maxOverfullPt = 0;

    for (const w of result.warnings) {
      const overfullMatch = w.match(/Overfull \\hbox \((\d+(?:\.\d+)?)pt too wide\)/);
      if (overfullMatch) {
        overfullHbox.push(w);
        const pt = parseFloat(overfullMatch[1]);
        if (pt > maxOverfullPt) maxOverfullPt = pt;
      } else if (w.includes("Underfull")) {
        underfullHbox.push(w);
      } else {
        otherWarnings.push(w);
      }
    }

    const parts: string[] = [];
    if (overfullHbox.length > 0) {
      const severity = maxOverfullPt > 10 ? "ATENÇÃO: conteúdo pode estar cortado" : "cosmético";
      parts.push(`${overfullHbox.length} Overfull hbox (máx ${maxOverfullPt.toFixed(1)}pt — ${severity})`);
    }
    if (underfullHbox.length > 0) {
      parts.push(`${underfullHbox.length} Underfull hbox (cosmético, pode ignorar)`);
    }
    if (otherWarnings.length > 0) {
      parts.push(`${otherWarnings.length} outro(s): ${otherWarnings.slice(0, 3).join("; ")}`);
    }
    warningsNote = `\nWarnings (${result.warnings.length}): ${parts.join(" | ")}`;
  }

  return {
    success: true,
    output: `Compilação bem-sucedida! PDF gerado: output/${pdfPath} (${formatBytes(pdfBytes.byteLength)})${autoFixNote}${warningsNote}`,
    filePath: `output/${pdfPath}`,
  };
}

async function getStudentData(
  ctx: ToolExecContext,
  searchName?: string
): Promise<ToolExecResult> {
  // 1. Try to resolve from project link first
  const project = await ctx.db
    .select()
    .from(workspaceProjects)
    .where(eq(workspaceProjects.id, ctx.projectId))
    .get();

  const sid = project?.studentId && project.studentId !== "null" ? project.studentId : null;

  if (sid) {
    const student = await ctx.db
      .select()
      .from(students)
      .where(and(eq(students.id, sid), eq(students.userId, ctx.userId)))
      .get();

    if (student) {
      const data = Object.entries(student)
        .filter(([_, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      return { success: true, output: data };
    }
  }

  // 2. No linked student — search by name if provided
  if (searchName) {
    const allStudents = await ctx.db
      .select()
      .from(students)
      .where(eq(students.userId, ctx.userId));

    const term = searchName.toLowerCase();
    const matches = allStudents.filter((s) =>
      s.name.toLowerCase().includes(term)
    );

    if (matches.length === 1) {
      // Exact single match — return data and auto-link to project
      const student = matches[0];
      await ctx.db
        .update(workspaceProjects)
        .set({ studentId: student.id })
        .where(eq(workspaceProjects.id, ctx.projectId));

      const data = Object.entries(student)
        .filter(([_, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      return { success: true, output: `(Aluno vinculado automaticamente ao projeto)\n\n${data}` };
    }

    if (matches.length > 1) {
      const list = matches.map((s) => `- ${s.name} (${s.diagnosis || "sem diagnóstico"}, ${s.grade || "série não informada"})`).join("\n");
      return {
        success: false,
        error: `Encontrei ${matches.length} alunos com "${searchName}":\n${list}\n\nEspecifique melhor o nome para eu selecionar o correto.`,
      };
    }

    return {
      success: false,
      error: `Nenhum aluno encontrado com o nome "${searchName}". Verifique o nome ou peça à professora para cadastrar o aluno.`,
    };
  }

  // 3. No linked student, no search name — list available students
  const allStudents = await ctx.db
    .select({ id: students.id, name: students.name, diagnosis: students.diagnosis, grade: students.grade })
    .from(students)
    .where(eq(students.userId, ctx.userId));

  if (allStudents.length === 0) {
    return {
      success: false,
      error: "Nenhum aluno cadastrado. Peça o nome, diagnóstico e série do aluno diretamente à professora.",
    };
  }

  if (allStudents.length === 1) {
    // Only one student — auto-link and return
    const student = await ctx.db
      .select()
      .from(students)
      .where(and(eq(students.id, allStudents[0].id), eq(students.userId, ctx.userId)))
      .get();

    if (student) {
      await ctx.db
        .update(workspaceProjects)
        .set({ studentId: student.id })
        .where(eq(workspaceProjects.id, ctx.projectId));

      const data = Object.entries(student)
        .filter(([_, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      return { success: true, output: `(Único aluno cadastrado — vinculado automaticamente ao projeto)\n\n${data}` };
    }
  }

  const list = allStudents.map((s) => `- ${s.name} (${s.diagnosis || "sem diagnóstico"}, ${s.grade || "série não informada"})`).join("\n");
  return {
    success: false,
    error: `Nenhum aluno vinculado ao projeto. Alunos disponíveis:\n${list}\n\nDiga o nome do aluno ou chame get_student_data(name: "nome") para selecionar.`,
  };
}

async function getPromptTemplate(
  slug: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  const prompt = await ctx.db
    .select()
    .from(prompts)
    .where(
      and(
        eq(prompts.slug, slug),
        or(
          eq(prompts.isBuiltIn, true),
          eq(prompts.userId, ctx.userId)
        )
      )
    )
    .get();

  if (!prompt) {
    // List available slugs (only built-in + own)
    const allPrompts = await ctx.db
      .select({ slug: prompts.slug, name: prompts.name })
      .from(prompts)
      .where(
        or(
          eq(prompts.isBuiltIn, true),
          eq(prompts.userId, ctx.userId)
        )
      );
    const available = allPrompts.map((p) => `${p.slug} — ${p.name}`).join("\n");
    return {
      success: false,
      error: `Template não encontrado: ${slug}\n\nTemplates disponíveis:\n${available}`,
    };
  }

  let output = `Template: ${prompt.name}\n\n${prompt.promptTemplate || "(template vazio)"}`;

  // Append Pro Max enhancements when in promax mode
  if (ctx.qualityMode === "promax" && PRO_MAX_ENHANCEMENTS[slug]) {
    output += `\n\n--- INSTRUÇÕES PRO MAX ---\n${PRO_MAX_ENHANCEMENTS[slug]}`;
  }

  return {
    success: true,
    output,
  };
}

async function assessQuality(
  filePath: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  // Read the .tex file from R2
  const file = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, filePath)
      )
    )
    .get();

  if (!file) {
    return { success: false, error: `Arquivo não encontrado: ${filePath}` };
  }

  if (!filePath.endsWith(".tex")) {
    return { success: false, error: `assess_quality só funciona com arquivos .tex` };
  }

  const r2Object = await ctx.r2.get(`projects/${ctx.projectId}/${filePath}`);
  if (!r2Object) {
    return { success: false, error: `Conteúdo não encontrado no R2: ${filePath}` };
  }

  const content = await r2Object.text();
  const metrics = analyzeLatexStructure(content);
  const report = formatQualityReport(metrics, ctx.qualityMode || "standard");

  return {
    success: true,
    output: report,
  };
}

async function renameFile(
  oldPath: string,
  newPath: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  const file = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, oldPath)
      )
    )
    .get();

  if (!file) {
    return { success: false, error: `Arquivo não encontrado: ${oldPath}` };
  }

  // Check if target path already exists
  const existing = await ctx.db
    .select()
    .from(workspaceFiles)
    .where(
      and(
        eq(workspaceFiles.projectId, ctx.projectId),
        eq(workspaceFiles.path, newPath)
      )
    )
    .get();

  if (existing) {
    return { success: false, error: `Já existe um arquivo em: ${newPath}` };
  }

  const newR2Key = `workspace/${ctx.userId}/${ctx.projectId}/${newPath}`;
  const newMimeType = guessMimeType(newPath);

  // Copy object in R2 to new key
  const object = await ctx.r2.get(file.r2Key);
  if (!object) {
    return { success: false, error: `Conteúdo não encontrado para: ${oldPath}` };
  }

  const body = await object.arrayBuffer();
  await ctx.r2.put(newR2Key, body, {
    httpMetadata: { contentType: newMimeType },
  });

  // Delete old R2 key if different
  if (file.r2Key !== newR2Key) {
    await ctx.r2.delete(file.r2Key).catch(() => {});
  }

  // Update DB record
  await ctx.db
    .update(workspaceFiles)
    .set({
      path: newPath,
      r2Key: newR2Key,
      mimeType: newMimeType,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaceFiles.id, file.id));

  return {
    success: true,
    output: `Arquivo renomeado: ${oldPath} → ${newPath}`,
    fileId: file.id,
    filePath: newPath,
  };
}

// ---------- helpers ----------

/**
 * AI models sometimes double-escape newlines in tool call JSON arguments,
 * producing literal \n (two chars: backslash + n) instead of real newlines.
 * Detect and fix: if content has no real newlines but contains literal \n
 * and is non-trivial in length, unescape it.
 */
function unescapeAIContent(content: string): string {
  if (content.length > 80 && !content.includes("\n") && content.includes("\\n")) {
    return content.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  }
  return content;
}

/**
 * Fix double-escaped LaTeX: AI sometimes writes \\begin instead of \begin,
 * \\section instead of \section, etc. This happens when the model treats
 * backslash as an escape character and doubles every one.
 *
 * Detection: count occurrences of \\ before common LaTeX command names.
 * If >= 3 matches, the content is double-escaped.
 *
 * Fix: replace every \\ with \ globally. This correctly handles:
 *   \\begin{doc}  → \begin{doc}   (command fixed)
 *   \\\\          → \\            (line break preserved)
 *   \\textbf{x}   → \textbf{x}   (command fixed)
 */
function fixDoubleEscapedLatex(content: string): string {
  const doubleEscapeCount = (content.match(
    /\\\\(?:begin|end|section|subsection|subsubsection|paragraph|textbf|textit|textrm|textsc|texttt|vspace|hspace|rule|centering|raggedright|raggedleft|documentclass|usepackage|item|newpage|clearpage|maketitle|tableofcontents|noindent|par|small|footnotesize|scriptsize|tiny|normalsize|large|Large|LARGE|huge|Huge|linewidth|textwidth|columnwidth|rowcolor|cellcolor|hfill|vfill|emph|underline|caption|label|ref|footnote|setlength|renewcommand|newcommand|definecolor|color|leavevmode|mbox|makebox|phantom|hphantom|tcolorbox|newtcolorbox|tcbset)/g
  ) || []).length;

  if (doubleEscapeCount >= 3) {
    console.log(`[fixDoubleEscapedLatex] detected ${doubleEscapeCount} double-escaped commands, fixing`);
    return content.replace(/\\\\/g, "\\");
  }
  return content;
}

function isBinaryMime(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    mime === "application/pdf" ||
    mime === "application/zip" ||
    mime.includes("octet-stream")
  );
}

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
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return map[ext || ""] || "application/octet-stream";
}

/**
 * Fix \\ in positions where LaTeX has no line to end.
 * This causes "! LaTeX Error: There's no line here to end."
 *
 * Patterns caught:
 *   \section{Title with \textbf{bold}}\\  → \section{Title with \textbf{bold}}
 *   \subsection{Title} \\[5pt]           → \subsection{Title}\vspace{5pt}
 *   \begin{center}\\                     → \begin{center}
 *   \maketitle\\                         → \maketitle
 *   \centering\\                         → \centering
 *   Empty line followed by \\            → remove the \\
 *   \\ on an otherwise empty line        → remove
 */
function fixLineBreakAfterSectioning(source: string): string {
  let result = source;

  // 1. \\ after sectioning commands (handles nested braces like \textbf{})
  //    Uses loop-based brace matching to avoid catastrophic regex backtracking.
  const sectionCmdRe = /\\(?:section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{/g;
  let secMatch: RegExpExecArray | null;
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  while ((secMatch = sectionCmdRe.exec(result)) !== null) {
    const braceStart = secMatch.index + secMatch[0].length - 1; // position of {
    // Find matching closing } using depth counter
    let depth = 1;
    let idx = braceStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }
    if (depth !== 0) continue; // unmatched brace, skip

    // idx now points right after the closing }
    // Check if followed by \\ (with optional whitespace)
    const afterCmd = result.substring(idx);
    const trailingMatch = afterCmd.match(/^\s*\\\\\s*(?:\[([^\]]*)\])?/);
    if (trailingMatch) {
      const fullEnd = idx + trailingMatch[0].length;
      const cmdText = result.substring(secMatch.index, idx);
      const spacing = trailingMatch[1];
      replacements.push({
        start: secMatch.index,
        end: fullEnd,
        replacement: spacing ? `${cmdText}\n\\vspace{${spacing}}` : cmdText,
      });
    }
  }

  // Apply replacements in reverse order to preserve indices
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    result = result.substring(0, r.start) + r.replacement + result.substring(r.end);
  }

  // 2. \\ right after \begin{...} (same line) for non-tabular environments
  //    Skips tabular, longtable, array, align, equation, gather, split, cases, matrix
  const safeEnvs = "tabular|tabularx|longtable|array|align|equation|gather|multline|split|cases|matrix|pmatrix|bmatrix|vmatrix|Bmatrix";
  result = result.replace(
    new RegExp(
      `(\\\\begin\\{(?!(?:${safeEnvs})\\})[^}]+\\}(?:\\[[^\\]]*\\])?)\\s*\\\\\\\\\\s*(?:\\[[^\\]]*\\])?`,
      "g"
    ),
    "$1"
  );

  // 3. \\ right after commands that start fresh context (no preceding line to end)
  const freshCmds = "maketitle|centering|raggedright|raggedleft|noindent|par";
  result = result.replace(
    new RegExp(`(\\\\(?:${freshCmds}))\\s*\\\\\\\\\\s*(?:\\[[^\\]]*\\])?`, "g"),
    "$1"
  );

  // 4. \vspace{...} \\ or \vspace*{...} \\ → remove the \\
  result = result.replace(/\\vspace\*?\{([^}]*)\}\s*\\\\\s*(?:\[[^\]]*\])?/g, "\\vspace{$1}");

  // 5. \\ right after \end{...} (no line to end between environments)
  result = result.replace(
    new RegExp(
      `(\\\\end\\{[^}]+\\})\\s*\\\\\\\\\\s*(?:\\[[^\\]]*\\])?`,
      "g"
    ),
    "$1"
  );

  // 6. \\ at the start of a paragraph (after a blank line)
  result = result.replace(/\n\n\s*\\\\\s*(?:\[[^\]]*\])?\s*\n/g, "\n\n");

  // 7. \\ on an otherwise empty line
  result = result.replace(/^\s*\\\\\s*(?:\[[^\]]*\])?\s*$/gm, "");

  // 8. \hfill\\ or \hfill \\ (no line content before \hfill)
  result = result.replace(/^\s*\\hfill\s*\\\\\s*(?:\[[^\]]*\])?\s*$/gm, "");

  // 9. \rule{...}{...}\\ at the very start of a center/flushleft/flushright
  //    (right after \begin{center} or \vspace — no preceding text line)
  //    Pattern: \vspace{...}\n\rule{...}{...}\\ → add ~ before \rule to create a line
  result = result.replace(
    /(\\vspace\*?\{[^}]*\}\s*\n\s*)(\\rule\{[^}]*\}\{[^}]*\})\s*\\\\/g,
    "$1$2\n"
  );

  return result;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
