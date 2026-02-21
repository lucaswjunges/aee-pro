import type { AIProvider } from "../../lib/ai/types";
import { compileLatex, type CompileResult, type CompileImage } from "./compiler-client";
import { sanitizeLatexSource, detectTruncation } from "./sanitizer";

const MAX_FIX_ATTEMPTS = 3;
const MAX_REFINE_PASSES = 3;
/** Global timeout for the entire auto-fix pipeline (2 minutes). */
const PIPELINE_TIMEOUT_MS = 2 * 60 * 1000;

const AUTOFIX_SYSTEM_PROMPT = `Você é um especialista em LaTeX. O código abaixo falhou na compilação com pdflatex.

REGRAS DE CORREÇÃO:
1. Corrija os erros de compilação mantendo o conteúdo e estilo do documento.
2. Se o documento parece TRUNCADO (texto cortado no meio, ambientes abertos sem fechar, conteúdo incompleto), COMPLETE o conteúdo faltante de forma coerente com o resto do documento. Não apenas feche os ambientes — gere o conteúdo que falta.
3. NUNCA use \\begin{axis} (pgfplots). Se o erro envolve pgfplots/axis, SUBSTITUA o gráfico por uma tabela ou descrição textual equivalente usando tabularx com booktabs.
4. NUNCA coloque longtable dentro de adjustbox, tcolorbox, minipage ou qualquer grupo. Use tabular em vez disso.
5. NUNCA use colunas X em longtable — X é exclusivo de tabularx.
6. NUNCA use condicionais TeX (\\ifnum, \\ifcase, \\else, \\fi, \\or).
7. NUNCA use \\foreach com rnd ou \\pgfmathparse inline em cores.
8. NUNCA use \\multirowcell — use \\multirow{N}{*}{texto}.
9. Todas as tcolorbox (infobox, alertbox, etc.) já são breakable — NÃO adicione breakable manualmente.
10. \\rowcolor DEVE ser o PRIMEIRO comando de uma linha de tabela. NUNCA coloque \\rowcolor após & — use \\cellcolor para colorir células individuais.
11. Para Overfull \\hbox em TABELAS: envolva tabular (NÃO tabularx) em \\adjustbox{max width=\\linewidth}{...}, ou reduza colunas p{Ncm} para somar no máximo 15cm.
12. Para Overfull \\hbox em TCOLORBOX: use \\small ou \\footnotesize para texto e tabelas dentro de caixas (infobox, alertbox, sessaobox, etc.).
13. Se usar tabularx, SEMPRE inclua pelo menos uma coluna X. Se só tem colunas p{}, use tabular com adjustbox em vez de tabularx.

Retorne o código LaTeX corrigido COMPLETO (de \\begin{document} até \\end{document}), sem explicações, sem fence blocks.`;

interface AutoFixResult {
  success: boolean;
  latexSource: string;
  pdfBase64?: string;
  pdfSizeBytes?: number;
  attempts: number;
  lastError?: string;
  warnings?: string[];
}

/**
 * Full pipeline: compile → fix errors → iteratively refine warnings.
 * @param maxTokens — token budget for AI responses (should match original generation).
 */
export async function compileWithAutoFix(
  initialSource: string,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
  maxTokens = 16000,
  images?: CompileImage[],
): Promise<AutoFixResult> {
  // Wrap entire pipeline in a timeout to prevent infinite hangs
  return Promise.race([
    compileWithAutoFixPipeline(initialSource, compilerUrl, compilerToken, aiProvider, aiModel, maxTokens, images),
    new Promise<AutoFixResult>((_, reject) =>
      setTimeout(() => reject(new Error("Pipeline de compilação excedeu o tempo limite (3 min)")), PIPELINE_TIMEOUT_MS),
    ),
  ]);
}

async function compileWithAutoFixPipeline(
  initialSource: string,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
  maxTokens = 16000,
  images?: CompileImage[],
): Promise<AutoFixResult> {
  // Sanitize source before any compilation attempt
  const sanitized = sanitizeLatexSource(initialSource);

  // Phase 1: compile and fix compilation errors
  const result = await compileAndFixErrors(
    sanitized,
    compilerUrl,
    compilerToken,
    aiProvider,
    aiModel,
    maxTokens,
    images,
  );

  if (!result.success) return result;

  // Phase 1.5: detect truncated content and ask AI to complete
  const truncation = detectTruncation(result.latexSource);
  if (truncation) {
    console.log(`[auto-fix] Conteúdo truncado detectado: ${truncation}`);
    const completed = await completeTruncatedContent(
      result,
      truncation,
      compilerUrl,
      compilerToken,
      aiProvider,
      aiModel,
      maxTokens,
      images,
    );
    if (completed) return completed;
    // If completion failed, continue with truncated but compilable version
  }

  // Phase 2: deterministic post-compilation Overfull fix (no AI needed)
  const deterministicResult = await fixOverfullDeterministic(result, compilerUrl, compilerToken, images);

  // Phase 3: targeted surgical AI refinement for remaining warnings
  return refineWarningsTargeted(
    deterministicResult,
    compilerUrl,
    compilerToken,
    aiProvider,
    aiModel,
    maxTokens,
    images,
  );
}

