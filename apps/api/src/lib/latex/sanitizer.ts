/**
 * Sanitize AI-generated LaTeX by removing problematic constructs
 * that commonly cause compilation errors.
 *
 * Three-layer approach:
 * 1. Remove entire \foreach blocks that use randomness (rnd) — these are
 *    always decorative TikZ elements (circles, dots) and always break.
 * 2. Strip TeX conditional markers (\ifnum, \ifcase, \else, \or, \fi)
 *    and their condition lines, keeping content between them.
 * 3. Replace inline \pgfmathparse...\pgfmathresult with safe defaults.
 */
/**
 * Detect if the LaTeX source appears truncated.
 * Returns a description of what's truncated, or null if complete.
 */
export function detectTruncation(source: string): string | null {
  const endDocIdx = source.lastIndexOf("\\end{document}");
  if (endDocIdx === -1) return "Documento sem \\end{document}";

  const body = source.substring(0, endDocIdx);

  // Check for unclosed environments
  const envRegex = /\\(begin|end)\{([^}]+)\}/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = envRegex.exec(body)) !== null) {
    if (m[2] === "document") continue;
    if (m[1] === "begin") stack.push(m[2]);
    else {
      const idx = stack.lastIndexOf(m[2]);
      if (idx !== -1) stack.splice(idx, 1);
    }
  }

  if (stack.length > 0) {
    return `Ambientes não fechados antes de \\end{document}: ${stack.join(", ")}. O conteúdo dentro desses ambientes parece ter sido cortado no meio.`;
  }

  // Find the last line of ACTUAL content (skip \end{...}, blank lines, \vfill, etc.)
  const lines = body.split("\n");
  let lastContentLine = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (/^\\end\{/.test(trimmed)) continue;
    if (/^\\(vfill|vspace|newpage|clearpage|pagebreak)\b/.test(trimmed)) continue;
    lastContentLine = trimmed;
    break;
  }

  // Check if last content line ends mid-sentence
  // Good endings: . ! ? } ] ) or LaTeX commands like \\ or \hline
  if (lastContentLine && !/[.!?}\])]$/.test(lastContentLine) && !/\\\\$/.test(lastContentLine) && !/\\(hline|cline|bottomrule|midrule|toprule)\b/.test(lastContentLine)) {
    return `Texto cortado no meio de uma frase: "${lastContentLine.substring(Math.max(0, lastContentLine.length - 60))}"`;
  }

  return null;
}

export function sanitizeLatexSource(source: string): string {
  let result = source;

  // Layer 0a: Remove \setlength{\parindent}{0...} and \usepackage{parskip} from body.
  // AI models often zero out paragraph indentation. Our preamble sets 1.25cm — preserve it.
  result = result.replace(/\\setlength\{\\parindent\}\{0[^}]*\}/g, "");
  result = result.replace(/\\usepackage(\[[^\]]*\])?\{parskip\}/g, "");

  // Layer 0: Strip emoji and supplemental Unicode characters pdflatex cannot handle.
  // pdflatex only supports characters declared in utf8.def (Latin-1 + some extensions).
  // Emoji (U+1F000+) and Misc Symbols (U+2600–U+27BF) cause fatal
  // "Unicode character not set up for use with LaTeX" errors.
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\u2600-\u27BF\u{1F000}-\u{10FFFF}]/gu, "");

  // Layer 1: Remove entire \foreach blocks that use rnd (randomness).
  // These are always decorative TikZ elements that cause compilation
  // errors due to randomness + conditionals + inline math.
  result = removeProblematicForeach(result);

  // Layer 2: Strip conditional markers, keeping content between them
  result = stripTexConditionalMarkers(result);

  // Layer 3: Fix tcolorbox [breakable, Title] → [Title]
  // The AI sometimes adds "breakable" to box arguments, but our boxes
  // already have breakable built-in, and the optional arg is title-only.
  result = result.replace(
    /\\begin\{(infobox|alertbox|successbox|sessaobox|dicabox)\}\[breakable,\s*/g,
    "\\begin{$1}[",
  );

  // Layer 4: Fix tcolorbox environments used as commands.
  // AI sometimes writes \sessaobox[Title]{content} instead of
  // \begin{sessaobox}[Title]...\end{sessaobox}. This breaks tcolorbox internals
  // (tcb@savebox never closes).
  result = fixTcolorboxAsCommand(result);

  // Layer 5: Remove tikzpicture blocks containing pgfplots \begin{axis}
  // or TikZ child trees (mind maps) — both produce terrible visual output.
  result = removeProblematicTikzBlocks(result);

  // Layer 5: Replace \pgfmathparse...\pgfmathresult inline color specs
  result = result.replace(
    /\\pgfmathparse\{[^}]*\}\\pgfmathresult/g,
    "black",
  );
  result = result.replace(/\\pgfmathresult/g, "0");

  // Layer 5: Remove overlapping TikZ nodes.
  // AI sometimes creates a header node and then overlays content at
  // (header.center), causing text-on-text. Remove the overlay nodes.
  result = removeOverlappingTikzNodes(result);

  // Layer 6: Wrap tikzpicture in adjustbox to prevent overflow.
  // TikZ diagrams can't break across pages and often overflow when
  // the AI creates wide/tall node diagrams. adjustbox shrinks them.
  result = wrapTikzInAdjustbox(result);

  // Layer 7: Fix \makecell containing itemize/enumerate.
  // \makecell operates in LR mode which doesn't allow paragraph-mode
  // environments like itemize. Strip \makecell wrapper, keep content.
  result = fixMakecellWithLists(result);

  // Layer 8: Fix longtable issues
  // longtable inside adjustbox/tcolorbox/minipage causes \endgroup errors.
  // longtable with X columns (tabularx-only) also breaks.
  result = fixLongtableIssues(result);

  // Layer 9: Fix tabularx inside tcolorbox/adjustbox width issues.
  // When tabularx{\textwidth} is inside a tcolorbox (which is narrower),
  // the columns are calculated for full page width then get squeezed,
  // creating unreadable narrow columns. Fix: use \linewidth instead.
  result = fixTabularxInsideBoxes(result);

  // Layer 10: Wrap narrow-column tables (4+ cols of l/c/r) in adjustbox.
  // AI generates tabular with many l/c/r columns containing long text,
  // which is the #1 cause of Overfull \hbox warnings.
  result = fixNarrowColumnTables(result);

  // Layer 11: Strip \sloppy from document body.
  // \sloppy sets \emergencystretch=\maxdimen which can break tabularx's
  // trial typesetting algorithm, causing tables to be wider than expected.
  // Our preamble already has \tolerance=2000 and \emergencystretch=5em.
  result = stripSloppyFromBody(result);

  // Layer 12: Convert l columns to p{} in tables inside tcolorbox/adjustbox
  // when there are 2+ l columns (likely long text that will overflow).
  result = fixTabularColumnOverflow(result);

  // Layer 13: Strip \newgeometry{...} from document body.
  // AI sometimes generates \newgeometry that resets headheight to 15pt (default),
  // breaking fancyhdr headers. Also strip redundant \usepackage{geometry} after \begin{document}.
  result = stripGeometryOverrides(result);

  // Layer 14: Clamp tabularx width — AI generates {1.1\linewidth} or {1.2\textwidth}
  // which guarantees overflow. Clamp any multiplier > 1 down to \linewidth.
  result = clampTabularxWidth(result);

  // Layer 15: Replace \makecell[l]{...\\...} inside p{} columns with plain text + \newline.
  // \makecell[l] creates an internal l-column that ignores the p{} wrapping,
  // causing Overfull \hbox. Plain text with \newline respects the column width.
  result = replaceMakecellInParagraphColumns(result);

  // Layer 16: Convert l columns to wrapping columns in tabularx that also has X columns.
  // AI generates {lX} or {>{\bfseries}lX} — the l column never wraps, so long labels
  // like "Diagnóstico: Transtorno do Espectro Autista (TEA) Nível 1" overflow.
  // Convert l → p{auto-sized} by replacing l with >{\raggedright\arraybackslash}p{4cm}
  // in tabularx that already has X columns (key-value tables).
  result = fixLColumnInTabularxWithX(result);

  // Layer 16.5: Convert fixed p{>=4cm} in tabularx with X columns to proportional widths.
  // AI (or previous sanitizer runs) may have p{5cm} which is too wide inside tcolorbox.
  result = convertFixedPColumnWidths(result);

  // Layer 17: Clamp \rule width inside minipage/narrow containers.
  // AI generates \rule{6cm}{0.4pt} inside 0.45\textwidth minipage = overflow.
  result = clampRuleWidths(result);

  // Layer 18: Replace large \hspace{>=4cm} with \hfill.
  // AI generates \hspace{5cm} for spacing, which overflows on narrow containers.
  result = clampLargeHspace(result);

  // Layer 19: Ensure \noindent\begin{minipage} starts a new paragraph.
  // Without \par before it, minipages end up inline with preceding text (e.g. date line).
  result = ensureMinipageOnNewLine(result);

  // Layer 20: Fix tabularx without X columns — convert fixed p{} widths to proportional.
  // AI generates \begin{tabularx}{\linewidth}{p{3cm} p{4cm} p{3cm} p{3cm} p{2cm}} = 15cm
  // but \linewidth ≈ 16cm minus padding/colsep → guaranteed overflow.
  // Convert all p{Ncm} to p{fraction\linewidth} so total fits.
  result = fixTabularxWithoutXColumns(result);

  // Layer 21: Fix \rowcolor inside table cells — causes "Misplaced \noalign" fatal error.
  // AI writes "Text & \rowcolor{blue} Text2 & \rowcolor{red} Text3 \\"
  // \rowcolor uses \noalign internally and MUST be at the start of a row, before any &.
  // Strip \rowcolor{...} that appears after & on the same line, replace with \cellcolor.
  result = fixMisplacedRowcolor(result);

  // Layer 22: Fix \objtag wrapping long text — causes Overfull because tcbox is inline and can't break.
  // AI writes \objtag[color]{Very long objective text that overflows}
  // Convert to plain text: just remove \objtag[color]{...} wrapper, keep content.
  result = fixObjtagOverflow(result);

  // Layer 23: Add spacing after element titles (Figura N, Tabela N, Quadro N).
  // AI generates \textbf{Figura 1 --- ...} on a standalone line before the element,
  // but without vertical spacing the title runs into the element below it.
  result = addSpacingAfterElementTitles(result);

  // Layer 24: Wrap bare URLs (http:// or https://) in \url{} for automatic line breaking.
  // URLs not already inside \url{} or \href{} cause overfull because they have no breakpoints.
  result = wrapBareUrls(result);

  // Layer 6: Close unclosed environments before \end{document}
  // AI output is often truncated, leaving environments open.
  result = closeUnclosedEnvironments(result);

  return result;
}

