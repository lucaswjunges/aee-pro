import os
import re
import base64
import subprocess
import tempfile
import shutil

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

app = FastAPI(title="AEE+ PRO LaTeX Compiler")

AUTH_TOKEN = os.environ.get("COMPILER_AUTH_TOKEN", "")


class CompileRequest(BaseModel):
    latex_source: str


class CompileResponse(BaseModel):
    success: bool
    pdf_base64: str | None = None
    pdf_size_bytes: int | None = None
    error: str | None = None
    warnings: list[str] | None = None


_WARNING_PATTERNS = [
    re.compile(r"^(Overfull \\[hv]box .+)$", re.MULTILINE),
    re.compile(r"^(Underfull \\[hv]box .+)$", re.MULTILINE),
    re.compile(r"^(LaTeX Warning: .+)$", re.MULTILINE),
    re.compile(r"^(Package \S+ Warning: .+)$", re.MULTILINE),
]

MAX_WARNINGS = 30


def _extract_warnings(log_path: str) -> list[str]:
    """Parse a LaTeX .log file and return relevant warning lines."""
    if not os.path.exists(log_path):
        return []
    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        log_text = f.read()
    warnings: list[str] = []
    for pat in _WARNING_PATTERNS:
        for m in pat.finditer(log_text):
            warnings.append(m.group(1).strip())
            if len(warnings) >= MAX_WARNINGS:
                return warnings
    return warnings


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/compile", response_model=CompileResponse)
def compile_latex(
    req: CompileRequest,
    authorization: str = Header(default=""),
):
    # Auth check
    if AUTH_TOKEN:
        token = authorization.removeprefix("Bearer ").strip()
        if token != AUTH_TOKEN:
            raise HTTPException(status_code=401, detail="Unauthorized")

    tmpdir = tempfile.mkdtemp(prefix="latex_")
    tex_path = os.path.join(tmpdir, "document.tex")
    pdf_path = os.path.join(tmpdir, "document.pdf")

    try:
        # Write .tex file
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(req.latex_source)

        # Run pdflatex twice (for table of contents / references)
        for pass_num in range(2):
            result = subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-output-directory", tmpdir,
                    tex_path,
                ],
                capture_output=True,
                timeout=60,
                cwd=tmpdir,
            )

            # Decode stdout/stderr safely
            stdout = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
            stderr = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""

            if result.returncode != 0:
                # Extract meaningful error lines from log
                log_path = os.path.join(tmpdir, "document.log")
                error_log = ""
                if os.path.exists(log_path):
                    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.readlines()
                    # Extract error lines
                    error_lines = []
                    capture = False
                    for line in lines:
                        if line.startswith("!") or capture:
                            error_lines.append(line.rstrip())
                            capture = True
                            if len(error_lines) > 5:
                                capture = False
                        if len(error_lines) > 30:
                            break
                    error_log = "\n".join(error_lines) if error_lines else stdout[-2000:]
                else:
                    error_log = stdout[-2000:] if stdout else stderr[-2000:]

                return CompileResponse(
                    success=False,
                    error=error_log[:3000],
                )

        # Check PDF exists
        if not os.path.exists(pdf_path):
            return CompileResponse(
                success=False,
                error="PDF was not generated (file not found after compilation)",
            )

        # Extract warnings from log
        log_path = os.path.join(tmpdir, "document.log")
        warnings = _extract_warnings(log_path) or None

        # Read PDF and encode as base64
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        return CompileResponse(
            success=True,
            pdf_base64=base64.b64encode(pdf_bytes).decode("ascii"),
            pdf_size_bytes=len(pdf_bytes),
            warnings=warnings,
        )

    except subprocess.TimeoutExpired:
        return CompileResponse(
            success=False,
            error="Compilation timed out (60s limit)",
        )
    except Exception as e:
        return CompileResponse(
            success=False,
            error=f"Server error: {str(e)}",
        )
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
