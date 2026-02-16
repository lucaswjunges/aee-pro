import type { AIProvider } from "../../lib/ai/types";
import { compileLatex, type CompileResult } from "./compiler-client";
import { sanitizeLatexSource, detectTruncation } from "./sanitizer";

const MAX_FIX_ATTEMPTS = 3;
const MAX_REFINE_PASSES = 3;
/** Global timeout for the entire auto-fix pipeline (3 minutes). */
const PIPELINE_TIMEOUT_MS = 3 * 60 * 1000;

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
10. \\rowcolor DEVE ser o PRIMEIRO comando de uma linha de tabela.
11. Para Overfull \\hbox em TABELAS: envolva a tabela em \\adjustbox{max width=\\linewidth}{...} ou use colunas p{Xcm} em vez de l/c/r para colunas com texto longo.
12. Para Overfull \\hbox em TCOLORBOX: use \\small ou \\footnotesize para texto e tabelas dentro de caixas (infobox, alertbox, sessaobox, etc.).

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
): Promise<AutoFixResult> {
  // Wrap entire pipeline in a timeout to prevent infinite hangs
  return Promise.race([
    compileWithAutoFixPipeline(initialSource, compilerUrl, compilerToken, aiProvider, aiModel, maxTokens),
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
    );
    if (completed) return completed;
    // If completion failed, continue with truncated but compilable version
  }

  // Phase 2: iteratively refine layout warnings
  return refineWarnings(result, compilerUrl, compilerToken, aiProvider, aiModel, maxTokens);
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
): Promise<AutoFixResult> {
  let source = initialSource;

  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const result: CompileResult = await compileLatex(
      source,
      compilerUrl,
      compilerToken,
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
 * Also filters Underfull \hbox with low badness (< 5000) as irrelevant.
 */
function filterSignificantWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => {
    // Must be a layout warning (Overfull/Underfull)
    const isOverfull = w.startsWith("Overfull \\hbox") || w.startsWith("Overfull \\vbox");
    const isUnderfull = w.startsWith("Underfull \\hbox") || w.startsWith("Underfull \\vbox");

    if (!isOverfull && !isUnderfull) {
      // Not a box warning — check if it's a noise warning to filter out
      // Keep non-noise, non-box warnings (they might be relevant)
      return !NOISE_WARNING_PATTERNS.some((p) => p.test(w));
    }

    // Filter out low-badness Underfull (badness < 5000 is visually irrelevant)
    if (isUnderfull) {
      const badnessMatch = w.match(/badness (\d+)/);
      if (badnessMatch && parseInt(badnessMatch[1], 10) < 5000) return false;
    }

    return true;
  });
}

/** Check if there are significant warnings worth refining. */
function hasSignificantWarnings(warnings?: string[]): boolean {
  if (!warnings || warnings.length === 0) return false;
  return filterSignificantWarnings(warnings).length > 0;
}

function rebuildSource(currentSource: string, newBody: string): string {
  const preambleEnd = currentSource.indexOf("\\begin{document}");
  if (preambleEnd !== -1) {
    return currentSource.substring(0, preambleEnd) + newBody;
  }
  return newBody;
}

/**
 * Extract line numbers from warning messages.
 * Warnings look like: "Overfull \hbox (14.5pt too wide) in paragraph at lines 538--538"
 * Returns unique sorted line numbers.
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
 * Get source code context around specific lines (±contextLines).
 * Returns a formatted string with line numbers.
 */
function getSourceContext(source: string, lineNumbers: number[], contextLines = 5): string {
  const sourceLines = source.split("\n");
  const snippets: string[] = [];
  const seen = new Set<number>();

  // Limit to first 5 problematic areas to avoid overwhelming the prompt
  const limitedLines = lineNumbers.slice(0, 5);

  for (const lineNum of limitedLines) {
    const start = Math.max(0, lineNum - contextLines - 1);
    const end = Math.min(sourceLines.length, lineNum + contextLines);

    // Skip if overlapping with previous snippet
    let skip = false;
    for (let i = start; i < end; i++) {
      if (seen.has(i)) { skip = true; break; }
    }
    if (skip) continue;

    const snippet: string[] = [];
    for (let i = start; i < end; i++) {
      seen.add(i);
      const marker = i === lineNum - 1 ? ">>>" : "   ";
      snippet.push(`${marker} ${i + 1}: ${sourceLines[i]}`);
    }
    snippets.push(snippet.join("\n"));
  }

  return snippets.join("\n---\n");
}

/**
 * Group warnings by type and build a dynamic refinement prompt.
 */