/**
 * Compile and fix compilation errors (up to MAX_FIX_ATTEMPTS).
 * Does NOT refine warnings — that's handled separately.
 */
async function compileAndFixErrors(
  initialSource: string,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
  maxTokens = 16000,
  images?: CompileImage[],
): Promise<AutoFixResult> {
  let source = initialSource;

  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const result: CompileResult = await compileLatex(
      source,
      compilerUrl,
      compilerToken,
      images,
    );

    if (result.success && result.pdfBase64) {
      return {
        success: true,
        latexSource: source,
        pdfBase64: result.pdfBase64,
        pdfSizeBytes: result.pdfSizeBytes,
        attempts: attempt,
        warnings: result.warnings,
      };
    }

    // Last attempt failed — don't try to fix
    if (attempt === MAX_FIX_ATTEMPTS) {
      return {
        success: false,
        latexSource: source,
        attempts: attempt,
        lastError: result.error,
      };
    }

    // Try AI fix for compilation error
    console.log(`[auto-fix] Erro de compilação (tentativa ${attempt}/${MAX_FIX_ATTEMPTS}), pedindo IA corrigir...`);
    const fixResult = await aiProvider.generate({
      model: aiModel,
      messages: [
        {
          role: "system",
          content: AUTOFIX_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `ERRO DE COMPILAÇÃO:\n${result.error}\n\nCÓDIGO LATEX COM ERRO:\n${source}`,
        },
      ],
      maxTokens,
      temperature: 0.2,
    });

    const fixed = extractLatexBody(fixResult.content);
    if (fixed) {
      const preambleEnd = source.indexOf("\\begin{document}");
      if (preambleEnd !== -1) {
        source = source.substring(0, preambleEnd) + fixed;
      } else {
        source = fixed;
      }
    }
  }

  return {
    success: false,
    latexSource: source,
    attempts: MAX_FIX_ATTEMPTS,
    lastError: "Exceeded maximum fix attempts",
  };
}

/**
 * Ask AI to complete truncated content.
 * The document compiles but has incomplete text (cut off mid-sentence/section).
 */
