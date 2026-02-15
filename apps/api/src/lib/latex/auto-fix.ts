import type { AIProvider } from "../../lib/ai/types";
import { compileLatex, type CompileResult } from "./compiler-client";
import { sanitizeLatexSource, detectTruncation } from "./sanitizer";

const MAX_FIX_ATTEMPTS = 3;
const MAX_REFINE_PASSES = 3;

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

/** Warnings worth sending to AI for refinement (layout issues). */
function hasSignificantWarnings(warnings?: string[]): boolean {
  if (!warnings || warnings.length === 0) return false;
  return warnings.some(
    (w) =>
      w.startsWith("Overfull \\hbox") ||
      w.startsWith("Overfull \\vbox") ||
      w.startsWith("Underfull \\hbox") ||
      w.startsWith("Underfull \\vbox"),
  );
}

function rebuildSource(currentSource: string, newBody: string): string {
  const preambleEnd = currentSource.indexOf("\\begin{document}");
  if (preambleEnd !== -1) {
    return currentSource.substring(0, preambleEnd) + newBody;
  }
  return newBody;
}

/**
 * Iteratively refine layout warnings until:
 * - Zero warnings remain, OR
 * - No improvement from last pass, OR
 * - MAX_REFINE_PASSES reached.
 *
 * Each pass: AI fixes layout → compileAndFixErrors (handles any new errors).
 * Always keeps the best version seen so far.
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
  let bestWarningCount = initialResult.warnings?.length ?? 0;
  let currentSource = initialResult.latexSource;
  let currentWarnings = initialResult.warnings!;

  console.log(`[auto-fix] ${bestWarningCount} warning(s) significativo(s), iniciando refinamento iterativo...`);

  for (let pass = 1; pass <= MAX_REFINE_PASSES; pass++) {
    console.log(`[auto-fix] Refinamento ${pass}/${MAX_REFINE_PASSES}: ${currentWarnings.length} warning(s), enviando para IA...`);

    try {
      const fixResult = await aiProvider.generate({
        model: aiModel,
        messages: [
          {
            role: "system",
            content: `Você é um especialista em LaTeX. O documento abaixo compilou com sucesso, mas gerou avisos de layout (overfull/underfull boxes). Corrija os problemas de layout sem alterar o conteúdo textual. Técnicas comuns: ajustar largura de tabelas, usar \\adjustbox{max width=\\textwidth}{...}, quebrar linhas longas, usar \\sloppy localmente, reduzir fonte em tabelas com \\small ou \\footnotesize, usar p{Xcm} em vez de l/c/r em colunas de tabela. Retorne o código LaTeX corrigido COMPLETO (de \\begin{document} até \\end{document}), sem explicações, sem fence blocks.`,
          },
          {
            role: "user",
            content: `AVISOS DE COMPILAÇÃO:\n${currentWarnings.join("\n")}\n\nCÓDIGO LATEX:\n${currentSource}`,
          },
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

      const newWarningCount = refinedResult.warnings?.length ?? 0;
      console.log(`[auto-fix] Passo ${pass}: ${bestWarningCount} → ${newWarningCount} warning(s)`);

      // Keep if better than our best so far
      if (newWarningCount < bestWarningCount) {
        best = refinedResult;
        bestWarningCount = newWarningCount;
      }

      // Zero warnings — done!
      if (newWarningCount === 0) {
        console.log(`[auto-fix] Zero warnings! Refinamento completo.`);
        break;
      }

      // Didn't improve from previous pass — stop iterating
      if (newWarningCount >= currentWarnings.length) {
        console.log(`[auto-fix] Passo ${pass} não melhorou (${currentWarnings.length} → ${newWarningCount}), parando`);
        break;
      }

      // Continue with refined version for next pass
      currentSource = refinedResult.latexSource;
      currentWarnings = refinedResult.warnings ?? [];
    } catch (err) {
      console.log(`[auto-fix] Erro no passo ${pass}:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  console.log(`[auto-fix] Refinamento finalizado: ${initialResult.warnings?.length ?? 0} → ${bestWarningCount} warning(s)`);
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