/**
 * Fix tcolorbox environments incorrectly used as commands.
 *
 * The AI sometimes writes:  \sessaobox[Title]{content...}
 * Instead of:               \begin{sessaobox}[Title]content...\end{sessaobox}
 *
 * The command form leaves tcolorbox's internal tcb@savebox open,
 * causing "tcb@savebox ended by \end{document}" errors.
 */
const TCOLORBOX_ENVS = "infobox|alertbox|successbox|datacard|atividadebox|dicabox|materialbox|sessaobox";

function fixTcolorboxAsCommand(source: string): string {
  // Match: \envname  or  \envname[title]  followed by {
  // But NOT \begin{envname} (which is correct usage)
  const pattern = new RegExp(
    `\\\\(${TCOLORBOX_ENVS})(\\[[^\\]]*\\])?\\s*\\{`,
    "g",
  );

  let result = source;
  let match: RegExpExecArray | null;
  let safety = 0;

  while (safety++ < 20) {
    pattern.lastIndex = 0;
    match = pattern.exec(result);
    if (!match) break;

    // Make sure this isn't inside a \begin{...} — check chars before match
    const before = result.substring(Math.max(0, match.index - 7), match.index);
    if (before.includes("begin{")) {
      // This is \begin{sessaobox}[...]{  — a different issue, skip
      // Actually \begin{env}[title] doesn't have {, but just in case
      break;
    }

    const envName = match[1];
    const optArg = match[2] || ""; // e.g. [Title]
    const braceStart = match.index + match[0].length - 1; // position of {

    // Find matching closing }
    let depth = 1;
    let idx = braceStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }

    if (depth !== 0) break; // unmatched brace, bail

    const content = result.substring(braceStart + 1, idx - 1);
    const replacement = `\\begin{${envName}}${optArg}\n${content}\n\\end{${envName}}`;

    result =
      result.substring(0, match.index) +
      replacement +
      result.substring(idx);
  }

  return result;
}

/**
 * Wrap \begin{tikzpicture}...\end{tikzpicture} in \adjustbox{max width=\textwidth, max totalheight=0.45\textheight}
 * so large TikZ diagrams (node trees, flowcharts) shrink to fit the page
 * instead of overflowing and getting clipped.
 *
 * Skips tikzpictures already inside an adjustbox.
 */
function wrapTikzInAdjustbox(source: string): string {
  const beginTag = "\\begin{tikzpicture}";
  const endTag = "\\end{tikzpicture}";
  let result = source;
  let cursor = 0;
  let safety = 0;

  while (safety++ < 30) {
    const startIdx = result.indexOf(beginTag, cursor);
    if (startIdx === -1) break;

    // Find matching \end{tikzpicture} handling nesting
    let depth = 1;
    let endIdx = startIdx + beginTag.length;
    while (depth > 0 && endIdx < result.length) {
      const nextBegin = result.indexOf(beginTag, endIdx);
      const nextEnd = result.indexOf(endTag, endIdx);
      if (nextEnd === -1) break;
      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth++;
        endIdx = nextBegin + beginTag.length;
      } else {
        depth--;
        endIdx = nextEnd + endTag.length;
      }
    }

    if (depth !== 0) break;

    // Check if already wrapped in adjustbox (look at ~60 chars before)
    // Must check for \begin{adjustbox} specifically — \end{adjustbox} from a previous
    // element doesn't mean this tikzpicture is inside an adjustbox.
    const before = result.substring(Math.max(0, startIdx - 80), startIdx);
    if (before.includes("\\begin{adjustbox}")) {
      cursor = endIdx;
      continue;
    }

    // Only wrap tikzpictures with multiple \node (likely diagrams, not decorative)
    const block = result.substring(startIdx, endIdx);
    const nodeCount = (block.match(/\\node\b/g) || []).length;
    if (nodeCount < 3) {
      cursor = endIdx;
      continue;
    }

    // Wrap in adjustbox
    const wrapped =
      "\\begin{adjustbox}{max width=\\textwidth, max totalheight=0.45\\textheight, center}\n" +
      block +
      "\n\\end{adjustbox}";

    result = result.substring(0, startIdx) + wrapped + result.substring(endIdx);
    cursor = startIdx + wrapped.length;
  }

  return result;
}

/**
 * Fix \makecell containing \begin{itemize} or \begin{enumerate}.
 *
 * \makecell operates in LR mode which forbids paragraph-mode environments.
 * This causes "Not allowed in LR mode" fatal errors.
 *
 * Fix: strip the \makecell wrapper, keeping the content bare inside the cell.
 * This works when the column is p{} or X (paragraph mode).
 */