async function completeTruncatedContent(
  currentResult: AutoFixResult,
  truncationInfo: string,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
  maxTokens: number,
  images?: CompileImage[],
): Promise<AutoFixResult | null> {
  try {
    const result = await aiProvider.generate({
      model: aiModel,
      messages: [
        {
          role: "system",
          content: `Você é um especialista em LaTeX e AEE (Atendimento Educacional Especializado). O documento abaixo foi TRUNCADO — o conteúdo foi cortado no meio. Você deve COMPLETAR o documento.

REGRAS:
1. Mantenha TODO o conteúdo existente intacto — não remova nem reescreva o que já está lá.
2. COMPLETE as partes inacabadas (frases cortadas, atividades incompletas, seções faltantes).
3. Se uma atividade ou seção foi cortada no meio, complete-a de forma coerente.
4. É melhor completar bem as seções existentes do que adicionar muitas novas.
5. NÃO use \\begin{axis} (pgfplots), condicionais TeX (\\ifnum etc.), nem \\foreach com rnd.
6. NÃO coloque longtable dentro de adjustbox.
7. Todas as tcolorbox já são breakable — NÃO adicione breakable.
8. Retorne o código LaTeX COMPLETO (de \\begin{document} até \\end{document}).`,
        },
        {
          role: "user",
          content: `PROBLEMA DETECTADO: ${truncationInfo}\n\nDOCUMENTO TRUNCADO:\n${currentResult.latexSource}`,
        },
      ],
      maxTokens,
      temperature: 0.3,
    });

    const completed = extractLatexBody(result.content);
    if (!completed) {
      console.log("[auto-fix] IA não retornou corpo válido para completar truncamento");
      return null;
    }

    const completedSource = rebuildSource(currentResult.latexSource, completed);

    // Compile the completed version
    const compileResult = await compileAndFixErrors(
      completedSource,
      compilerUrl,
      compilerToken,
      aiProvider,
      aiModel,
      maxTokens,
      images,
    );

    if (compileResult.success) {
      console.log("[auto-fix] Documento truncado completado com sucesso");
      return compileResult;
    }

    console.log("[auto-fix] Versão completada falhou na compilação, mantendo versão truncada");
    return null;
  } catch (err) {
    console.log("[auto-fix] Erro ao completar truncamento:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Warning filtering
// ---------------------------------------------------------------------------

/** Noise warning patterns that should be ignored in refinement. */
const NOISE_WARNING_PATTERNS = [
  /^Package fancyhdr Warning/,
  /^Package hyperref Warning/,
  /^LaTeX Font Warning.*font.*substitut/i,
  /^Package auxhook Warning/,
  /^Package pgfplots Warning/,
];

/**
 * Filter warnings to only keep actionable ones (layout issues).
 * Removes noise from packages like fancyhdr, hyperref, font substitution.
 * Also filters small Overfull \hbox (< 5pt) and low-badness Underfull.
 */
function filterSignificantWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => {
    const isOverfull = w.startsWith("Overfull \\hbox") || w.startsWith("Overfull \\vbox");
    const isUnderfull = w.startsWith("Underfull \\hbox") || w.startsWith("Underfull \\vbox");

    if (!isOverfull && !isUnderfull) {
      return !NOISE_WARNING_PATTERNS.some((p) => p.test(w));
    }

    // Filter out small Overfull (< 5pt is visually imperceptible)
    if (isOverfull) {
      const ptMatch = w.match(/\(([0-9.]+)pt too wide\)/);
      if (ptMatch && parseFloat(ptMatch[1]) < 5) return false;
    }

    // Filter out ALL Underfull — they never cause visible problems (just loose spacing).
    // Only Overfull causes text to be visually cut off.
    if (isUnderfull) return false;

    return true;
  });
}

/**
 * Filter warnings for display to the user.
 * Exported for use when storing warnings in DB.
 */
export function filterDisplayWarnings(warnings: string[]): string[] {
  return filterSignificantWarnings(warnings);
}

/** Check if there are significant warnings worth refining. */
function hasSignificantWarnings(warnings?: string[]): boolean {
  if (!warnings || warnings.length === 0) return false;
  return filterSignificantWarnings(warnings).length > 0;
}

// ---------------------------------------------------------------------------
// Deterministic post-compilation Overfull fixer
// ---------------------------------------------------------------------------

/**
 * After compilation, analyze Overfull \hbox warnings and apply deterministic
 * fixes based on what's at the warning lines. No AI needed.
 *
 * Strategy per warning line:
 * 1. If the line is inside a tabular/tabularx → wrap the table in \adjustbox{max width=\linewidth}
 * 2. If the line is inside a tcolorbox → add \small at the start
 * 3. If the line is a paragraph → wrap in {\sloppy ... }
 *
 * Recompiles once after applying all fixes.
 */
async function fixOverfullDeterministic(
  result: AutoFixResult,
  compilerUrl: string,
  compilerToken: string,
  images?: CompileImage[],
): Promise<AutoFixResult> {
  const significant = filterSignificantWarnings(result.warnings ?? []);
  const overfullWarnings = significant.filter(
    (w) => w.startsWith("Overfull \\hbox") || w.startsWith("Overfull \\vbox"),
  );

  if (overfullWarnings.length === 0) return result;

  const lineNumbers = extractWarningLines(overfullWarnings);
  if (lineNumbers.length === 0) return result;

  const sourceLines = result.latexSource.split("\n");
  let modified = false;

  // Track which tables/environments we've already wrapped
  const wrappedRanges = new Set<string>();

  for (const lineNum of lineNumbers) {
    const idx = lineNum - 1; // 0-based
    if (idx < 0 || idx >= sourceLines.length) continue;

    // Scan backwards to find what environment we're inside
    const envInfo = findEnclosingEnvironment(sourceLines, idx);

    const isTcolorbox = envInfo && [
      "infobox", "alertbox", "successbox", "sessaobox",
      "datacard", "atividadebox", "dicabox", "materialbox",
    ].includes(envInfo.envName);

    if (envInfo && (envInfo.envName === "tabular" || envInfo.envName === "tabularx")) {
      const key = `${envInfo.startLine}-${envInfo.endLine}`;
      if (wrappedRanges.has(key)) continue;
      wrappedRanges.add(key);

      // Check if already inside adjustbox
      if (envInfo.startLine > 0) {
        const lineBefore = sourceLines[envInfo.startLine - 1]?.trim() ?? "";
        if (lineBefore.includes("adjustbox")) continue;
      }

      // For tabularx: add \small before it to reduce font (less invasive than adjustbox)
      // For tabular: wrap in adjustbox
      if (envInfo.envName === "tabularx") {
        // Prepend \small to shrink content
        if (!sourceLines[envInfo.startLine].includes("\\small") &&
            !(envInfo.startLine > 0 && sourceLines[envInfo.startLine - 1]?.trim() === "\\small")) {
          sourceLines[envInfo.startLine] = "{\\small\n" + sourceLines[envInfo.startLine];
          sourceLines[envInfo.endLine] = sourceLines[envInfo.endLine] + "\n}";
          modified = true;
          console.log(`[auto-fix/determ] Wrapped tabularx at lines ${envInfo.startLine + 1}-${envInfo.endLine + 1} in {\\small}`);
        }
      } else {
        // Wrap plain tabular in adjustbox
        sourceLines[envInfo.startLine] =
          "\\begin{adjustbox}{max width=\\linewidth}" +
          "\n" +
          sourceLines[envInfo.startLine];
        sourceLines[envInfo.endLine] =
          sourceLines[envInfo.endLine] +
          "\n" +
          "\\end{adjustbox}";
        modified = true;
        console.log(`[auto-fix/determ] Wrapped tabular at lines ${envInfo.startLine + 1}-${envInfo.endLine + 1} in adjustbox`);
      }
    } else if (isTcolorbox) {
      // Inside a tcolorbox — add \small at the overfull line to reduce font size
      const line = sourceLines[idx].trim();
      if (line && !line.startsWith("\\begin{") && !line.startsWith("\\end{") && !line.startsWith("\\small")) {
        sourceLines[idx] = "{\\small " + sourceLines[idx] + "}";
        modified = true;
        console.log(`[auto-fix/determ] Added \\small to line ${lineNum} inside ${envInfo!.envName}`);
      }
    } else if (!envInfo) {
      // Not inside a table or tcolorbox — it's a paragraph or standalone line
      const line = sourceLines[idx].trim();
      if (line && !line.startsWith("\\begin{") && !line.startsWith("\\end{")) {
        // Extract overfull amount for this line from warnings
        const warningForLine = overfullWarnings.find((w) => {
          const m = w.match(/at lines? (\d+)(?:--(\d+))?/);
          if (!m) return false;
          return parseInt(m[1], 10) === lineNum || (m[2] && parseInt(m[2], 10) === lineNum);
        });
        const ptMatch = warningForLine?.match(/\(([0-9.]+)pt too wide\)/);
        const overfullPt = ptMatch ? parseFloat(ptMatch[1]) : 50;

        if (overfullPt > 50) {
          // Large overfull: use \sloppy (emergencystretch=\maxdimen)
          sourceLines[idx] = "{\\sloppy " + sourceLines[idx] + "}";
          modified = true;
          console.log(`[auto-fix/determ] Wrapped paragraph at line ${lineNum} in \\sloppy (${overfullPt}pt overfull)`);
        } else {
          // Medium overfull: use tolerance + maxdimen emergencystretch
          sourceLines[idx] = "{\\tolerance=9999\\emergencystretch=\\maxdimen " + sourceLines[idx] + "}";
          modified = true;
          console.log(`[auto-fix/determ] Wrapped paragraph at line ${lineNum} in \\emergencystretch=\\maxdimen (${overfullPt}pt overfull)`);
        }
      }
    }
  }

  if (!modified) return result;

  const newSource = sourceLines.join("\n");
  const compileResult = await compileLatex(newSource, compilerUrl, compilerToken, images);

  if (compileResult.success && compileResult.pdfBase64) {
    const newSignificant = filterSignificantWarnings(compileResult.warnings ?? []);
    console.log(
      `[auto-fix/determ] ${overfullWarnings.length} → ${newSignificant.filter((w) => w.startsWith("Overfull")).length} overfull warning(s) após fix determinístico`,
    );
    return {
      success: true,
      latexSource: newSource,
      pdfBase64: compileResult.pdfBase64,
      pdfSizeBytes: compileResult.pdfSizeBytes,
      attempts: result.attempts,
      warnings: compileResult.warnings,
    };
  }

  // Deterministic fix broke compilation — revert
  console.log("[auto-fix/determ] Fix determinístico quebrou compilação, revertendo");
  return result;
}

/**
 * Find the enclosing tabular/tabularx/tcolorbox environment for a given line.
 * Returns the environment name and start/end line indices (0-based).
 */
function findEnclosingEnvironment(
  sourceLines: string[],
  targetLine: number,
): { envName: string; startLine: number; endLine: number } | null {
  const tableEnvs = ["tabularx", "tabular", "longtable"];
  const tcolorboxEnvs = ["infobox", "alertbox", "successbox", "sessaobox", "datacard", "atividadebox", "dicabox", "materialbox"];

  // Scan BOTH backward AND forward from targetLine for \begin{env}
  // This handles cases where the warning line is just before the table
  const scanStart = Math.max(0, targetLine - 80);
  const scanEnd = Math.min(sourceLines.length - 1, targetLine + 15);

  // Search for table environments first (higher priority — more specific fix)
  for (let i = scanEnd; i >= scanStart; i--) {
    const line = sourceLines[i];
    for (const env of tableEnvs) {
      if (line.includes(`\\begin{${env}}`)) {
        const endTag = `\\end{${env}}`;
        for (let j = i + 1; j < Math.min(sourceLines.length, i + 80); j++) {
          if (sourceLines[j].includes(endTag)) {
            if (targetLine >= i - 3 && targetLine <= j + 3) {
              return { envName: env, startLine: i, endLine: j };
            }
            break;
          }
        }
      }
    }
  }

  // Search for tcolorbox environments (wider scan range since boxes are larger)
  for (let i = scanEnd; i >= scanStart; i--) {
    const line = sourceLines[i];
    for (const env of tcolorboxEnvs) {
      if (line.includes(`\\begin{${env}}`)) {
        const endTag = `\\end{${env}}`;
        for (let j = i + 1; j < Math.min(sourceLines.length, i + 150); j++) {
          if (sourceLines[j].includes(endTag)) {
            if (targetLine >= i && targetLine <= j) {
              return { envName: env, startLine: i, endLine: j };
            }
            break;
          }
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Targeted surgical warning refinement
// ---------------------------------------------------------------------------

/** A contiguous chunk of source code around warning lines. */
interface SourceChunk {
  startLine: number; // 0-based index into sourceLines array
  endLine: number;   // 0-based, inclusive
  content: string;
  warningLines: number[]; // 1-based line numbers from warnings
}

/**
 * Extract line numbers from warning messages.
 * "Overfull \hbox (14.5pt too wide) in paragraph at lines 538--538"
 * Returns unique sorted line numbers (1-based).
 */
function extractWarningLines(warnings: string[]): number[] {
  const lines = new Set<number>();
  for (const w of warnings) {
    const match = w.match(/at lines? (\d+)(?:--(\d+))?/);
    if (match) {
      lines.add(parseInt(match[1], 10));
      if (match[2]) lines.add(parseInt(match[2], 10));
    }
  }
  return [...lines].sort((a, b) => a - b);
}

/**
 * Group line numbers into clusters. Lines within `maxGap` of each other
 * belong to the same cluster (same problematic region).
 */
function groupIntoClusters(lineNumbers: number[], maxGap: number): number[][] {
  if (lineNumbers.length === 0) return [];
  const sorted = [...lineNumbers].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= maxGap) {
      clusters[clusters.length - 1].push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }
  return clusters;
}

/**
 * For a given warning line, expand outward to find the enclosing LaTeX
 * environment boundaries (\begin{...} and \end{...}).
 * Returns [startLine, endLine] as 0-based indices.
 */
function expandToEnvironment(
  sourceLines: string[],
  warningLine0: number, // 0-based
  maxScan = 60,
): [number, number] {
  let start = warningLine0;
  let end = warningLine0;

  // Scan backwards for an unmatched \begin
  let depth = 0;
  for (let i = warningLine0; i >= Math.max(0, warningLine0 - maxScan); i--) {
    const line = sourceLines[i];
    const endCount = (line.match(/\\end\{/g) || []).length;
    const beginCount = (line.match(/\\begin\{/g) || []).length;
    depth += endCount - beginCount;
    if (beginCount > 0 && depth < 0) {
      start = i;
      break;
    }
    start = i;
  }

  // Scan forward for the matching \end
  depth = 0;
  for (let i = warningLine0; i < Math.min(sourceLines.length, warningLine0 + maxScan); i++) {
    const line = sourceLines[i];
    const beginCount = (line.match(/\\begin\{/g) || []).length;
    const endCount = (line.match(/\\end\{/g) || []).length;
    depth += beginCount - endCount;
    end = i;
    if (endCount > 0 && depth <= 0) {
      break;
    }
  }

  return [start, end];
}

/**
 * Extract problematic source chunks around warning lines.
 * Expands each cluster to find the enclosing environment, adds context.
 */
function extractChunks(source: string, warnings: string[]): SourceChunk[] {
  const lineNumbers = extractWarningLines(warnings);
  if (lineNumbers.length === 0) return [];

  const sourceLines = source.split("\n");
  const clusters = groupIntoClusters(lineNumbers, 10);
  const chunks: SourceChunk[] = [];

  for (const cluster of clusters.slice(0, 5)) {
    const firstLine = Math.min(...cluster) - 1; // to 0-based
    const lastLine = Math.max(...cluster) - 1;

    // Expand each end to enclosing environment
    const [envStart] = expandToEnvironment(sourceLines, firstLine);
    const [, envEnd] = expandToEnvironment(sourceLines, lastLine);

    // Use whichever gives a wider range
    const start = Math.max(0, Math.min(envStart, firstLine) - 3);
    const end = Math.min(sourceLines.length - 1, Math.max(envEnd, lastLine) + 3);

    chunks.push({
      startLine: start,
      endLine: end,
      content: sourceLines.slice(start, end + 1).join("\n"),
      warningLines: cluster,
    });
  }

  // Merge overlapping chunks
  return mergeChunks(chunks, sourceLines);
}

/** Merge overlapping or adjacent chunks. */
function mergeChunks(chunks: SourceChunk[], sourceLines: string[]): SourceChunk[] {
  if (chunks.length <= 1) return chunks;
  const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);
  const merged: SourceChunk[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.startLine <= prev.endLine + 5) {
      prev.endLine = Math.max(prev.endLine, curr.endLine);
      prev.warningLines = [...prev.warningLines, ...curr.warningLines];
      prev.content = sourceLines.slice(prev.startLine, prev.endLine + 1).join("\n");
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

const TARGETED_SYSTEM_PROMPT = `Você é um especialista em LaTeX. Receberá trechos de um documento com avisos de Overfull/Underfull \\hbox. Corrija APENAS o layout para eliminar os avisos.

CAUSAS COMUNS E SOLUÇÕES:
1. Tabela com colunas fixas (p{Ncm}) que somam mais que 15cm:
   → Reduza as larguras proporcionalmente para somar no máximo ~15cm
   → Ou envolva tabular (NÃO tabularx) em \\begin{adjustbox}{max width=\\linewidth}
2. tabularx SEM coluna X (ex: só p{3cm} p{4cm} p{3cm}):
   → Converta a coluna mais larga em X para que tabularx calcule automaticamente
3. Texto longo em parágrafo transbordando:
   → Reformule o texto para ser mais curto, ou quebre em múltiplas linhas
4. \\itemize dentro de célula de tabela:
   → Use \\begin{itemize}[leftmargin=*, nosep, topsep=0pt] para reduzir margens
5. Texto dentro de tcolorbox transbordando:
   → Adicione \\small no início do conteúdo da box

REGRAS:
- NÃO altere o conteúdo textual, apenas corrija layout e formatação
- NÃO adicione breakable a tcolorbox (já são breakable)
- NUNCA coloque longtable dentro de adjustbox
- \\rowcolor DEVE ser o PRIMEIRO comando de uma linha de tabela (nunca após &)
- Retorne APENAS o trecho corrigido, sem explicações, sem \`\`\`
- Se houver múltiplos trechos, use os marcadores --- TRECHO N --- para separar`;

/**
 * Build a targeted prompt with only the problematic chunks, not the full document.
 */
function buildTargetedPrompt(
  warnings: string[],
  chunks: SourceChunk[],
  sourceLines: string[],
): { system: string; user: string } {
  let user = `AVISOS DE COMPILAÇÃO (${warnings.length}):\n${warnings.join("\n")}\n\n`;

  if (chunks.length === 1) {
    const chunk = chunks[0];
    user += `TRECHO PROBLEMÁTICO (linhas ${chunk.startLine + 1}–${chunk.endLine + 1}):\n\n`;
    const lines = sourceLines.slice(chunk.startLine, chunk.endLine + 1);
    const warningSet = new Set(chunk.warningLines);
    for (let i = 0; i < lines.length; i++) {
      const lineNum = chunk.startLine + i + 1; // 1-based
      const marker = warningSet.has(lineNum) ? ">>>" : "   ";
      user += `${marker} ${lineNum}: ${lines[i]}\n`;
    }
    user += `\nRetorne APENAS o trecho corrigido (linhas ${chunk.startLine + 1}–${chunk.endLine + 1}), sem número de linha, sem marcadores >>>.`;
  } else {
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      user += `--- TRECHO ${c + 1} (linhas ${chunk.startLine + 1}–${chunk.endLine + 1}) ---\n`;
      const lines = sourceLines.slice(chunk.startLine, chunk.endLine + 1);
      const warningSet = new Set(chunk.warningLines);
      for (let i = 0; i < lines.length; i++) {
        const lineNum = chunk.startLine + i + 1;
        const marker = warningSet.has(lineNum) ? ">>>" : "   ";
        user += `${marker} ${lineNum}: ${lines[i]}\n`;
      }
      user += "\n";
    }
    user += `Retorne cada trecho corrigido separado por --- TRECHO N ---, sem número de linha, sem marcadores >>>.`;
  }

  return { system: TARGETED_SYSTEM_PROMPT, user };
}

/**
 * Parse AI response into fixed chunks.
 * For single chunk: the entire response is the fixed chunk.
 * For multiple chunks: split by --- TRECHO N --- markers.
 */
function parseFixedChunks(response: string, expectedCount: number): string[] {
  // Clean fences
  let cleaned = response
    .replace(/```latex\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Remove line number prefixes the AI might have kept (e.g. "   548: " or ">>> 548: ")
  cleaned = cleaned.replace(/^(?:>>>|   )\s*\d+:\s?/gm, "");

  if (expectedCount === 1) {
    return [cleaned];
  }

  // Split by --- TRECHO N --- markers
  const parts: string[] = [];
  const markerRegex = /---\s*TRECHO\s+\d+\s*(?:\([^)]*\))?\s*---/gi;
  const splits = cleaned.split(markerRegex);

  // First element before any marker is usually empty or preamble — skip it
  for (const part of splits) {
    const trimmed = part.trim();
    if (trimmed) parts.push(trimmed);
  }

  // If we got the right number, great. Otherwise, try to salvage.
  if (parts.length === expectedCount) return parts;

  // Fallback: if AI didn't use markers, try splitting by double newlines
  if (parts.length === 1 && expectedCount > 1) {
    console.log("[auto-fix] IA não usou marcadores de trecho, tentando split por linhas duplas");
  }

  return parts;
}

/**
 * Splice fixed chunks back into the source, replacing the original lines.
 * Applies in reverse order to preserve line numbers.
 */
function spliceChunks(
  sourceLines: string[],
  chunks: SourceChunk[],
  fixedChunks: string[],
): string {
  const result = [...sourceLines];

  // Apply in reverse order so earlier indices stay valid
  const sorted = chunks
    .map((chunk, i) => ({ chunk, fixed: fixedChunks[i] }))
    .sort((a, b) => b.chunk.startLine - a.chunk.startLine);

  for (const { chunk, fixed } of sorted) {
    if (!fixed) continue;
    const fixedLines = fixed.split("\n");
    const deleteCount = chunk.endLine - chunk.startLine + 1;
    result.splice(chunk.startLine, deleteCount, ...fixedLines);
  }

  return result.join("\n");
}

/**
 * Targeted surgical warning refinement.
 *
 * Instead of sending the entire 600+ line document to the AI,
 * this approach:
 * 1. Parses warning line numbers
 * 2. Groups them into clusters (same region)
 * 3. Expands each cluster to enclosing environment boundaries
 * 4. Sends ONLY the problematic chunks (typically 20-60 lines each)
 * 5. AI fixes just those chunks with full focus
 * 6. Splices fixed chunks back into the source
 * 7. Recompiles and verifies improvement
 */
async function refineWarningsTargeted(
  initialResult: AutoFixResult,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
  maxTokens = 16000,
  images?: CompileImage[],
): Promise<AutoFixResult> {
  if (!hasSignificantWarnings(initialResult.warnings)) {
    console.log("[auto-fix] Sem warnings significativos, pulando refinamento");
    return initialResult;
  }

  let best = initialResult;
  let bestSignificantCount = filterSignificantWarnings(initialResult.warnings ?? []).length;
  let currentSource = initialResult.latexSource;
  let currentWarnings = filterSignificantWarnings(initialResult.warnings ?? []);

  console.log(`[auto-fix] ${bestSignificantCount} warning(s) significativo(s), iniciando refinamento cirúrgico...`);

  for (let pass = 1; pass <= MAX_REFINE_PASSES; pass++) {
    const chunks = extractChunks(currentSource, currentWarnings);
    if (chunks.length === 0) {
      console.log(`[auto-fix] Passo ${pass}: sem trechos identificáveis, parando`);
      break;
    }

    const totalLines = chunks.reduce((sum, c) => sum + (c.endLine - c.startLine + 1), 0);
    console.log(
      `[auto-fix] Passo ${pass}/${MAX_REFINE_PASSES}: ${currentWarnings.length} warning(s), ` +
      `${chunks.length} trecho(s) (${totalLines} linhas no total), enviando para IA...`,
    );

    try {
      const sourceLines = currentSource.split("\n");
      const { system, user } = buildTargetedPrompt(currentWarnings, chunks, sourceLines);

      // Targeted fix uses fewer tokens since it's only fixing small chunks
      const chunkTokenBudget = Math.min(maxTokens, Math.max(4000, totalLines * 20));

      const fixResult = await aiProvider.generate({
        model: aiModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: chunkTokenBudget,
        temperature: 0.15,
      });

      const fixedChunks = parseFixedChunks(fixResult.content, chunks.length);

      if (fixedChunks.length === 0) {
        console.log(`[auto-fix] Passo ${pass}: IA não retornou conteúdo válido, parando`);
        break;
      }

      // If we got fewer chunks than expected, only use what we have
      const usableCount = Math.min(fixedChunks.length, chunks.length);
      const refinedSource = spliceChunks(
        sourceLines,
        chunks.slice(0, usableCount),
        fixedChunks.slice(0, usableCount),
      );

      // Compile the patched source
      const compileResult = await compileLatex(refinedSource, compilerUrl, compilerToken, images);

      if (!compileResult.success) {
        // The surgical fix broke compilation — try compileAndFixErrors as fallback
        console.log(`[auto-fix] Passo ${pass}: fix cirúrgico quebrou compilação, tentando auto-fix de erros...`);
        const recovered = await compileAndFixErrors(
          refinedSource,
          compilerUrl,
          compilerToken,
          aiProvider,
          aiModel,
          maxTokens,
          images,
        );
        if (!recovered.success) {
          console.log(`[auto-fix] Passo ${pass}: não recuperou, parando`);
          break;
        }
        // Use recovered version
        const newWarnings = filterSignificantWarnings(recovered.warnings ?? []);
        if (newWarnings.length < bestSignificantCount) {
          best = recovered;
          bestSignificantCount = newWarnings.length;
          currentSource = recovered.latexSource;
          currentWarnings = newWarnings;
        }
        if (newWarnings.length >= currentWarnings.length) {
          console.log(`[auto-fix] Passo ${pass}: não melhorou após recovery, parando`);
          break;
        }
        continue;
      }

      // Success — check if warnings improved
      const newSignificant = filterSignificantWarnings(compileResult.warnings ?? []);
      console.log(
        `[auto-fix] Passo ${pass}: ${currentWarnings.length} → ${newSignificant.length} warning(s) significativo(s)`,
      );

      const newResult: AutoFixResult = {
        success: true,
        latexSource: refinedSource,
        pdfBase64: compileResult.pdfBase64,
        pdfSizeBytes: compileResult.pdfSizeBytes,
        attempts: best.attempts,
        warnings: compileResult.warnings,
      };

      if (newSignificant.length < bestSignificantCount) {
        best = newResult;
        bestSignificantCount = newSignificant.length;
      }

      if (newSignificant.length === 0) {
        console.log("[auto-fix] Zero warnings! Refinamento completo.");
        break;
      }

      if (newSignificant.length >= currentWarnings.length) {
        console.log(`[auto-fix] Passo ${pass}: não melhorou, parando`);
        break;
      }

      currentSource = refinedSource;
      currentWarnings = newSignificant;
    } catch (err) {
      console.log(`[auto-fix] Erro no passo ${pass}:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  const initialCount = filterSignificantWarnings(initialResult.warnings ?? []).length;
  console.log(`[auto-fix] Refinamento finalizado: ${initialCount} → ${bestSignificantCount} warning(s)`);
  return best;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rebuildSource(currentSource: string, newBody: string): string {
  const preambleEnd = currentSource.indexOf("\\begin{document}");
  if (preambleEnd !== -1) {
    return currentSource.substring(0, preambleEnd) + newBody;
  }
  return newBody;
}

function extractLatexBody(content: string): string | null {
  // Remove fence blocks
  let cleaned = content
    .replace(/```latex\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Must contain \begin{document}
  const startIdx = cleaned.indexOf("\\begin{document}");
  if (startIdx === -1) return null;

  const endIdx = cleaned.lastIndexOf("\\end{document}");
  let body: string;
  if (endIdx === -1) {
    body = cleaned.substring(startIdx) + "\n\\end{document}";
  } else {
    body = cleaned.substring(startIdx, endIdx + "\\end{document}".length);
  }

  // Strip problematic TeX constructs (\ifnum, \ifdim, etc.)
  return sanitizeLatexSource(body);
}
