export interface CompileResult {
  success: boolean;
  pdfBase64?: string;
  pdfSizeBytes?: number;
  error?: string;
  warnings?: string[];
}

export async function compileLatex(
  latexSource: string,
  compilerUrl: string,
  compilerToken: string,
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
      body: JSON.stringify({ latex_source: latexSource }),
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