function fixMakecellWithLists(source: string): string {
  // Match \makecell or \makecell[...] followed by {
  const pattern = /\\makecell(\[[^\]]*\])?\s*\{/g;
  let result = source;
  let match: RegExpExecArray | null;
  let safety = 0;

  while (safety++ < 50) {
    pattern.lastIndex = 0;
    match = pattern.exec(result);
    if (!match) break;

    const fullMatchStart = match.index;
    const braceStart = fullMatchStart + match[0].length - 1;

    // Find matching closing }
    let depth = 1;
    let idx = braceStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }
    if (depth !== 0) break;

    const content = result.substring(braceStart + 1, idx - 1);

    // Only fix if content contains itemize or enumerate
    if (!/\\begin\{(itemize|enumerate)\}/.test(content)) {
      // Safe makecell — skip by advancing pattern
      pattern.lastIndex = idx;
      continue;
    }

    // Replace \makecell{content} with just content
    // Also convert \\ line breaks to \newline (since we're now in paragraph mode)
    const fixed = content.replace(/\\\\(?!\[)/g, "\\newline ");
    result = result.substring(0, fullMatchStart) + fixed + result.substring(idx);
  }

  return result;
}

/**
 * Remove TikZ overlay nodes that cause text-on-text.
 *
 * The AI sometimes creates a pattern like:
 *   \node[box] (header) {Title};
 *   \node[text width=3.5cm] at (header.center) { \begin{itemize}... };
 *
 * The second node is placed ON TOP of the first, causing overlapping text.
 * We remove the overlay nodes entirely — the header nodes still provide
 * a readable diagram structure.
 */
function removeOverlappingTikzNodes(source: string): string {
  // Match: \node[...] at (somename.center) { ... };
  // These are always overlay nodes meant to add content on top of another node.
  // Need to handle multi-line content with nested braces.
  let result = source;
  const pattern = /\\node\s*\[[^\]]*\]\s*at\s*\([^)]*\.center\)\s*\{/g;
  let match: RegExpExecArray | null;
  let safety = 0;

  while (safety++ < 30) {
    pattern.lastIndex = 0;
    match = pattern.exec(result);
    if (!match) break;

    const startIdx = match.index;
    const braceStart = startIdx + match[0].length - 1;

    // Find matching closing }
    let depth = 1;
    let idx = braceStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }

    if (depth !== 0) break;

    // Find the trailing semicolon
    let end = idx;
    while (end < result.length && /\s/.test(result[end])) end++;
    if (end < result.length && result[end] === ";") end++;

    // Remove the line(s) including leading whitespace
    const lineStart = result.lastIndexOf("\n", startIdx) + 1;
    const lineEnd = end < result.length && result[end] === "\n" ? end + 1 : end;

    result = result.substring(0, lineStart) + result.substring(lineEnd);
  }

  return result;
}

/**
 * Remove \foreach blocks whose body contains `rnd` (randomness).
 * These are purely decorative TikZ elements (random circles, dots,
 * decorations) that frequently cause compilation errors.
 *
 * Matches: \foreach \var in {list} { ... } where body contains rnd
 */
function removeProblematicForeach(source: string): string {
  let result = source;
  // Find \foreach ... { and then find the matching closing }
  const foreachPattern = /\\foreach\b/g;
  let match: RegExpExecArray | null;
  let safety = 0;

  while (safety++ < 20) {
    foreachPattern.lastIndex = 0;
    match = foreachPattern.exec(result);
    if (!match) break;

    const startIdx = match.index;

    // Find the opening { of the foreach body
    let braceStart = result.indexOf("{", startIdx + 8); // skip past \foreach
    // There might be two { — one for the list, one for the body
    // Pattern: \foreach \var in {list} { body }
    // We need to find the body brace, which is after the list brace
    if (braceStart === -1) break;

    // Skip the list brace {list}
    let depth = 1;
    let idx = braceStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }
    // idx is now past the list }

    // Find the body opening {
    const bodyStart = result.indexOf("{", idx);
    if (bodyStart === -1) break;

    // Find matching closing }
    depth = 1;
    idx = bodyStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }
    const bodyEnd = idx; // past the closing }

    // Extract the body content
    const body = result.substring(bodyStart, bodyEnd);

    // Check if body contains problematic constructs
    if (body.includes("rnd") || /\\if(?:num|dim|x|odd|case)\b/.test(body)) {
      // Remove the entire \foreach block (including any leading whitespace on the line)
      const lineStart = result.lastIndexOf("\n", startIdx) + 1;
      // Also consume trailing newline
      const lineEnd = bodyEnd < result.length && result[bodyEnd] === "\n" ? bodyEnd + 1 : bodyEnd;
      result = result.substring(0, lineStart) + result.substring(lineEnd);
      // Don't advance foreachPattern — positions shifted
    } else {
      // Safe \foreach — skip it
      break;
    }
  }

  return result;
}

/**
 * Strip TeX conditional markers and their conditions, keeping
 * content between branches intact.
 *
 * Removes:
 * - Lines containing \ifnum, \ifdim, \ifx, \ifodd, \ifcase
 * - Lines with \else (standalone or as \else\ifnum...)
 * - Lines with \or (used in \ifcase blocks)
 * - Lines with \fi (not \fill, \filbreak, etc.)
 * - Orphaned condition fragments like "\c = 1 \relax"
 */
/**
 * Remove tikzpicture blocks that contain:
 * 1. pgfplots \begin{axis} — charts with unavailable packages/options
 * 2. TikZ child trees — mind-map-like diagrams that overflow and look terrible
 *
 * These are always decorative — removing them doesn't lose document content.
 */
function removeProblematicTikzBlocks(source: string): string {
  let result = source;
  const beginTag = "\\begin{tikzpicture}";
  const endTag = "\\end{tikzpicture}";
  let cursor = 0;
  let safety = 0;

  while (safety++ < 20) {
    const startIdx = result.indexOf(beginTag, cursor);
    if (startIdx === -1) break;

    // Find matching \end{tikzpicture} handling nesting
    let depth = 1;
    let endIdx = startIdx + beginTag.length;

    while (depth > 0 && endIdx < result.length) {
      const nextBegin = result.indexOf(beginTag, endIdx);
      const nextEnd = result.indexOf(endTag, endIdx);

      if (nextEnd === -1) break;

      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth++;
        endIdx = nextBegin + beginTag.length;
      } else {
        depth--;
        endIdx = nextEnd + endTag.length;
      }
    }

    const block = result.substring(startIdx, endIdx);

    const isProblematic =
      block.includes("\\begin{axis}") || // pgfplots
      /\bchild\s*\{/.test(block);        // TikZ child trees (mind maps)

    if (isProblematic) {
      const lineStart = result.lastIndexOf("\n", startIdx) + 1;
      const lineEnd = endIdx < result.length && result[endIdx] === "\n" ? endIdx + 1 : endIdx;
      result = result.substring(0, lineStart) + result.substring(lineEnd);
      cursor = lineStart; // re-scan from same position
    } else {
      cursor = endIdx; // skip past this safe tikzpicture
    }
  }

  return result;
}

/**
 * Replace X column specifiers in longtable with p{4cm}.
 * X is a tabularx-only column type; longtable doesn't support it.
 * Handles nested braces in colspec like {p{0.2\textwidth} X}.
 */
