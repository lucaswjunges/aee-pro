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


class ConvertDocxResponse(BaseModel):
    success: bool
    docx_base64: str | None = None
    docx_size_bytes: int | None = None
    error: str | None = None


_UNTITLED_ENVS = ["datacard", "materialbox"]


def _extract_brace_arg(text: str, start: int) -> tuple[str, int]:
    """Extract content from a {...} group, handling nested braces."""
    if start >= len(text) or text[start] != "{":
        return ("", start)
    depth = 0
    i = start
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return (text[start + 1 : i], i + 1)
        i += 1
    return (text[start + 1 :], len(text))


def _extract_cover_info(tikz_block: str) -> str:
    """Extract text content from a TikZ cover page into plain LaTeX."""
    lines: list[str] = []
    # Extract \textbf{Key:} Value patterns from \node content
    for m in re.finditer(r"\\textbf\{([^}]*)\}\s*([^\\}\n]+)", tikz_block):
        key = m.group(1).strip()
        val = m.group(2).strip()
        if key and val:
            lines.append(f"\\textbf{{{key}}} {val}")
    if not lines:
        return ""
    return "\\begin{center}\n" + " \\\\\n".join(lines) + "\n\\end{center}\n"


def _remove_adjustbox_cmd(text: str) -> str:
    """Remove \\adjustbox{options}{content} command form, keeping content."""
    while True:
        m = re.search(r"\\adjustbox\{[^}]*\}\s*\{", text)
        if not m:
            break
        # Find the opening { of the content
        brace_start = text.index("{", m.start() + len("\\adjustbox{"))
        # Skip past the options {..}
        _, after_opts = _extract_brace_arg(text, m.start() + len("\\adjustbox"))
        # Now extract the content {..}
        if after_opts < len(text) and text[after_opts] == "{":
            content, end_pos = _extract_brace_arg(text, after_opts)
            text = text[:m.start()] + content + text[end_pos:]
        else:
            break
    return text


