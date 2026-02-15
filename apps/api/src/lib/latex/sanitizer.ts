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

  // Layer 4: Replace \pgfmathparse...\pgfmathresult inline color specs
  result = result.replace(
    /\\pgfmathparse\{[^}]*\}\\pgfmathresult/g,
    "black",
  );
  result = result.replace(/\\pgfmathresult/g, "0");

  // Layer 5: Close unclosed environments before \end{document}
  // AI output is often truncated, leaving environments open.
  result = closeUnclosedEnvironments(result);

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
