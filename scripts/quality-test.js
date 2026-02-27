#!/usr/bin/env node

/**
 * Quality Test Harness for AEE+ Pro
 *
 * Tests the quality analysis pipeline against sample LaTeX documents
 * and (optionally) against the live agent service.
 *
 * Usage:
 *   node scripts/quality-test.js                     # Analyze existing .tex files
 *   node scripts/quality-test.js --agent             # Test via agent service (requires running service)
 *   node scripts/quality-test.js --agent --mode=promax
 *
 * Environment:
 *   AGENT_SERVICE_URL  — URL of the agent service (default: http://localhost:8082)
 *   AGENT_SERVICE_TOKEN — Bearer token for the agent service
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Import quality analyzer (JS version from agent-service)
const analyzerPath = path.join(ROOT, "services/agent-service/quality-analyzer.js");
let analyzeLatexStructure, formatQualityReport;

try {
  const mod = await import(analyzerPath);
  analyzeLatexStructure = mod.analyzeLatexStructure;
  formatQualityReport = mod.formatQualityReport;
} catch (err) {
  console.error(`Failed to import quality-analyzer from ${analyzerPath}:`, err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const useAgent = args.includes("--agent");
const mode = args.find((a) => a.startsWith("--mode="))?.split("=")[1] || "promax";
const verbose = args.includes("--verbose") || args.includes("-v");
const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8082";
const AGENT_TOKEN = process.env.AGENT_SERVICE_TOKEN || "";

// ---------------------------------------------------------------------------
// Test scenarios for agent-based testing
// ---------------------------------------------------------------------------

const AGENT_SCENARIOS = [
  {
    name: "Anamnese (TEA-2)",
    message: "Crie uma anamnese completa para o aluno vinculado ao projeto.",
    studentData: {
      name: "João Pedro Silva",
      diagnosis: "TEA — Transtorno do Espectro Autista (Nível 2 de suporte)",
      grade: "3º ano do Ensino Fundamental",
      age: "8 anos",
      school: "Escola Municipal Monteiro Lobato",
      teacher_aee: "Profa. Maria Aparecida",
      teacher_regular: "Profa. Ana Paula",
      medications: "Risperidona 0,5mg (noite)",
      therapies: "Fonoaudiologia (2x/semana), Terapia Ocupacional (1x/semana)",
      family: "Mora com mãe (35 anos, cabeleireira) e avó materna (62 anos, aposentada). Pai ausente.",
      motor: "Coordenação fina em desenvolvimento. Dificuldade com recorte e escrita cursiva.",
      language: "Vocabulário funcional de ~40 palavras. Ecolalia frequente. Usa frases de 2 palavras.",
      cognitive: "Atenção sustentada de 10 min. Boa memória visual. Dificuldade com abstrações.",
      social: "Prefere brincar sozinho. Aceita interação quando mediada por adulto.",
      autonomy: "Alimentação independente (seletividade alimentar). Higiene com apoio verbal.",
    },
  },
  {
    name: "PEI/PDI (TDAH)",
    message: "Gere um PDI completo para o aluno vinculado.",
    studentData: {
      name: "Ana Beatriz Oliveira",
      diagnosis: "TDAH — Transtorno do Déficit de Atenção e Hiperatividade (predominantemente desatento)",
      grade: "5º ano do Ensino Fundamental",
      age: "10 anos",
      school: "Escola Estadual Santos Dumont",
      teacher_aee: "Prof. Carlos Eduardo",
      teacher_regular: "Profa. Juliana Santos",
      medications: "Metilfenidato 10mg (manhã)",
      cognitive: "QI dentro da média. Boa compreensão verbal. Dificuldade com organização e planejamento.",
      academic: "Leitura fluente. Escrita com omissões e trocas. Matemática: operações básicas OK, problemas com enunciado longo: dificuldade.",
      social: "Sociável mas impulsiva nas interações. Interrompe colegas com frequência.",
    },
  },
  {
    name: "Sugestão de Atendimento (DI)",
    message: "Crie uma sugestão de atendimento para o aluno.",
    studentData: {
      name: "Lucas Gabriel Ferreira",
      diagnosis: "DI — Deficiência Intelectual (leve)",
      grade: "4º ano do Ensino Fundamental",
      age: "11 anos",
      school: "Escola Municipal Cecília Meireles",
      teacher_aee: "Profa. Fernanda Lima",
      cognitive: "Raciocínio concreto preservado. Dificuldade com conceitos abstratos.",
      academic: "Pré-silábico (leitura). Escrita do nome com apoio. Matemática: contagem até 20, reconhece numerais até 10.",
      social: "Afetivo e colaborativo. Gosta de atividades em grupo.",
      autonomy: "Boa autonomia para AVDs. Precisa de apoio para organização de materiais.",
    },
  },
  {
    name: "Parecer Descritivo (TEA-1)",
    message: "Gere um parecer descritivo do aluno para este semestre.",
    studentData: {
      name: "Mariana Costa Santos",
      diagnosis: "TEA — Transtorno do Espectro Autista (Nível 1 de suporte)",
      grade: "7º ano do Ensino Fundamental",
      age: "12 anos",
      school: "Escola Estadual Machado de Assis",
      teacher_aee: "Profa. Renata Oliveira",
      cognitive: "Desempenho acadêmico dentro do esperado em áreas de interesse. Hiperfoco em ciências e tecnologia.",
      language: "Linguagem verbal fluente. Dificuldade com expressões idiomáticas e sarcasmo. Linguagem literal.",
      social: "Dificuldade em fazer e manter amizades. Ansiedade social em situações não-estruturadas.",
      academic: "Excelente em Matemática e Ciências. Dificuldade em produção de texto (narrativo e argumentativo).",
    },
  },
];

// ---------------------------------------------------------------------------
// Mode 1: Analyze existing .tex files
// ---------------------------------------------------------------------------

async function analyzeExistingFiles() {
  // Find .tex files in the project root (generated test files)
  const texFiles = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith(".tex"))
    .map((f) => path.join(ROOT, f));

  // Also check output/ directory
  const outputDir = path.join(ROOT, "output");
  if (fs.existsSync(outputDir)) {
    const outputTex = fs.readdirSync(outputDir)
      .filter((f) => f.endsWith(".tex"))
      .map((f) => path.join(outputDir, f));
    texFiles.push(...outputTex);
  }

  if (texFiles.length === 0) {
    console.log("No .tex files found in project root. Use --agent to test with live agent service.");
    return;
  }

  console.log(`\nQuality Analysis Report — ${new Date().toLocaleDateString("pt-BR")}`);
  console.log("═".repeat(70));

  let totalScore = 0;
  let passCount = 0;
  const TARGET = mode === "promax" ? 80 : 60;

  for (const texFile of texFiles) {
    const fileName = path.relative(ROOT, texFile);
    const content = fs.readFileSync(texFile, "utf-8");
    const metrics = analyzeLatexStructure(content);
    const report = formatQualityReport(metrics, mode);

    const status = metrics.score >= TARGET ? "✓" : "✗";
    const scoreColor = metrics.score >= TARGET ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";

    console.log(`\n${status} ${fileName}`);
    console.log(`  Score: ${scoreColor}${metrics.score}/100${reset} (${metrics.grade})`);
    console.log(`  Pages: ~${metrics.estimatedPages} | Sections: ${metrics.sectionCount} | Boxes: ${metrics.coloredBoxCount} | TikZ: ${metrics.tikzDiagramCount} | Tables: ${metrics.tableCount}`);
    console.log(`  Cover: ${metrics.hasCoverPage ? "✓" : "✗"} | TOC: ${metrics.hasTableOfContents ? "✓" : "✗"} | Signature: ${metrics.hasSignatureBlock ? "✓" : "✗"}`);

    if (metrics.textDeserts.length > 0) {
      console.log(`  Text deserts: ${metrics.textDeserts.map((d) => `L${d.startLine}-${d.endLine}`).join(", ")}`);
    }
    if (metrics.emptySubsections.length > 0) {
      console.log(`  Empty subsections: ${metrics.emptySubsections.join(", ")}`);
    }

    if (verbose) {
      console.log("\n  --- Full Report ---");
      report.split("\n").forEach((line) => console.log(`  ${line}`));
    }

    totalScore += metrics.score;
    if (metrics.score >= TARGET) passCount++;
  }

  console.log("\n" + "═".repeat(70));
  console.log(`SUMMARY: ${passCount}/${texFiles.length} pass (target: ${TARGET}) | avg score: ${Math.round(totalScore / texFiles.length)}`);
}

// ---------------------------------------------------------------------------
// Mode 2: Test via agent service (live)
// ---------------------------------------------------------------------------

async function testWithAgent() {
  console.log(`\nAgent Service Quality Test — ${new Date().toLocaleDateString("pt-BR")}`);
  console.log(`Mode: ${mode} | Agent: ${AGENT_URL}`);
  console.log("═".repeat(70));

  // Check agent health
  try {
    const health = await fetch(`${AGENT_URL}/health`);
    if (!health.ok) throw new Error(`Health check failed: ${health.status}`);
    console.log("Agent service: online\n");
  } catch (err) {
    console.error(`Agent service not reachable at ${AGENT_URL}: ${err.message}`);
    console.log("Start the agent service first: cd services/agent-service && node server.js");
    process.exit(1);
  }

  const TARGET = mode === "promax" ? 80 : 60;
  const results = [];

  for (const scenario of AGENT_SCENARIOS) {
    const startTime = Date.now();
    process.stdout.write(`Testing: ${scenario.name}...`);

    try {
      const result = await runAgentScenario(scenario);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

      if (result.error) {
        console.log(` ✗ ERROR (${elapsed}s) — ${result.error}`);
        results.push({ ...scenario, status: "error", error: result.error, elapsed });
        continue;
      }

      if (!result.texContent) {
        console.log(` ✗ NO TEX (${elapsed}s) — Agent didn't produce a .tex file`);
        results.push({ ...scenario, status: "no_tex", elapsed });
        continue;
      }

      // Analyze quality
      const metrics = analyzeLatexStructure(result.texContent);
      const status = metrics.score >= TARGET ? "✓" : "✗";
      const scoreColor = metrics.score >= TARGET ? "\x1b[32m" : "\x1b[31m";
      const reset = "\x1b[0m";

      console.log(` ${status} score: ${scoreColor}${metrics.score}${reset} | ${metrics.estimatedPages}p | ${elapsed}s`);

      if (verbose) {
        const report = formatQualityReport(metrics, mode);
        report.split("\n").forEach((line) => console.log(`    ${line}`));
      }

      results.push({
        ...scenario,
        status: metrics.score >= TARGET ? "pass" : "low_score",
        score: metrics.score,
        pages: metrics.estimatedPages,
        elapsed,
        compiled: result.compiled,
      });
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(` ✗ EXCEPTION (${elapsed}s) — ${err.message}`);
      results.push({ ...scenario, status: "exception", error: err.message, elapsed });
    }
  }

  // Summary
  console.log("\n" + "═".repeat(70));
  const passes = results.filter((r) => r.status === "pass").length;
  const failures = results.filter((r) => r.status !== "pass").length;
  console.log(`SUMMARY: ${passes}/${results.length} pass | ${failures} failures | target: ${TARGET}`);

  if (failures > 0) {
    console.log("\nFailed scenarios:");
    for (const r of results.filter((r) => r.status !== "pass")) {
      console.log(`  - ${r.name}: ${r.status}${r.score ? ` (score: ${r.score})` : ""}${r.error ? ` — ${r.error}` : ""}`);
    }
  }
}

/**
 * Run a single test scenario against the agent service.
 * Sends request, collects SSE events, extracts .tex content.
 */
