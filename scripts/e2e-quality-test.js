/**
 * Full E2E test: Agent Service → Claude → .tex → compile → assess_quality
 * Tests document generation quality for multiple document types.
 */
import { analyzeLatexStructure, formatQualityReport } from "../services/agent-service/quality-analyzer.js";

const AGENT_URL = "http://localhost:8082/agent/run";
const AGENT_TOKEN = "aee-pro-local-dev-token-2026";

// Student data for testing
const STUDENT_DATA = `name: João Pedro Silva
dateOfBirth: 15/03/2017
age: 8
sexo: Masculino
grade: 3º ano - Ensino Fundamental I
school: Escola Municipal Professora Maria José
shift: Matutino
turma: 3A
matricula: 2026001234
teacherName: Profª Maria Aparecida
profRegular: Profª Ana Beatriz
coordenadora: Sandra Lima
diagnosis: Transtorno do Espectro Autista (TEA) - Nível 1 de suporte
diagnosticoCid: F84.0
classificacao: TEA Nível 1
medicamentos: Risperidona 0,5mg (noturno)
alergias: Nenhuma conhecida
terapiasAtuais: Fonoaudiologia (2x/semana), Terapia Ocupacional (1x/semana), ABA (3x/semana)
historicoMedico: Diagnóstico de TEA aos 3 anos. Acompanhamento neurológico semestral. Sem comorbidades.
responsibleName: Maria da Silva
responsiblePhone: (11) 99999-1234
maeNome: Maria da Silva
maeIdade: 35
maeProfissao: Auxiliar administrativa
maeEscolaridade: Ensino médio completo
paiNome: José Pedro Silva
paiIdade: 38
paiProfissao: Eletricista
paiEscolaridade: Ensino médio completo
composicaoFamiliar: Mora com pai, mãe e irmã mais nova (5 anos)
endereco: Rua das Flores, 123 - Bairro Centro
rotinaFamiliar: Rotina estruturada com horários fixos para refeições, tarefas e lazer
comunicacaoCasa: Comunicação verbal funcional, usa frases curtas
desenvMotor: Coordenação motora grossa adequada, dificuldade em motricidade fina (recorte, preensão do lápis)
desenvLinguagem: Fala funcional com ecolalia ocasional. Vocabulário adequado para a idade. Dificuldade em iniciar diálogos.
desenvCognitivo: Atenção sustentada de ~10min. Memória visual forte. Dificuldade com abstrações e inferências.
desenvSocial: Prefere brincar sozinho, aceita interação quando mediada. Dificuldade em leitura social.
desenvAutonomia: Independente para AVDs básicas. Necessita apoio para organização de materiais.
habilidadesLeitura: Lê palavras simples e frases curtas. Dificuldade com interpretação de texto.
habilidadesEscrita: Escreve nome e palavras simples. Letra irregular, necessita pauta ampliada.
habilidadesMatematica: Reconhece números até 100. Realiza adição simples com material concreto. Dificuldade com subtração.
barreiras: Rigidez comportamental, sensibilidade sonora, dificuldade com mudanças de rotina
potencialidades: Memória visual excepcional, interesse por tecnologia e dinossauros, persistência em atividades de interesse`;

