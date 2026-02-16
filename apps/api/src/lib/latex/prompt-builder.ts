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
- Para dados de desenvolvimento, use TABELAS coloridas com booktabs e ícones (\\cmark, \\starmark) — NÃO use pgfplots/axis.
- Diagramas TikZ (timeline, fluxograma, árvore familiar) usando nodes e arrows.
- Capa profissional com TikZ (barras de cor, textos estilizados, card de dados).
- objtag para categorizar atividades.`;
    case 5:
      return `ESTILO VISUAL: MÁXIMO (Nível 5)
- Use TUDO disponível no preâmbulo: TODAS as tcolorbox, TikZ avançado.
- Para dados e indicadores, use TABELAS elaboradas com cores, ícones (\\cmark, \\starmark), barras visuais com \\rule{Xcm}{0.3cm} — NÃO use pgfplots/axis.
- Diagramas TikZ elaborados: timelines, fluxogramas, árvores com nodes e arrows.
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

IMPORTANTE: Estes são AMBIENTES LaTeX. Use SEMPRE \\begin{nome}...\\end{nome}. NUNCA use como comando (\\sessaobox{...} está ERRADO — use \\begin{sessaobox}...\\end{sessaobox}).

COMANDOS ATALHO: \\cmark (check), \\starmark (estrela), \\hand (mão), \\bulb (lâmpada)