async function runAgentScenario(scenario) {
  const studentDataText = Object.entries(scenario.studentData)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const systemPrompt = `Assistente AEE. Gere o documento solicitado em LaTeX. Comece com \\begin{document}, termine com \\end{document}. O preamble é injetado automaticamente.`;

  const body = {
    files: [],
    systemPrompt,
    messages: [{ role: "user", content: scenario.message }],
    studentData: studentDataText,
    promptTemplates: {},
    proMaxEnhancements: {},
    projectId: `test-${Date.now()}`,
    maxTurns: mode === "promax" ? 35 : 15,
    maxThinkingTokens: mode === "promax" ? 16000 : 4000,
  };

  const headers = { "Content-Type": "application/json" };
  if (AGENT_TOKEN) headers["Authorization"] = `Bearer ${AGENT_TOKEN}`;

  const response = await fetch(`${AGENT_URL}/agent/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { error: `HTTP ${response.status}: ${await response.text()}` };
  }

  // Parse SSE stream
  const text = await response.text();
  const events = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      try { return JSON.parse(line.slice(6)); } catch { return null; }
    })
    .filter(Boolean);

  // Find .tex file content from files_sync event
  let texContent = null;
  let compiled = false;

  for (const ev of events) {
    if (ev.type === "files_sync" && ev.files) {
      for (const file of ev.files) {
        if (file.path.endsWith(".tex") && file.content) {
          // Decode base64 content
          try {
            texContent = Buffer.from(file.content, "base64").toString("utf-8");
          } catch {
            texContent = file.content;
          }
        }
        if (file.path.endsWith(".pdf")) {
          compiled = true;
        }
      }
    }
    if (ev.type === "tool_call" && ev.tool === "compile_latex") {
      compiled = true;
    }
  }

  // Fallback: try to find .tex content from tool calls (Write tool)
  if (!texContent) {
    for (const ev of events) {
      if (ev.type === "tool_call" && (ev.tool === "Write" || ev.tool === "write_file")) {
        const input = ev.toolInput || {};
        if (typeof input.file_path === "string" && input.file_path.endsWith(".tex") && input.content) {
          texContent = input.content;
        }
      }
    }
  }

  return { texContent, compiled };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (useAgent) {
    await testWithAgent();
  } else {
    await analyzeExistingFiles();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