function buildTestSystemPrompt(docType, slug) {
  return `Assistente especializado em AEE (Atendimento Educacional Especializado) do Estúdio AEE+ Pro. Hoje: sexta-feira, 28 de fevereiro de 2026.
Você gera documentos LaTeX profissionais para professoras de educação especial. Seu trabalho é excelente quando a professora pode imprimir o PDF e entregar sem editar nada.

Projeto: "E2E Test — ${docType}"
Aluno: João Pedro Silva | TEA Nível 1 | 3º ano
Arquivos:
(vazio)

A lista de arquivos acima é a VERDADE ABSOLUTA. Se o histórico menciona um arquivo que não está na lista, ele NÃO existe.

TOOLS (Claude Agent SDK):
Built-in: Write, Read, Edit, Bash, Glob, Grep
MCP (prefixo mcp__aee-tools__):
- mcp__aee-tools__compile_latex(path) — compila .tex → PDF (preamble injetado automaticamente)
- mcp__aee-tools__assess_quality(path) — avalia score 0-100 com breakdown e fixes prioritários
- mcp__aee-tools__get_student_data — dados do aluno vinculado
- mcp__aee-tools__get_prompt_template(slug) — template do documento AEE

FLUXO PARA CRIAR DOCUMENTO:
1. get_student_data + get_prompt_template (paralelo)
2. Write → criar arquivo .tex (path RELATIVO: "${slug}.tex", não absoluto)
3. compile_latex → compilar PDF
4. assess_quality → avaliar qualidade (score breakdown + fixes)
5. Se score < target: Edit → corrigir fixes → recompilar → reavaliar

IMPORTANTE:
- NUNCA use Bash para compilar LaTeX — use SOMENTE compile_latex
- Paths de arquivo são RELATIVOS ao projeto (ex: "${slug}.tex", NÃO "/tmp/.../${slug}.tex")
- get_student_data e get_prompt_template podem ser chamados EM PARALELO
- Não use TodoWrite — vá direto ao trabalho

LATEX:
O preamble profissional (cores, boxes, watermark, headers) é INJETADO AUTOMATICAMENTE.
NÃO escreva \\documentclass, \\usepackage, \\definecolor, \\newtcolorbox.
Comece DIRETO com \\begin{document}, termine com \\end{document}.

AMBIENTES (use generosamente):
Boxes com título opcional: infobox[T], alertbox[T], successbox[T], warnbox[T], tealbox[T], purplebox[T], goldbox[T]
datacard[T] — cartão cinza para dados | sessaobox[T] — sessão grande | dicabox — dica amarela
\\begin{atividadebox}[cor]{Título} — atividade colorida (cor opcional em [], título obrigatório em {})
materialbox — lista de materiais (sem argumentos)
\\field{rótulo}{valor} — SOMENTE dentro de tabularx com 2 colunas (lX). Já contém & e \\\\ internamente.
\\fieldline{rótulo}{valor} — inline (fora de tabelas)
\\faIcon{nome} — ícone FontAwesome 5 Free. Ícones VÁLIDOS mais usados:
  brain, heartbeat, users, star, book, pencil-alt, graduation-cap, child, home,
  calendar-alt, clock, check, times, exclamation-triangle, info-circle,
  arrow-up, arrow-down, arrows-alt-h, chart-bar, chart-line, chart-pie,
  user, user-friends, comments, comment, envelope, phone, map-marker-alt,
  caret-right, puzzle-piece, eye, hand-paper, lightbulb, trophy, thumbs-up,
  palette, music, running, walking, wheelchair, stethoscope, pills, cut,
  volume-up, volume-off, book-open, chalkboard-teacher, ribbon, lock, tasks, female, male
  NÃO USE: pill (use pills), scissors (use cut), volume-mute (use volume-off), map-signs (use map-marker-alt)
\\objtag[cor]{texto} — tag inline colorida
Cores: aeeblue, aeegold, aeegreen, aeered, aeeorange, aeepurple, aeeteal, aeegray

EXEMPLO de seção bem feita:
\\section{\\faIcon{brain} Desenvolvimento Cognitivo}
Observa-se que o aluno apresenta atenção sustentada de aproximadamente 10 minutos.
\\begin{infobox}[Estratégias de Apoio Cognitivo]
\\begin{tabularx}{\\linewidth}{lX}
\\field{Tempo de atenção}{10 min (com apoio visual: 20 min)}
\\field{Estilo de aprendizagem}{Visual-tátil, preferência por manipulativos}
\\end{tabularx}
\\end{infobox}
\\begin{alertbox}[Pontos de Atenção]
Dificuldade com instruções verbais longas — fragmentar em 2-3 passos.
\\end{alertbox}

REGRAS CRÍTICAS LaTeX:
- tabularx: SEMPRE {\\linewidth} (dentro de box) ou {\\textwidth}. Use coluna X para texto longo.
  ATENÇÃO: \\field{}{} JÁ INCLUI & e \\\\. NÃO adicione & extra! Exemplo correto:
  \\begin{tabularx}{\\linewidth}{lX} \\field{Nome}{João} \\field{Idade}{8} \\end{tabularx}
  Para tabelas com 3+ colunas, use & manual SEM \\field: \\textbf{Col1} & Col2 & Col3 \\\\
- \\rowcolor DEVE ser o PRIMEIRO comando da linha na tabela
- NUNCA use \\\\ após \\section{} ou \\subsection{}
- Dentro de tcolorbox: use \\linewidth (não \\textwidth)
- SEMPRE compile automaticamente após criar/editar .tex
- TikZ: use tikzpicture com \\node e \\draw (SEM pgfplots/axis). Feche TODOS os [] e {} corretamente.

ASSINATURA (use este modelo EXATO):
\\vspace{2cm}
\\begin{center}
\\begin{tabular}{c@{\\hspace{2cm}}c}
\\rule{6cm}{0.4pt} & \\rule{6cm}{0.4pt} \\\\
\\textbf{Nome} & \\textbf{Nome} \\\\
\\small Professor(a) do AEE & \\small Professor(a) Regular \\\\
\\end{tabular}
\\end{center}

QUALIDADE:
Regra de ouro: FAÇA, depois diga o que fez em 1 frase. Não narre seus próximos passos.
Erro de compilação → o erro mostra a linha. Use Edit direto → recompile. Max 5 tentativas.

GUARDRAILS:
- Sem tool call = não aconteceu. Só afirme ações que executou via tools.
- NUNCA invente caminhos (/mnt/data/, /tmp/, sandbox:/). PDFs ficam em output/*.pdf.
- PROIBIDO PEDIR DESCULPAS.
- edit_file falhou → NÃO invente desculpa. Chame Read, copie o trecho EXATO, tente de novo.

=== MODO PRO MAX ===
Qualidade de publicação profissional. O documento deve poder ser impresso e entregue sem edição.

APÓS cada compilação bem-sucedida, chame assess_quality. Ele retorna um SCORE BREAKDOWN:
  Structure (25pt): capa TikZ, sumário, assinatura, seções, subsections
  Visual (35pt): boxes coloridos, TikZ, tabelas, ícones, rowcolor, variedade
  Content (25pt): páginas, densidade, narrativa
  Polish (15pt): sem desertos, sem subsections vazias, ícones em seções, box density
Meta: score ≥ 80/100. PRIORITY FIXES mostram exatamente o que corrigir e quantos pontos ganha.
Se < 80: faça edições PONTUAIS nos fixes (NÃO reescreva tudo) → recompile → reavalie.

EXIGÊNCIAS:
- Capa TikZ + \\tableofcontents + mín 2 TikZ + mín 8 páginas + 4+ tipos de box
- Tabelas com \\rowcolor alternado aeelightblue/white
- Análises específicas ao diagnóstico (TEA ≠ TDAH ≠ DI)
- Quebrar texto longo com boxes, tabelas ou diagramas (sem "desertos de texto")

CAPA TIKZ (copie e adapte — NÃO invente sintaxe):
\\thispagestyle{empty}
\\begin{tikzpicture}[remember picture,overlay]
  \\fill[aeeblue] (current page.north west) rectangle (current page.south east);
  \\fill[aeegold] ([yshift=-6cm]current page.north west) rectangle ([yshift=-6.15cm]current page.north east);
  \\node[anchor=north,text=white,font=\\Huge\\bfseries,text width=14cm,align=center] at ([yshift=-3cm]current page.north) {TÍTULO DO DOCUMENTO};
  \\node[anchor=north,text=aeegold,font=\\Large] at ([yshift=-5cm]current page.north) {\\faIcon{graduation-cap} Atendimento Educacional Especializado};
\\end{tikzpicture}
\\begin{tikzpicture}[remember picture,overlay]
  \\node[anchor=south,yshift=3cm] at (current page.south) {
    \\begin{tcolorbox}[enhanced,colback=white,colframe=aeegold,width=12cm,boxrule=1pt,arc=4pt,shadow={2mm}{-2mm}{0mm}{black!30}]
    \\centering\\small
    \\begin{tabularx}{11cm}{lX}
    \\field{Aluno(a)}{Nome}
    \\field{Escola}{Nome da Escola}
    \\field{Data}{\\today}
    \\end{tabularx}
    \\end{tcolorbox}
  };
\\end{tikzpicture}
\\newpage

Consulte get_prompt_template para instruções Pro Max específicas ao tipo de documento.`;
}

