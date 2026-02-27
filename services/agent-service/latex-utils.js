import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ---------- Preamble injection ----------

/**
 * Escape text for safe use inside LaTeX commands.
 */
function escapeLatex(text) {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[&%$#_{}]/g, (ch) => `\\${ch}`)
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/---/g, "---")
    .replace(/--/g, "--");
}

/**
 * Generate the professional AEE preamble.
 */
function getLatexPreamble({ documentTitle, studentName, schoolName, printMode }) {
  const bwOverrides = printMode === "bw" ? `
% --- B&W Mode ---
\\definecolor{aeeblue}{gray}{0.20}
\\definecolor{aeegold}{gray}{0.45}
\\definecolor{aeelightblue}{gray}{0.93}
\\definecolor{aeegreen}{gray}{0.30}
\\definecolor{aeered}{gray}{0.25}
\\definecolor{aeeorange}{gray}{0.35}
\\definecolor{aeepurple}{gray}{0.28}
\\definecolor{aeeteal}{gray}{0.30}
\\definecolor{aeegray}{gray}{0.95}
\\definecolor{textgray}{gray}{0.35}
\\definecolor{lightgreen}{gray}{0.93}
\\definecolor{lightorange}{gray}{0.95}
\\definecolor{lightpurple}{gray}{0.94}
\\definecolor{lightteal}{gray}{0.93}
\\definecolor{lightred}{gray}{0.94}
\\definecolor{lightyellow}{gray}{0.96}
` : "";

  return `% ============================================================================
% ${documentTitle} - Atendimento Educacional Especializado (AEE)
% ============================================================================
\\documentclass[12pt,a4paper]{article}

% --- Encoding & Language ---
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazil]{babel}

% --- Typography ---
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{setspace}
\\onehalfspacing

% --- Overflow prevention ---
\\tolerance=2000
\\emergencystretch=5em
\\hbadness=3000

% --- Prevent orphan headings ---
\\widowpenalty=10000
\\clubpenalty=10000
\\makeatletter
\\@beginparpenalty=10000
\\makeatother

% --- Page Layout ---
\\usepackage[top=2.5cm,bottom=2.5cm,left=2.5cm,right=2.5cm,headheight=36pt]{geometry}

% --- Colors ---
\\usepackage[dvipsnames,svgnames,x11names]{xcolor}
\\definecolor{aeeblue}{HTML}{1E3A5F}
\\definecolor{aeegold}{HTML}{C9A84C}
\\definecolor{aeelightblue}{HTML}{E8F0FE}
\\definecolor{aeegreen}{HTML}{2E7D32}
\\definecolor{aeered}{HTML}{C62828}
\\definecolor{aeeorange}{HTML}{E65100}
\\definecolor{aeepurple}{HTML}{6A1B9A}
\\definecolor{aeeteal}{HTML}{00695C}
\\definecolor{aeegray}{HTML}{F5F5F5}
\\definecolor{textgray}{HTML}{555555}
\\definecolor{lightgreen}{HTML}{E8F5E9}
\\definecolor{lightorange}{HTML}{FFF3E0}
\\definecolor{lightpurple}{HTML}{F3E5F5}
\\definecolor{lightteal}{HTML}{E0F2F1}
\\definecolor{lightred}{HTML}{FFEBEE}
\\definecolor{lightyellow}{HTML}{FFFDE7}
${bwOverrides}
% --- Math symbols ---
\\usepackage{amssymb}
\\usepackage{amsmath}

% --- Graphics & Tables ---
\\usepackage[draft]{graphicx}
\\usepackage{tikz}
\\usetikzlibrary{positioning,shapes.geometric,calc,decorations.pathmorphing,shadows,patterns,fit,arrows.meta,backgrounds}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usepackage{tabularx}
\\usepackage{booktabs}
\\usepackage{multirow}
\\usepackage{makecell}
\\usepackage{colortbl}
\\usepackage{array}
\\usepackage{longtable}
\\usepackage{adjustbox}

% --- Prevent orphan headings ---
\\usepackage{needspace}

% --- Lists & Enumerations ---
\\usepackage{pifont}
\\usepackage{enumitem}
\\setlist[itemize]{leftmargin=1.5em, itemsep=2pt, parsep=0pt}
\\setlist[enumerate]{leftmargin=1.5em, itemsep=2pt, parsep=0pt}

% --- Icons ---
\\usepackage{fontawesome5}
\\newcommand{\\cmark}{\\ding{51}}
\\newcommand{\\starmark}{\\ding{72}}
\\newcommand{\\hand}{\\ding{43}}
\\newcommand{\\bulb}{\\ding{228}}

% --- Field macros ---
\\newcommand{\\field}[2]{\\textcolor{textgray}{\\small #1:} & \\textbf{#2} \\\\[3pt]}
\\newcommand{\\fieldline}[2]{\\textcolor{aeeblue}{\\faCaretRight}~\\textcolor{textgray}{#1:} \\textbf{#2}}

% --- Multi-column ---
\\usepackage{multicol}

% --- Page count ---
\\usepackage{lastpage}

% --- Headers & Footers ---
\\usepackage{fancyhdr}
\\usepackage[fit]{truncate}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\color{textgray}\\textit{\\truncate{0.45\\headwidth}{${escapeLatex(documentTitle)}}}}
\\fancyhead[R]{\\small\\color{textgray}\\textit{\\truncate{0.45\\headwidth}{${escapeLatex(studentName)} --- ${escapeLatex(schoolName)}}}}
\\fancyfoot[C]{\\small\\color{textgray}\\thepage}
\\fancyfoot[R]{}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.2pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{aeegold}\\leaders\\hrule height \\headrulewidth\\hfill}}
\\renewcommand{\\footrule}{\\hbox to\\headwidth{\\color{aeegold}\\leaders\\hrule height \\footrulewidth\\hfill}}

% --- Section Formatting ---
\\usepackage{titlesec}
\\titleformat{\\section}
  {\\needspace{5\\baselineskip}\\Large\\bfseries\\color{aeeblue}}
  {\\thesection.}{0.5em}{}
  [\\vspace{-0.5em}{\\color{aeegold}\\rule{\\textwidth}{1.5pt}}]

\\titleformat{\\subsection}
  {\\needspace{4\\baselineskip}\\large\\bfseries\\color{aeeblue!80}}
  {\\thesubsection}{0.5em}{}

\\titleformat{\\subsubsection}
  {\\needspace{3\\baselineskip}\\normalsize\\bfseries\\color{aeeblue!65}}
  {\\thesubsubsection}{0.5em}{}

% --- Boxes ---
\\usepackage[most]{tcolorbox}

\\newtcolorbox{infobox}[1][]{enhanced,breakable,colback=aeelightblue,colframe=aeeblue,coltitle=white,fonttitle=\\bfseries,title=#1,rounded corners,boxrule=0.8pt,left=8pt,right=8pt,top=6pt,bottom=6pt,shadow={1mm}{-1mm}{0mm}{black!20},before skip=10pt,after skip=10pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{alertbox}[1][]{enhanced,breakable,colback=aeered!5,colframe=aeered!70,coltitle=white,fonttitle=\\bfseries,title=#1,rounded corners,boxrule=0.8pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=10pt,after skip=10pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{successbox}[1][]{enhanced,breakable,colback=aeegreen!5,colframe=aeegreen!70,coltitle=white,fonttitle=\\bfseries,title=#1,rounded corners,boxrule=0.8pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=10pt,after skip=10pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{datacard}[1][]{enhanced,breakable,colback=aeegray,colframe=aeeblue!30,coltitle=white,fonttitle=\\bfseries,title={#1},rounded corners,boxrule=0.5pt,left=10pt,right=10pt,top=8pt,bottom=8pt,before skip=8pt,after skip=8pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{atividadebox}[2][]{enhanced,breakable,colback=#1!5,colframe=#1!60,coltitle=white,fonttitle=\\bfseries,title={\\large #2},rounded corners,boxrule=0.8pt,left=10pt,right=10pt,top=8pt,bottom=8pt,shadow={1mm}{-1mm}{0mm}{black!15},before skip=12pt,after skip=12pt,attach boxed title to top left={yshift=-2mm,xshift=5mm},boxed title style={rounded corners,colback=#1!60},before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{dicabox}[1][]{enhanced,breakable,colback=lightyellow,colframe=aeegold!70,coltitle=aeeblue,fonttitle=\\bfseries,title={\\bulb~Dica da Prática},rounded corners,boxrule=0.5pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=8pt,after skip=8pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{materialbox}{enhanced,breakable,colback=aeegray,colframe=aeeblue!20,rounded corners,boxrule=0.4pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=6pt,after skip=6pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{sessaobox}[1][]{enhanced,breakable,colback=white,colframe=aeeblue,coltitle=white,fonttitle=\\bfseries\\large,title={#1},rounded corners,boxrule=1pt,left=10pt,right=10pt,top=8pt,bottom=8pt,shadow={1.5mm}{-1.5mm}{0mm}{black!10},before skip=14pt,after skip=14pt,toptitle=3pt,bottomtitle=3pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{warnbox}[1][]{enhanced,breakable,colback=lightorange,colframe=aeeorange!70,coltitle=white,fonttitle=\\bfseries,title=#1,rounded corners,boxrule=0.8pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=10pt,after skip=10pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{tealbox}[1][]{enhanced,breakable,colback=lightteal,colframe=aeeteal!70,coltitle=white,fonttitle=\\bfseries,title=#1,rounded corners,boxrule=0.8pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=10pt,after skip=10pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{purplebox}[1][]{enhanced,breakable,colback=lightpurple,colframe=aeepurple!70,coltitle=white,fonttitle=\\bfseries,title=#1,rounded corners,boxrule=0.8pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=10pt,after skip=10pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcolorbox{goldbox}[1][]{enhanced,breakable,colback=lightyellow,colframe=aeegold!70,coltitle=aeeblue,fonttitle=\\bfseries,title=#1,rounded corners,boxrule=0.8pt,left=8pt,right=8pt,top=6pt,bottom=6pt,before skip=10pt,after skip=10pt,before upper app={\\tolerance=9999\\emergencystretch=3em}}

\\newtcbox{\\objtag}[1][aeeblue]{on line,colback=#1!10,colframe=#1!40,boxrule=0.4pt,arc=3pt,left=3pt,right=3pt,top=1pt,bottom=1pt,fontupper=\\scriptsize\\bfseries\\color{#1}}

% --- Watermark ---
\\usepackage{draftwatermark}
\\SetWatermarkText{CONFIDENCIAL}
\\SetWatermarkScale{0.4}
\\SetWatermarkColor{aeeblue!5}
\\SetWatermarkAngle{45}

% --- URL breaking ---
\\usepackage[hyphens]{url}
\\usepackage{xurl}

% --- Float control ---
\\usepackage{float}

% --- Hyperlinks ---
\\usepackage[colorlinks=${printMode === "bw" ? "false" : "true"},linkcolor=aeeblue,urlcolor=aeeblue!70,citecolor=aeeblue]{hyperref}

% ============================================================================
`;
}

