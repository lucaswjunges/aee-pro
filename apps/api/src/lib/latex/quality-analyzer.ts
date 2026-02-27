/**
 * Quality Analyzer for LaTeX documents.
 *
 * Purely computational analysis (zero token cost).
 * Counts structural elements, visual density, content depth.
 * Returns a score 0-100 with actionable priority fixes.
 *
 * Architecture (Signals & Systems):
 *   Score = Σ(subsystem scores) - penalties
 *   Each subsystem has a clear max, so the agent can see exactly where to gain points.
 *   The report includes a SCORE BREAKDOWN (feedforward) enabling predictive correction.
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

  // Score breakdown (feedforward for the agent)
  scoreBreakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  structure: { earned: number; max: number };
  visual: { earned: number; max: number };
  content: { earned: number; max: number };
  polish: { earned: number; max: number };
  penalties: number;
}

interface QualityFix {
  priority: number;
  category: string;
  message: string;
  points: number; // how many points this fix is worth
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
// Visual line detection (for text desert analysis)
// ---------------------------------------------------------------------------

const VISUAL_PATTERNS = [
  /\\begin\{(?:tikzpicture|tabularx?|longtable|itemize|enumerate|description)\}/,
  /\\begin\{(?:infobox|alertbox|successbox|datacard|atividadebox|dicabox|materialbox|sessaobox|warnbox|tealbox|purplebox|goldbox)\}/,
  /\\end\{(?:infobox|alertbox|successbox|datacard|atividadebox|dicabox|materialbox|sessaobox|warnbox|tealbox|purplebox|goldbox)\}/,
  /\\begin\{tcolorbox\}/,
  /\\end\{tcolorbox\}/,
  /\\faIcon\{/,
  /\\includegraphics/,
  /\\rowcolor/,
  /\\section\s*[\[{]/,
  /\\subsection\s*[\[{]/,
  /\\field\{/,
  /\\objtag/,
  /\\starmark/,
  /\\cmark/,
];

function isVisualLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("%")) return true;
  return VISUAL_PATTERNS.some((p) => p.test(trimmed));
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

export function analyzeLatexStructure(source: string): QualityMetrics {
  const lines = source.split("\n");
  const totalLines = lines.length;

  // --- Structure ---
  const sectionCount = (source.match(/\\section\s*[\[{]/g) || []).length;
  const subsectionCount = (source.match(/\\subsection\s*[\[{]/g) || []).length;

  // Cover page: TikZ overlay with \fill covering page area
  const hasCoverPage =
    /\\begin\{tikzpicture\}.*?remember picture.*?overlay/s.test(source) &&
    /\\fill\[.*?\].*?current page/s.test(source);

  const hasTableOfContents = /\\tableofcontents/.test(source);

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
  // Also count raw \begin{tcolorbox}
  const rawTcolorboxCount = (source.match(/\\begin\{tcolorbox\}/g) || []).length;
  if (rawTcolorboxCount > 0) {
    coloredBoxTypes["tcolorbox"] = rawTcolorboxCount;
    coloredBoxCount += rawTcolorboxCount;
  }

  // TikZ diagrams (excluding cover page overlay)
  const tikzBlocks = (source.match(/\\begin\{tikzpicture\}/g) || []).length;
  const tikzDiagramCount = hasCoverPage
    ? Math.max(0, tikzBlocks - 1)
    : tikzBlocks;

  // Tables
  const tableCount = (source.match(/\\begin\{(?:tabularx?|longtable)\}/g) || []).length;
  const rowColorCount = (source.match(/\\rowcolor/g) || []).length;
  const iconCount = (source.match(/\\faIcon\{/g) || []).length;

  // --- Content analysis ---
  const contentLines = lines.filter(
    (l) => l.trim() !== "" && !l.trim().startsWith("%")
  ).length;

  const envOverhead = coloredBoxCount * 4 + tikzDiagramCount * 8 + tableCount * 5;
  const estimatedPages = Math.max(1, Math.round((contentLines + envOverhead) / 42));

  const textDeserts = findTextDeserts(lines);
  const emptySubsections = findEmptySubsections(lines);

  // --- Compute score with breakdown ---
  const { score, breakdown } = computeScore({
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
    scoreBreakdown: breakdown,
  };
}

// ---------------------------------------------------------------------------
// Score computation — recalibrated so max=100 is achievable
// ---------------------------------------------------------------------------
//
// Subsystems and their max points:
//   STRUCTURE  (25): cover(6) + toc(4) + signature(3) + sections(8) + subsections(4)
//   VISUAL     (35): boxes(12) + tikz(8) + tables(6) + icons(4) + rowcolors(3) + box diversity(2)
//   CONTENT    (25): pages(15) + content density(5) + narrative ratio(5)
//   POLISH     (15): no deserts(6) + no empty subs(4) + icons in sections(3) + has lists(2)
//   PENALTIES: deserts(-4 each), empty subs(-3 each), <3 pages(-5)
//
// Total achievable: 100 (a well-crafted document hits 85-95)

function computeScore(m: {
  estimatedPages: number;
  sectionCount: number;
  subsectionCount: number;
  hasCoverPage: boolean;
  hasTableOfContents: boolean;
  hasSignatureBlock: boolean;
  coloredBoxCount: number;
  coloredBoxTypes: Record<string, number>;
  tikzDiagramCount: number;
  tableCount: number;
  rowColorCount: number;
  iconCount: number;
  totalLines: number;
  contentLines: number;
  textDeserts: Array<{ startLine: number; endLine: number; lineCount: number }>;
  emptySubsections: string[];
}): { score: number; breakdown: ScoreBreakdown } {

  // === STRUCTURE (max 25) ===
  let structure = 0;
  if (m.hasCoverPage) structure += 6;
  if (m.hasTableOfContents) structure += 4;
  if (m.hasSignatureBlock) structure += 3;
  structure += Math.min(m.sectionCount, 8);       // 1pt per section, max 8
  structure += Math.min(Math.floor(m.subsectionCount / 2), 4); // 1pt per 2 subs, max 4
  const structureMax = 25;

  // === VISUAL (max 35) ===
  let visual = 0;
  visual += Math.min(m.coloredBoxCount * 2, 12);   // 2pt per box, max 12
  visual += Math.min(m.tikzDiagramCount * 4, 8);    // 4pt per diagram, max 8
  visual += Math.min(m.tableCount * 2, 6);           // 2pt per table, max 6
  visual += Math.min(Math.floor(m.iconCount * 0.5), 4); // 0.5pt per icon, max 4
  visual += Math.min(m.rowColorCount, 3);            // 1pt per rowcolor, max 3
  visual += Math.min(Object.keys(m.coloredBoxTypes).length, 2); // box diversity, max 2
  const visualMax = 35;

  // === CONTENT (max 25) ===
  let content = 0;
  // Pages: 2.5pt per page up to 6 pages = max 15
  content += Math.min(Math.round(m.estimatedPages * 2.5), 15);
  // Content density: ratio of content lines to total lines
  const density = m.totalLines > 0 ? m.contentLines / m.totalLines : 0;
  content += density >= 0.6 ? 5 : density >= 0.4 ? 3 : 1;
  // Narrative richness: enough content lines for the page count
  const linesPerPage = m.estimatedPages > 0 ? m.contentLines / m.estimatedPages : 0;
  content += linesPerPage >= 35 ? 5 : linesPerPage >= 25 ? 3 : linesPerPage >= 15 ? 1 : 0;
  const contentMax = 25;

  // === POLISH (max 15) ===
  let polish = 0;
  // No text deserts: 6pts if zero deserts
  if (m.textDeserts.length === 0) polish += 6;
  // No empty subsections: 4pts if zero
  if (m.emptySubsections.length === 0) polish += 4;
  // Icons in section headers (proxy: icons > sections means most sections have icons)
  if (m.iconCount >= m.sectionCount && m.sectionCount > 0) polish += 3;
  // Has lists (itemize/enumerate tend to indicate structured content — counted via contentLines)
  // Simple proxy: coloredBoxCount > sectionCount means visual density is good
  if (m.coloredBoxCount >= m.sectionCount) polish += 2;
  const polishMax = 15;

  // === PENALTIES ===
  let penalties = 0;
  penalties += m.textDeserts.length * 4;
  penalties += m.emptySubsections.length * 3;
  if (m.estimatedPages < 3) penalties += 5;

  const raw = structure + visual + content + polish - penalties;
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    breakdown: {
      structure: { earned: structure, max: structureMax },
      visual: { earned: visual, max: visualMax },
      content: { earned: content, max: contentMax },
      polish: { earned: polish, max: polishMax },
      penalties,
    },
  };
}

// ---------------------------------------------------------------------------
// Text desert detection
// ---------------------------------------------------------------------------

function findTextDeserts(lines: string[]): QualityMetrics["textDeserts"] {
  const deserts: QualityMetrics["textDeserts"] = [];
  const THRESHOLD = 25;

  let desertStart = -1;
  let consecutive = 0;

  for (let i = 0; i < lines.length; i++) {
    if (isVisualLine(lines[i])) {
      if (consecutive >= THRESHOLD) {
        deserts.push({
          startLine: desertStart + 1,
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
// Format quality report — with SCORE BREAKDOWN (feedforward)
// ---------------------------------------------------------------------------

export function formatQualityReport(
  metrics: QualityMetrics,
  mode: "standard" | "promax" = "standard"
): string {
  const target = mode === "promax" ? 80 : 60;
  const isPass = metrics.score >= target;
  const b = metrics.scoreBreakdown;

  const lines: string[] = [];
  lines.push(
    `QUALITY: ${metrics.score}/100 (${metrics.grade}) ${isPass ? "PASS" : "NEEDS IMPROVEMENT"}`
  );
  lines.push("");

  // Score breakdown — the agent sees exactly where to gain points
  lines.push("SCORE BREAKDOWN:");
  lines.push(
    `  Structure: ${b.structure.earned}/${b.structure.max}  Visual: ${b.visual.earned}/${b.visual.max}  Content: ${b.content.earned}/${b.content.max}  Polish: ${b.polish.earned}/${b.polish.max}${b.penalties > 0 ? `  Penalties: -${b.penalties}` : ""}`
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
  if (metrics.rowColorCount > 0) {
    lines.push(`  ${metrics.rowColorCount} \\rowcolor uses`);
  }
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

  // Priority fixes with point values
  const fixes = generateFixes(metrics, mode);
  if (fixes.length > 0) {
    lines.push("PRIORITY FIXES:");
    for (const fix of fixes) {
      lines.push(`  ${fix.priority}. [${fix.category}] ${fix.message} (+${fix.points}pt)`);
    }
  } else {
    lines.push("No critical fixes needed. Score target met.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Generate priority fixes — with point values for each fix
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
        "Add TikZ cover page: \\begin{tikzpicture}[remember picture,overlay] with \\fill and student datacard",
      points: 6,
    });
  }

  if (!m.hasTableOfContents) {
    fixes.push({
      priority: p++,
      category: "STRUCTURE",
      message: "Add \\tableofcontents + \\newpage after cover",
      points: 4,
    });
  }

  for (const desert of m.textDeserts) {
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Break text desert at lines ${desert.startLine}-${desert.endLine} with infobox, alertbox, or table`,
      points: 4,
    });
  }

  if (m.tikzDiagramCount < minTikz) {
    const needed = minTikz - m.tikzDiagramCount;
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Add ${needed} TikZ diagram(s): radar chart, mind map, or timeline`,
      points: needed * 4,
    });
  }

  if (m.coloredBoxCount < minBoxes) {
    const needed = minBoxes - m.coloredBoxCount;
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Add ${needed} colored box(es) — use infobox, alertbox, successbox, dicabox (not raw tcolorbox)`,
      points: Math.min(needed * 2, 12 - m.coloredBoxCount * 2),
    });
  }

  if (m.tableCount < minTables) {
    const needed = minTables - m.tableCount;
    fixes.push({
      priority: p++,
      category: "VISUAL",
      message: `Add ${needed} table(s) with tabularx and \\rowcolor alternating`,
      points: Math.min(needed * 2, 6 - m.tableCount * 2),
    });
  }

  if (m.sectionCount < minSections) {
    fixes.push({
      priority: p++,
      category: "CONTENT",
      message: `Document has ${m.sectionCount} sections; add ${minSections - m.sectionCount} more to reach ${minSections}`,
      points: Math.min(minSections - m.sectionCount, 8 - m.sectionCount),
    });
  }

  if (m.estimatedPages < minPages) {
    fixes.push({
      priority: p++,
      category: "CONTENT",
      message: `Document is ~${m.estimatedPages} pages; expand to ${minPages}+. Add detail, examples, strategies.`,
      points: Math.min((minPages - m.estimatedPages) * 2, 15 - Math.round(m.estimatedPages * 2.5)),
    });
  }

  if (!m.hasSignatureBlock) {
    fixes.push({
      priority: p++,
      category: "STRUCTURE",
      message:
        "Add signature block: \\rule{6cm}{0.4pt} with name fields for AEE teacher and coordinator",
      points: 3,
    });
  }

  for (const sub of m.emptySubsections) {
    fixes.push({
      priority: p++,
      category: "CONTENT",
      message: `Subsection "${sub}" is empty — add content or remove`,
      points: 3,
    });
  }

  if (m.rowColorCount === 0 && m.tableCount > 0) {
    fixes.push({
      priority: p++,
      category: "POLISH",
      message: "Add \\rowcolor{aeelightblue} alternating to tables for readability",
      points: 3,
    });
  }

  if (Object.keys(m.coloredBoxTypes).length < 2 && m.coloredBoxCount > 0) {
    fixes.push({
      priority: p++,
      category: "POLISH",
      message: "Use more box variety — mix infobox, alertbox, successbox, dicabox, tealbox",
      points: 2,
    });
  }

  return fixes;
}