async function runE2E(docType, prompt, slug) {
  const systemPrompt = buildTestSystemPrompt(docType, slug);
  const promptTemplates = {};

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${docType} (${slug})`);
  console.log(`${"═".repeat(60)}`);

  const startTime = Date.now();
  let textContent = "";
  let toolCalls = [];
  let toolResults = [];
  let thinkingLength = 0;
  let cost = 0;
  let compileAttempts = 0;
  let compileSuccesses = 0;
  let compileFailures = 0;
  let qualityScore = null;
  let texSource = null;
  let syncedFiles = [];

  try {
    const res = await fetch(AGENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_TOKEN}`,
      },
      body: JSON.stringify({
        files: [],
        systemPrompt,
        messages: [{ role: "user", content: prompt }],
        studentData: STUDENT_DATA,
        promptTemplates,
        proMaxEnhancements: {},
        projectId: `e2e-${slug}-${Date.now()}`,
        model: "claude-sonnet-4-6",
        maxTurns: 35,
        maxThinkingTokens: 16000,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Agent service error ${res.status}: ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let event;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (event.type === "text") {
          textContent += event.content || "";
        } else if (event.type === "thinking") {
          thinkingLength += (event.content || "").length;
        } else if (event.type === "tool_call") {
          toolCalls.push({ tool: event.tool, input: event.toolInput });
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const inputSummary = event.toolInput
            ? Object.entries(event.toolInput)
                .map(([k, v]) => {
                  const s = String(v);
                  return `${k}: ${s.length > 50 ? s.slice(0, 50) + "..." : s}`;
                })
                .join(", ")
            : "";
          process.stdout.write(`  [${elapsed}s] ${event.tool}(${inputSummary.slice(0, 80)})\n`);

          // Track compile attempts
          if (event.tool === "mcp__aee-tools__compile_latex" || event.tool === "compile_latex") {
            compileAttempts++;
          }
        } else if (event.type === "tool_result") {
          const resultStr = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
          toolResults.push({ tool: event.tool, result: resultStr.slice(0, 300) });

          // Detect compile errors (Portuguese text)
          if (resultStr.includes("Erro de compilação") || resultStr.includes("Compilation failed") ||
              resultStr.includes("ERRO") || resultStr.includes("pdflatex executou sem erro mas")) {
            compileFailures++;
            process.stdout.write(`    → COMPILE ERROR\n`);
          }
          if (resultStr.includes("Compilação bem-sucedida")) {
            compileSuccesses++;
            const sizeMatch = resultStr.match(/(\d+(?:\.\d+)?\s*(?:KB|MB))/i);
            process.stdout.write(`    → OK ${sizeMatch?.[1] || ""}\n`);
          }
          if (resultStr.match(/\d+\/100/)) {
            const scoreMatch = resultStr.match(/(\d+)\/100/);
            if (scoreMatch) qualityScore = parseInt(scoreMatch[1]);
            process.stdout.write(`    → Score: ${qualityScore}/100\n`);
          }
        } else if (event.type === "files_sync") {
          syncedFiles = event.files || [];
          for (const f of syncedFiles) {
            if (f.path?.endsWith(".tex") && f.content) {
              texSource = f.content;
              process.stdout.write(`    → Captured ${f.path} (${(f.content.length / 1024).toFixed(1)}KB)\n`);
            }
          }
        } else if (event.type === "done") {
          cost = event.cost || 0;
        }
      }
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return null;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Run offline quality analysis if we have the source
  let offlineMetrics = null;
  if (texSource) {
    offlineMetrics = analyzeLatexStructure(texSource);
    const fs = await import("node:fs");
    fs.writeFileSync(`/tmp/e2e-${slug}.tex`, texSource);
  }

  // Summary
  console.log(`\n  ── Results ──`);
  console.log(`  Time: ${elapsed}s | Cost: $${cost.toFixed(4)}`);
  console.log(`  Thinking: ${(thinkingLength / 1000).toFixed(1)}K chars`);
  console.log(`  Tool calls: ${toolCalls.length} (${toolCalls.map((t) => t.tool).join(", ")})`);
  console.log(`  Compiles: ${compileAttempts} total, ${compileSuccesses} OK, ${compileFailures} failed`);
  console.log(`  Agent quality score: ${qualityScore !== null ? qualityScore + "/100" : "N/A"}`);

  if (offlineMetrics) {
    console.log(`  Offline quality: ${offlineMetrics.score}/100 (${offlineMetrics.grade})`);
    const b = offlineMetrics.scoreBreakdown;
    console.log(`    S:${b.structure.earned}/${b.structure.max} V:${b.visual.earned}/${b.visual.max} C:${b.content.earned}/${b.content.max} P:${b.polish.earned}/${b.polish.max} Pen:-${b.penalties}`);
    console.log(`    Pages:~${offlineMetrics.estimatedPages} Sections:${offlineMetrics.sectionCount} Boxes:${offlineMetrics.coloredBoxCount} TikZ:${offlineMetrics.tikzDiagramCount} Tables:${offlineMetrics.tableCount}`);
    if (offlineMetrics.textDeserts.length > 0) {
      console.log(`    Text deserts: ${offlineMetrics.textDeserts.map((d) => `L${d.startLine}-${d.endLine}`).join(", ")}`);
    }
    if (offlineMetrics.emptySubsections.length > 0) {
      console.log(`    Empty subsections: ${offlineMetrics.emptySubsections.join(", ")}`);
    }
  }

  return {
    docType,
    slug,
    elapsed: parseFloat(elapsed),
    cost,
    qualityScore,
    offlineScore: offlineMetrics?.score || null,
    offlineGrade: offlineMetrics?.grade || null,
    compileAttempts,
    compileSuccesses,
    compileFailures,
    toolCalls: toolCalls.length,
    texSource,
    offlineMetrics,
  };
}