/**
 * Extract document metadata from LaTeX source.
 */
function extractDocMetadata(source) {
  let title = "Documento AEE";
  let studentName = "";
  let schoolName = "";

  const titleMatch = source.match(/\\title\{([^}]+)\}/);
  if (titleMatch) {
    title = titleMatch[1].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1").trim();
  } else {
    const sectionMatch = source.match(/\\section\*?\{([^}]+)\}/);
    if (sectionMatch) {
      title = sectionMatch[1].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1").trim();
    }
  }

  const fancyMatch = source.match(/\\fancyhead\[R\]\{[^}]*\\truncate\{[^}]*\}\{([^}]+)\}\}/);
  if (fancyMatch) {
    const parts = fancyMatch[1].split("---").map((s) => s.trim());
    if (parts.length >= 2) {
      studentName = parts[0];
      schoolName = parts[1];
    } else if (parts.length === 1) {
      studentName = parts[0];
    }
  }

  if (!studentName) {
    const authorMatch = source.match(/\\author\{([^}]+)\}/);
    if (authorMatch) {
      studentName = authorMatch[1].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1").trim();
    }
  }

  return { title, studentName, schoolName };
}

/**
 * Replace AI preamble with professional AEE preamble.
 */
function injectProfessionalPreamble(source, fallbackTitle, fallbackStudent, fallbackSchool) {
  const beginDocIdx = source.indexOf("\\begin{document}");
  if (beginDocIdx === -1) return source;

  const preambleSection = source.substring(0, beginDocIdx);
  const meta = extractDocMetadata(preambleSection);

  const title = meta.title !== "Documento AEE" ? meta.title : (fallbackTitle || "Documento AEE");
  const studentName = meta.studentName || fallbackStudent || "";
  const schoolName = meta.schoolName || fallbackSchool || "";

  const professionalPreamble = getLatexPreamble({
    documentTitle: title,
    studentName,
    schoolName,
  });

  const body = source.substring(beginDocIdx);
  return professionalPreamble + "\n" + body;
}