def _preprocess_latex_for_pandoc(source: str) -> str:
    """Convert custom LaTeX to standard LaTeX that pandoc understands well."""

    # 1) Strip everything before \begin{document}
    begin_idx = source.find(r"\begin{document}")
    if begin_idx != -1:
        body = source[begin_idx:]
    else:
        body = source

    # 2) Handle atividadebox specially: \begin{atividadebox}[color]{★ Title}
    #    The TITLE is in the {braces}, the [brackets] is the color
    def _replace_atividadebox(m):
        rest = body[m.end():]
        # skip optional [color]
        pos = 0
        if rest and rest[0] == "[":
            close = rest.find("]")
            if close != -1:
                pos = close + 1
        # extract {Title}
        if pos < len(rest) and rest[pos] == "{":
            title, end_pos = _extract_brace_arg(rest, pos)
            # Clean up commands in title
            title = re.sub(r"\\starmark\s*~?\s*", "★ ", title)
            title = re.sub(r"\\[a-zA-Z]+\s*", "", title)
            title = title.strip()
            # Return subsection + remainder
            return f"\n\\subsection*{{{title}}}\n" + rest[end_pos:]
        return "\n" + rest

    # Process atividadebox iteratively
    while True:
        m = re.search(r"\\begin\{atividadebox\}", body)
        if not m:
            break
        before = body[: m.start()]
        replaced = _replace_atividadebox(m)
        body = before + replaced
    body = body.replace("\\end{atividadebox}", "\n")

    # 3) Handle other titled envs: \begin{env}[Title]
    for env in ["sessaobox", "infobox", "alertbox", "successbox", "dicabox"]:
        pattern = re.compile(
            r"\\begin\{" + env + r"\}\[([^\]]*)\]"
        )
        body = pattern.sub(lambda m: f"\n\\subsection*{{{m.group(1)}}}\n", body)
        # Also handle without title
        body = re.sub(r"\\begin\{" + env + r"\}", "\n", body)
        body = body.replace(f"\\end{{{env}}}", "\n")

    # 4) Remove untitled box environments — keep content
    for env in _UNTITLED_ENVS:
        body = re.sub(r"\\begin\{" + env + r"\}(?:\[[^\]]*\])?(?:\{[^}]*\})?", "\n", body)
        body = body.replace(f"\\end{{{env}}}", "\n")

    # 5) Remove any remaining tcolorbox environments
    body = re.sub(r"\\begin\{tcolorbox\}(?:\[[^\]]*\])?", "\n", body)
    body = body.replace("\\end{tcolorbox}", "\n")

    # 6) TikZ pictures — extract cover info from first, replace all with note
    tikz_blocks = list(re.finditer(
        r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}",
        body,
        flags=re.DOTALL,
    ))
    # Process in reverse order to preserve indices
    for i, m in enumerate(reversed(tikz_blocks)):
        idx = len(tikz_blocks) - 1 - i
        if idx == 0:
            # First tikzpicture is the cover — extract info
            cover_info = _extract_cover_info(m.group())
            if cover_info:
                body = body[:m.start()] + cover_info + body[m.end():]
            else:
                body = body[:m.start()] + "\n\\emph{[Diagrama visual -- ver PDF]}\n" + body[m.end():]
        else:
            body = body[:m.start()] + "\n\\emph{[Diagrama visual -- ver PDF]}\n" + body[m.end():]

    # 7) Remove adjustbox — both environment and command forms
    body = re.sub(r"\\begin\{adjustbox\}\{[^}]*\}", "", body)
    body = body.replace("\\end{adjustbox}", "")
    body = _remove_adjustbox_cmd(body)

    # 8) Replace custom icon commands with Unicode
    body = re.sub(r"\\cmark\b", "✓", body)
    body = re.sub(r"\\starmark\b\s*~?\s*", "★ ", body)
    body = re.sub(r"\\hand\b", "☞", body)
    body = re.sub(r"\\bulb\b\s*~?\s*", "💡 ", body)

    # 9) Remove \objtag — extract the text content (no brackets to avoid
    #    pandoc interpreting \item [text] as a label)
    body = re.sub(r"\\objtag(?:\[[^\]]*\])?\{([^}]*)\}", r"\1", body)

    # 10) Remove color commands — keep text
    body = re.sub(r"\\textcolor\{[^}]*\}\{([^}]*)\}", r"\1", body)
    body = re.sub(r"\\color\{[^}]*\}", "", body)
    body = re.sub(r"\\rowcolor\{[^}]*\}", "", body)
    body = re.sub(r"\\cellcolor\{[^}]*\}", "", body)
    body = re.sub(r"\\columncolor\{[^}]*\}", "", body)

    # 11) Remove \makecell — keep text
    body = re.sub(r"\\makecell(?:\[[^\]]*\])?\{([^}]*)\}", r"\1", body)

    # 12) Simplify tabularx → tabular with simple column spec
    #     Column specs can span multiple lines with nested braces
    def _replace_tabularx(m):
        rest = body[m.end():]
        # Skip {width}
        if rest.startswith("{"):
            _, pos = _extract_brace_arg(rest, 0)
        else:
            pos = 0
        # Skip {col spec} - may contain nested braces
        if pos < len(rest) and rest[pos] == "{":
            col_spec, end_pos = _extract_brace_arg(rest, pos)
            # Count columns
            n_cols = len(re.findall(r"[XlcrpL]", col_spec, re.IGNORECASE))
            if n_cols == 0:
                n_cols = col_spec.count("&") + 2  # rough guess
            n_cols = max(n_cols, 2)
            simple_spec = "|".join(["l"] * n_cols)
            return (f"\\begin{{tabular}}{{|{simple_spec}|}}", m.start(), m.end() + end_pos)
        return (f"\\begin{{tabular}}{{|l|l|}}", m.start(), m.end())

    # Process tabularx iteratively
    while True:
        m = re.search(r"\\begin\{tabularx\}", body)
        if not m:
            break
        result_tuple = _replace_tabularx(m)
        replacement, start, end = result_tuple
        body = body[:start] + replacement + body[end:]
    body = body.replace("\\end{tabularx}", "\\end{tabular}")

    # Also simplify complex tabular specs (with >{} modifiers)
    def _simplify_tabular_spec(m):
        spec = m.group(1)
        if ">" not in spec and "p{" not in spec:
            return m.group(0)  # already simple
        n_cols = spec.count("&") + 1
        if n_cols <= 1:
            n_cols = len(re.findall(r"[lcrpX]", spec, re.IGNORECASE))
        n_cols = max(n_cols, 2)
        simple = "|".join(["l"] * n_cols)
        return f"\\begin{{tabular}}{{|{simple}|}}"
    body = re.sub(r"\\begin\{tabular\}\{([^}]*)\}", _simplify_tabular_spec, body)

    # Remove \hline duplicates (pandoc handles single \hline fine)
    body = re.sub(r"(\\hline\s*){2,}", r"\\hline\n", body)

    # 13) Remove longtable-specific commands
    body = re.sub(r"\\endhead\b", "", body)
    body = re.sub(r"\\endfoot\b", "", body)
    body = re.sub(r"\\endfirsthead\b", "", body)
    body = re.sub(r"\\endlastfoot\b", "", body)

    # 14) Remove watermark
    body = re.sub(r"\\SetWatermark\w+\{[^}]*\}", "", body)

    # 15) \hrulefill → underscores (fill-in-the-blank lines)
    body = body.replace("\\hrulefill", "________________")

    # 16) Signature: \rule → line, minipage → keep content
    body = re.sub(r"\\rule\{[^}]*\}\{[^}]*\}", "________________________________", body)
    # Handle %\hfill% between minipages (LaTeX comment glue)
    body = re.sub(r"%\\hfill%", "\n\n", body)
    body = re.sub(r"\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}", "\n", body)
    body = body.replace("\\end{minipage}", "\n")
    body = re.sub(r"\\hfill\b", "    ", body)
    body = re.sub(r"\\vfill\b", "\n", body)

    # 17) Clean misc commands pandoc doesn't need
    body = re.sub(r"\\noindent\b", "", body)
    body = re.sub(r"\\centering\b", "", body)
    body = re.sub(r"\\(large|Large|LARGE|huge|Huge|small|footnotesize|scriptsize)\b", "", body)
    body = re.sub(r"\\vspace\*?\{[^}]*\}", "\n", body)
    body = re.sub(r"\\hspace\*?\{[^}]*\}", "", body)
    body = re.sub(r"\\newpage\b", "\n", body)
    body = re.sub(r"\\clearpage\b", "\n", body)
    body = re.sub(r"\\pagebreak\b", "\n", body)
    # Remove % line comments (but not \%)
    body = re.sub(r"(?<!\\)%[^\n]*", "", body)

    # 18) Clean excessive blank lines
    body = re.sub(r"\n{4,}", "\n\n\n", body)

    # 19) Build a minimal preamble that pandoc can work with
    preamble = r"""\documentclass[12pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[brazil]{babel}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{multirow}
\usepackage{tabularx}
\usepackage{array}
\usepackage{enumitem}
\usepackage{graphicx}
\usepackage{hyperref}
"""
    return preamble + "\n" + body