function fixLongtableXColumns(source: string): string {
  let result = source;
  const marker = "\\begin{longtable}{";
  let searchFrom = 0;

  while (true) {
    const idx = result.indexOf(marker, searchFrom);
    if (idx === -1) break;

    const colStart = idx + marker.length - 1; // position of opening {
    let depth = 1;
    let i = colStart + 1;
    while (depth > 0 && i < result.length) {
      if (result[i] === "{") depth++;
      else if (result[i] === "}") depth--;
      i++;
    }
    const colspec = result.substring(colStart, i);

    // Replace standalone X (column type) but not X inside words like \textwidth
    if (/(?<![a-zA-Z\\])X(?![a-zA-Z])/.test(colspec)) {
      const fixed = colspec.replace(/(?<![a-zA-Z\\])X(?![a-zA-Z])/g, "p{4cm}");
      result = result.substring(0, colStart) + fixed + result.substring(i);
      searchFrom = colStart + fixed.length;
    } else {
      searchFrom = i;
    }
  }

  return result;
}

/**
 * Fix longtable issues that cause compilation errors:
 *
 * 1. longtable inside adjustbox, tcolorbox, or minipage → convert to tabular.
 *    longtable MUST be at the top level of the document; it cannot be
 *    wrapped in any box or group.
 *
 * 2. longtable with X columns → convert to tabularx or replace X with p{}.
 *    X columns only work with tabularx, not longtable.
 */
function fixLongtableIssues(source: string): string {
  let result = source;

  // Pattern 1: longtable inside adjustbox → tabular
  // Match \begin{adjustbox}...\begin{longtable}...\end{longtable}...\end{adjustbox}
  result = result.replace(
    /\\begin\{adjustbox\}(\{[^}]*\})\s*\\begin\{longtable\}/g,
    "\\begin{adjustbox}$1\\begin{tabular}",
  );
  result = result.replace(
    /\\end\{longtable\}(\s*)\\end\{adjustbox\}/g,
    "\\end{tabular}$1\\end{adjustbox}",
  );

  // Pattern 2: longtable with X column type → replace X with p{4cm}
  // X columns are tabularx-only; longtable doesn't support them.
  // Must handle nested braces in colspec like {p{0.2\textwidth} X}
  result = fixLongtableXColumns(result);

  // Remove longtable-specific commands that don't work in tabular
  // (\endhead, \endfirsthead, \endfoot, \endlastfoot)
  // These are only valid in longtable; in tabular they cause errors
  // Only remove them if we converted longtable → tabular (i.e. inside adjustbox)
  // Simple approach: always remove them since tabular ignores pagebreaks anyway
  result = result.replace(
    /^[ \t]*\\(endhead|endfirsthead|endfoot|endlastfoot)\b[^\n]*$/gm,
    "",
  );

  return result;
}

/**
 * Close unclosed LaTeX environments before \end{document}.
 *
 * AI output is often truncated mid-generation, leaving environments like
 * \begin{enumerate}, \begin{itemize}, \begin{atividadebox} etc. open.
 * This causes "ended by \end{document}" errors.
 *
 * Strategy: scan for all \begin{X} and \end{X}, track a stack, and
 * insert missing \end{X} in reverse order before \end{document}.
 */
function closeUnclosedEnvironments(source: string): string {
  const endDocIdx = source.lastIndexOf("\\end{document}");
  if (endDocIdx === -1) return source;

  const body = source.substring(0, endDocIdx);
  const tail = source.substring(endDocIdx);

  // Match all \begin{...} and \end{...}
  const envRegex = /\\(begin|end)\{([^}]+)\}/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = envRegex.exec(body)) !== null) {
    const action = m[1]; // "begin" or "end"
    const envName = m[2]; // e.g. "enumerate", "atividadebox"

    if (envName === "document") continue;

    if (action === "begin") {
      stack.push(envName);
    } else {
      // Pop matching open environment (search from top)
      const idx = stack.lastIndexOf(envName);
      if (idx !== -1) {
        stack.splice(idx, 1);
      }
    }
  }

  if (stack.length === 0) return source;

  // Close environments in reverse order (innermost first)
  const closings = stack
    .reverse()
    .map((env) => `\\end{${env}}`)
    .join("\n");

  return body + "\n" + closings + "\n" + tail;
}

/**
 * Fix tabularx width issues inside tcolorbox/adjustbox.
 *
 * When AI generates \adjustbox{max width=\textwidth}{\begin{tabularx}{\textwidth}...},
 * the tabularx calculates column widths for full page \textwidth, but adjustbox then
 * shrinks the entire table to fit a narrower container (like a tcolorbox).
 * This creates unreadable narrow columns (3-4 chars each).
 *
 * Fixes:
 * 1. Remove \adjustbox wrapper around tabularx — tabularx already handles width.
 * 2. Replace \textwidth with \linewidth in tabularx — \linewidth respects
 *    the current container width (tcolorbox inner width).
 */
function fixTabularxInsideBoxes(source: string): string {
  let result = source;

  // Fix 1: Remove \adjustbox{...}{ ... \end{tabularx}} around tabularx.
  // Strategy: find \adjustbox{options}{ that is followed (eventually) by \begin{tabularx},
  // then find \end{tabularx} and its trailing }, remove the adjustbox wrapper.
  let safety = 0;
  while (safety++ < 20) {
    // Find \adjustbox{...}{ followed by \begin{tabularx}
    const m = result.match(
      /\\adjustbox\{[^}]*\}\s*\{(\s*\\begin\{tabularx\})/,
    );
    if (!m || m.index === undefined) break;

    const adjStart = m.index;
    // Find the { that opens the adjustbox content group
    // It's the { right before the whitespace+\begin{tabularx}
    const prefixLen = m[0].length - m[1].length;
    const outerBracePos = adjStart + prefixLen - 1;

    // Verify it's actually a {
    if (result[outerBracePos] !== "{") {
      // Try to find it nearby
      const searchStart = adjStart + "\\adjustbox{".length;
      let pos = result.indexOf("}", searchStart);
      if (pos === -1) break;
      pos = result.indexOf("{", pos + 1);
      if (pos === -1) break;

      // Match from this brace
      let depth = 1;
      let idx = pos + 1;
      while (depth > 0 && idx < result.length) {
        if (result[idx] === "{") depth++;
        else if (result[idx] === "}") depth--;
        idx++;
      }
      if (depth !== 0) break;
      const inner = result.substring(pos + 1, idx - 1).trim();
      result = result.substring(0, adjStart) + inner + result.substring(idx);
      continue;
    }

    // Find matching closing } for outer brace
    let depth = 1;
    let idx = outerBracePos + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }
    if (depth !== 0) break;

    // Extract inner content (between outer braces)
    const inner = result.substring(outerBracePos + 1, idx - 1).trim();
    result = result.substring(0, adjStart) + inner + result.substring(idx);
  }

  // Fix 2: In tabularx, replace \textwidth with \linewidth
  // This ensures the table respects the current container width
  result = result.replace(
    /\\begin\{tabularx\}\{\\textwidth\}/g,
    "\\begin{tabularx}{\\linewidth}",
  );

  // Fix 3: Strip >{\hsize=N\hsize} modifiers from X columns.
  // AI often generates \hsize multipliers that don't sum to the number of
  // X columns (e.g. 1.5+1.5+1+1=5 for 4 columns), causing tabularx to
  // miscalculate widths. Stripping them gives equal-width X columns.
  result = result.replace(
    />\{\\hsize=[^}]*\\hsize\}\s*X/g,
    "X",
  );

  return result;
}

/**
 * Wrap tables (tabular or tabularx) with 3+ columns using only l/c/r in adjustbox.
 * These tables are the #1 cause of Overfull \hbox — the AI generates many
 * narrow columns with long text that overflows the page.
 *
 * Also catches tabularx where the AI used l/c/r instead of X columns
 * (defeating the purpose of tabularx).
 *
 * Only wraps if not already inside an adjustbox.
 */