// ---------- LaTeX fixers (ported from tool-executor.ts) ----------

/**
 * Fix double-escaped LaTeX (\\begin → \begin).
 */
function fixDoubleEscapedLatex(content) {
  const doubleEscapeCount = (content.match(
    /\\\\(?:begin|end|section|subsection|subsubsection|paragraph|textbf|textit|textrm|textsc|texttt|vspace|hspace|rule|centering|raggedright|raggedleft|documentclass|usepackage|item|newpage|clearpage|maketitle|tableofcontents|noindent|par|small|footnotesize|scriptsize|tiny|normalsize|large|Large|LARGE|huge|Huge|linewidth|textwidth|columnwidth|rowcolor|cellcolor|hfill|vfill|emph|underline|caption|label|ref|footnote|setlength|renewcommand|newcommand|definecolor|color|leavevmode|mbox|makebox|phantom|hphantom|tcolorbox|newtcolorbox|tcbset)/g
  ) || []).length;

  if (doubleEscapeCount >= 3) {
    return content.replace(/\\\\/g, "\\");
  }
  return content;
}

/**
 * Fix \\ in positions where LaTeX has no line to end.
 */
function fixLineBreakAfterSectioning(source) {
  let result = source;

  // 1. \\ after sectioning commands (loop-based brace matching)
  const sectionCmdRe = /\\(?:section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{/g;
  let secMatch;
  const replacements = [];

  while ((secMatch = sectionCmdRe.exec(result)) !== null) {
    const braceStart = secMatch.index + secMatch[0].length - 1;
    let depth = 1;
    let idx = braceStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }
    if (depth !== 0) continue;

    const afterCmd = result.substring(idx);
    const trailingMatch = afterCmd.match(/^\s*\\\\\s*(?:\[([^\]]*)\])?/);
    if (trailingMatch) {
      const fullEnd = idx + trailingMatch[0].length;
      const cmdText = result.substring(secMatch.index, idx);
      const spacing = trailingMatch[1];
      replacements.push({
        start: secMatch.index,
        end: fullEnd,
        replacement: spacing ? `${cmdText}\n\\vspace{${spacing}}` : cmdText,
      });
    }
  }

  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    result = result.substring(0, r.start) + r.replacement + result.substring(r.end);
  }

  // 2. \\ after \begin{...} (non-tabular)
  const safeEnvs = "tabular|tabularx|longtable|array|align|equation|gather|multline|split|cases|matrix|pmatrix|bmatrix|vmatrix|Bmatrix";
  result = result.replace(
    new RegExp(`(\\\\begin\\{(?!(?:${safeEnvs})\\})[^}]+\\}(?:\\[[^\\]]*\\])?)\\s*\\\\\\\\\\s*(?:\\[[^\\]]*\\])?`, "g"),
    "$1"
  );

  // 3. \\ after context-starting commands
  const freshCmds = "maketitle|centering|raggedright|raggedleft|noindent|par";
  result = result.replace(
    new RegExp(`(\\\\(?:${freshCmds}))\\s*\\\\\\\\\\s*(?:\\[[^\\]]*\\])?`, "g"),
    "$1"
  );

  // 4. \vspace{...} \\
  result = result.replace(/\\vspace\*?\{([^}]*)\}\s*\\\\\s*(?:\[[^\]]*\])?/g, "\\vspace{$1}");

  // 5. \\ after \end{...}
  result = result.replace(
    new RegExp(`(\\\\end\\{[^}]+\\})\\s*\\\\\\\\\\s*(?:\\[[^\\]]*\\])?`, "g"),
    "$1"
  );

  // 6. \\ at start of paragraph
  result = result.replace(/\n\n\s*\\\\\s*(?:\[[^\]]*\])?\s*\n/g, "\n\n");

  // 7. \\ on empty line
  result = result.replace(/^\s*\\\\\s*(?:\[[^\]]*\])?\s*$/gm, "");

  // 8. \hfill\\
  result = result.replace(/^\s*\\hfill\s*\\\\\s*(?:\[[^\]]*\])?\s*$/gm, "");

  // 9. \rule after \vspace
  result = result.replace(
    /(\\vspace\*?\{[^}]*\}\s*\n\s*)(\\rule\{[^}]*\}\{[^}]*\})\s*\\\\/g,
    "$1$2\n"
  );

  return result;
}