PACOTES DISPONÍVEIS: tikz (com libraries: positioning, shapes.geometric, calc, decorations.pathmorphing, shadows, patterns, fit, arrows.meta, backgrounds), tabularx, booktabs, multirow, makecell, colortbl, longtable, adjustbox, pifont, enumitem, fancyhdr, tcolorbox, hyperref, draftwatermark
`;

interface Signatory {
  name: string | null | undefined;
  role: string;
}

function getSignatories(
  documentType: string,
  student: StudentData,
): Signatory[] {
  const aee: Signatory = {
    name: student.teacherName,
    role: "Professor(a) de AEE",
  };
  const coord: Signatory = {
    name: student.coordenadora,
    role: "Coordenador(a) Pedagógico(a)",
  };
  const regular: Signatory = {
    name: student.profRegular,
    role: "Professor(a) da Sala Regular",
  };
  const responsavel: Signatory = {
    name: student.responsibleName,
    role: "Responsável pelo(a) Aluno(a)",
  };

  switch (documentType) {
    // Collaborative documents: AEE + Regular + Coordenação
    case "pdi":
    case "plano-intervencao":
    case "adaptacoes-curriculares":
    case "adaptacao-avaliacoes":
    case "estudo-de-caso":
    case "parecer-descritivo":
      return [aee, regular, coord];

    // Family-facing documents: AEE + Responsável
    case "anamnese":
    case "relatorio-familia":
      return [aee, responsavel];

    // Teacher-facing: AEE + Professor Regular
    case "relatorio-professor":
      return [aee, regular];

    // AEE internal + Coordenação
    default:
      return [aee, coord];
  }
}

export function buildSignatureBlock(
  documentType: string,
  student: StudentData,
): string {
  const signatories = getSignatories(documentType, student);
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Build location/date line from student address (extract city) or generic
  const cityName = student.endereco
    ? extractCity(student.endereco)
    : null;
  const locationDate = cityName
    ? `${escapeLatexText(cityName)}, ${today}`
    : `\\hspace{5cm}, ${today}`;

  const lines: string[] = [];

  lines.push(`\\vspace{1.5cm}`);
  lines.push(`\\noindent ${locationDate}`);
  lines.push(`\\vspace{1.5cm}`);

  // Use minipages inside a center environment for side-by-side signature blocks.
  // Each pair is on the same line via \noindent + minipage + \hfill + minipage.
  for (let i = 0; i < signatories.length; i += 2) {
    const left = signatories[i];
    const right = i + 1 < signatories.length ? signatories[i + 1] : null;
    const leftName = left.name ? escapeLatexText(left.name) : "\\hspace{6cm}";

    if (right) {
      const rightName = right.name ? escapeLatexText(right.name) : "\\hspace{6cm}";
      // All on one line (no blank lines between minipages!) to stay in same paragraph
      lines.push(
        `\\noindent\\begin{minipage}[t]{0.45\\textwidth}\\centering\\rule{6cm}{0.4pt}\\\\[4pt]\\textbf{${leftName}}\\\\\\small ${left.role}\\end{minipage}%` +
        `\\hfill%` +
        `\\begin{minipage}[t]{0.45\\textwidth}\\centering\\rule{6cm}{0.4pt}\\\\[4pt]\\textbf{${rightName}}\\\\\\small ${right.role}\\end{minipage}`,
      );
    } else {
      lines.push(
        `\\begin{center}\\rule{6cm}{0.4pt}\\\\[4pt]\\textbf{${leftName}}\\\\\\small ${left.role}\\end{center}`,
      );
    }
    lines.push(`\\vspace{0.8cm}`);
  }

  return lines.join("\n");
}

function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[&%$#_{}~^]/g, (ch) => `\\${ch}`);
}

function extractCity(endereco: string): string | null {
  // Match "Cidade - UF" or "Cidade/UF" or "Cidade-UF" at the end
  // Only extract if there's a clear 2-letter state code
  const m = endereco.match(/(?:,\s*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,}?)\s*[-\/]\s*[A-Z]{2}\s*$/);
  return m ? m[1].trim() : null;
}

export function buildLatexPrompt(
  student: StudentData,
  documentType: string,
  heatLevel: number,
  sizeLevel: number,
  customPrompt?: string,
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
9. NÃO use TikZ mindmap nem child trees. Para diagramas conceituais, use nodes individuais com positioning e setas (\\draw[-Latex]). Exemplo: \\node[draw,fill=aeeblue!20] (A) {Texto}; \\node[right=of A] (B) {Texto2}; \\draw[-Latex] (A)--(B);
10. A data de hoje é ${today}.
11. \\rowcolor DEVE ser o PRIMEIRO comando de uma linha de tabela (antes de qualquer &). NUNCA coloque \\rowcolor depois de &.
12. Em tabelas, use \\makecell{linha1 \\\\ linha2} para quebrar texto CURTO dentro de uma célula. NUNCA coloque \\begin{itemize} ou \\begin{enumerate} dentro de \\makecell — causa erro "Not allowed in LR mode". Para listas dentro de tabelas, use colunas p{Xcm} ou X e coloque a lista diretamente na célula (sem makecell).
13. Para multirow com texto longo, use \\multirow{N}{*}{texto} e NUNCA \\multirowcell.
14. Em TikZ: use valores de coordenadas PEQUENOS (max 100). Dimensões muito grandes causam "Dimension too large". Para diagramas de nodes, use text width=4cm e node distance=10mm — diagramas TikZ NÃO quebram entre páginas, então DEVEM caber em MEIA PÁGINA no máximo.
14b. Em TikZ: TODO o conteúdo de um node DEVE estar DENTRO do próprio node. NUNCA crie um node header e depois sobreponha outro node com \\node at (header.center). Isso causa texto sobreposto. Coloque o conteúdo completo (título + lista) dentro de UM ÚNICO node. Exemplo CORRETO: \\node[draw, text width=4cm] (A) {\\textbf{Título}\\\\\\begin{itemize}[leftmargin=*] \\item Item1 \\item Item2\\end{itemize}};
15. TABELAS DEVEM CABER NA PÁGINA: use tabularx com largura \\textwidth e colunas X (auto-ajuste). Para tabelas com muitas colunas, envolva em \\adjustbox{max width=\\textwidth}{...}. NUNCA use colunas l/c/r para texto longo — use p{Xcm} ou X.
16. Todas as tcolorbox já são breakable por padrão — NÃO adicione breakable manualmente. O argumento opcional é SOMENTE o título: \\begin{infobox}[Meu Título].
17. Texto dentro de células de tabela DEVE ser curto. Se precisar de texto longo, use colunas p{} ou X com largura proporcional.
18. PROIBIDO (causa erro fatal):
  - NÃO use condicionais TeX: \\ifnum, \\ifdim, \\ifx, \\ifodd, \\ifcase, \\or, \\else, \\fi.
  - NÃO use \\foreach com rnd (aleatoriedade) — círculos decorativos aleatórios SEMPRE falham.
  - NÃO use \\pgfmathparse inline em especificações de cor (ex: \\fill[cor!\\pgfmathresult!white]).
  - NÃO use \\begin{axis} nem pgfplots para gráficos. Em vez disso, use TABELAS com booktabs e ícones para representar dados visuais, ou diagramas TikZ simples com nodes e arrows.
  - NÃO use TikZ child trees (sintaxe "child {node ...}") para diagramas de árvore/mind map — o layout fica péssimo com texto longo. Use nodes com positioning e setas (\\draw[-Latex]) em vez disso.
  - NÃO coloque longtable dentro de adjustbox, tcolorbox ou qualquer grupo — longtable DEVE estar no nível raiz do documento. Use tabular dentro de adjustbox se precisar redimensionar.
  - NÃO use colunas X em longtable — X é exclusivo de tabularx.
  - NÃO use \\multirowcell — use \\multirow{N}{*}{texto}.
  - Para capas TikZ: use APENAS retângulos coloridos fixos, nodes com texto, linhas decorativas. Cores devem ser literais (aeeblue, aeegold), NUNCA calculadas.
19. Se o documento for longo, GARANTA que todo conteúdo esteja COMPLETO. Não interrompa no meio de uma seção ou atividade. É melhor ter menos seções completas do que muitas seções incompletas.
20. NOMEIE todos os elementos visuais com títulos descritivos numerados para facilitar referência e edição posterior:
  - Tabelas: adicione acima da tabela um título como \\textbf{Tabela 1 --- Objetivos por área de desenvolvimento}
  - Diagramas TikZ: adicione acima um título como \\textbf{Figura 1 --- Perfil do aluno e conexões}
  - Caixas tcolorbox: use o argumento de título (ex: \\begin{infobox}[Quadro 1 --- Estrutura da sessão])
  - Atividades: numere no título (ex: \\begin{atividadebox}[aeegreen]{\\starmark~Atividade 1: Nome da atividade})
  - Use numeração sequencial consistente no documento inteiro (Tabela 1, 2, 3...; Figura 1, 2...; Quadro 1, 2...).

${AVAILABLE_LATEX_REFERENCE}

${antiDetection}`;

  const customBlock = customPrompt?.trim()
    ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customPrompt.trim()}\n`
    : "";

  const user = `TIPO DE DOCUMENTO: ${config.name}

${config.instruction}

${heatInstruction}

${sizeInstruction}

DADOS DO ALUNO:
${studentData}
${customBlock}
Gere o corpo LaTeX completo, começando com \\begin{document} e terminando com \\end{document}. O preâmbulo já está pronto — NÃO o inclua.

NÃO inclua bloco de assinaturas nem espaço para assinatura — isso será adicionado automaticamente pelo sistema.

Ao final do documento (ANTES de \\end{document}), adicione:
\\vfill
\\begin{center}
  \\scriptsize\\color{textgray}
  Documento elaborado em ${today}.\\\\[4pt]
  \\textit{Este documento contém informações confidenciais protegidas pela LGPD (Lei 13.709/2018).}
\\end{center}`;

  return { system, user };
}