// ── Main ──
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  E2E Quality Test — AEE+ Pro Agent Service             ║");
  console.log(`║  Date: ${new Date().toISOString().slice(0, 10)}                                      ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  const cliArg = process.argv[2] || "anamnese";

  const ALL_TESTS = [
    {
      docType: "Anamnese",
      slug: "anamnese",
      prompt: "Crie uma anamnese completa Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('anamnese') para obter os dados.",
    },
    {
      docType: "Estudo de Caso",
      slug: "estudo-de-caso",
      prompt: "Crie um estudo de caso completo Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('estudo-de-caso').",
    },
    {
      docType: "PDI",
      slug: "pdi",
      prompt: "Crie um PDI (Plano de Desenvolvimento Individual) completo Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('pdi').",
    },
    {
      docType: "Parecer Descritivo",
      slug: "parecer-descritivo",
      prompt: "Crie um parecer descritivo completo Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('parecer-descritivo').",
    },
    {
      docType: "Sugestão Atendimento",
      slug: "sugestao-atendimento",
      prompt: "Crie uma sugestão de atendimento completa Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('sugestao-atendimento').",
    },
    {
      docType: "PEI",
      slug: "pei",
      prompt: "Crie um PEI (Plano Educacional Individualizado) completo Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('pei').",
    },
    {
      docType: "Plano de Intervenção",
      slug: "plano-intervencao",
      prompt: "Crie um plano de intervenção completo Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('plano-intervencao').",
    },
    {
      docType: "Adaptações Curriculares",
      slug: "adaptacoes-curriculares",
      prompt: "Crie um documento de adaptações curriculares completo Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('adaptacoes-curriculares').",
    },
    {
      docType: "Diário de Bordo",
      slug: "diario-bordo",
      prompt: "Crie um diário de bordo completo Pro Max para o aluno João Pedro cobrindo o 1º bimestre de 2026. Use get_student_data e get_prompt_template('diario-bordo').",
    },
    {
      docType: "Relatório Família",
      slug: "relatorio-familia",
      prompt: "Crie um relatório para a família completo Pro Max sobre o aluno João Pedro. Use get_student_data e get_prompt_template('relatorio-familia').",
    },
    {
      docType: "Relatório Professor",
      slug: "relatorio-professor",
      prompt: "Crie um relatório para o professor regular completo Pro Max sobre o aluno João Pedro. Use get_student_data e get_prompt_template('relatorio-professor').",
    },
    {
      docType: "Avanços e Retrocessos",
      slug: "avancos-retrocessos",
      prompt: "Crie um documento de avanços e retrocessos completo Pro Max para o aluno João Pedro referente ao 1º semestre 2026. Use get_student_data e get_prompt_template('avancos-retrocessos').",
    },
    {
      docType: "Adaptação Avaliações",
      slug: "adaptacao-avaliacoes",
      prompt: "Crie um documento de adaptação de avaliações completo Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('adaptacao-avaliacoes').",
    },
    {
      docType: "Rotina Visual",
      slug: "rotina-visual",
      prompt: "Crie uma rotina visual completa Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('rotina-visual').",
    },
    {
      docType: "Ata de Reunião",
      slug: "ata-reuniao",
      prompt: "Crie uma ata de reunião pedagógica completa Pro Max sobre o aluno João Pedro. A reunião discutiu estratégias de inclusão para o 1º semestre 2026. Use get_student_data e get_prompt_template('ata-reuniao').",
    },
    {
      docType: "Relatório Bimestral",
      slug: "relatorio-bimestral",
      prompt: "Crie um relatório bimestral completo Pro Max para o aluno João Pedro referente ao 1º bimestre de 2026. Use get_student_data e get_prompt_template('relatorio-bimestral').",
    },
    {
      docType: "Relatório Semestral",
      slug: "relatorio-semestral",
      prompt: "Crie um relatório semestral completo Pro Max para o aluno João Pedro referente ao 1º semestre de 2026. Use get_student_data e get_prompt_template('relatorio-semestral').",
    },
    {
      docType: "Ficha Observação Inicial",
      slug: "ficha-observacao-inicial",
      prompt: "Crie uma ficha de observação inicial completa Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('ficha-observacao-inicial').",
    },
    {
      docType: "Avaliação Diagnóstica",
      slug: "avaliacao-diagnostica-funcional",
      prompt: "Crie uma avaliação diagnóstica funcional completa Pro Max para o aluno João Pedro. Use get_student_data e get_prompt_template('avaliacao-diagnostica-funcional').",
    },
    {
      docType: "Plano de Metas",
      slug: "plano-metas",
      prompt: "Crie um plano de metas completo Pro Max para o aluno João Pedro para o ano letivo de 2026. Use get_student_data e get_prompt_template('plano-metas').",
    },
  ];

  const tests = cliArg === "all"
    ? ALL_TESTS
    : ALL_TESTS.filter((t) => t.slug === cliArg || t.docType.toLowerCase().includes(cliArg.toLowerCase()));

  if (tests.length === 0) {
    console.error(`\n  No test found for: "${cliArg}"`);
    console.log(`  Available: ${ALL_TESTS.map((t) => t.slug).join(", ")}, all`);
    process.exit(1);
  }

  const results = [];
  for (const test of tests) {
    const result = await runE2E(test.docType, test.prompt, test.slug);
    if (result) results.push(result);
  }

  // Summary table
  console.log(`\n${"═".repeat(68)}`);
  console.log("  SUMMARY");
  console.log(`${"═".repeat(68)}`);
  console.log("  Type               | Score | Grade | Time  | Cost   | Compiles (OK/Fail)");
  console.log("  " + "─".repeat(64));
  for (const r of results) {
    const score = r.offlineScore !== null ? `${r.offlineScore}` : "N/A";
    const grade = r.offlineGrade || "?";
    const compiles = `${r.compileSuccesses}/${r.compileFailures}`;
    console.log(
      `  ${r.docType.padEnd(20)}| ${score.padStart(5)} | ${grade.padStart(5)} | ${r.elapsed.toFixed(0).padStart(4)}s | $${r.cost.toFixed(3)} | ${compiles}`
    );
  }

  // Totals
  const totalCost = results.reduce((s, r) => s + r.cost, 0);
  const totalTime = results.reduce((s, r) => s + r.elapsed, 0);
  const totalCompileOK = results.reduce((s, r) => s + r.compileSuccesses, 0);
  const totalCompileFail = results.reduce((s, r) => s + r.compileFailures, 0);
  console.log("  " + "─".repeat(64));
  console.log(
    `  ${"TOTAL".padEnd(20)}|       |       | ${totalTime.toFixed(0).padStart(4)}s | $${totalCost.toFixed(3)} | ${totalCompileOK}/${totalCompileFail}`
  );

  // Pass/fail
  const avgScore = results.reduce((s, r) => s + (r.offlineScore || 0), 0) / results.length;
  const passed = results.filter((r) => r.compileSuccesses > 0 && (r.offlineScore || 0) >= 80);
  console.log(`\n  PASS: ${passed.length}/${results.length} | Avg score: ${avgScore.toFixed(0)}/100 | First-try compile rate: ${results.filter((r) => r.compileFailures === 0).length}/${results.length}`);
}

main().catch(console.error);