// ---------- Local pdflatex compilation ----------

/**
 * Compile a .tex file locally using pdflatex.
 * Injects preamble and applies sanitization first.
 *
 * @param {string} relPath - relative path to .tex file
 * @param {string} workDir - workspace root
 * @returns {{ success: boolean, output?: string, error?: string }}
 */
export async function compileLatexLocal(relPath, workDir) {
  const absPath = path.join(workDir, relPath);

  if (!fs.existsSync(absPath)) {
    return { success: false, error: `Arquivo não encontrado: ${relPath}` };
  }

  let rawSource = fs.readFileSync(absPath, "utf-8");

  // Fix double-escaped LaTeX
  const fixedEscape = fixDoubleEscapedLatex(rawSource);
  if (fixedEscape !== rawSource) {
    rawSource = fixedEscape;
    fs.writeFileSync(absPath, rawSource, "utf-8");
  }

  // Inject preamble if \begin{document} is present
  let compileSource = rawSource;
  if (rawSource.includes("\\begin{document}")) {
    const fallbackTitle = relPath.replace(/\.tex$/, "").replace(/[-_]/g, " ");
    compileSource = injectProfessionalPreamble(rawSource, fallbackTitle, "", "");
  }

  // Fix line breaks after sectioning
  compileSource = fixLineBreakAfterSectioning(compileSource);

  // Write the processed source to a temp file for compilation
  const compileDir = path.join(workDir, ".compile-tmp");
  fs.mkdirSync(compileDir, { recursive: true });
  const compilePath = path.join(compileDir, path.basename(relPath));
  fs.writeFileSync(compilePath, compileSource, "utf-8");

  // Copy supporting files (.tex, .bib, .sty, .cls, images) to compile dir
  copyProjectFiles(workDir, compileDir, relPath);

  // Run pdflatex (2 passes for ToC/references)
  const pdfName = path.basename(relPath, ".tex") + ".pdf";
  const MAX_AUTO_RETRIES = 5;
  let currentSource = compileSource;
  let autoFixes = 0;
  let lastError = "";
  let warnings = [];

  for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
    if (attempt > 0) {
      // Write updated source for retry
      fs.writeFileSync(compilePath, currentSource, "utf-8");
    }

    try {
      // First pass
      execSync(
        `pdflatex -interaction=nonstopmode -halt-on-error -output-directory="${compileDir}" "${compilePath}"`,
        { cwd: compileDir, timeout: 60_000, stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
      );
      // Second pass (for ToC, references)
      const result = execSync(
        `pdflatex -interaction=nonstopmode -halt-on-error -output-directory="${compileDir}" "${compilePath}"`,
        { cwd: compileDir, timeout: 60_000, stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
      );

      // Parse warnings from output
      const output = result.toString("utf-8");
      warnings = parseWarnings(output);

      // Move PDF to output directory
      const compiledPdf = path.join(compileDir, pdfName);
      if (!fs.existsSync(compiledPdf)) {
        return { success: false, error: "pdflatex executou sem erro mas não gerou PDF." };
      }

      const outputDir = path.join(workDir, "output");
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPdf = path.join(outputDir, pdfName);
      fs.copyFileSync(compiledPdf, outputPdf);

      const pdfSize = fs.statSync(outputPdf).size;
      const autoFixNote = autoFixes > 0
        ? `\n(${autoFixes} correção(ões) automática(s) aplicada(s))`
        : "";

      let warningsNote = "";
      if (warnings.length > 0) {
        warningsNote = formatWarnings(warnings);
      }

      // Cleanup compile temp
      cleanCompileDir(compileDir);

      return {
        success: true,
        output: `Compilação bem-sucedida! PDF gerado: output/${pdfName} (${formatBytes(pdfSize)})${autoFixNote}${warningsNote}`,
      };
    } catch (err) {
      lastError = err.stderr?.toString("utf-8") || err.stdout?.toString("utf-8") || err.message;

      // Auto-fix "no line here to end" or "Illegal unit of measure"
      const lineMatch = lastError.match(/(?:line |l\.|ERRO na linha )(\d+).*(?:no line here to end|Illegal unit of measure)/i);

      if (!lineMatch || attempt === MAX_AUTO_RETRIES) break;

      const errorLine = parseInt(lineMatch[1], 10);
      const lines = currentSource.split("\n");
      if (errorLine < 1 || errorLine > lines.length) break;

      const idx = errorLine - 1;
      const line = lines[idx];
      let fixed = false;

      if (line.includes("\\\\")) {
        lines[idx] = line.replace(/\\\\\s*(\[[^\]]*\])?/, "");
        fixed = true;
      }
      if (!fixed && idx > 0 && lines[idx - 1].includes("\\\\")) {
        lines[idx - 1] = lines[idx - 1].replace(/\\\\\s*(\[[^\]]*\])?/, "");
        fixed = true;
      }
      if (!fixed && line.trim() === "") {
        lines.splice(idx, 1);
        fixed = true;
      }
      if (!fixed && !line.trim().startsWith("\\leavevmode")) {
        lines[idx] = "\\leavevmode " + line;
        fixed = true;
      }
      if (!fixed) {
        lines[idx] = "% AUTO-FIX: " + lines[idx];
        fixed = true;
      }

      if (fixed) {
        autoFixes++;
        currentSource = lines.join("\n");
      } else {
        break;
      }
    }
  }

  // Cleanup on failure too
  cleanCompileDir(compileDir);

  // Parse error for user-friendly message
  const errorMsg = parseCompileError(lastError);
  const autoFixNote = autoFixes > 0
    ? `\n\n[Auto-fix tentou ${autoFixes} correção(ões) mas o erro persistiu.]`
    : "";

  return { success: false, error: `Erro de compilação:\n${errorMsg}${autoFixNote}` };
}

