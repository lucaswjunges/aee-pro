/**
 * Quality Analyzer for LaTeX documents.
 *
 * Purely computational analysis (zero token cost).
 * Counts structural elements, visual density, content depth.
 * Returns a score 0-100 with actionable priority fixes.
 *
 * Used by both Workers (tool-executor) and Fly.io (mcp-tools).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityMetrics {
  // Structure
  estimatedPages: number;
  sectionCount: number;
  subsectionCount: number;
  hasCoverPage: boolean;
  hasTableOfContents: boolean;
  hasSignatureBlock: boolean;

  // Visual elements
  coloredBoxCount: number;
  coloredBoxTypes: Record<string, number>;
  tikzDiagramCount: number;
  tableCount: number;
  rowColorCount: number;
  iconCount: number;

  // Content
  totalLines: number;
  contentLines: number; // non-empty, non-comment
  textDeserts: Array<{ startLine: number; endLine: number; lineCount: number }>;
  emptySubsections: string[];

  // Computed
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

interface QualityFix {
  priority: number; // 1 = most important
  category: string;
  message: string;
  location?: string;
}

// ---------------------------------------------------------------------------
// Known tcolorbox environments from preamble.ts
// ---------------------------------------------------------------------------

const TCOLORBOX_ENVS = [
  "infobox",
  "alertbox",
  "successbox",
  "datacard",
  "atividadebox",
  "dicabox",
  "materialbox",
  "sessaobox",
  "warnbox",
  "tealbox",
  "purplebox",
  "goldbox",
];

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

export function analyzeLatexStructure(source: string): QualityMetrics {
  const lines = source.split("\n");
  const totalLines = lines.length;

  // --- Structure ---
  const sectionMatches = source.match(/\\section\s*[\[{]/g) || [];
  const subsectionMatches = source.match(/\\subsection\s*[\[{]/g) || [];
  const sectionCount = sectionMatches.length;
  const subsectionCount = subsectionMatches.length;

  // Cover page: TikZ with fill covering page top area (any color, not just aeeblue)
  const hasCoverPage =
    /\\begin\{tikzpicture\}.*?remember picture.*?overlay/s.test(source) &&
    /\\fill\[.*?\].*?current page/s.test(source);

  // Table of contents
  const hasTableOfContents = /\\tableofcontents/.test(source);

  // Signature block: line for signature or \assinatura
  const hasSignatureBlock =
    /\\rule\{.*?\}\{.*?\}.*?(?:Assinatura|assinatura|Professor|Responsável)/is.test(source) ||
    /assinatura|\\vfill.*?\\rule/is.test(source) ||
    /Local.*?Data|Data:.*?____/i.test(source);

  // --- Visual elements ---
  const coloredBoxTypes: Record<string, number> = {};
  let coloredBoxCount = 0;
  for (const env of TCOLORBOX_ENVS) {
    const re = new RegExp(`\\\\begin\\{${env}\\}`, "g");
    const matches = source.match(re) || [];
    if (matches.length > 0) {
      coloredBoxTypes[env] = matches.length;
      coloredBoxCount += matches.length;
    }
  }
  // Also count raw \begin{tcolorbox} (agents sometimes use this directly)
  const rawTcolorboxCount = (source.match(/\\begin\{tcolorbox\}/g) || []).length;
  if (rawTcolorboxCount > 0) {
    coloredBoxTypes["tcolorbox"] = rawTcolorboxCount;
    coloredBoxCount += rawTcolorboxCount;
  }

  // TikZ diagrams (excluding cover page overlay)
  const tikzBlocks = source.match(/\\begin\{tikzpicture\}/g) || [];
  // Subtract 1 if cover page uses tikzpicture
  const tikzDiagramCount = hasCoverPage
    ? Math.max(0, tikzBlocks.length - 1)
    : tikzBlocks.length;

  // Tables
  const tabularMatches = source.match(/\\begin\{(?:tabularx?|longtable)\}/g) || [];
  const tableCount = tabularMatches.length;

  // Row coloring
  const rowColorMatches = source.match(/\\rowcolor/g) || [];
  const rowColorCount = rowColorMatches.length;

  // FontAwesome icons
  const iconMatches = source.match(/\\faIcon\{/g) || [];
  const iconCount = iconMatches.length;

  // --- Content analysis ---
  const contentLines = lines.filter(
    (l) => l.trim() !== "" && !l.trim().startsWith("%")
  ).length;

  // Estimate pages: ~45 content lines per page (with environments, spacing)
  const envOverhead = coloredBoxCount * 4 + tikzDiagramCount * 8 + tableCount * 5;
  const estimatedPages = Math.max(1, Math.round((contentLines + envOverhead) / 42));

  // Text deserts: consecutive lines of pure text (no environments, no commands)
  const textDeserts = findTextDeserts(lines);

  // Empty subsections: subsection followed by another section/subsection without content
  const emptySubsections = findEmptySubsections(lines);

  // --- Compute score ---
  const score = computeScore({
    estimatedPages,
    sectionCount,
    subsectionCount,
    hasCoverPage,
    hasTableOfContents,
    hasSignatureBlock,
    coloredBoxCount,
    coloredBoxTypes,
    tikzDiagramCount,
    tableCount,
    rowColorCount,
    iconCount,
    totalLines,
    contentLines,
    textDeserts,
    emptySubsections,
    score: 0,
    grade: "F",
  });

  const grade =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F";

  return {
    estimatedPages,
    sectionCount,
    subsectionCount,
    hasCoverPage,
    hasTableOfContents,
    hasSignatureBlock,
    coloredBoxCount,
    coloredBoxTypes,
    tikzDiagramCount,
    tableCount,
    rowColorCount,
    iconCount,
    totalLines,
    contentLines,
    textDeserts,
    emptySubsections,
    score,
    grade,
  };
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

function computeScore(m: QualityMetrics): number {
  let score = 0;

  // === STRUCTURE (max 30 pts) ===
  // Cover page: 8 pts
  if (m.hasCoverPage) score += 8;
  // Table of contents: 5 pts
  if (m.hasTableOfContents) score += 5;
  // Signature block: 4 pts
  if (m.hasSignatureBlock) score += 4;
  // Sections: 0-8 pts (1pt per section, max 8)
  score += Math.min(m.sectionCount, 8);
  // Subsections: 0-5 pts (1pt per 2 subsections, max 5)
  score += Math.min(Math.floor(m.subsectionCount / 2), 5);

  // === VISUAL DENSITY (max 30 pts) ===
  // Colored boxes: 0-12 pts (2pt per box, max 12)
  score += Math.min(m.coloredBoxCount * 2, 12);
  // TikZ diagrams: 0-8 pts (4pt per diagram, max 8)
  score += Math.min(m.tikzDiagramCount * 4, 8);
  // Tables: 0-6 pts (2pt per table, max 6)
  score += Math.min(m.tableCount * 2, 6);
  // Icons: 0-4 pts (0.5pt per icon, max 4)
  score += Math.min(Math.floor(m.iconCount * 0.5), 4);

  // === CONTENT DEPTH (max 20 pts) ===
  // Page count: 0-12 pts (2pt per page, max at 6 pages)
  score += Math.min(m.estimatedPages * 2, 12);
  // Diverse box types: 0-4 pts (1pt per unique type, max 4)
  score += Math.min(Object.keys(m.coloredBoxTypes).length, 4);
  // Row coloring in tables: 0-4 pts
  score += Math.min(m.rowColorCount, 4);

  // === PENALTIES (negative) ===
  // Text deserts: -3 per desert
  score -= m.textDeserts.length * 3;
  // Empty subsections: -2 each
  score -= m.emptySubsections.length * 2;
  // Too short document: -5 if under 3 pages
  if (m.estimatedPages < 3) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Text desert detection
// ---------------------------------------------------------------------------

const VISUAL_PATTERNS = [
  /\\begin\{(?:tikzpicture|tabularx?|longtable|itemize|enumerate|description)\}/,
  /\\begin\{(?:infobox|alertbox|successbox|datacard|atividadebox|dicabox|materialbox|sessaobox|warnbox|tealbox|purplebox|goldbox)\}/,
  /\\end\{(?:infobox|alertbox|successbox|datacard|atividadebox|dicabox|materialbox|sessaobox|warnbox|tealbox|purplebox|goldbox)\}/,
  /\\faIcon\{/,
  /\\includegraphics/,
  /\\rowcolor/,
  /\\section\s*[\[{]/,
  /\\subsection\s*[\[{]/,
];

function isVisualLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("%")) return true; // blank/comment = break
  return VISUAL_PATTERNS.some((p) => p.test(trimmed));
}

function findTextDeserts(lines: string[]): QualityMetrics["textDeserts"] {
  const deserts: QualityMetrics["textDeserts"] = [];
  const THRESHOLD = 25; // consecutive text-only lines

  let desertStart = -1;
  let consecutive = 0;

  for (let i = 0; i < lines.length; i++) {
    if (isVisualLine(lines[i])) {
      if (consecutive >= THRESHOLD) {
        deserts.push({
          startLine: desertStart + 1, // 1-indexed
          endLine: i,
          lineCount: consecutive,
        });
      }
      consecutive = 0;
      desertStart = -1;
    } else {
      if (desertStart === -1) desertStart = i;
      consecutive++;
    }
  }

  // Trailing desert
  if (consecutive >= THRESHOLD) {
    deserts.push({
      startLine: desertStart + 1,
      endLine: lines.length,
      lineCount: consecutive,
    });
  }

  return deserts;
}

// ---------------------------------------------------------------------------
// Empty subsection detection
// ---------------------------------------------------------------------------

function findEmptySubsections(lines: string[]): string[] {
  const empty: string[] = [];
  const sectionRe = /^\\(?:sub)?section\s*(?:\[.*?\])?\s*\{(.+?)\}/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(sectionRe);
    if (!match) continue;

    // Check if next non-blank line is another section/subsection
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;

    if (j < lines.length) {
      const nextLine = lines[j].trim();
      if (
        /^\\(?:sub)?section\s*[\[{]/.test(nextLine) ||
        /^\\end\{document\}/.test(nextLine)
      ) {
        empty.push(match[1]);
      }
    }
  }

  return empty;
}

// ---------------------------------------------------------------------------
// Format quality report
// ---------------------------------------------------------------------------

export function formatQualityReport(
  metrics: QualityMetrics,
  mode: "standard" | "promax" = "standard"
): string {
  const target = mode === "promax" ? 80 : 60;
  const isPass = metrics.score >= target;

  const lines: string[] = [];
  lines.push(
    `QUALITY: ${metrics.score}/100 (${metrics.grade}) ${isPass ? "PASS" : "NEEDS IMPROVEMENT"}`
  );
  lines.push("");

  // Structure
  lines.push("STRUCTURE:");
  lines.push(
    `  ${metrics.hasCoverPage ? "[OK]" : "[MISSING]"} Cover page TikZ`
  );
  lines.push(
    `  ${metrics.hasTableOfContents ? "[OK]" : "[MISSING]"} Table of contents`
  );
  lines.push(
    `  ${metrics.hasSignatureBlock ? "[OK]" : "[MISSING]"} Signature block`
  );
  lines.push(
    `  ${metrics.sectionCount >= 5 ? "[OK]" : "[WARN]"} ${metrics.sectionCount} sections`
  );
  lines.push(
    `  ${metrics.subsectionCount >= 6 ? "[OK]" : "[WARN]"} ${metrics.subsectionCount} subsections`
  );
  lines.push("");

  // Visual density
  lines.push("VISUAL DENSITY:");
  const boxDetail = Object.entries(metrics.coloredBoxTypes)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  lines.push(
    `  ${metrics.coloredBoxCount >= 4 ? "[OK]" : "[WARN]"} ${metrics.coloredBoxCount} colored boxes${boxDetail ? ` (${boxDetail})` : ""}`
  );
  lines.push(
    `  ${metrics.tikzDiagramCount >= 2 ? "[OK]" : "[WARN]"} ${metrics.tikzDiagramCount} TikZ diagrams`
  );
  lines.push(
    `  ${metrics.tableCount >= 2 ? "[OK]" : "[WARN]"} ${metrics.tableCount} tables`
  );
  lines.push(`  ${metrics.iconCount} FontAwesome icons`);
  lines.push("");

  // Content
  lines.push("CONTENT:");
  lines.push(
    `  ${metrics.estimatedPages >= 5 ? "[OK]" : "[WARN]"} ~${metrics.estimatedPages} pages estimated`
  );
  if (metrics.textDeserts.length > 0) {
    for (const d of metrics.textDeserts) {
      lines.push(
        `  [WARN] Text desert: lines ${d.startLine}-${d.endLine} (${d.lineCount} lines without visual element)`
      );
    }
  } else {
    lines.push("  [OK] No text deserts");
  }
  if (metrics.emptySubsections.length > 0) {
    lines.push(
      `  [WARN] Empty subsections: ${metrics.emptySubsections.join(", ")}`
    );
  }
  lines.push("");

  // Priority fixes
  const fixes = generateFixes(metrics, mode);
  if (fixes.length > 0) {
    lines.push("PRIORITY FIXES:");
    for (const fix of fixes) {
      lines.push(`  ${fix.priority}. [${fix.category}] ${fix.message}`);
    }
  } else {
    lines.push("No critical fixes needed.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Generate priority fixes
// ---------------------------------------------------------------------------

function generateFixes(m: QualityMetrics, mode: string): QualityFix[] {
  const fixes: QualityFix[] = [];
  let p = 1;

  const isProMax = mode === "promax";
  const minPages = isProMax ? 8 : 4;
  const minBoxes = isProMax ? 5 : 3;
  const minTikz = isProMax ? 2 : 1;
  const minTables = isProMax ? 2 : 1;
  const minSections = isProMax ? 6 : 4;

  if (!m.hasCoverPage) {
    fixes.push({
      priority: p++,
      category: "STRUCTURE",
      message:
        "Add a TikZ cover page with \\fill[aeeblue] overlay, title, student datacard",
    });
  }

  if (!m.hasTableOfContents) {
    fixes.push({
      priority: p++,
      category: "STRUCTURE",
      message: "Add \\tableofcontents + \\newpage after cover",
    });
  }

  for (const desert of m.textDeserts) {
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Break text desert at lines ${desert.startLine}-${desert.endLine} with infobox, alertbox, or table`,
      location: `lines ${desert.startLine}-${desert.endLine}`,
    });
  }

  if (m.tikzDiagramCount < minTikz) {
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Add ${minTikz - m.tikzDiagramCount} more TikZ diagram(s) (radar chart, mind map, or timeline)`,
    });
  }

  if (m.coloredBoxCount < minBoxes) {
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Add ${minBoxes - m.coloredBoxCount} more colored box(es) (infobox, alertbox, successbox, dicabox)`,
    });
  }

  if (m.tableCount < minTables) {
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Add ${minTables - m.tableCount} more table(s) with \\rowcolor for readability`,
    });
  }

  if (m.sectionCount < minSections) {
    fixes.push({
      priority: p++,
      category: "CONTENT",
      message: `Document has only ${m.sectionCount} sections; aim for ${minSections}+`,
    });
  }

  if (m.estimatedPages < minPages) {
    fixes.push({
      priority: p++,
      category: "CONTENT",
      message: `Document is ~${m.estimatedPages} pages; aim for ${minPages}+. Expand sections with detail.`,
    });
  }

  if (!m.hasSignatureBlock) {
    fixes.push({
      priority: p++,
      category: "STRUCTURE",
      message:
        "Add signature block at end (\\rule + name/date lines for teacher and coordinator)",
    });
  }

  for (const sub of m.emptySubsections) {
    fixes.push({
      priority: p++,
      category: "CONTENT",
      message: `Subsection "${sub}" is empty — add content or remove it`,
    });
  }

  return fixes;
}
