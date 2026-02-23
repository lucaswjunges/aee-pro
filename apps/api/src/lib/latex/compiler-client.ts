export interface CompileImage {
  filename: string;
  data_base64: string;
}

export interface CompileFile {
  filename: string;
  content: string;
}

export interface CompileResult {
  success: boolean;
  pdfBase64?: string;
  pdfSizeBytes?: number;
  error?: string;
  warnings?: string[];
}

export interface GenerateAndCompileResult {
  success: boolean;
  pdfBase64?: string;
  pdfSizeBytes?: number;
  latexSource?: string;
  error?: string;
  warnings?: string[];
  attempts: number;
  aiModel?: string;
}

export async function compileLatex(
  latexSource: string,
  compilerUrl: string,
  compilerToken: string,
  images?: CompileImage[],
  additionalFiles?: CompileFile[],
): Promise<CompileResult> {
  if (!compilerUrl) {
    return { success: false, error: "LATEX_COMPILER_URL não configurado" };
  }

  let res: Response;
  try {
    res = await fetch(`${compilerUrl}/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${compilerToken}`,
      },
      body: JSON.stringify({
        latex_source: latexSource,
        ...(images && images.length > 0 ? { images } : {}),
        ...(additionalFiles && additionalFiles.length > 0 ? { additional_files: additionalFiles } : {}),
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Compilador LaTeX indisponível (${compilerUrl}): ${msg}`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      success: false,
      error: `Compiler HTTP ${res.status}: ${text.slice(0, 500)}`,
    };
  }

  const data = (await res.json()) as {
    success: boolean;
    pdf_base64?: string;
    pdf_size_bytes?: number;
    error?: string;
    warnings?: string[];
  };

  return {
    success: data.success,
    pdfBase64: data.pdf_base64,
    pdfSizeBytes: data.pdf_size_bytes,
    error: data.error,
    warnings: data.warnings ?? undefined,
  };
}

/**
 * Try to generate LaTeX with Claude and compile in one shot on the local server.
 * Returns null if the local server is unavailable (caller should fallback).
 * Uses a short connect timeout (3s) to fail fast when the server is offline.
 */
export async function generateAndCompile(
  params: {
    systemPrompt: string;
    userPrompt: string;
    preamble: string;
    maxTokens: number;
    signatureBlock?: string;
    images?: CompileImage[];
  },
  compilerUrl: string,
  compilerToken: string,
): Promise<GenerateAndCompileResult | null> {
  if (!compilerUrl) return null;

  const controller = new AbortController();
  // Claude generation + compilation + auto-fix can take up to 10 minutes for large documents
  const connectTimeout = setTimeout(() => controller.abort(), 600_000);

  let res: Response;
  try {
    res = await fetch(`${compilerUrl}/generate-and-compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${compilerToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_prompt: params.systemPrompt,
        user_prompt: params.userPrompt,
        preamble: params.preamble,
        max_tokens: params.maxTokens,
        ...(params.signatureBlock ? { signature_block: params.signatureBlock } : {}),
        ...(params.images && params.images.length > 0 ? { images: params.images } : {}),
      }),
    });
  } catch {
    // Server offline or connect timeout — caller should fallback
    return null;
  } finally {
    clearTimeout(connectTimeout);
  }

  if (res.status === 503) {
    // Server up but Claude API not configured — fallback
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      success: false,
      error: `Local server HTTP ${res.status}: ${text.slice(0, 500)}`,
      attempts: 0,
    };
  }

  const data = (await res.json()) as {
    success: boolean;
    pdf_base64?: string;
    pdf_size_bytes?: number;
    latex_source?: string;
    error?: string;
    warnings?: string[];
    attempts?: number;
    ai_model?: string;
  };

  return {
    success: data.success,
    pdfBase64: data.pdf_base64,
    pdfSizeBytes: data.pdf_size_bytes,
    latexSource: data.latex_source,
    error: data.error,
    warnings: data.warnings ?? undefined,
    attempts: data.attempts ?? 1,
    aiModel: data.ai_model,
  };
}