function fixNarrowColumnTables(source: string): string {
  let result = source;
  // Match both \begin{tabular}{colspec} and \begin{tabularx}{width}{colspec}
  const patterns = [
    { regex: /\\begin\{tabular\}\{([^}]*)\}/g, envName: "tabular" },
    { regex: /\\begin\{tabularx\}\{[^}]*\}\{([^}]*)\}/g, envName: "tabularx" },
  ];

  const replacements: { start: number; end: number; wrapped: string }[] = [];

  for (const { regex, envName } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(result)) !== null) {
      const colspec = match[1];

      // Count l/c/r columns (excluding p{}, m{}, b{}, X, |, @{}, etc.)
      const cleanedCols = colspec.replace(/>?\{[^}]*\}/g, "").replace(/[|]/g, "");
      const lcrCount = (cleanedCols.match(/[lcr]/g) || []).length;
      const hasWideCols = /[pmbX]/.test(cleanedCols);

      // Fix tables with 3+ narrow columns and no wide columns
      if (lcrCount < 3 || hasWideCols) continue;

      // Check if already inside adjustbox (look back ~100 chars)
      const before = result.substring(Math.max(0, match.index - 100), match.index);
      if (before.includes("\\begin{adjustbox}")) continue;

      // Find matching \end{envName}
      const beginTag = `\\begin{${envName}}`;
      const endTag = `\\end{${envName}}`;
      let depth = 1;
      let idx = match.index + match[0].length;
      while (depth > 0 && idx < result.length) {
        const nextBegin = result.indexOf(beginTag, idx);
        const nextEnd = result.indexOf(endTag, idx);
        if (nextEnd === -1) break;
        if (nextBegin !== -1 && nextBegin < nextEnd) {
          depth++;
          idx = nextBegin + beginTag.length;
        } else {
          depth--;
          idx = nextEnd + endTag.length;
        }
      }

      if (depth !== 0) continue;

      const block = result.substring(match.index, idx);
      const wrapped =
        "\\begin{adjustbox}{max width=\\linewidth}\n" +
        block +
        "\n\\end{adjustbox}";

      replacements.push({ start: match.index, end: idx, wrapped });
    }
  }

  // Sort by start position descending, apply in reverse to preserve indices
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    result = result.substring(0, r.start) + r.wrapped + result.substring(r.end);
  }

  return result;
}

/**
 * Add \sloppy at the beginning of tcolorbox environments.
 * tcolorbox has narrower inner width than \textwidth, which causes frequent
 * Overfull \hbox warnings. \sloppy allows TeX to stretch/shrink spaces more
 * aggressively to avoid overflow.
 *
 * Skips boxes that already have \sloppy.
 */
/**
 * Strip \sloppy from the document body.
 * \sloppy sets \emergencystretch=\maxdimen which can interfere with
 * tabularx's trial typesetting algorithm. Our preamble already provides
 * \tolerance=2000 and \emergencystretch=5em for flexible line breaking.
 */
function stripSloppyFromBody(source: string): string {
  // Remove standalone \sloppy lines (with optional whitespace)
  return source.replace(/^\s*\\sloppy\s*$/gm, "");
}

/**
 * Convert l columns to proportional p{} widths in tabular/tabularx inside
 * tcolorbox or adjustbox, when the table has 3+ l columns (likely long text).
 *
 * Heuristic: tables inside containers with many l columns usually have
 * text that overflows. Using p{} columns forces line wrapping.
 */
function fixTabularColumnOverflow(source: string): string {
  let result = source;

  // Find tabular/tabularx inside tcolorbox environments
  const tcolorboxEnvs = TCOLORBOX_ENVS.split("|");
  for (const env of tcolorboxEnvs) {
    const beginEnv = `\\begin{${env}}`;
    const endEnv = `\\end{${env}}`;
    let cursor = 0;
    let safety = 0;

    while (safety++ < 30) {
      const envStart = result.indexOf(beginEnv, cursor);
      if (envStart === -1) break;

      const envEnd = result.indexOf(endEnv, envStart);
      if (envEnd === -1) break;

      const envBlock = result.substring(envStart, envEnd);

      // Find ALL tabular/tabularx inside this env block (not just the first)
      const tabRegex = /\\begin\{tabular(?:x)?\}(?:\{[^}]*\})?\{([^}]*)\}/g;
      let tabMatch: RegExpExecArray | null;
      // Collect replacements to apply in reverse order
      const tabReplacements: { absPos: number; oldStr: string; newStr: string }[] = [];

      while ((tabMatch = tabRegex.exec(envBlock)) !== null) {
        const colspec = tabMatch[1];
        // Count l columns
        const cleanedCols = colspec.replace(/>?\{[^}]*\}/g, "").replace(/[|]/g, "");
        const lCount = (cleanedCols.match(/l/g) || []).length;
        const totalCols = (cleanedCols.match(/[lcr]/g) || []).length;

        // Fix if 3+ l columns and no p{}/X columns already
        if (lCount >= 3 && !/[pmbX]/.test(cleanedCols)) {
          const colWidth = (0.95 / totalCols).toFixed(2);
          // Replace l columns properly — parse character by character
          // to avoid regex lookbehind failures on adjacent column types
          let newColspec = "";
          let ci = 0;
          while (ci < colspec.length) {
            // Skip brace groups: >{...}, <{...}, @{...}, !{...}, p{...}, m{...}, b{...}
            if (/[><@!pmb]/.test(colspec[ci]) && ci + 1 < colspec.length && colspec[ci + 1] === "{") {
              newColspec += colspec[ci];
              ci++;
              // Copy brace group
              let braceDepth = 0;
              while (ci < colspec.length) {
                if (colspec[ci] === "{") braceDepth++;
                else if (colspec[ci] === "}") braceDepth--;
                newColspec += colspec[ci];
                ci++;
                if (braceDepth === 0) break;
              }
            } else if (colspec[ci] === "l") {
              newColspec += `p{${colWidth}\\linewidth}`;
              ci++;
            } else {
              newColspec += colspec[ci];
              ci++;
            }
          }

          const oldColspecStr = `{${colspec}}`;
          const newColspecStr = `{${newColspec}}`;
          const relPos = envBlock.indexOf(oldColspecStr, tabMatch.index);
          if (relPos !== -1) {
            tabReplacements.push({
              absPos: envStart + relPos,
              oldStr: oldColspecStr,
              newStr: newColspecStr,
            });
          }
        }
      }

      // Apply replacements in reverse order to preserve positions
      for (let i = tabReplacements.length - 1; i >= 0; i--) {
        const r = tabReplacements[i];
        result =
          result.substring(0, r.absPos) +
          r.newStr +
          result.substring(r.absPos + r.oldStr.length);
      }

      cursor = envStart + beginEnv.length;
    }
  }

  return result;
}

/**
 * Extract the colspec from a tabularx declaration, handling nested braces.
 * Given a string starting right after \begin{tabularx}{width}, finds the
 * colspec group {colspec} and returns [colspec, endIndex].
 *
 * Example: "{>{\bfseries}lX}" → [">{\bfseries}lX", 18]
 */
function extractNestedBraceGroup(source: string, startIdx: number): [string, number] | null {
  if (startIdx >= source.length || source[startIdx] !== "{") return null;
  let depth = 1;
  let i = startIdx + 1;
  while (depth > 0 && i < source.length) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return [source.substring(startIdx + 1, i - 1), i];
}

/**
 * Parse a LaTeX colspec and replace bare l columns with p{4cm}.
 * Handles modifiers like >{\bfseries}, separators |, @{}, etc.
 *
 * Colspec tokens: l, c, r, X, p{..}, m{..}, b{..}, |, @{..}, >{..}, <{..}, !{..}
 *
 * Only replaces l columns, preserving any >{\modifier} prefix.
 */
