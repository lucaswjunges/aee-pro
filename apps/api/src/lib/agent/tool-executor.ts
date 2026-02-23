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
          ctx
        );
      case "list_files":
        return await listFiles(ctx);
      case "delete_file":
        return await deleteFile(input.path as string, ctx);
      case "search_files":
        return await searchFiles(input.query as string, ctx);
      case "compile_latex":
        return await compileLatexFile(input.path as string, ctx);
      case "get_student_data":
        return await getStudentData(input.student_id as string, ctx);
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

  if (existing) {
    // Save current version before overwriting
    await saveVersion(existing.id, existing.r2Key, existing.sizeBytes ?? 0, ctx.db, ctx.r2).catch(() => {});
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
  };
}

async function editFile(
  path: string,
  oldText: string,
  newText: string,
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
  await saveVersion(file.id, file.r2Key, file.sizeBytes ?? 0, ctx.db, ctx.r2).catch(() => {});

  const newContent = targetContent.replace(matchedOld, cleanNew);
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

  return {
    success: true,
    output: `Arquivo editado: ${path} (substituição feita)`,
    fileId: file.id,
    filePath: path,
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

  const object = await ctx.r2.get(file.r2Key);
  if (!object) {
    return { success: false, error: `Conteúdo não encontrado: ${path}` };
  }

  const rawSource = await object.text();

  // Sanitize: fix common AI-generated LaTeX issues (same pipeline as document generation)
  let latexSource = sanitizeLatexSource(rawSource);
  // Fix \\ after sectioning commands — causes "There's no line here to end"
  latexSource = fixLineBreakAfterSectioning(latexSource);

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
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(buffer))
    );
    images.push({ filename: img.path, data_base64: base64 });
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

  // Compile
  const result = await compileLatex(
    latexSource,
    ctx.compilerUrl,
    ctx.compilerToken,
    images.length > 0 ? images : undefined,
    additionalFiles.length > 0 ? additionalFiles : undefined
  );

  if (!result.success) {
    return {
      success: false,
      error: `Erro de compilação:\n${result.error}`,
    };
  }

  // Save PDF to R2
  const pdfPath = path.replace(/\.tex$/, ".pdf");
  const pdfR2Key = `workspace/${ctx.userId}/${ctx.projectId}/output/${pdfPath}`;
  const pdfBytes = Uint8Array.from(atob(result.pdfBase64!), (c) =>
    c.charCodeAt(0)
  );

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
  studentId: string,
  ctx: ToolExecContext
): Promise<ToolExecResult> {
  // If no studentId provided, try to get from project
  let sid = studentId;
  if (!sid) {
    const project = await ctx.db
      .select()
      .from(workspaceProjects)
      .where(eq(workspaceProjects.id, ctx.projectId))
      .get();
    if (project?.studentId) {
      sid = project.studentId;
    } else {
      return {
        success: false,
        error: "Nenhum aluno vinculado ao projeto. Informe o student_id.",
      };
    }
  }

  const student = await ctx.db
    .select()
    .from(students)
    .where(and(eq(students.id, sid), eq(students.userId, ctx.userId)))
    .get();

  if (!student) {
    return { success: false, error: `Aluno não encontrado: ${sid}` };
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
  //    Matches: \section*{...{...}...}\\  or  \section{...}\\[5pt]
  const sectionCmds = "section|subsection|subsubsection|paragraph|subparagraph";
  result = result.replace(
    new RegExp(
      `(\\\\(?:${sectionCmds})\\*?\\s*\\{(?:[^{}]*|\\{[^{}]*\\})*\\})\\s*\\\\\\\\\\s*(?:\\[([^\\]]*)\\])?`,
      "g"
    ),
    (_m: string, cmd: string, spacing?: string) =>
      spacing ? `${cmd}\n\\vspace{${spacing}}` : cmd
  );

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