function buildRefinementPrompt(warnings: string[], source: string): { system: string; user: string } {
  const overfullHbox = warnings.filter((w) => w.startsWith("Overfull \\hbox"));
  const overfullVbox = warnings.filter((w) => w.startsWith("Overfull \\vbox"));
  const underfull = warnings.filter((w) => w.startsWith("Underfull"));
  const other = warnings.filter(
    (w) => !w.startsWith("Overfull") && !w.startsWith("Underfull"),
  );

  let instructions = `Você é um especialista em LaTeX. O documento abaixo compilou com sucesso, mas gerou ${warnings.length} aviso(s) de layout. Corrija os problemas sem alterar o conteúdo textual.\n\n`;

  if (overfullHbox.length > 0) {
    instructions += `OVERFULL \\hbox (${overfullHbox.length} ocorrências):\n`;
    instructions += `- Para tabelas: envolva em \\adjustbox{max width=\\linewidth}{...} ou troque colunas l/c/r por p{Xcm}\n`;
    instructions += `- Para texto dentro de tcolorbox: use \\small ou \\footnotesize\n`;
    instructions += `- Para texto normal: quebre linhas longas ou use \\sloppy localmente\n\n`;
  }

  if (overfullVbox.length > 0) {
    instructions += `OVERFULL \\vbox (${overfullVbox.length} ocorrências):\n`;
    instructions += `- Reduza conteúdo na página ou adicione \\pagebreak antes do trecho\n\n`;
  }

  if (underfull.length > 0) {
    instructions += `UNDERFULL (${underfull.length} ocorrências):\n`;
    instructions += `- Underfull \\hbox com badness alto: considere \\sloppy ou reformular o parágrafo\n\n`;
  }

  if (other.length > 0) {
    instructions += `OUTROS AVISOS (${other.length}):\n`;
    instructions += `- Analise e corrija conforme o tipo específico\n\n`;
  }

  instructions += `Retorne o código LaTeX corrigido COMPLETO (de \\begin{document} até \\end{document}), sem explicações, sem fence blocks.`;

  // Build user message with warnings, line context, and full source
  const lineNumbers = extractWarningLines(warnings);
  let userMsg = `AVISOS DE COMPILAÇÃO (${warnings.length}):\n${warnings.join("\n")}\n\n`;

  if (lineNumbers.length > 0) {
    const context = getSourceContext(source, lineNumbers);
    userMsg += `TRECHOS PROBLEMÁTICOS (linhas indicadas com >>>):\n${context}\n\n`;
  }

  userMsg += `CÓDIGO LATEX COMPLETO:\n${source}`;

  return { system: instructions, user: userMsg };
}

/**
 * Iteratively refine layout warnings until:
 * - Zero significant warnings remain, OR
 * - No improvement from last pass, OR
 * - MAX_REFINE_PASSES reached.
 *
 * Each pass: AI fixes layout → compileAndFixErrors (handles any new errors).
 * Always keeps the best version seen so far.
 * Compares only significant warnings (filtered, without noise).
 */
async function refineWarnings(
  initialResult: AutoFixResult,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
  maxTokens = 16000,
): Promise<AutoFixResult> {
  if (!hasSignificantWarnings(initialResult.warnings)) {
    console.log("[auto-fix] Sem warnings significativos, pulando refinamento");
    return initialResult;
  }

  let best = initialResult;
  const initialSignificant = filterSignificantWarnings(initialResult.warnings ?? []);
  let bestSignificantCount = initialSignificant.length;
  let currentSource = initialResult.latexSource;
  let currentSignificantWarnings = initialSignificant;

  console.log(`[auto-fix] ${bestSignificantCount} warning(s) significativo(s) (${initialResult.warnings?.length ?? 0} total), iniciando refinamento iterativo...`);

  for (let pass = 1; pass <= MAX_REFINE_PASSES; pass++) {
    console.log(`[auto-fix] Refinamento ${pass}/${MAX_REFINE_PASSES}: ${currentSignificantWarnings.length} warning(s) significativo(s), enviando para IA...`);

    try {
      const { system, user } = buildRefinementPrompt(currentSignificantWarnings, currentSource);

      const fixResult = await aiProvider.generate({
        model: aiModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens,
        temperature: 0.2,
      });

      const fixed = extractLatexBody(fixResult.content);
      if (!fixed) {
        console.log(`[auto-fix] Passo ${pass}: IA não retornou corpo válido, parando`);
        break;
      }

      const refinedSource = rebuildSource(currentSource, fixed);

      // Compile with error auto-fix (so if AI introduced an error, it gets corrected)
      const refinedResult = await compileAndFixErrors(
        refinedSource,
        compilerUrl,
        compilerToken,
        aiProvider,
        aiModel,
        maxTokens,
      );

      if (!refinedResult.success) {
        console.log(`[auto-fix] Passo ${pass}: falhou na compilação mesmo com auto-fix, parando`);
        break;
      }

      const newSignificant = filterSignificantWarnings(refinedResult.warnings ?? []);
      const newSignificantCount = newSignificant.length;
      console.log(`[auto-fix] Passo ${pass}: ${bestSignificantCount} → ${newSignificantCount} warning(s) significativo(s) (${refinedResult.warnings?.length ?? 0} total)`);

      // Keep if better than our best so far (compare significant only)
      if (newSignificantCount < bestSignificantCount) {
        best = refinedResult;
        bestSignificantCount = newSignificantCount;
      }

      // Zero significant warnings — done!
      if (newSignificantCount === 0) {
        console.log(`[auto-fix] Zero warnings significativos! Refinamento completo.`);
        break;
      }

      // Didn't improve from previous pass — stop iterating
      if (newSignificantCount >= currentSignificantWarnings.length) {
        console.log(`[auto-fix] Passo ${pass} não melhorou (${currentSignificantWarnings.length} → ${newSignificantCount}), parando`);
        break;
      }

      // Continue with refined version for next pass
      currentSource = refinedResult.latexSource;
      currentSignificantWarnings = newSignificant;
    } catch (err) {
      console.log(`[auto-fix] Erro no passo ${pass}:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  console.log(`[auto-fix] Refinamento finalizado: ${initialSignificant.length} → ${bestSignificantCount} warning(s) significativo(s)`);
  return best;
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