def _postprocess_docx(docx_path: str) -> None:
    """Apply professional AEE+ styling to the DOCX generated by pandoc."""
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn, nsdecls
    from docx.oxml import parse_xml

    doc = Document(docx_path)

    # Brand colors
    AEE_BLUE = RGBColor(0x1E, 0x3A, 0x5F)
    AEE_BLUE_LIGHT = RGBColor(0x2C, 0x5F, 0x8A)
    AEE_GOLD = RGBColor(0xC9, 0xA8, 0x4C)
    TEXT_DARK = RGBColor(0x33, 0x33, 0x33)

    # --- Style headings ---
    for p in doc.paragraphs:
        if not p.style:
            continue
        sn = p.style.name

        if sn == "Heading 1":
            for run in p.runs:
                run.font.color.rgb = AEE_BLUE
                run.font.size = Pt(16)
                run.bold = True
            # Add bottom border (gold line)
            pPr = p._element.get_or_add_pPr()
            pBdr = parse_xml(
                f'<w:pBdr {nsdecls("w")}>'
                f'<w:bottom w:val="single" w:sz="12" w:space="1" w:color="{AEE_GOLD}"/>'
                f'</w:pBdr>'
            )
            pPr.append(pBdr)

        elif sn == "Heading 2":
            for run in p.runs:
                run.font.color.rgb = AEE_BLUE_LIGHT
                run.font.size = Pt(13)
                run.bold = True

        elif sn in ("Body Text", "First Paragraph", "Normal"):
            for run in p.runs:
                if not run.bold and not run.italic:
                    run.font.color.rgb = TEXT_DARK
                run.font.size = run.font.size or Pt(11)

    # --- Style tables ---
    HEADER_BG = "1E3A5F"
    ROW_ALT_1 = "F0F4F8"
    ROW_ALT_2 = "FFFFFF"
    GOLD_BG = "FFF8E1"

    for table in doc.tables:
        # Set table width to full page
        table.autofit = True

        for r_idx, row in enumerate(table.rows):
            for cell in row.cells:
                # Header row
                if r_idx == 0:
                    shading = parse_xml(
                        f'<w:shd {nsdecls("w")} w:fill="{HEADER_BG}" w:val="clear"/>'
                    )
                    cell._element.get_or_add_tcPr().append(shading)
                    for p in cell.paragraphs:
                        for run in p.runs:
                            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                            run.font.bold = True
                            run.font.size = Pt(10)
                else:
                    # Alternating row colors
                    bg = GOLD_BG if r_idx % 2 == 1 else ROW_ALT_1
                    shading = parse_xml(
                        f'<w:shd {nsdecls("w")} w:fill="{bg}" w:val="clear"/>'
                    )
                    cell._element.get_or_add_tcPr().append(shading)
                    for p in cell.paragraphs:
                        for run in p.runs:
                            run.font.size = Pt(10)
                            run.font.color.rgb = TEXT_DARK

    # --- Add header/footer ---
    for section in doc.sections:
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

        # Footer with page number
        footer = section.footer
        footer.is_linked_to_previous = False
        fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = fp.add_run()
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
        # Add page number field
        fldChar1 = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="begin"/>')
        run._element.append(fldChar1)
        instrText = parse_xml(f'<w:instrText {nsdecls("w")}> PAGE </w:instrText>')
        run._element.append(instrText)
        fldChar2 = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="end"/>')
        run._element.append(fldChar2)

    doc.save(docx_path)