// ---------- Helpers ----------

function copyProjectFiles(workDir, compileDir, mainTexPath) {
  const entries = walkDir(workDir);
  const skipDirs = [".compile-tmp", "output", "node_modules"];

  for (const entry of entries) {
    const relPath = path.relative(workDir, entry);

    if (skipDirs.some((d) => relPath.startsWith(d))) continue;
    if (relPath === mainTexPath) continue; // already handled

    const ext = path.extname(entry).toLowerCase();
    const copyExts = [".tex", ".bib", ".sty", ".cls", ".bst", ".png", ".jpg", ".jpeg", ".pdf", ".svg", ".webp"];

    if (copyExts.includes(ext)) {
      const dest = path.join(compileDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(entry, dest);
    }
  }
}

function walkDir(dir) {
  const files = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(full));
      } else {
        files.push(full);
      }
    }
  } catch { /* permission errors */ }
  return files;
}

function cleanCompileDir(compileDir) {
  try {
    fs.rmSync(compileDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
}

function parseCompileError(raw) {
  if (!raw) return "Erro desconhecido";
  // Extract the most relevant error line
  const lines = raw.split("\n");
  const errorLines = lines.filter((l) =>
    l.startsWith("!") || l.includes("Error:") || l.includes("ERRO")
  );
  if (errorLines.length > 0) {
    return errorLines.slice(0, 5).join("\n");
  }
  // Fallback: last 20 lines
  return lines.slice(-20).join("\n");
}

function parseWarnings(output) {
  const warnings = [];
  const patterns = [
    /^(Overfull \\[hv]box .+)$/gm,
    /^(Underfull \\[hv]box .+)$/gm,
    /^(LaTeX Warning: .+)$/gm,
    /^(Package \S+ Warning: .+)$/gm,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(output)) !== null) {
      warnings.push(m[1]);
      if (warnings.length >= 30) return warnings;
    }
  }
  return warnings;
}

