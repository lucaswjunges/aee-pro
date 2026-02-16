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

  // Layer 11: Add \sloppy inside tcolorbox environments.
  // tcolorbox has narrower width than \textwidth, causing frequent
  // Overfull \hbox. \sloppy allows more aggressive line breaking.
  result = addSloppyToTcolorbox(result);

  // Layer 12: Convert l columns to p{} in tables inside tcolorbox/adjustbox
  // when there are 3+ l columns (likely long text that will overflow).
  result = fixTabularColumnOverflow(result);

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
    const before = result.substring(Math.max(0, startIdx - 80), startIdx);
    if (before.includes("\\begin{adjustbox}") || before.includes("adjustbox")) {
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
 * Replace X column specifiers in longtable with p{5cm}.
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
      const fixed = colspec.replace(/(?<![a-zA-Z\\])X(?![a-zA-Z])/g, "p{5cm}");
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

  // Pattern 2: longtable with X column type → replace X with p{5cm}
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

      // Only fix tables with 3+ narrow columns and no wide columns
      if (lcrCount < 3 || hasWideCols) continue;

      // Check if already inside adjustbox (look back ~100 chars)
      const before = result.substring(Math.max(0, match.index - 100), match.index);
      if (before.includes("adjustbox")) continue;

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
function addSloppyToTcolorbox(source: string): string {
  // Match \begin{env}, optional [arg], and optional {mandatory arg} on same line.
  // The {mandatory arg} is needed for atividadebox which takes [color]{title} —
  // inserting \sloppy between them would break tcolorbox argument parsing.
  const envPattern = new RegExp(
    `\\\\begin\\{(${TCOLORBOX_ENVS})\\}(\\[[^\\]]*\\])?(\\{[^}\\n]*\\})?`,
    "g",
  );

  return source.replace(envPattern, (fullMatch, _envName, _optArg, _mandArg, offset: number) => {
    // Check if \sloppy already follows on the next line
    const afterIdx = offset + fullMatch.length;
    const nextChars = source.substring(afterIdx, afterIdx + 20).trimStart();
    if (nextChars.startsWith("\\sloppy")) return fullMatch;

    return fullMatch + "\n\\sloppy";
  });
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

      // Find tabular or tabularx inside this env block
      const tabMatch = envBlock.match(/\\begin\{tabular(?:x)?\}(?:\{[^}]*\})?\{([^}]*)\}/);
      if (tabMatch) {
        const colspec = tabMatch[1];
        // Count l columns
        const cleanedCols = colspec.replace(/>?\{[^}]*\}/g, "").replace(/[|]/g, "");
        const lCount = (cleanedCols.match(/l/g) || []).length;
        const totalCols = (cleanedCols.match(/[lcr]/g) || []).length;

        // Only fix if 3+ l columns and no p{}/X columns already
        if (lCount >= 3 && !/[pmbX]/.test(cleanedCols)) {
          // Calculate proportional width: distribute \linewidth among columns
          const colWidth = (0.95 / totalCols).toFixed(2);
          const newColspec = colspec.replace(
            /(?<![a-zA-Z])l(?![a-zA-Z])/g,
            `p{${colWidth}\\linewidth}`,
          );

          const oldColspecStr = `{${colspec}}`;
          const newColspecStr = `{${newColspec}}`;
          const relPos = envBlock.indexOf(oldColspecStr);
          if (relPos !== -1) {
            const absPos = envStart + relPos;
            result =
              result.substring(0, absPos) +
              newColspecStr +
              result.substring(absPos + oldColspecStr.length);
          }
        }
      }

      cursor = envStart + beginEnv.length;
    }
  }

  return result;
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
