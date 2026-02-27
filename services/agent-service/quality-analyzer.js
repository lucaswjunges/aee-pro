/**
 * Quality Analyzer for LaTeX documents (JS version for Agent Service).
 * Mirror of apps/api/src/lib/latex/quality-analyzer.ts
 *
 * Recalibrated scorer:
 *   Structure(25) + Visual(35) + Content(25) + Polish(15) = 100
 *   Score breakdown (feedforward) enables predictive correction by the agent.
 */

const TCOLORBOX_ENVS = [
  "infobox", "alertbox", "successbox", "datacard", "atividadebox",
  "dicabox", "materialbox", "sessaobox", "warnbox", "tealbox",
  "purplebox", "goldbox",
];

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

function isVisualLine(line) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("%")) return true;
  return VISUAL_PATTERNS.some((p) => p.test(trimmed));
}

export function analyzeLatexStructure(source) {
  const lines = source.split("\n");
  const totalLines = lines.length;

  const sectionCount = (source.match(/\\section\s*[\[{]/g) || []).length;
  const subsectionCount = (source.match(/\\subsection\s*[\[{]/g) || []).length;

  const hasCoverPage =
    /\\begin\{tikzpicture\}.*?remember picture.*?overlay/s.test(source) &&
    /\\fill\[.*?\].*?current page/s.test(source);

  const hasTableOfContents = /\\tableofcontents/.test(source);

  const hasSignatureBlock =
    /\\rule\{.*?\}\{.*?\}.*?(?:Assinatura|assinatura|Professor|Responsável)/is.test(source) ||
    /assinatura|\\vfill.*?\\rule/is.test(source) ||
    /Local.*?Data|Data:.*?____/i.test(source);

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
  const rawTcolorboxCount = (source.match(/\\begin\{tcolorbox\}/g) || []).length;
  if (rawTcolorboxCount > 0) {
    coloredBoxTypes["tcolorbox"] = rawTcolorboxCount;
    coloredBoxCount += rawTcolorboxCount;
  }

  const tikzBlocks = (source.match(/\\begin\{tikzpicture\}/g) || []).length;
  const tikzDiagramCount = hasCoverPage ? Math.max(0, tikzBlocks - 1) : tikzBlocks;

  const tableCount = (source.match(/\\begin\{(?:tabularx?|longtable)\}/g) || []).length;
  const rowColorCount = (source.match(/\\rowcolor/g) || []).length;
  const iconCount = (source.match(/\\faIcon\{/g) || []).length;

  const contentLines = lines.filter(
    (l) => l.trim() !== "" && !l.trim().startsWith("%")
  ).length;

  const envOverhead = coloredBoxCount * 4 + tikzDiagramCount * 8 + tableCount * 5;
  const estimatedPages = Math.max(1, Math.round((contentLines + envOverhead) / 42));

  const textDeserts = findTextDeserts(lines);
  const emptySubsections = findEmptySubsections(lines);

  const { score, breakdown } = computeScore({
    estimatedPages, sectionCount, subsectionCount,
    hasCoverPage, hasTableOfContents, hasSignatureBlock,
    coloredBoxCount, coloredBoxTypes, tikzDiagramCount,
    tableCount, rowColorCount, iconCount,
    totalLines, contentLines, textDeserts, emptySubsections,
  });

  const grade =
    score >= 90 ? "A" : score >= 80 ? "B" :
    score >= 65 ? "C" : score >= 50 ? "D" : "F";

  return {
    estimatedPages, sectionCount, subsectionCount,
    hasCoverPage, hasTableOfContents, hasSignatureBlock,
    coloredBoxCount, coloredBoxTypes, tikzDiagramCount,
    tableCount, rowColorCount, iconCount,
    totalLines, contentLines, textDeserts, emptySubsections,
    score, grade, scoreBreakdown: breakdown,
  };
}

function computeScore(m) {
  // Structure (max 25)
  let structure = 0;
  if (m.hasCoverPage) structure += 6;
  if (m.hasTableOfContents) structure += 4;
  if (m.hasSignatureBlock) structure += 3;
  structure += Math.min(m.sectionCount, 8);
  structure += Math.min(Math.floor(m.subsectionCount / 2), 4);

  // Visual (max 35)
  let visual = 0;
  visual += Math.min(m.coloredBoxCount * 2, 12);
  visual += Math.min(m.tikzDiagramCount * 4, 8);
  visual += Math.min(m.tableCount * 2, 6);
  visual += Math.min(Math.floor(m.iconCount * 0.5), 4);
  visual += Math.min(m.rowColorCount, 3);
  visual += Math.min(Object.keys(m.coloredBoxTypes).length, 2);

  // Content (max 25)
  let content = 0;
  content += Math.min(Math.round(m.estimatedPages * 2.5), 15);
  const density = m.totalLines > 0 ? m.contentLines / m.totalLines : 0;
  content += density >= 0.6 ? 5 : density >= 0.4 ? 3 : 1;
  const linesPerPage = m.estimatedPages > 0 ? m.contentLines / m.estimatedPages : 0;
  content += linesPerPage >= 35 ? 5 : linesPerPage >= 25 ? 3 : linesPerPage >= 15 ? 1 : 0;

  // Polish (max 15)
  let polish = 0;
  if (m.textDeserts.length === 0) polish += 6;
  if (m.emptySubsections.length === 0) polish += 4;
  if (m.iconCount >= m.sectionCount && m.sectionCount > 0) polish += 3;
  if (m.coloredBoxCount >= m.sectionCount) polish += 2;

  // Penalties
  let penalties = 0;
  penalties += m.textDeserts.length * 4;
  penalties += m.emptySubsections.length * 3;
  if (m.estimatedPages < 3) penalties += 5;

  const raw = structure + visual + content + polish - penalties;
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    breakdown: {
      structure: { earned: structure, max: 25 },
      visual: { earned: visual, max: 35 },
      content: { earned: content, max: 25 },
      polish: { earned: polish, max: 15 },
      penalties,
    },
  };
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
  const b = metrics.scoreBreakdown;

  const lines = [];
  lines.push(`QUALITY: ${metrics.score}/100 (${metrics.grade}) ${isPass ? "PASS" : "NEEDS IMPROVEMENT"}`);
  lines.push("");

  // Score breakdown — feedforward for the agent
  lines.push("SCORE BREAKDOWN:");
  lines.push(`  Structure: ${b.structure.earned}/${b.structure.max}  Visual: ${b.visual.earned}/${b.visual.max}  Content: ${b.content.earned}/${b.content.max}  Polish: ${b.polish.earned}/${b.polish.max}${b.penalties > 0 ? `  Penalties: -${b.penalties}` : ""}`);
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
  if (metrics.rowColorCount > 0) {
    lines.push(`  ${metrics.rowColorCount} \\rowcolor uses`);
  }
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
    fixes.push({ priority: p++, category: "STRUCTURE", message: "Add TikZ cover page: \\begin{tikzpicture}[remember picture,overlay] with \\fill and student datacard", points: 6 });
  }
  if (!m.hasTableOfContents) {
    fixes.push({ priority: p++, category: "STRUCTURE", message: "Add \\tableofcontents + \\newpage after cover", points: 4 });
  }
  for (const desert of m.textDeserts) {
    fixes.push({ priority: p++, category: "VISUAL", message: `Break text desert at lines ${desert.startLine}-${desert.endLine} with infobox, alertbox, or table`, points: 4 });
  }
  if (m.tikzDiagramCount < minTikz) {
    const needed = minTikz - m.tikzDiagramCount;
    fixes.push({ priority: p++, category: "VISUAL", message: `Add ${needed} TikZ diagram(s): radar chart, mind map, or timeline`, points: needed * 4 });
  }
  if (m.coloredBoxCount < minBoxes) {
    const needed = minBoxes - m.coloredBoxCount;
    fixes.push({ priority: p++, category: "VISUAL", message: `Add ${needed} colored box(es) — use infobox, alertbox, successbox, dicabox (not raw tcolorbox)`, points: Math.min(needed * 2, 12 - m.coloredBoxCount * 2) });
  }
  if (m.tableCount < minTables) {
    const needed = minTables - m.tableCount;
    fixes.push({ priority: p++, category: "VISUAL", message: `Add ${needed} table(s) with tabularx and \\rowcolor alternating`, points: Math.min(needed * 2, 6 - m.tableCount * 2) });
  }
  if (m.sectionCount < minSections) {
    fixes.push({ priority: p++, category: "CONTENT", message: `Document has ${m.sectionCount} sections; add ${minSections - m.sectionCount} more`, points: Math.min(minSections - m.sectionCount, 8 - m.sectionCount) });
  }
  if (m.estimatedPages < minPages) {
    fixes.push({ priority: p++, category: "CONTENT", message: `Document is ~${m.estimatedPages} pages; expand to ${minPages}+`, points: Math.min((minPages - m.estimatedPages) * 2, 15 - Math.round(m.estimatedPages * 2.5)) });
  }
  if (!m.hasSignatureBlock) {
    fixes.push({ priority: p++, category: "STRUCTURE", message: "Add signature block: \\rule{6cm}{0.4pt} with name fields", points: 3 });
  }
  for (const sub of m.emptySubsections) {
    fixes.push({ priority: p++, category: "CONTENT", message: `Subsection "${sub}" is empty — add content or remove`, points: 3 });
  }
  if (m.rowColorCount === 0 && m.tableCount > 0) {
    fixes.push({ priority: p++, category: "POLISH", message: "Add \\rowcolor{aeelightblue} alternating to tables", points: 3 });
  }
  if (Object.keys(m.coloredBoxTypes).length < 2 && m.coloredBoxCount > 0) {
    fixes.push({ priority: p++, category: "POLISH", message: "Use more box variety — mix infobox, alertbox, successbox, dicabox, tealbox", points: 2 });
  }

  return fixes;
}