function formatWarnings(warnings) {
  const overfullHbox = [];
  const underfullHbox = [];
  const otherWarnings = [];
  let maxOverfullPt = 0;

  for (const w of warnings) {
    const overfullMatch = w.match(/Overfull \\hbox \((\d+(?:\.\d+)?)pt too wide\)/);
    if (overfullMatch) {
      overfullHbox.push(w);
      const pt = parseFloat(overfullMatch[1]);
      if (pt > maxOverfullPt) maxOverfullPt = pt;
    } else if (w.includes("Underfull")) {
      underfullHbox.push(w);
    } else {
      otherWarnings.push(w);
    }
  }

  const parts = [];
  if (overfullHbox.length > 0) {
    const severity = maxOverfullPt > 10 ? "ATENÇÃO: conteúdo pode estar cortado" : "cosmético";
    parts.push(`${overfullHbox.length} Overfull hbox (máx ${maxOverfullPt.toFixed(1)}pt — ${severity})`);
  }
  if (underfullHbox.length > 0) {
    parts.push(`${underfullHbox.length} Underfull hbox (cosmético)`);
  }
  if (otherWarnings.length > 0) {
    parts.push(`${otherWarnings.length} outro(s): ${otherWarnings.slice(0, 3).join("; ")}`);
  }
  return `\nWarnings (${warnings.length}): ${parts.join(" | ")}`;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
