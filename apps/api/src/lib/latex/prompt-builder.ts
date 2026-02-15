import { getDocumentTypeConfig } from "./document-types";
import { getAntiDetectionPrompt } from "./anti-detection";

interface StudentData {
  name: string;
  dateOfBirth?: string | null;
  grade?: string | null;
  school?: string | null;
  shift?: string | null;
  sexo?: string | null;
  turma?: string | null;
  matricula?: string | null;
  profRegular?: string | null;
  coordenadora?: string | null;
  diagnosis?: string | null;
  diagnosticoCid?: string | null;
  classificacao?: string | null;
  medicamentos?: string | null;
  alergias?: string | null;
  terapiasAtuais?: string | null;
  historicoMedico?: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  maeNome?: string | null;
  maeIdade?: string | null;
  maeProfissao?: string | null;
  maeEscolaridade?: string | null;
  paiNome?: string | null;
  paiIdade?: string | null;
  paiProfissao?: string | null;
  paiEscolaridade?: string | null;
  composicaoFamiliar?: string | null;
  endereco?: string | null;
  rotinaFamiliar?: string | null;
  comunicacaoCasa?: string | null;
  desenvMotor?: string | null;
  desenvLinguagem?: string | null;
  desenvCognitivo?: string | null;
  desenvSocial?: string | null;
  desenvAutonomia?: string | null;
  comportamentoEmocional?: string | null;
  habLeitura?: string | null;
  habEscrita?: string | null;
  habMatematica?: string | null;
  teacherName?: string | null;
  tipoAtendimento?: string | null;
  frequencia?: string | null;
  dificuldadesIniciais?: string | null;
  potencialidades?: string | null;
  barreiras?: string | null;
  necessidadesAcessibilidade?: string | null;
  expectativasFamilia?: string | null;
  observations?: string | null;
  [key: string]: string | null | undefined;
}

interface PromptResult {
  system: string;
  user: string;
}

function getHeatInstruction(level: number): string {
  switch (level) {
    case 1:
      return `ESTILO VISUAL: CONSERVADOR (Nível 1)
- Use APENAS texto corrido com seções (\\section, \\subsection).
- NÃO use tcolorbox, tikz, pgfplots, cores em tabelas.
- Tabelas simples com tabularx e booktabs.
- Estilo limpo e minimalista.
- NÃO faça capa com TikZ.`;
    case 2:
      return `ESTILO VISUAL: SIMPLES (Nível 2)
- Use datacard e infobox para dados importantes.
- Tabularx simples com booktabs.
- NÃO use tikz, pgfplots, diagramas.
- NÃO faça capa com TikZ — comece direto no conteúdo.
- Pode usar cores de fundo em linhas de tabela (\\rowcolor).`;
    case 3:
      return `ESTILO VISUAL: MODERADO (Nível 3)
- Use tcolorbox (infobox, alertbox, successbox, datacard).
- Tabelas com cores alternadas (\\rowcolor).
- 1-2 diagramas TikZ simples (fluxo, timeline).
- NÃO use pgfplots (gráficos de barras).
- Capa simples com TikZ (retângulos de cor, texto centralizado).`;
    case 4:
      return `ESTILO VISUAL: ELABORADO (Nível 4)
- Use TODAS as tcolorbox (infobox, alertbox, successbox, datacard, atividadebox, dicabox, materialbox, sessaobox).
- pgfplots para gráfico de barras de desenvolvimento.
- Diagramas TikZ (timeline, fluxograma, árvore familiar).
- Capa profissional com TikZ (barras de cor, textos estilizados, card de dados).
- objtag para categorizar atividades.`;
    case 5:
      return `ESTILO VISUAL: MÁXIMO (Nível 5)
- Use TUDO disponível no preâmbulo: TODAS as tcolorbox, pgfplots, TikZ avançado.
- pgfplots para gráficos de barras e radar charts.
- Mind maps TikZ, diagramas de fluxo elaborados, timelines detalhadas.
- Capa completa com TikZ (gradiente, círculos decorativos, barras douradas).
- Watermark CONFIDENCIAL já está no preâmbulo.
- Cores em toda parte, ícones (\\cmark, \\starmark, \\hand, \\bulb).
- Tabelas elaboradas com cores, multirow, cabeçalhos coloridos.
- Produza um documento VISUALMENTE IMPRESSIONANTE.`;
    default:
      return getHeatInstruction(3);
  }
}