function replaceColumnsInColspec(colspec: string): string {
  let result = "";
  let i = 0;
  let pendingModifier = ""; // accumulated >{\something} before a column type

  while (i < colspec.length) {
    const ch = colspec[i];

    if (ch === "|") {
      result += ch;
      i++;
    } else if (ch === ">" || ch === "<" || ch === "!" || ch === "@") {
      // These are followed by {content} — consume the brace group
      const braceStart = colspec.indexOf("{", i + 1);
      if (braceStart === -1) { result += ch; i++; continue; }
      let depth = 1;
      let j = braceStart + 1;
      while (depth > 0 && j < colspec.length) {
        if (colspec[j] === "{") depth++;
        else if (colspec[j] === "}") depth--;
        j++;
      }
      const group = colspec.substring(i, j);
      if (ch === ">") {
        pendingModifier += group;
      } else {
        result += group;
      }
      i = j;
    } else if (ch === "l") {
      // This is the column we want to replace
      const hasRaggedright = /raggedright/.test(pendingModifier);
      const hasArraybackslash = /arraybackslash/.test(pendingModifier);
      if (pendingModifier) {
        // Insert raggedright+arraybackslash into existing modifier
        let mod = pendingModifier.slice(0, -1); // remove last }
        if (!hasRaggedright) mod += "\\raggedright";
        if (!hasArraybackslash) mod += "\\arraybackslash";
        mod += "}";
        result += mod + "p{4cm}";
      } else {
        result += ">{\\raggedright\\arraybackslash}p{4cm}";
      }
      pendingModifier = "";
      i++;
    } else if (ch === "c" || ch === "r" || ch === "X") {
      result += pendingModifier + ch;
      pendingModifier = "";
      i++;
    } else if (ch === "p" || ch === "m" || ch === "b") {
      // These are followed by {width} — consume
      const braceStart = colspec.indexOf("{", i + 1);
      if (braceStart === -1) { result += pendingModifier + ch; pendingModifier = ""; i++; continue; }
      let depth = 1;
      let j = braceStart + 1;
      while (depth > 0 && j < colspec.length) {
        if (colspec[j] === "{") depth++;
        else if (colspec[j] === "}") depth--;
        j++;
      }
      result += pendingModifier + colspec.substring(i, j);
      pendingModifier = "";
      i = j;
    } else if (/\s/.test(ch)) {
      result += ch;
      i++;
    } else {
      result += pendingModifier + ch;
      pendingModifier = "";
      i++;
    }
  }

  // Flush any remaining modifier
  result += pendingModifier;

  return result;
}

/**
 * Convert l columns to wrapping columns in tabularx that has X columns.
 *
 * AI generates {lX}, {>{\bfseries}lX}, {>{\bfseries}lXX} for key-value tables.
 * The l column never wraps, so long label text overflows.
 * Convert bare l (and l with modifiers like >{\bfseries}) to a wrapping p{} column.
 *
 * Only targets tabularx with at least one X column — these are key-value tables
 * where the l column is for labels and should wrap if too long.
 */
function fixLColumnInTabularxWithX(source: string): string {
  const marker = "\\begin{tabularx}";
  let result = source;
  let cursor = 0;
  let safety = 0;

  while (safety++ < 50) {
    const idx = result.indexOf(marker, cursor);
    if (idx === -1) break;

    const afterMarker = idx + marker.length;

    // Skip the width group {width}
    const widthGroup = extractNestedBraceGroup(result, afterMarker);
    if (!widthGroup) { cursor = afterMarker; continue; }
    const [, afterWidth] = widthGroup;

    // Skip optional whitespace
    let colspecStart = afterWidth;
    while (colspecStart < result.length && /\s/.test(result[colspecStart])) colspecStart++;

    // Extract the colspec group {colspec}
    const colspecGroup = extractNestedBraceGroup(result, colspecStart);
    if (!colspecGroup) { cursor = afterWidth; continue; }
    const [colspec, afterColspec] = colspecGroup;

    // Strip brace groups from colspec to get bare column types for detection.
    // e.g. ">{\bfseries}lX" → "lX", ">{\raggedright\arraybackslash}p{4cm}X" → "pX"
    const bareTypes = colspec.replace(/[><!@]\{[^}]*\}/g, "").replace(/\{[^}]*\}/g, "").replace(/[|\s]/g, "");

    // Only fix if there's at least one X column AND at least one l column
    if (!bareTypes.includes("X") || !bareTypes.includes("l")) {
      cursor = afterColspec;
      continue;
    }

    // Parse the colspec and replace l columns with p{4cm}
    const newColspec = replaceColumnsInColspec(colspec);

    if (newColspec !== colspec) {
      // Replace in source
      const before = result.substring(0, colspecStart);
      const after = result.substring(afterColspec);
      result = before + "{" + newColspec + "}" + after;
      cursor = before.length + newColspec.length + 2;
    } else {
      cursor = afterColspec;
    }
  }

  return result;
}

/**
 * Clamp fixed p{Ncm} column widths to p{4cm} in tabularx that also has X columns.
 * AI sometimes generates p{5cm} or wider, which leaves too little room for X columns.
 *
 * Uses extractNestedBraceGroup for proper brace matching since colspecs
 * contain nested braces like >{\bfseries}p{5cm}X.
 */
function convertFixedPColumnWidths(source: string): string {
  let result = source;
  const tabularxTag = "\\begin{tabularx}";
  let cursor = 0;

  while (cursor < result.length) {
    const pos = result.indexOf(tabularxTag, cursor);
    if (pos === -1) break;

    // Skip past \begin{tabularx}
    const afterTag = pos + tabularxTag.length;

    // Extract width group {width}
    const widthGroup = extractNestedBraceGroup(result, afterTag);
    if (!widthGroup) { cursor = afterTag; continue; }
    const [, afterWidth] = widthGroup;

    // Skip whitespace
    let colspecStart = afterWidth;
    while (colspecStart < result.length && /\s/.test(result[colspecStart])) colspecStart++;

    // Extract colspec group {colspec}
    const colspecGroup = extractNestedBraceGroup(result, colspecStart);
    if (!colspecGroup) { cursor = afterWidth; continue; }
    const [colspec, afterColspec] = colspecGroup;

    // Check if there's an X column
    const bareTypes = colspec.replace(/[><!@]\{[^}]*\}/g, "").replace(/\{[^}]*\}/g, "").replace(/[|\s]/g, "");
    if (!bareTypes.includes("X")) { cursor = afterColspec; continue; }

    // Clamp p{Ncm} where N > 4 to p{4cm}
    const newColspec = colspec.replace(
      /p\{(\d+\.?\d*)\s*cm\}/g,
      (_m, width: string) => {
        if (parseFloat(width) > 4) {
          return "p{4cm}";
        }
        return _m;
      },
    );

    if (newColspec !== colspec) {
      const before = result.substring(0, colspecStart);
      const after = result.substring(afterColspec);
      result = before + "{" + newColspec + "}" + after;
      cursor = before.length + newColspec.length + 2;
    } else {
      cursor = afterColspec;
    }
  }

  return result;
}

/**
 * Clamp \rule{width}{height} when the width is >= 5cm and it's inside a minipage
 * or narrow container. Replace fixed widths with \linewidth.
 *
 * AI generates \rule{6cm}{0.4pt} inside 0.45\textwidth minipage, causing overflow.
 */
