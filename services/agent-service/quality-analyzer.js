/**
 * Quality Analyzer for LaTeX documents (JS version for Agent Service).
 * Mirror of apps/api/src/lib/latex/quality-analyzer.ts
 *
 * Purely computational analysis (zero token cost).
 */

// Known tcolorbox environments from preamble
const TCOLORBOX_ENVS = [
  "infobox", "alertbox", "successbox", "datacard", "atividadebox",
  "dicabox", "materialbox", "sessaobox", "warnbox", "tealbox",
  "purplebox", "goldbox",
];

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

export function analyzeLatexStructure(source) {
  const lines = source.split("\n");
  const totalLines = lines.length;

  // Structure
  const sectionCount = (source.match(/\\section\s*[\[{]/g) || []).length;
  const subsectionCount = (source.match(/\\subsection\s*[\[{]/g) || []).length;

  const hasCoverPage =
    /\\begin\{tikzpicture\}.*?remember picture.*?overlay/s.test(source) &&
    /\\fill\[.*?aeeblue.*?\].*?current page/s.test(source);

  const hasTableOfContents = /\\tableofcontents/.test(source);

  const hasSignatureBlock =
    /\\rule\{.*?\}\{.*?\}.*?(?:Assinatura|assinatura|Professor|Responsável)/is.test(source) ||
    /assinatura|\\vfill.*?\\rule/is.test(source) ||
    /Local.*?Data|Data:.*?____/i.test(source);

  // Visual elements
  const coloredBoxTypes = {};
  let coloredBoxCount = 0;
  for (const env of TCOLORBOX_ENVS) {
    const re = new RegExp(`\\\\begin\\{${env}\\}`, "g");
    const matches = source.match(re) || [];
    if (matches.length > 0) {
      coloredBoxTypes[env] = matches.length;
      coloredBoxCount += matches.length;
    }
  }

  const tikzBlocks = (source.match(/\\begin\{tikzpicture\}/g) || []).length;
  const tikzDiagramCount = hasCoverPage ? Math.max(0, tikzBlocks - 1) : tikzBlocks;

  const tableCount = (source.match(/\\begin\{(?:tabularx?|longtable)\}/g) || []).length;
  const rowColorCount = (source.match(/\\rowcolor/g) || []).length;
  const iconCount = (source.match(/\\faIcon\{/g) || []).length;

  // Content
  const contentLines = lines.filter(
    (l) => l.trim() !== "" && !l.trim().startsWith("%")
  ).length;

  const envOverhead = coloredBoxCount * 4 + tikzDiagramCount * 8 + tableCount * 5;
  const estimatedPages = Math.max(1, Math.round((contentLines + envOverhead) / 42));

  const textDeserts = findTextDeserts(lines);
  const emptySubsections = findEmptySubsections(lines);

  // Score
  const metrics = {
    estimatedPages, sectionCount, subsectionCount,
    hasCoverPage, hasTableOfContents, hasSignatureBlock,
    coloredBoxCount, coloredBoxTypes, tikzDiagramCount,
    tableCount, rowColorCount, iconCount,
    totalLines, contentLines, textDeserts, emptySubsections,
    score: 0, grade: "F",
  };

  metrics.score = computeScore(metrics);
  metrics.grade =
    metrics.score >= 90 ? "A" : metrics.score >= 80 ? "B" :
    metrics.score >= 65 ? "C" : metrics.score >= 50 ? "D" : "F";

  return metrics;
}

function computeScore(m) {
  let score = 0;

  // Structure (max 30)
  if (m.hasCoverPage) score += 8;
  if (m.hasTableOfContents) score += 5;
  if (m.hasSignatureBlock) score += 4;
  score += Math.min(m.sectionCount, 8);
  score += Math.min(Math.floor(m.subsectionCount / 2), 5);

  // Visual density (max 30)
  score += Math.min(m.coloredBoxCount * 2, 12);
  score += Math.min(m.tikzDiagramCount * 4, 8);
  score += Math.min(m.tableCount * 2, 6);
  score += Math.min(Math.floor(m.iconCount * 0.5), 4);

  // Content depth (max 20)
  score += Math.min(m.estimatedPages * 2, 12);
  score += Math.min(Object.keys(m.coloredBoxTypes).length, 4);
  score += Math.min(m.rowColorCount, 4);

  // Penalties
  score -= m.textDeserts.length * 3;
  score -= m.emptySubsections.length * 2;
  if (m.estimatedPages < 3) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function isVisualLine(line) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("%")) return true;
  return VISUAL_PATTERNS.some((p) => p.test(trimmed));
}

function findTextDeserts(lines) {
  const deserts = [];
  const THRESHOLD = 25;
  let desertStart = -1;
  let consecutive = 0;

  for (let i = 0; i < lines.length; i++) {
    if (isVisualLine(lines[i])) {
      if (consecutive >= THRESHOLD) {
        deserts.push({ startLine: desertStart + 1, endLine: i, lineCount: consecutive });
      }
      consecutive = 0;
      desertStart = -1;
    } else {
      if (desertStart === -1) desertStart = i;
      consecutive++;
    }
  }

  if (consecutive >= THRESHOLD) {
    deserts.push({ startLine: desertStart + 1, endLine: lines.length, lineCount: consecutive });
  }

  return deserts;
}

function findEmptySubsections(lines) {
  const empty = [];
  const sectionRe = /^\\(?:sub)?section\s*(?:\[.*?\])?\s*\{(.+?)\}/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(sectionRe);
    if (!match) continue;

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;

    if (j < lines.length) {
      const nextLine = lines[j].trim();
      if (/^\\(?:sub)?section\s*[\[{]/.test(nextLine) || /^\\end\{document\}/.test(nextLine)) {
        empty.push(match[1]);
      }
    }
  }

  return empty;
}

export function formatQualityReport(metrics, mode = "standard") {
  const target = mode === "promax" ? 80 : 60;
  const isPass = metrics.score >= target;

  const lines = [];
  lines.push(`QUALITY: ${metrics.score}/100 (${metrics.grade}) ${isPass ? "PASS" : "NEEDS IMPROVEMENT"}`);
  lines.push("");

  lines.push("STRUCTURE:");
  lines.push(`  ${metrics.hasCoverPage ? "[OK]" : "[MISSING]"} Cover page TikZ`);
  lines.push(`  ${metrics.hasTableOfContents ? "[OK]" : "[MISSING]"} Table of contents`);
  lines.push(`  ${metrics.hasSignatureBlock ? "[OK]" : "[MISSING]"} Signature block`);
  lines.push(`  ${metrics.sectionCount >= 5 ? "[OK]" : "[WARN]"} ${metrics.sectionCount} sections`);
  lines.push(`  ${metrics.subsectionCount >= 6 ? "[OK]" : "[WARN]"} ${metrics.subsectionCount} subsections`);
  lines.push("");

  lines.push("VISUAL DENSITY:");
  const boxDetail = Object.entries(metrics.coloredBoxTypes).map(([k, v]) => `${k}:${v}`).join(", ");
  lines.push(`  ${metrics.coloredBoxCount >= 4 ? "[OK]" : "[WARN]"} ${metrics.coloredBoxCount} colored boxes${boxDetail ? ` (${boxDetail})` : ""}`);
  lines.push(`  ${metrics.tikzDiagramCount >= 2 ? "[OK]" : "[WARN]"} ${metrics.tikzDiagramCount} TikZ diagrams`);
  lines.push(`  ${metrics.tableCount >= 2 ? "[OK]" : "[WARN]"} ${metrics.tableCount} tables`);
  lines.push(`  ${metrics.iconCount} FontAwesome icons`);
  lines.push("");

  lines.push("CONTENT:");
  lines.push(`  ${metrics.estimatedPages >= 5 ? "[OK]" : "[WARN]"} ~${metrics.estimatedPages} pages estimated`);
  if (metrics.textDeserts.length > 0) {
    for (const d of metrics.textDeserts) {
      lines.push(`  [WARN] Text desert: lines ${d.startLine}-${d.endLine} (${d.lineCount} lines without visual element)`);
    }
  } else {
    lines.push("  [OK] No text deserts");
  }
  if (metrics.emptySubsections.length > 0) {
    lines.push(`  [WARN] Empty subsections: ${metrics.emptySubsections.join(", ")}`);
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

function generateFixes(m, mode) {
  const fixes = [];
  let p = 1;
  const isProMax = mode === "promax";
  const minPages = isProMax ? 8 : 4;
  const minBoxes = isProMax ? 5 : 3;
  const minTikz = isProMax ? 2 : 1;
  const minTables = isProMax ? 2 : 1;
  const minSections = isProMax ? 6 : 4;

  if (!m.hasCoverPage) {
    fixes.push({ priority: p++, category: "STRUCTURE", message: "Add TikZ cover page with \\fill[aeeblue] overlay, title, student datacard" });
  }
  if (!m.hasTableOfContents) {
    fixes.push({ priority: p++, category: "STRUCTURE", message: "Add \\tableofcontents + \\newpage after cover" });
  }
  for (const desert of m.textDeserts) {
    fixes.push({ priority: p++, category: "VISUAL", message: `Break text desert at lines ${desert.startLine}-${desert.endLine} with infobox, alertbox, or table` });
  }
  if (m.tikzDiagramCount < minTikz) {
    fixes.push({ priority: p++, category: "VISUAL", message: `Add ${minTikz - m.tikzDiagramCount} more TikZ diagram(s) (radar chart, mind map, or timeline)` });
  }
  if (m.coloredBoxCount < minBoxes) {
    fixes.push({ priority: p++, category: "VISUAL", message: `Add ${minBoxes - m.coloredBoxCount} more colored box(es) (infobox, alertbox, successbox, dicabox)` });
  }
  if (m.tableCount < minTables) {
    fixes.push({ priority: p++, category: "VISUAL", message: `Add ${minTables - m.tableCount} more table(s) with \\rowcolor for readability` });
  }
  if (m.sectionCount < minSections) {
    fixes.push({ priority: p++, category: "CONTENT", message: `Document has only ${m.sectionCount} sections; aim for ${minSections}+` });
  }
  if (m.estimatedPages < minPages) {
    fixes.push({ priority: p++, category: "CONTENT", message: `Document is ~${m.estimatedPages} pages; aim for ${minPages}+. Expand sections.` });
  }
  if (!m.hasSignatureBlock) {
    fixes.push({ priority: p++, category: "STRUCTURE", message: "Add signature block at end (\\rule + name/date)" });
  }
  for (const sub of m.emptySubsections) {
    fixes.push({ priority: p++, category: "CONTENT", message: `Subsection "${sub}" is empty — add content or remove` });
  }

  return fixes;
}