function getSizeInstruction(level: number): string {
  switch (level) {
    case 1:
      return "TAMANHO: RESUMIDO — Gere um documento conciso de 2-4 páginas. Seja direto, sem repetições.";
    case 2:
      return "TAMANHO: COMPACTO — Gere um documento de 4-6 páginas. Cubra os pontos essenciais com detalhamento moderado.";
    case 3:
      return "TAMANHO: PADRÃO — Gere um documento de 6-10 páginas. Detalhamento completo das seções principais.";
    case 4:
      return "TAMANHO: DETALHADO — Gere um documento de 10-14 páginas. Detalhamento extenso com exemplos e elaboração.";
    case 5:
      return "TAMANHO: COMPLETO — Gere um documento de 14-18 páginas. Máximo detalhamento, exemplos, tabelas extensas, múltiplos diagramas.";
    default:
      return getSizeInstruction(3);
  }
}

function formatStudentData(student: StudentData): string {
  const fields: [string, string | null | undefined][] = [
    ["Nome", student.name],
    ["Data de nascimento", student.dateOfBirth],
    ["Sexo", student.sexo],
    ["Ano/Série", student.grade],
    ["Turma", student.turma],
    ["Matrícula", student.matricula],
    ["Escola", student.school],
    ["Turno", student.shift],
    ["Professor(a) regular", student.profRegular],
    ["Professor(a) AEE", student.teacherName],
    ["Coordenadora", student.coordenadora],
    ["Diagnóstico", student.diagnosis],
    ["CID", student.diagnosticoCid],
    ["Classificação", student.classificacao],
    ["Medicamentos", student.medicamentos],
    ["Alergias", student.alergias],
    ["Terapias atuais", student.terapiasAtuais],
    ["Histórico médico", student.historicoMedico],
    ["Responsável", student.responsibleName],
    ["Telefone responsável", student.responsiblePhone],
    ["Mãe - Nome", student.maeNome],
    ["Mãe - Idade", student.maeIdade],
    ["Mãe - Profissão", student.maeProfissao],
    ["Mãe - Escolaridade", student.maeEscolaridade],
    ["Pai - Nome", student.paiNome],
    ["Pai - Idade", student.paiIdade],
    ["Pai - Profissão", student.paiProfissao],
    ["Pai - Escolaridade", student.paiEscolaridade],
    ["Composição familiar", student.composicaoFamiliar],
    ["Endereço", student.endereco],
    ["Rotina familiar", student.rotinaFamiliar],
    ["Comunicação em casa", student.comunicacaoCasa],
    ["Desenvolvimento motor", student.desenvMotor],
    ["Desenvolvimento linguagem", student.desenvLinguagem],
    ["Desenvolvimento cognitivo", student.desenvCognitivo],
    ["Desenvolvimento social", student.desenvSocial],
    ["Desenvolvimento autonomia", student.desenvAutonomia],
    ["Comportamento emocional", student.comportamentoEmocional],
    ["Habilidade leitura", student.habLeitura],
    ["Habilidade escrita", student.habEscrita],
    ["Habilidade matemática", student.habMatematica],
    ["Tipo de atendimento", student.tipoAtendimento],
    ["Frequência", student.frequencia],
    ["Dificuldades iniciais", student.dificuldadesIniciais],
    ["Potencialidades", student.potencialidades],
    ["Barreiras", student.barreiras],
    ["Necessidades de acessibilidade", student.necessidadesAcessibilidade],
    ["Expectativas da família", student.expectativasFamilia],
    ["Observações", student.observations],
  ];

  return fields
    .filter(([, value]) => value)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
}