function clampRuleWidths(source: string): string {
  // Find \rule{Ncm} where N >= 5 inside minipage and replace with \linewidth
  let result = source;

  // Strategy: find minipage blocks, and inside them clamp large \rule widths
  const minipageRegex = /\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}/g;
  let match: RegExpExecArray | null;

  while ((match = minipageRegex.exec(result)) !== null) {
    const mpStart = match.index;
    const endTag = "\\end{minipage}";
    const mpEnd = result.indexOf(endTag, mpStart);
    if (mpEnd === -1) continue;

    const blockEnd = mpEnd + endTag.length;
    const block = result.substring(mpStart, blockEnd);

    // Replace \rule{Ncm}{...} where N >= 5 with \rule{\linewidth}{...}
    const fixed = block.replace(
      /\\rule\{(\d+\.?\d*)\s*cm\}/g,
      (_m, width: string) => {
        if (parseFloat(width) >= 5) {
          return "\\rule{\\linewidth}";
        }
        return _m;
      },
    );

    if (fixed !== block) {
      result = result.substring(0, mpStart) + fixed + result.substring(blockEnd);
      // Adjust regex index for next iteration
      minipageRegex.lastIndex = mpStart + fixed.length;
    }
  }

  return result;
}

/**
 * Replace large \hspace{>=4cm} with \hfill.
 * AI generates \hspace{5cm} for visual spacing (e.g. before dates),
 * but on narrow containers or short lines this overflows.
 */
function clampLargeHspace(source: string): string {
  return source.replace(
    /\\hspace\{(\d+\.?\d*)\s*cm\}/g,
    (_m, width: string) => {
      if (parseFloat(width) >= 4) {
        return "\\hfill";
      }
      return _m;
    },
  );
}

/**
 * Layer 19: Ensure \begin{minipage} on a new line starts a new paragraph.
 *
 * When \begin{minipage} appears right after a text line without an explicit
 * paragraph break (\par or blank line), LaTeX treats it as inline content,
 * causing signatures to appear next to dates, etc.
 *
 * This inserts \par before \begin{minipage} lines that don't already have
 * a paragraph break above them.
 */
function ensureMinipageOnNewLine(source: string): string {
  const lines = source.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (
      (trimmed.startsWith("\\begin{minipage}") ||
        trimmed.startsWith("\\noindent\\begin{minipage}") ||
        trimmed.startsWith("\\noindent \\begin{minipage}")) &&
      i > 0
    ) {
      const prev = lines[i - 1].trim();
      // If previous line is not empty, not \par, not \end{...}, not \vspace, not \\,
      // not \hfill (glue between paired minipages), not ending with % (continuation)
      // then we need a paragraph break
      if (
        prev !== "" &&
        !prev.endsWith("\\par") &&
        !prev.startsWith("\\end{") &&
        !prev.startsWith("\\vspace") &&
        !prev.startsWith("\\par") &&
        !prev.startsWith("\\hfill") &&
        !prev.endsWith("%") &&
        prev !== "\\\\"
      ) {
        result.push("\\par");
      }
    }
    result.push(lines[i]);
  }

  return result.join("\n");
}

/**
 * Layer 20: Fix tabularx without X columns.
 *
 * AI generates \begin{tabularx}{\linewidth}{p{3cm} p{4cm} p{3cm} p{3cm} p{2cm}}
 * Total = 15cm fixed, but \linewidth is only ~16cm minus column separators and padding.
 * Without any X column, tabularx can't flex — it behaves like a rigid tabular.
 *
 * Solution: Convert all p{Ncm} to proportional p{frac\linewidth} so total ≤ 0.95\linewidth.
 * We reserve 5% for column separators (6 \tabcolsep × 2 per col gap).
 */
function fixTabularxWithoutXColumns(source: string): string {
  let result = source;
  const tabularxTag = "\\begin{tabularx}";
  let cursor = 0;

  while (cursor < result.length) {
    const pos = result.indexOf(tabularxTag, cursor);
    if (pos === -1) break;

    const afterTag = pos + tabularxTag.length;

    // Extract width group {width}
    const widthGroup = extractNestedBraceGroup(result, afterTag);
    if (!widthGroup) { cursor = afterTag; continue; }
    const [, afterWidth] = widthGroup;

    // Skip whitespace
    let colspecStart = afterWidth;
    while (colspecStart < result.length && /\s/.test(result[colspecStart])) colspecStart++;

    // Extract colspec group {colspec}
    const colspecGroup = extractNestedBraceGroup(result, colspecStart);
    if (!colspecGroup) { cursor = afterWidth; continue; }
    const [colspec, afterColspec] = colspecGroup;

    // Strip modifiers to find bare column types
    const bareTypes = colspec
      .replace(/[><!@]\{[^}]*\}/g, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/[|\s]/g, "");

    // Only act on tabularx WITHOUT X columns that have p{} columns
    if (bareTypes.includes("X") || !bareTypes.includes("p")) {
      cursor = afterColspec;
      continue;
    }

    // Extract all p{Ncm} widths
    const pWidths: { match: string; cm: number }[] = [];
    const pRegex = /p\{(\d+\.?\d*)\s*cm\}/g;
    let m: RegExpExecArray | null;
    while ((m = pRegex.exec(colspec)) !== null) {
      pWidths.push({ match: m[0], cm: parseFloat(m[1]) });
    }

    if (pWidths.length === 0) {
      cursor = afterColspec;
      continue;
    }

    const totalCm = pWidths.reduce((sum, pw) => sum + pw.cm, 0);

    // Only fix if total exceeds ~14cm (typical \linewidth for a4paper with 2.5cm margins ≈ 16cm)
    if (totalCm <= 14) {
      cursor = afterColspec;
      continue;
    }

    // Convert each p{Ncm} to proportional, using 0.95 as usable fraction
    const usableFraction = 0.95;
    let newColspec = colspec;
    for (const pw of pWidths) {
      const fraction = ((pw.cm / totalCm) * usableFraction).toFixed(2);
      newColspec = newColspec.replace(
        pw.match,
        `p{${fraction}\\linewidth}`,
      );
    }

    if (newColspec !== colspec) {
      const before = result.substring(0, colspecStart);
      const after = result.substring(afterColspec);
      result = before + "{" + newColspec + "}" + after;
      cursor = before.length + newColspec.length + 2;
    } else {
      cursor = afterColspec;
    }
  }

  return result;
}

/**
 * Layer 21: Fix \rowcolor — causes "Misplaced \noalign" fatal error inside tabularx.
 *
 * \rowcolor uses \noalign internally. In tabularx, the table body is processed
 * multiple times to calculate column widths, which breaks \noalign completely.
 * Even correctly-placed \rowcolor at the start of a row will crash inside tabularx.
 *
 * Fix: replace ALL \rowcolor{color} with per-cell \cellcolor{color} applied to
 * each cell in the row, OR simply strip \rowcolor if it's too complex to convert.
 */
function fixMisplacedRowcolor(source: string): string {
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("\\rowcolor")) continue;

    // Extract the color from \rowcolor{...} or \rowcolor[model]{...}
    const match = line.match(/\\rowcolor(?:\[[^\]]*\])?\{([^}]+)\}/);
    const color = match ? match[1] : null;

    // Remove the \rowcolor command from the line
    let cleaned = line.replace(/\\rowcolor(?:\[[^\]]*\])?\{[^}]*\}\s*/g, "");

    // If the line has & (table row), add \cellcolor to each cell
    if (color && cleaned.includes("&")) {
      const cells = cleaned.split("&");
      cleaned = cells
        .map((cell) => {
          const trimmed = cell.trimStart();
          // Don't add cellcolor to empty cells or cells that already have it
          if (!trimmed || trimmed === "\\\\" || cell.includes("\\cellcolor")) return cell;
          return cell.replace(trimmed, `\\cellcolor{${color}}${trimmed}`);
        })
        .join("&");
    } else if (color && !cleaned.includes("&")) {
      // Single-column or standalone: just prepend cellcolor
      const trimmed = cleaned.trimStart();
      if (trimmed && trimmed !== "\\\\") {
        cleaned = cleaned.replace(trimmed, `\\cellcolor{${color}}${trimmed}`);
      }
    }

    lines[i] = cleaned;
  }

  return lines.join("\n");
}

