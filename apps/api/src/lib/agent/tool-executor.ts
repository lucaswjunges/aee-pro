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
    switch (toolName) {
      case "read_file":
        return await readFile(input.path as string, ctx);
      case "write_file":
        return await writeFile(
          input.path as string,
          input.content as string,
          ctx
        );
      case "edit_file":
        return await editFile(
          input.path as string,
          input.old_text as string,
          input.new_text as string,
          ctx,
          input.replace_all as boolean | undefined
        );
      case "list_files":
        return await listFiles(ctx);
      case "delete_file":
        return await deleteFile(input.path as string, ctx);
      case "rename_file":
        return await renameFile(
          input.old_path as string,
          input.new_path as string,
          ctx
        );
      case "search_files":
        return await searchFiles(input.query as string, ctx);
      case "compile_latex":
        return await compileLatexFile(input.path as string, ctx);
      case "get_student_data":
        return await getStudentData(ctx);
      case "get_prompt_template":
        return await getPromptTemplate(input.slug as string, ctx);
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
  const cleanContent = unescapeAIContent(content);
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
  const cleanOld = unescapeAIContent(oldText);
  const cleanNew = unescapeAIContent(newText);
  // Normalize line endings (\r\n → \n)
  const normContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const normOld = cleanOld.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Try exact match first, then normalized, then trimmed whitespace
  let matchedOld: string;
  let targetContent: string;

  if (content.includes(cleanOld)) {
    matchedOld = cleanOld;
    targetContent = content;
  } else if (normContent.includes(normOld)) {
    matchedOld = normOld;
    targetContent = normContent;
  } else {
    // Trim trailing whitespace per line and retry
    const trimLines = (s: string) =>
      s.split("\n").map((l) => l.trimEnd()).join("\n");
    const trimmedContent = trimLines(normContent);
    const trimmedOld = trimLines(normOld);

    if (trimmedContent.includes(trimmedOld)) {
      matchedOld = trimmedOld;
      targetContent = trimmedContent;
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
  const rawSource = await object.text();
  console.log("[compile_latex] step 3 done, rawSource length:", rawSource.length);

  // Sanitize: fix common AI-generated LaTeX issues (same pipeline as document generation)
  // Yield before/after because the sanitizer runs 24+ regex passes synchronously
  await yieldEventLoop();
  console.log("[compile_latex] step 4: sanitize START");
  const sanitizeStart = Date.now();
  let latexSource = sanitizeLatexSource(rawSource);
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

  // Compile
  console.log("[compile_latex] calling compiler, source length:", latexSource.length, "images:", images.length, "files:", additionalFiles.length);
  const result = await compileLatex(
    latexSource,
    ctx.compilerUrl,
    ctx.compilerToken,
    images.length > 0 ? images : undefined,
    additionalFiles.length > 0 ? additionalFiles : undefined
  );

  console.log("[compile_latex] compiler returned, success:", result.success);
  if (!result.success) {
    return {
      success: false,
      error: `Erro de compilação:\n${result.error}`,
    };
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

  const warnings = result.warnings?.length
    ? `\nWarnings:\n${result.warnings.join("\n")}`
    : "";

  return {
    success: true,
    output: `Compilação bem-sucedida! PDF gerado: output/${pdfPath} (${formatBytes(pdfBytes.byteLength)})${warnings}`,
    filePath: `output/${pdfPath}`,
  };
}

async function getStudentData(
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  // Resolve student from the project link — no ID needed from the AI.
  const project = await ctx.db
    .select()
    .from(workspaceProjects)
    .where(eq(workspaceProjects.id, ctx.projectId))
    .get();

  const sid = project?.studentId;

  if (!sid) {
    return {
      success: false,
      error: "Nenhum aluno vinculado ao projeto. Vincule um aluno nas configurações do projeto.",
    };
  }

  const student = await ctx.db
    .select()
    .from(students)
    .where(and(eq(students.id, sid), eq(students.userId, ctx.userId)))
    .get();

  if (!student) {
    return { success: false, error: `Aluno não encontrado (id: ${sid})` };
  }

  // Format student data as readable text
  const data = Object.entries(student)
    .filter(([_, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return { success: true, output: data };
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

  return {
    success: true,
    output: `Template: ${prompt.name}\n\n${prompt.promptTemplate || "(template vazio)"}`,
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

  // 4. \\ at the start of a paragraph (after a blank line)
  result = result.replace(/\n\n\s*\\\\\s*(?:\[[^\]]*\])?\s*\n/g, "\n\n");

  // 5. \\ on an otherwise empty line
  result = result.replace(/^\s*\\\\\s*(?:\[[^\]]*\])?\s*$/gm, "");

  return result;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