const AVAILABLE_LATEX_REFERENCE = `
AMBIENTES DISPONÍVEIS NO PREÂMBULO (use apenas estes):
- \\begin{infobox}[Título]...\\end{infobox} — caixa azul para informações
- \\begin{alertbox}[Título]...\\end{alertbox} — caixa vermelha para alertas
- \\begin{successbox}[Título]...\\end{successbox} — caixa verde para conquistas
- \\begin{datacard}...\\end{datacard} — card cinza para dados
- \\begin{atividadebox}[cor]{Título}...\\end{atividadebox} — ex: \\begin{atividadebox}[aeegreen]{\\starmark~Atividade 1: Nome}
- \\begin{dicabox}...\\end{dicabox} — dica amarela com ícone
- \\begin{materialbox}...\\end{materialbox} — lista de materiais
- \\begin{sessaobox}[Título]...\\end{sessaobox} — planejamento de sessão
- \\objtag{texto} ou \\objtag[cor]{texto} — tag inline para objetivos

CORES DISPONÍVEIS: aeeblue, aeegold, aeelightblue, aeegreen, aeered, aeeorange, aeepurple, aeeteal, aeegray, textgray, lightgreen, lightorange, lightpurple, lightteal, lightred, lightyellow

COMANDOS ATALHO: \\cmark (check), \\starmark (estrela), \\hand (mão), \\bulb (lâmpada)

PACOTES DISPONÍVEIS: tikz (com libraries: positioning, shapes.geometric, calc, decorations.pathmorphing, shadows, patterns, fit, arrows.meta, backgrounds), pgfplots, tabularx, booktabs, multirow, colortbl, longtable, pifont, enumitem, fancyhdr, tcolorbox, hyperref, draftwatermark
`;

export function buildLatexPrompt(
  student: StudentData,
  documentType: string,
  heatLevel: number,
  sizeLevel: number,
): PromptResult {
  const config = getDocumentTypeConfig(documentType);
  if (!config) {
    throw new Error(`Tipo de documento desconhecido: ${documentType}`);
  }

  const antiDetection = getAntiDetectionPrompt();
  const heatInstruction = getHeatInstruction(heatLevel);
  const sizeInstruction = getSizeInstruction(sizeLevel);
  const studentData = formatStudentData(student);
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const system = `Você é um especialista em LaTeX E em Atendimento Educacional Especializado (AEE). Você gera código LaTeX profissional, compilável e sem erros.

REGRAS CRÍTICAS:
1. Gere APENAS o corpo do documento — de \\begin{document} até \\end{document} (inclusive ambos).
2. NÃO inclua \\documentclass, \\usepackage, \\definecolor, \\newtcolorbox nem nenhuma definição de preâmbulo — o preâmbulo já está definido externamente.
3. Use APENAS os ambientes, cores e comandos listados abaixo — eles já existem no preâmbulo.
4. O código DEVE compilar sem erros com pdflatex.
5. Escape caracteres especiais LaTeX corretamente: & % $ # _ { } ~ ^
6. Use --- para travessão, -- para meia-risca.
7. NÃO use \\includegraphics — não há imagens disponíveis. Use TikZ para qualquer elemento visual.
8. Em TikZ: sempre nomeie nodes com texto (ex: \\node (meunode) {...}), NUNCA use números puros como nome de node.
9. NÃO use TikZ mindmap (a biblioteca não está disponível). Para diagramas conceituais, use nodes com setas e positioning.
10. A data de hoje é ${today}.

${AVAILABLE_LATEX_REFERENCE}

${antiDetection}`;

  const user = `TIPO DE DOCUMENTO: ${config.name}

${config.instruction}

${heatInstruction}

${sizeInstruction}

DADOS DO ALUNO:
${studentData}

Gere o corpo LaTeX completo, começando com \\begin{document} e terminando com \\end{document}. O preâmbulo já está pronto — NÃO o inclua.

Ao final do documento, adicione:
\\vfill
\\begin{center}
  \\scriptsize\\color{textgray}
  Documento gerado em ${today} pelo sistema \\textbf{AEE+ PRO}\\\\
  Desenvolvido por \\textbf{Blumenau TI} --- \\url{www.blumenauti.com.br}\\\\[4pt]
  \\textit{Este documento contém informações confidenciais protegidas pela LGPD (Lei 13.709/2018).}
\\end{center}`;

  return { system, user };
}
