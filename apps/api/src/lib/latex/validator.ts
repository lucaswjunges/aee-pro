/**
 * LaTeX validation with Haiku — auto-fix common AI-generated errors
 * before sending to the expensive pdflatex compiler.
 *
 * Cost: ~$0.004 per document (Haiku is very cheap).
 * Latency: ~0.25-0.5s (non-streaming, no tools).
 * Fallback: any failure returns the original source unchanged.
 */

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_SOURCE_LENGTH = 50_000; // skip validation for very large docs
const TIMEOUT_MS = 15_000;

const VALIDATION_PROMPT = `Você é um validador de LaTeX para pdflatex. Analise o código e encontre APENAS erros de compilação:
1. \\\\ após \\section, \\subsection, \\begin{...} (não-tabular), \\centering, \\maketitle, \\vspace{...}
2. Braces {} desbalanceados
3. \\begin{X} sem \\end{X} correspondente (ou vice-versa)
4. \\includegraphics (não disponível — remover a linha inteira)
5. Comandos usados sem pacote (os seguintes são definidos e NÃO são erros: infobox, alertbox, successbox, datacard, sessaobox, dicabox, atividadebox, materialbox, objtag, cmark, starmark, hand, bulb)
6. Texto com caracteres unicode inválidos para pdflatex

Se TUDO está correto: responda apenas VALID

Se encontrar erros, responda SOMENTE neste formato (uma correção por linha):
FIX:<número_linha>:<texto_original>→<texto_corrigido>
(use REMOVE como texto_corrigido para deletar a linha inteira)

Não inclua explicações, apenas FIX: linhas ou VALID.`;

export interface ValidationResult {
  source: string;
  applied: number;
}

export async function validateAndFixLatex(
  source: string,
  apiKey: string
): Promise<ValidationResult> {
  // Skip validation for very large documents
  if (source.length > MAX_SOURCE_LENGTH) {
    return { source, applied: 0 };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `${VALIDATION_PROMPT}\n\n---\n\n${source}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[latex-validator] Haiku API returned ${response.status}`);
      return { source, applied: 0 };
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content?.[0]?.text?.trim();
    if (!text) {
      return { source, applied: 0 };
    }

    // If VALID, no fixes needed
    if (text === "VALID") {
      return { source, applied: 0 };
    }

    // Parse FIX: lines and apply corrections
    return applyFixes(source, text);
  } catch (err) {
    // Graceful degradation — any error means we skip validation
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[latex-validator] Skipping validation: ${msg}`);
    return { source, applied: 0 };
  }
}

/**
 * Parse FIX: lines from Haiku's response and apply them to the source.
 * Format: FIX:<line_number>:<original_text>→<corrected_text>
 * If corrected_text is "REMOVE", the entire line is deleted.
 */
function applyFixes(source: string, response: string): ValidationResult {
  const lines = source.split("\n");
  let applied = 0;

  // Extract FIX: lines from the response
  const fixLines = response
    .split("\n")
    .filter((line) => line.startsWith("FIX:"));

  for (const fixLine of fixLines) {
    // Parse: FIX:<lineNum>:<original>→<corrected>
    const withoutPrefix = fixLine.slice(4); // remove "FIX:"
    const colonIdx = withoutPrefix.indexOf(":");
    if (colonIdx === -1) continue;

    const lineNumStr = withoutPrefix.slice(0, colonIdx);
    const lineNum = parseInt(lineNumStr, 10);
    if (isNaN(lineNum) || lineNum < 1 || lineNum > lines.length) continue;

    const rest = withoutPrefix.slice(colonIdx + 1);
    // Split on → (Unicode arrow) — the separator between original and corrected
    const arrowIdx = rest.indexOf("→");
    if (arrowIdx === -1) continue;

    const originalText = rest.slice(0, arrowIdx);
    const correctedText = rest.slice(arrowIdx + 1);

    const targetIdx = lineNum - 1; // 0-indexed

    if (correctedText.trim() === "REMOVE") {
      // Delete the entire line
      lines[targetIdx] = "\x00REMOVE\x00";
      applied++;
    } else if (lines[targetIdx].includes(originalText)) {
      // Replace the original text in the target line
      lines[targetIdx] = lines[targetIdx].replace(originalText, correctedText);
      applied++;
    } else {
      // Fuzzy: if the line roughly matches, replace the whole line
      const trimmedLine = lines[targetIdx].trim();
      const trimmedOriginal = originalText.trim();
      if (trimmedLine === trimmedOriginal) {
        const indent = lines[targetIdx].match(/^\s*/)?.[0] || "";
        lines[targetIdx] = indent + correctedText.trim();
        applied++;
      }
    }
  }

  if (applied === 0) {
    return { source, applied: 0 };
  }

  // Remove deleted lines and rejoin
  const result = lines
    .filter((line) => line !== "\x00REMOVE\x00")
    .join("\n");

  return { source: result, applied };
}
