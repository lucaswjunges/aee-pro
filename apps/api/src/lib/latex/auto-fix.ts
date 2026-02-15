import type { AIProvider } from "../../lib/ai/types";
import { compileLatex, type CompileResult } from "./compiler-client";

const MAX_FIX_ATTEMPTS = 3;

interface AutoFixResult {
  success: boolean;
  latexSource: string;
  pdfBase64?: string;
  pdfSizeBytes?: number;
  attempts: number;
  lastError?: string;
  warnings?: string[];
}

export async function compileWithAutoFix(
  initialSource: string,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
): Promise<AutoFixResult> {
  let source = initialSource;

  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const result: CompileResult = await compileLatex(
      source,
      compilerUrl,
      compilerToken,
    );

    if (result.success && result.pdfBase64) {
      // Try one refinement pass if there are layout warnings
      const refined = await tryRefineWarnings(
        source,
        result,
        compilerUrl,
        compilerToken,
        aiProvider,
        aiModel,
      );
      return {
        success: true,
        latexSource: refined.latexSource,
        pdfBase64: refined.pdfBase64,
        pdfSizeBytes: refined.pdfSizeBytes,
        attempts: attempt,
        warnings: refined.warnings,
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

    // Try AI fix
    const fixResult = await aiProvider.generate({
      model: aiModel,
      messages: [
        {
          role: "system",
          content: `Você é um especialista em LaTeX. O código abaixo falhou na compilação com pdflatex. Corrija APENAS os erros de compilação — não mude o conteúdo nem o estilo. Retorne o código LaTeX corrigido COMPLETO (de \\begin{document} até \\end{document}), sem explicações, sem fence blocks.`,
        },
        {
          role: "user",
          content: `ERRO DE COMPILAÇÃO:\n${result.error}\n\nCÓDIGO LATEX COM ERRO:\n${source}`,
        },
      ],
      maxTokens: 16000,
      temperature: 0.2,
    });

    const fixed = extractLatexBody(fixResult.content);
    if (fixed) {
      // Reconstruct: keep preamble, replace body
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

/**
 * If compilation succeeded but has significant layout warnings,
 * ask the AI to fix them. Returns the better version (original or refined).
 * At most 1 extra AI call + 1 extra compilation.
 */
async function tryRefineWarnings(
  source: string,
  originalResult: CompileResult,
  compilerUrl: string,
  compilerToken: string,
  aiProvider: AIProvider,
  aiModel: string,
): Promise<{
  latexSource: string;
  pdfBase64?: string;
  pdfSizeBytes?: number;
  warnings?: string[];
}> {
  if (!hasSignificantWarnings(originalResult.warnings)) {
    return {
      latexSource: source,
      pdfBase64: originalResult.pdfBase64,
      pdfSizeBytes: originalResult.pdfSizeBytes,
      warnings: originalResult.warnings,
    };
  }

  try {
    const fixResult = await aiProvider.generate({
      model: aiModel,
      messages: [
        {
          role: "system",
          content: `Você é um especialista em LaTeX. O documento abaixo compilou com sucesso, mas gerou avisos de layout (overfull/underfull boxes). Corrija os problemas de layout sem alterar o conteúdo textual. Técnicas comuns: ajustar largura de tabelas, usar \\adjustbox, quebrar linhas longas, usar \\sloppy localmente. Retorne o código LaTeX corrigido COMPLETO (de \\begin{document} até \\end{document}), sem explicações, sem fence blocks.`,
        },
        {
          role: "user",
          content: `AVISOS DE COMPILAÇÃO:\n${originalResult.warnings!.join("\n")}\n\nCÓDIGO LATEX:\n${source}`,
        },
      ],
      maxTokens: 16000,
      temperature: 0.2,
    });

    const fixed = extractLatexBody(fixResult.content);
    if (!fixed) {
      return {
        latexSource: source,
        pdfBase64: originalResult.pdfBase64,
        pdfSizeBytes: originalResult.pdfSizeBytes,
        warnings: originalResult.warnings,
      };
    }

    // Reconstruct: keep preamble, replace body
    let refinedSource: string;
    const preambleEnd = source.indexOf("\\begin{document}");
    if (preambleEnd !== -1) {
      refinedSource = source.substring(0, preambleEnd) + fixed;
    } else {
      refinedSource = fixed;
    }

    // Recompile the refined version
    const refinedResult = await compileLatex(
      refinedSource,
      compilerUrl,
      compilerToken,
    );

    // Only use refined version if it compiled and didn't get worse
    if (refinedResult.success && refinedResult.pdfBase64) {
      const origWarningCount = originalResult.warnings?.length ?? 0;
      const newWarningCount = refinedResult.warnings?.length ?? 0;
      if (newWarningCount <= origWarningCount) {
        return {
          latexSource: refinedSource,
          pdfBase64: refinedResult.pdfBase64,
          pdfSizeBytes: refinedResult.pdfSizeBytes,
          warnings: refinedResult.warnings,
        };
      }
    }
  } catch {
    // Refinement failed — keep original
  }

  // Fallback: return original successful compilation
  return {
    latexSource: source,
    pdfBase64: originalResult.pdfBase64,
    pdfSizeBytes: originalResult.pdfSizeBytes,
    warnings: originalResult.warnings,
  };
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
  if (endIdx === -1) {
    return cleaned.substring(startIdx) + "\n\\end{document}";
  }

  return cleaned.substring(startIdx, endIdx + "\\end{document}".length);
}