/**
 * Layer 22: Fix \objtag wrapping long text.
 *
 * \objtag is a \newtcbox (inline box) that can't break across lines.
 * When AI puts a full sentence inside \objtag[color]{long text...},
 * the inline box overflows. Solution: unwrap the text, keeping just the content.
 *
 * Threshold: if the text inside \objtag{} is longer than 40 chars, unwrap it.
 */
function fixObjtagOverflow(source: string): string {
  return source.replace(
    /\\objtag\[([^\]]*)\]\{([^}]+)\}/g,
    (_match, _color: string, text: string) => {
      if (text.length > 40) {
        return text;
      }
      return _match;
    },
  );
}

/**
 * Clamp tabularx width to at most \linewidth.
 *
 * AI sometimes generates \begin{tabularx}{1.1\linewidth} or {1.2\textwidth}
 * which is wider than the page and guarantees Overfull \hbox.
 * Any multiplier > 1.0 is clamped to plain \linewidth.
 */
function clampTabularxWidth(source: string): string {
  // Match \begin{tabularx}{<width>} where width may be a multiplier > 1
  return source.replace(
    /\\begin\{tabularx\}\{(\d+\.?\d*)\s*\\(linewidth|textwidth)\}/g,
    (_match, multiplier, unit) => {
      const val = parseFloat(multiplier);
      if (val > 1.0) {
        return "\\begin{tabularx}{\\linewidth}";
      }
      return `\\begin{tabularx}{${multiplier}\\${unit}}`;
    },
  );
}

/**
 * Replace \makecell[l]{text1 \\ text2 \\ text3} with plain text using \newline.
 *
 * \makecell[l] creates an internal l-alignment column which IGNORES the
 * enclosing p{} column width, causing Overfull \hbox for long text.
 * Replacing with direct text + \newline respects the p{} wrapping.
 *
 * Only targets \makecell[l] (left-aligned) which is the most common AI pattern.
 * \makecell[c] or bare \makecell are less problematic (shorter text typically).
 */
function replaceMakecellInParagraphColumns(source: string): string {
  let result = source;
  // Match \makecell[l]{ ... }
  // Need to handle nested braces inside the content
  const pattern = /\\makecell\[l\]\s*\{/g;
  let match: RegExpExecArray | null;
  let safety = 0;

  while (safety++ < 200) {
    pattern.lastIndex = 0;
    match = pattern.exec(result);
    if (!match) break;

    const fullMatchStart = match.index;
    const braceStart = fullMatchStart + match[0].length - 1;

    // Find matching closing }
    let depth = 1;
    let idx = braceStart + 1;
    while (depth > 0 && idx < result.length) {
      if (result[idx] === "{") depth++;
      else if (result[idx] === "}") depth--;
      idx++;
    }
    if (depth !== 0) break;

    const content = result.substring(braceStart + 1, idx - 1);

    // Replace \\ line breaks with \newline (since we're in paragraph mode)
    // Handle \\[Xpt] spacing variants too
    const fixed = content
      .replace(/\\\\\s*\[\s*[^[\]]*\]/g, "\\newline ")
      .replace(/\\\\/g, "\\newline ");

    result = result.substring(0, fullMatchStart) + fixed + result.substring(idx);
  }

  return result;
}

/**
 * Strip \newgeometry{...} and redundant \usepackage{geometry} from the document body.
 *
 * AI-generated LaTeX sometimes includes \newgeometry{...} calls that reset
 * headheight to the default 15pt, causing fancyhdr warnings. The preamble
 * already has the correct geometry settings including headheight=28pt.
 *
 * Also removes \geometry{...} and \restoregeometry commands.
 */
function stripGeometryOverrides(source: string): string {
  const beginDoc = source.indexOf("\\begin{document}");
  if (beginDoc === -1) return source;

  const preamble = source.substring(0, beginDoc);
  let body = source.substring(beginDoc);

  // Remove \newgeometry{...} (may span multiple lines)
  body = body.replace(/\\newgeometry\s*\{[^}]*\}/g, "");

  // Remove \restoregeometry
  body = body.replace(/\\restoregeometry\b/g, "");

  // Remove \geometry{...} calls in the body
  body = body.replace(/\\geometry\s*\{[^}]*\}/g, "");

  // Remove redundant \usepackage[...]{geometry} in the body (shouldn't be there)
  body = body.replace(/\\usepackage\s*(\[[^\]]*\])?\s*\{geometry\}/g, "");

  return preamble + body;
}

function stripTexConditionalMarkers(source: string): string {
  let result = source;

  // Remove any line that CONTAINS \ifnum, \ifdim, \ifx, \ifodd, \ifcase
  // (even if it also contains \else, \or, etc.)
  result = result.replace(
    /^[^\n]*\\if(?:num|dim|x|odd|case)\b[^\n]*$/gm,
    "",
  );

  // Remove standalone \else lines (with possible trailing content like comments)
  result = result.replace(
    /^[ \t]*\\else\b[^\n]*$/gm,
    "",
  );

  // Remove standalone \or lines (\or is used in \ifcase blocks)
  result = result.replace(
    /^[ \t]*\\or\b[^\n]*$/gm,
    "",
  );

  // Remove standalone \fi lines (not \fill, \filbreak, etc.)
  result = result.replace(
    /^[ \t]*\\fi(?![a-zA-Z])[^\n]*$/gm,
    "",
  );

  // Remove inline \fi\fi or \fi that appears mid-content
  result = result.replace(/\\fi(?![a-zA-Z])/g, "");

  // Remove inline \else that appears mid-content
  result = result.replace(/\\else(?![a-zA-Z])/g, "");

  // Remove inline \or that appears mid-content
  result = result.replace(/\\or(?![a-zA-Z])/g, "");

  // Clean up multiple blank lines left behind
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

/**
 * Add vertical spacing around element titles like:
 *   \textbf{Figura 1 --- Linha do tempo...}
 *   \textbf{Tabela 2 --- Objetivos por área}
 *   \textbf{Quadro 3 --- Estrutura da sessão}
 *
 * Professional LaTeX documents use \caption which gives ~10pt above + below.
 * We replicate that with \vspace{0.6cm} above and \vspace{0.4cm} below,
 * centering the title and using \small + italic for a caption-like style.
 */
function addSpacingAfterElementTitles(source: string): string {
  return source.replace(
    /^([ \t]*)(\\textbf\{((?:Figura|Tabela|Quadro)\s+\d+\s*---[^}]*)\})\s*$/gm,
    "$1\\vspace{0.6cm}\n$1\\begin{center}\n$1\\small\\textbf{$3}\\end{center}\n$1\\vspace{0.4cm}",
  );
}

/**
 * Layer 24: Wrap bare URLs in \url{} for automatic line breaking.
 *
 * AI-generated LaTeX often includes bare URLs like:
 *   Acesse https://example.com/very/long/path para mais informações.
 *
 * Without \url{}, LaTeX treats the URL as a single unbreakable word,
 * causing severe Overfull \hbox. The url/xurl packages (loaded in preamble)
 * allow breaking at /, -, ., and alphanumeric boundaries.
 *
 * Skips URLs already inside \url{}, \href{}, or verbatim environments.
 */
function wrapBareUrls(source: string): string {
  // Match http:// or https:// URLs NOT preceded by \url{ or \href{
  // URL characters: letters, digits, and common URL punctuation
  return source.replace(
    /(?<!\\url\{)(?<!\\href\{)(https?:\/\/[^\s},)\]\\]+)/g,
    "\\url{$1}",
  );
}