@app.post("/convert-docx", response_model=ConvertDocxResponse)
def convert_to_docx(
    req: CompileRequest,
    authorization: str = Header(default=""),
):
    """Preprocess LaTeX (strip custom envs) then convert to DOCX via pandoc."""
    if AUTH_TOKEN:
        token = authorization.removeprefix("Bearer ").strip()
        if token != AUTH_TOKEN:
            raise HTTPException(status_code=401, detail="Unauthorized")

    tmpdir = tempfile.mkdtemp(prefix="docx_")
    tex_path = os.path.join(tmpdir, "document.tex")
    docx_path = os.path.join(tmpdir, "document.docx")

    try:
        # Preprocess: convert custom LaTeX to standard LaTeX
        clean_latex = _preprocess_latex_for_pandoc(req.latex_source)

        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(clean_latex)

        result = subprocess.run(
            [
                "pandoc",
                tex_path,
                "-f", "latex",
                "-t", "docx",
                "-o", docx_path,
                "--wrap=preserve",
            ],
            capture_output=True,
            timeout=60,
            cwd=tmpdir,
        )

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
            return ConvertDocxResponse(
                success=False,
                error=f"Pandoc error: {stderr[:2000]}",
            )

        if not os.path.exists(docx_path):
            return ConvertDocxResponse(
                success=False,
                error="DOCX was not generated",
            )

        # Post-process: apply AEE+ PRO styling
        _postprocess_docx(docx_path)

        with open(docx_path, "rb") as f:
            docx_bytes = f.read()

        return ConvertDocxResponse(
            success=True,
            docx_base64=base64.b64encode(docx_bytes).decode("ascii"),
            docx_size_bytes=len(docx_bytes),
        )

    except subprocess.TimeoutExpired:
        return ConvertDocxResponse(
            success=False,
            error="Conversion timed out (60s limit)",
        )
    except Exception as e:
        return ConvertDocxResponse(
            success=False,
            error=f"Server error: {str(e)}",
        )
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
